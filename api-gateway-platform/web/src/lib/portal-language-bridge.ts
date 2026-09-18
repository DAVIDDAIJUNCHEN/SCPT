/*
Copyright (C) 2026 川邮星语 · AlloMax

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

/**
 * Portal ↔ 星语 语言态桥接。
 *
 * 背景：Portal 主页（自包含静态页）与星语控制台（本 SPA）是同一源下的两套前端，
 * 各自维护语言设置，且**用的存储键和取值体系都不同**：
 *
 *   Portal  : localStorage['xy_lang']            = 'zh' | 'en'
 *   星语    : localStorage['i18nextLng']         = 'zhCN' | 'en' | ...
 *
 * 因此「中文 Portal → 英文登录页」这类错配是必然的：两者从不通信。
 *
 * 本模块负责两件事：
 * ① 读取 Portal 的语言并翻译成星语的语言码（供首次进入时对齐）
 * ② 星语侧切换语言后回写 Portal 的键，使「返回主页」时 Portal 也用同一语言
 *
 * 刻意只在**用户尚未在星语侧显式选择过语言**时才做 ① 的对齐，
 * 否则会覆盖掉用户在本站内的选择（用户预期：我在登录页切了英文，刷新不能变回中文）。
 */

/** Portal 使用的语言存储键（见 portal/index.html 的 locale 切换逻辑） */
const PORTAL_LANG_KEY = 'xy_lang'

/** 星语是否已由用户显式选择过语言（i18next 检测器会写入此键） */
const XINGYU_LANG_KEY = 'i18nextLng'

/** Portal 语言码 → 星语语言码 */
function portalToXingyu(value: string): string | null {
  const lower = value.trim().toLowerCase()
  if (lower === 'zh' || lower.startsWith('zh-')) {
    // Portal 目前只区分简繁二选一，'zh' 按简体处理
    return lower.includes('tw') || lower.includes('hk') ? 'zhTW' : 'zhCN'
  }
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

/** 星语语言码 → Portal 语言码（Portal 只认 zh/en 两种） */
function xingyuToPortal(value: string): 'zh' | 'en' {
  const lower = value.trim().toLowerCase()
  // 繁体在 Portal 侧没有对应词条，归入中文
  if (lower.startsWith('zh')) return 'zh'
  return 'en'
}

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级：语言联动失效但不影响功能
  }
}

/**
 * 首次进入星语时，若用户还没在星语侧选过语言，则采用 Portal 的语言。
 *
 * @returns 需要应用的语言码；无需对齐时返回 null
 */
export function resolveInitialLanguageFromPortal(): string | null {
  // 用户已在星语侧显式选择过 → 尊重其选择，不覆盖
  if (safeGet(XINGYU_LANG_KEY)) return null

  const portalLang = safeGet(PORTAL_LANG_KEY)
  if (!portalLang) return null

  return portalToXingyu(portalLang)
}

/**
 * 星语侧切换语言后回写 Portal 的键，保证「返回主页」时两边语言一致。
 * 无论 localStorage 里原本有没有 Portal 的键都写 —— 用户在本站的显式选择
 * 应当成为下一步去到 Portal 时的默认值。
 */
export function syncLanguageToPortal(xingyuLang: string): void {
  safeSet(PORTAL_LANG_KEY, xingyuToPortal(xingyuLang))
}

/**
 * 把语言写进 URL 查询参数，用于跨页跳转时携带语言。
 *
 * Portal 的「和星语对话」按钮指向 /chat，星语侧可以从 URL 读取 ?lang= 作为
 * 最高优先级信号（localStorage 可能因跨设备/清缓存而缺失）。
 */
export function readLanguageFromSearch(search: string): string | null {
  try {
    const value = new URLSearchParams(search).get('lang')
    if (!value) return null
    return portalToXingyu(value)
  } catch {
    return null
  }
}

/** 供 Portal 使用：生成带语言参数的星语入口链接 */
export function buildLanguageAwareUrl(
  baseUrl: string,
  xingyuLang?: string
): string {
  const lang = xingyuLang ?? safeGet(XINGYU_LANG_KEY) ?? 'zhCN'
  const portalLang = xingyuToPortal(lang)
  try {
    const url = new URL(baseUrl, window.location.origin)
    url.searchParams.set('lang', portalLang)
    return url.toString()
  } catch {
    return baseUrl
  }
}