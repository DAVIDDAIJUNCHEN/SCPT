/*
Copyright (C) 2023-2026 QuantumNous

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

For commercial licensing, please contact support@quantumnous.com
*/
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import { convertDetectedLanguage } from './languages'
import {
  readLanguageFromSearch,
  resolveInitialLanguageFromPortal,
  syncLanguageToPortal,
} from '@/lib/portal-language-bridge'
import en from './locales/en.json'
import zhCN from './locales/zh.json'

/**
 * 川邮·星语（2026-09-19）：语言包按需加载。
 *
 * 背景：7 个语言包静态 import 共 3.0MB，其中 fr/ru/ja/vi/zh-TW 五个（约 2.2MB）
 * 星语根本不用（本项目锁定 zh + en），却全部打进首屏主包 —— 主包 3.6MB 里
 * 六成是这些用不到的死文案。这是「从 Portal 进登录页慢、不丝滑」的首要根因。
 *
 * 策略：zh + en 静态引入（首屏必需，命中率 100%）；
 *      其余语言走动态 import，仅当用户主动切到该语言时才拉对应 chunk。
 *      这样不删除上游任何语言（保留 AGPL 合流能力），只是把它们的加载时机推后。
 */
const resources = {
  en,
  zhCN,
} as const

const LAZY_LOCALES = {
  fr: () => import('./locales/fr.json'),
  ru: () => import('./locales/ru.json'),
  ja: () => import('./locales/ja.json'),
  vi: () => import('./locales/vi.json'),
  zhTW: () => import('./locales/zh-TW.json'),
} as const

type LazyLanguage = keyof typeof LAZY_LOCALES

const lazyLanguageCodes = Object.keys(LAZY_LOCALES) as LazyLanguage[]

function isLazyLanguage(value: string): value is LazyLanguage {
  return (lazyLanguageCodes as string[]).includes(value)
}

/**
 * 按需把某个语言包注册进 i18next。
 * 已注册过的直接返回，避免重复网络请求。
 */
export async function ensureLanguageLoaded(lng: string): Promise<void> {
  if (!isLazyLanguage(lng)) return
  if (i18n.hasResourceBundle(lng, 'translation')) return

  const mod = await LAZY_LOCALES[lng]()
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true)
}

/**
 * 川邮·星语：确定初始语言。
 *
 * 优先级（高 → 低）：
 *  1. URL 的 ?lang= —— Portal 跳转时携带，最明确（跨设备/清缓存后仍有效）
 *  2. Portal 的 xy_lang —— 与 Portal 主页语言保持一致
 *  3. 星语自己的 localStorage（i18nextLng）
 *  4. 浏览器语言
 *
 * 第 1、2 步只在「星语侧还没存过语言」时才考虑，(2) 由 bridge 内部判断；
 * (1) 则总是优先，因为它是本次跳转携带的显式意图。
 */
function resolveInitialLanguage(): string | undefined {
  if (typeof window === 'undefined') return undefined

  const fromUrl = readLanguageFromSearch(window.location.search)
  if (fromUrl) return fromUrl

  return resolveInitialLanguageFromPortal() ?? undefined
}

const initialLanguage = resolveInitialLanguage()

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zhCN', 'fr', 'ru', 'ja', 'vi', 'zhTW'],
    load: 'currentOnly',
    // 若能从 URL / Portal 得到明确语言则以其为准，否则交给检测器
    ...(initialLanguage ? { lng: initialLanguage } : {}),
    nsSeparator: false, // Allow literal colons in keys (e.g., URLs, labels)
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Browsers report `zh-CN`/`zh-TW`/`zh`; map them onto our `zhCN`/`zhTW`
      // codes (non-Chinese codes pass through for normal supportedLngs matching).
      convertDetectedLanguage,
    },
  })

// 川邮·星语：语言确定后回写 Portal 的键，使 Portal 与星语始终一致。
// 放在 init 之后，避免污染检测器对 i18nextLng 的判断。
if (initialLanguage) {
  syncLanguageToPortal(initialLanguage)
}

/**
 * 语言切换时按需拉取对应语言包。
 *
 * 监听 languageChanged：若目标语言是惰性语言且尚未注册，就动态 import 并注入。
 * 注入后 i18next 会自动重渲染已挂载的组件（react-i18next 的既有行为），
 * 因此用户能立刻看到新语言文案，无需刷新。
 *
 * 注意：这里**不 await**，让切换动作先返回（i18next 会以旧文案短暂兜底），
 * 语言包到达后自动刷新。若 await 会让切换按钮出现肉眼可见的卡顿。
 */
i18n.on('languageChanged', (lng: string) => {
  if (!isLazyLanguage(lng)) return
  void ensureLanguageLoaded(lng).catch(() => {
    // 语言包加载失败时静默降级到英文兜底，不打断用户操作
  })
})

// 初始语言本身就是惰性语言（如 ?lang=zhTW / 上次存了 ja）时，立即补拉。
if (initialLanguage && isLazyLanguage(initialLanguage)) {
  void ensureLanguageLoaded(initialLanguage).catch(() => {
    /* 静默降级到 en 兜底 */
  })
}

export default i18n
