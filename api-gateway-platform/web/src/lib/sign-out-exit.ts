/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// 川邮·星语：统一「登出后去哪」的出口逻辑。
//
// 背景：本平台部署在 Portal 的同一个源上（https://<host>/ 是 Portal 静态主页，
// 星语控制台同源挂在 /console、/dashboard 等路径下；开发环境直接在 dev server
// 根路径，没有 Portal）。因此「退出登录」的正确归宿是回到 Portal 主页
// （https://<host>/），而不是留在 /sign-in 登录页——后者会让用户以为
// 「只是被踢下线」，还得自己再找路回主页。
//
// 但有一个必须规避的死循环：若访问者本来就不在 Portal 站点（例如在教学环境里
// 直接打开了星语控制台的独立端口），把用户推到同源的 / 之后，Portal 的入口
// 按钮又会把他送回控制台 → 控制台发现未登录 → 再回 /……无限来回。
// 所以这里只在「当前访问确实来自 Portal 宿主」时才跳 Portal：
//   · 同源根路径就是 Portal（生产：nginx 把 / 交给 Portal 静态页）
//   · 用户本次会话是从 Portal 进入的（写入 sessionStorage 的路由提示）
//   · 用户刚刚主动点过「返回主页」
// 否则退回默认行为（跳登录页），保证任何部署形态下都不会打转。
// 开发环境（dev）默认不跳，避免接管 rsbuild dev server 的根路径。

const PORTAL_HOST_HINT_KEY = 'xingyu:entered-from-portal'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// 四域名架构（2026-09）：Portal 独占 ai.sptc.edu.cn（nginx 静态页），
// 星语 SPA 挂在 ai-platform.sptc.edu.cn（及 3080 明文 API）。
// 「返回主页」必须跨源跳 Portal 主域——返回当前源根路径只会落回星语 SPA
// 自己的根（/ → /dashboard → 未登录 → /sign-in），表现为「点了没反应」。
const PORTAL_FQDN = 'ai.sptc.edu.cn'

// 是否可能处在「Portal + 星语 同源」的部署形态下（用于决定跳不跳根路径）
export function isPortalCapableHost(): boolean {
  if (typeof window === 'undefined') return false
  if (import.meta.env.DEV) return false
  if (LOCAL_DEV_HOSTS.has(window.location.hostname)) return false
  // 四域名架构：只在 *.sptc.edu.cn（含 Portal 主域）下确定 Portal 可达。
  // IP 直连 / 教学独立部署等形态无法确定 Portal 位置，不提供该入口
  // （否则跳当前源根路径会落回 SPA 自身，形成死循环）。
  return (
    window.location.hostname === PORTAL_FQDN ||
    window.location.hostname.endsWith('.' + PORTAL_FQDN.split('.').slice(1).join('.'))
  )
}

// Portal 主页地址。
// · 访问域就是 Portal（ai.sptc.edu.cn）或老的同源部署形态 → 当前源根路径；
// · 星语挂在其他 sptc 子域（ai-platform 等）→ 跨源跳 Portal 主域。
export function resolvePortalHomeUrl(): string {
  if (typeof window === 'undefined') return '/'
  const host = window.location.hostname
  if (host === PORTAL_FQDN || !host.endsWith('.sptc.edu.cn')) {
    // Portal 本尊，或无法识别的部署形态：沿用同源根路径（老行为）
    return new URL('/', window.location.origin).toString()
  }
  // 星语在 sptc 子域上（ai-platform / 3080 等）→ Portal 独立主域
  return `https://${PORTAL_FQDN}/`
}

// 标记「本次会话由 Portal 进入」，供登出时判断是否该回 Portal。
// 由 Portal 带入的 ?from=portal 参数触发（见 _authenticated 路由守卫）。
export function markEnteredFromPortal(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PORTAL_HOST_HINT_KEY, '1')
  } catch {
    // sessionStorage 不可用时降级：只依赖同源根路径判定，不影响功能。
  }
}

export function hasEnteredFromPortal(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(PORTAL_HOST_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearEnteredFromPortal(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PORTAL_HOST_HINT_KEY)
  } catch {
    // 忽略：清理失败不影响登出。
  }
}

// 登出后是否需要回 Portal 主页。
// hard 表示本次是「硬跳转」（location.replace / 新标签），可以安全地跨出 SPA；
// 软跳转（router navigate）时若目标就是 Portal 根路径，TanStack Router 会当场
// 把请求转成整页加载，效果一致，无需区别对待，但保留参数便于将来细分。
export function shouldExitToPortal(): boolean {
  if (!isPortalCapableHost()) return false
  return hasEnteredFromPortal() || hasPortalEntryIntent()
}

// 「返回主页」按钮的显式意图：按钮点击时写一个短时效标记，避免用户从
// 深链接（直接粘贴控制台 URL）进来时误判——那种场景 Portal 未必可达。
const PORTAL_INTENT_KEY = 'xingyu:portal-exit-intent'

export function requestPortalExit(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PORTAL_INTENT_KEY, String(Date.now()))
  } catch {
    // 忽略
  }
}

function hasPortalEntryIntent(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(PORTAL_INTENT_KEY)
    if (!raw) return false
    return Math.abs(Date.now() - Number(raw)) < 5 * 60 * 1000
  } catch {
    return false
  }
}

export function clearPortalExitIntent(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PORTAL_INTENT_KEY)
  } catch {
    // 忽略
  }
}

// 执行登出后的位置切换。返回 true 表示已经接管跳转（调用方不应再 navigate）。
export function exitAfterSignOut(): boolean {
  if (!shouldExitToPortal()) {
    clearEnteredFromPortal()
    clearPortalExitIntent()
    return false
  }
  const target = resolvePortalHomeUrl()
  clearEnteredFromPortal()
  clearPortalExitIntent()
  window.location.replace(target)
  return true
}