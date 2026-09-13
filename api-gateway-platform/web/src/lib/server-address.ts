/*
Copyright (C) 2026 四川邮电职业技术学院 智算中心
四川邮电职业技术学院 信息工程学院  川邮·星语 API 平台

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

协调人：陈代军
联系邮箱：chendaijun@scptc.edu.cn
*/

/**
 * 平台对外地址解析（全站唯一出口）。
 *
 * 设计原则：**使用者从哪个地址访问，示例/分享链接就给哪个地址**，复制即用。
 * 只有当浏览器的地址不可用时（如 SSR、localhost 开发环境），
 * 才回退到后台「系统设置 → 服务器地址」里配置的值。
 *
 * 这样避免了两种长期困扰学生的问题：
 *   1. 示例代码里出现 `localhost:3000`（使用者机器上根本不存在）；
 *   2. 使用者用 443 访问，示例里却带 `:3000`，看起来像是必须写端口。
 */

/** 这些地址属于本机回环，外网使用者不可达，不能作为示例地址 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

/** 后端 /api/status 里可能出现的 key，不同版本命名不一致，全部兜一遍 */
const ADDRESS_KEYS = ['server_address', 'serverAddress', 'ServerAddress'] as const

function isLoopback(hostname: string): boolean {
  if (LOOPBACK_HOSTS.has(hostname)) return true
  // 127.x.x.x 整段都算回环
  return /^127\./.test(hostname)
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** 从任意来源里挖出一个看起来可用的地址字符串 */
function pickFromStatus(status: unknown): string {
  if (!status || typeof status !== 'object') return ''
  const record = status as Record<string, unknown>
  const containers: Record<string, unknown>[] = [record]
  if (record.data && typeof record.data === 'object') {
    containers.push(record.data as Record<string, unknown>)
  }
  for (const container of containers) {
    for (const key of ADDRESS_KEYS) {
      const value = container[key]
      if (typeof value === 'string' && value.trim()) {
        return stripTrailingSlash(value.trim())
      }
    }
  }
  return ''
}

/** 后端配置的地址是否可用（不能是 localhost:3000 这类本机地址） */
function isUsableAddress(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (!parsed.hostname) return false
    return !isLoopback(parsed.hostname)
  } catch {
    return false
  }
}

/** 用户从 localStorage 缓存里读到的 status（未登录/未请求接口时的兜底） */
function pickFromCachedStatus(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem('status')
    if (!raw) return ''
    return pickFromStatus(JSON.parse(raw))
  } catch {
    return ''
  }
}

/**
 * 解析平台对外地址。
 *
 * @param status `/api/status` 的响应对象（可省略）
 * @param fallback 全部失败时的兜底值，默认空串
 */
export function resolveServerAddress(
  status?: unknown,
  fallback = ''
): string {
  // ① 浏览器地址栏优先 —— 使用者访问什么，示例就给什么
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    if (origin) {
      try {
        const hostname = new URL(origin).hostname
        if (!isLoopback(hostname)) return stripTrailingSlash(origin)
      } catch {
        /* 解析失败则继续往下兜 */
      }
    }
  }

  // ② 后台「系统设置 → 服务器地址」配置值
  const configured = pickFromStatus(status) || pickFromCachedStatus()
  if (isUsableAddress(configured)) return configured

  // ③ 本机开发环境的地址，聊胜于无
  if (typeof window !== 'undefined' && window.location.origin) {
    return stripTrailingSlash(window.location.origin)
  }

  return fallback
}

/** 平台对外地址 + `/v1`，OpenAI SDK 的 base_url 用 */
export function resolveOpenAIBaseUrl(status?: unknown, fallback = ''): string {
  const base = resolveServerAddress(status, fallback)
  return base ? `${base}/v1` : ''
}

/**
 * 把已知的坏地址（如后端默认的 localhost:3000）归一化成当前可访问地址。
 * 用于后端已经吐了 localhost:3000、前端不想直接展示出去的场景。
 */
export function sanitizeAddress(
  raw: string | undefined | null,
  status?: unknown
): string {
  const value = (raw ?? '').trim()
  if (value) {
    try {
      const parsed = new URL(value)
      if (parsed.hostname && !isLoopback(parsed.hostname)) {
        return stripTrailingSlash(value)
      }
    } catch {
      /* 非法 URL，走兜底 */
    }
  }
  return resolveServerAddress(status)
}