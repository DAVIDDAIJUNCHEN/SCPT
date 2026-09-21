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
// ----------------------------------------------------------------------------
// Pricing Types
// ----------------------------------------------------------------------------

export type PricingVendor = {
  id: number
  name: string
  icon?: string
  description?: string
}

export type BillingUsageUnit = 'second' | 'count' | 'token' | 'credit'

export type BillingUsageFieldSchema = {
  type?: 'number' | 'boolean'
  unit?: BillingUsageUnit
  enum?: string[]
  description?: string | Record<string, string>
}

export type BillingUsageSchema = Record<string, BillingUsageFieldSchema>

export type BillingUsageExample = {
  label: string
  facts: Record<string, string | number>
}

export type PricingModel = {
  id: number
  model_name: string
  description?: string
  icon?: string
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  vendor_description?: string
  quota_type: number
  model_ratio: number
  completion_ratio: number
  model_price?: number
  cache_ratio?: number | null
  create_cache_ratio?: number | null
  image_ratio?: number | null
  audio_ratio?: number | null
  audio_completion_ratio?: number | null
  enable_groups: string[]
  tags?: string
  supported_endpoint_types?: string[]
  key?: string
  group_ratio?: Record<string, number>
  /** Billing mode (e.g. "tiered_expr") used to flag dynamic pricing */
  billing_mode?: string
  /** Raw expression describing dynamic / tiered billing */
  billing_expr?: string
  /** Task-plugin usage facts and their billing units. */
  billing_usage_schema?: BillingUsageSchema
  /** Display-only labeled usage vectors for pricing examples. */
  billing_usage_examples?: BillingUsageExample[]
  /** Pricing version returned by backend, useful for cache busting */
  pricing_version?: string
  /**
   * Optional model metadata fields reserved for backend-provided catalog data.
   * Keep them data-driven; do not synthesize display values on the client.
   */
  context_length?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  release_date?: string
  parameter_count?: string
  input_modalities?: Modality[]
  output_modalities?: Modality[]
  capabilities?: ModelCapability[]
}

/** Input/output modalities supported by a model. */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file'

/** Functional capabilities a model exposes. */
export type ModelCapability =
  | 'function_calling'
  | 'streaming'
  | 'vision'
  | 'json_mode'
  | 'structured_output'
  | 'reasoning'
  | 'tools'
  | 'system_prompt'
  | 'web_search'
  | 'code_interpreter'
  | 'caching'
  | 'embeddings'

export type PricingData = {
  success: boolean
  message?: string
  data: PricingModel[]
  vendors: PricingVendor[]
  group_ratio: Record<string, number>
  usable_group: Record<string, { desc: string; ratio: number }>
  supported_endpoint: Record<string, string>
  auto_groups: string[]
  /** 时段倍率（峰谷定价）配置，全局生效、与具体模型无关。 */
  time_ratio?: TimeRatioInfo
}

/**
 * 单条时段规则。区间语义为左闭右开 [start_hour, end_hour)，
 * 支持跨零点（start_hour > end_hour，例如 22 → 8 表示 22:00-次日 08:00）。
 */
export type TimeRatioRule = {
  name: string
  start_hour: number
  end_hour: number
  ratio: number
  /** 限定生效星期，空/缺省表示不限。0=周日 … 6=周六。 */
  days?: number[]
}

/** 当前时刻的时段状态，由后端算好，前端不做时段判定。 */
export type TimeRatioCurrent = {
  ratio: number
  /** 命中的时段名；未命中任何规则时为空串。 */
  name: string
  /** 判定所依据的本地小时，用于校准时区展示。 */
  hour: number
}

/** 时段倍率整体信息（/api/pricing 顶层字段）。 */
export type TimeRatioInfo = {
  enabled: boolean
  location: string
  rules: TimeRatioRule[]
  current: TimeRatioCurrent
}

export type TokenUnit = 'M' | 'K'
export type PriceType =
  | 'input'
  | 'output'
  | 'cache'
  | 'create_cache'
  | 'image'
  | 'audio_input'
  | 'audio_output'
export type QuotaType = 0 | 1 // 0: token-based, 1: per-request
