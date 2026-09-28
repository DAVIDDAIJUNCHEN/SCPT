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
import {
  resolveLocalizedText,
  type LocalizedTextValue,
} from '@/lib/localized-text'

/**
 * Model / vendor descriptions may be stored in the backend as either a bare
 * string (legacy, single-language) or a JSON object mapping BCP-47 tags to
 * localized copy (e.g. `{"zh": "...", "en": "..."}`). Resolve the stored value
 * against the active i18n language, falling back to the raw string when it is
 * not a valid localized map.
 */
export function resolveLocalizedDescription(
  raw: string | undefined | null,
  language: string
): string {
  if (raw == null) return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (
        parsed != null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        const resolved = resolveLocalizedText(
          parsed as LocalizedTextValue,
          language
        )
        // A valid map with at least one non-empty entry resolved fine; if
        // every entry is empty, prefer the raw string over showing nothing.
        if (resolved) return resolved
      }
    } catch {
      // Not valid JSON — treat as a plain string below.
    }
  }
  return raw
}
