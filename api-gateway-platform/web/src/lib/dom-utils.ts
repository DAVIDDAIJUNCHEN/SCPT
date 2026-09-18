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
import { DEFAULT_FAVICON, DEFAULT_LOGO } from '@/lib/constants'

export function applyFaviconToDom(url: string) {
  if (typeof document === 'undefined' || !url) return
  try {
    const next = new URL(url, window.location.href).href
    const existing =
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
    if (existing.length === 1 && existing[0].href === next) return
    const link = document.createElement('link')
    link.rel = 'icon'
    link.href = url
    existing.forEach((l) => l.remove())
    document.head.appendChild(link)
  } catch {
    // Ignore malformed URLs
  }
}

/**
 * tab 图标：带文字的校徽缩到 16px 会糊成一团，因此 favicon 固定用无文字圆徽
 * （DEFAULT_FAVICON，与 Portal 主页同源）。只有当管理员在后台显式配置了
 * 自定义 Logo（非内置默认值）时，才用该 Logo 覆盖——保持品牌可配置能力。
 * @param logoUrl 后端 /api/status 返回的 logo 字段
 */
export function applyBrandFavicon(logoUrl?: string) {
  if (typeof document === 'undefined') return
  const isCustomLogo =
    !!logoUrl && logoUrl !== DEFAULT_LOGO && logoUrl !== '/logo.png'
  applyFaviconToDom(isCustomLogo ? logoUrl : DEFAULT_FAVICON)
}
