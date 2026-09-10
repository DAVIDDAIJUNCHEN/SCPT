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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import { DEFAULT_GROUP } from '../constants'
import type { ApiKey, ApiKeyFormData } from '../types'

// ============================================================================
// Form Schema
// ============================================================================

export function getApiKeyFormSchema(t: TFunction, maxAutoGroups = 5) {
  const autoGroupLimit =
    Number.isInteger(maxAutoGroups) && maxAutoGroups > 0 ? maxAutoGroups : 5

  return z
    .object({
      name: z.string().min(1, t('Please enter a name')),
      remain_quota_dollars: z.number().optional(),
      expired_time: z.date().optional(),
      unlimited_quota: z.boolean(),
      model_limits: z.array(z.string()),
      allow_ips: z.string().optional(),
      group: z.string().optional(),
      auto_groups_mode: z.enum(['inherit', 'custom']),
      auto_groups: z.array(z.string()),
      cross_group_retry: z.boolean().optional(),
      tokenCount: z.number().min(1).optional(),
      // 川邮·星语：令牌级限流/并发管控（0=不限制）
      rate_limit_rpm: z.number().min(0).int().optional(),
      rate_limit_tpm: z.number().min(0).int().optional(),
      max_concurrency: z.number().min(0).int().optional(),
      // 川邮·星语：内容管控（ContentGuard）
      content_guard_mode: z.enum(['inherit', 'custom']),
      content_guard_pii_redact: z.boolean().optional(),
      content_guard_harmful_block: z.boolean().optional(),
      content_guard_injection_block: z.boolean().optional(),
      content_guard_output_block: z.boolean().optional(),
      content_guard_extra_output_words: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.group === 'auto') {
        if (
          data.auto_groups_mode === 'custom' &&
          data.auto_groups.length === 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['auto_groups'],
            message: t(
              'Select at least one Auto group or restore global Auto.'
            ),
          })
        }

        if (data.auto_groups.length > autoGroupLimit) {
          ctx.addIssue({
            code: 'custom',
            path: ['auto_groups'],
            message: t('Select at most {{max}} Auto groups', {
              max: autoGroupLimit,
            }),
          })
        }

        if (new Set(data.auto_groups).size !== data.auto_groups.length) {
          ctx.addIssue({
            code: 'custom',
            path: ['auto_groups'],
            message: t('Auto groups must not contain duplicates'),
          })
        }
      }

      if (data.unlimited_quota) {
        return
      }

      if (
        data.remain_quota_dollars === undefined ||
        data.remain_quota_dollars < 0
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['remain_quota_dollars'],
          message: t('Quota must be zero or greater'),
        })
      }
    })
}

export type ApiKeyFormValues = z.infer<ReturnType<typeof getApiKeyFormSchema>>

// ============================================================================
// Form Defaults
// ============================================================================

export const API_KEY_FORM_DEFAULT_VALUES: ApiKeyFormValues = {
  name: '',
  remain_quota_dollars: 10,
  expired_time: undefined,
  unlimited_quota: true,
  model_limits: [],
  allow_ips: '',
  group: DEFAULT_GROUP,
  auto_groups_mode: 'inherit',
  auto_groups: [],
  cross_group_retry: true,
  tokenCount: 1,
  rate_limit_rpm: 0,
  rate_limit_tpm: 0,
  max_concurrency: 0,
  content_guard_mode: 'inherit',
  content_guard_pii_redact: true,
  content_guard_harmful_block: true,
  content_guard_injection_block: true,
  content_guard_output_block: true,
  content_guard_extra_output_words: '',
}

export function getApiKeyFormDefaultValues(
  defaultUseAutoGroup: boolean
): ApiKeyFormValues {
  return {
    ...API_KEY_FORM_DEFAULT_VALUES,
    group: defaultUseAutoGroup ? 'auto' : DEFAULT_GROUP,
    auto_groups_mode: 'inherit',
    auto_groups: [],
    cross_group_retry: defaultUseAutoGroup,
  }
}

// ============================================================================
// ContentGuard（川邮·星语：内容管控）
// ============================================================================

/**
 * 表单值 → content_guard JSON 字符串。
 * mode=inherit 时返回空串（表示"跟随全局"，后端按全局设置生效）；
 * mode=custom 时把 4 个开关与专属输出词序列化为 JSON。
 */
export function buildContentGuardPayload(data: {
  content_guard_mode?: 'inherit' | 'custom'
  content_guard_pii_redact?: boolean
  content_guard_harmful_block?: boolean
  content_guard_injection_block?: boolean
  content_guard_output_block?: boolean
  content_guard_extra_output_words?: string
}): string {
  if (data.content_guard_mode !== 'custom') {
    return ''
  }
  const extraWords = (data.content_guard_extra_output_words || '')
    .split('\n')
    .map((word) => word.trim())
    .filter(Boolean)

  return JSON.stringify({
    enabled: true,
    pii_redact: !!data.content_guard_pii_redact,
    harmful_block: !!data.content_guard_harmful_block,
    injection_block: !!data.content_guard_injection_block,
    output_block: !!data.content_guard_output_block,
    ...(extraWords.length > 0 ? { extra_output_words: extraWords } : {}),
  })
}

/**
 * content_guard JSON 字符串 → 表单值（空/非法时回退为"跟随全局"）。
 */
export function parseContentGuard(raw?: string | null): {
  content_guard_mode: 'inherit' | 'custom'
  content_guard_pii_redact: boolean
  content_guard_harmful_block: boolean
  content_guard_injection_block: boolean
  content_guard_output_block: boolean
  content_guard_extra_output_words: string
} {
  const fallback = {
    content_guard_mode: 'inherit' as const,
    content_guard_pii_redact: true,
    content_guard_harmful_block: true,
    content_guard_injection_block: true,
    content_guard_output_block: true,
    content_guard_extra_output_words: '',
  }
  if (!raw) {
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const extra = parsed.extra_output_words
    return {
      content_guard_mode: 'custom',
      content_guard_pii_redact: !!parsed.pii_redact,
      content_guard_harmful_block: !!parsed.harmful_block,
      content_guard_injection_block: !!parsed.injection_block,
      content_guard_output_block: !!parsed.output_block,
      content_guard_extra_output_words: Array.isArray(extra)
        ? extra.join('\n')
        : '',
    }
  } catch {
    return fallback
  }
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: ApiKeyFormValues
): ApiKeyFormData {
  return {
    name: data.name,
    remain_quota: data.unlimited_quota
      ? 0
      : parseQuotaFromDollars(data.remain_quota_dollars || 0),
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : -1,
    unlimited_quota: data.unlimited_quota,
    model_limits_enabled: data.model_limits.length > 0,
    model_limits: data.model_limits.join(','),
    allow_ips: data.allow_ips || '',
    group: data.group || '',
    auto_groups:
      data.group === 'auto' && data.auto_groups_mode === 'custom'
        ? data.auto_groups
        : [],
    cross_group_retry: data.group === 'auto' ? !!data.cross_group_retry : false,
    // 川邮·星语：令牌级限流/并发（0=不限制）
    rate_limit_rpm: data.rate_limit_rpm && data.rate_limit_rpm > 0
      ? data.rate_limit_rpm
      : 0,
    rate_limit_tpm: data.rate_limit_tpm && data.rate_limit_tpm > 0
      ? data.rate_limit_tpm
      : 0,
    max_concurrency: data.max_concurrency && data.max_concurrency > 0
      ? data.max_concurrency
      : 0,
    // 川邮·星语：内容管控（inherit → 空串表示跟随全局）
    content_guard: buildContentGuardPayload(data),
  }
}

/**
 * Transform API key data to form defaults
 */
export function transformApiKeyToFormDefaults(
  apiKey: ApiKey,
  availableAutoGroups: string[] = [],
  maxAutoGroups = 5
): ApiKeyFormValues {
  const availableSet = new Set(availableAutoGroups)
  const storedAutoGroups = apiKey.auto_groups ?? []
  const autoGroups = storedAutoGroups
    .filter((group) => availableSet.has(group))
    .slice(0, Math.max(0, maxAutoGroups))
  const autoGroupsMode = storedAutoGroups.length > 0 ? 'custom' : 'inherit'

  return {
    name: apiKey.name,
    remain_quota_dollars: apiKey.unlimited_quota
      ? 0
      : quotaUnitsToDollars(apiKey.remain_quota),
    expired_time:
      apiKey.expired_time > 0
        ? new Date(apiKey.expired_time * 1000)
        : undefined,
    unlimited_quota: apiKey.unlimited_quota,
    model_limits: apiKey.model_limits
      ? apiKey.model_limits.split(',').filter(Boolean)
      : [],
    allow_ips: apiKey.allow_ips || '',
    group: apiKey.group || DEFAULT_GROUP,
    auto_groups_mode: autoGroupsMode,
    auto_groups: autoGroups,
    cross_group_retry: !!apiKey.cross_group_retry,
    tokenCount: 1,
    // 川邮·星语：令牌级限流/并发回填（0 无限制显示为空）
    rate_limit_rpm: apiKey.rate_limit_rpm || undefined,
    rate_limit_tpm: apiKey.rate_limit_tpm || undefined,
    max_concurrency: apiKey.max_concurrency || undefined,
    // 川邮·星语：内容管控回填
    ...parseContentGuard(apiKey.content_guard),
  }
}
