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
import fr from './locales/fr.json'
import ja from './locales/ja.json'
import ru from './locales/ru.json'
import vi from './locales/vi.json'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh.json'

export const resources = {
  en,
  zhCN,
  fr,
  ru,
  ja,
  vi,
  zhTW,
} as const

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

export default i18n
