package setting

// ============================================================
// AlloMax 二次开发：响应缓存（Response Cache）
//
// 与「DeepSeek 提示词缓存（prompt cache）」是不同层次的东西：
//   - prompt cache：供应商侧对相同前缀做 KV 缓存，仍调用模型、仍占 GPU，
//     只是命中 token 计费打折（星语已有：CacheRatio / PromptCacheHitTokens）
//   - 响应缓存（本文件）：网关侧对「完全相同请求」缓存完整响应，
//     命中后不调用模型、不占 GPU，毫秒级返回
//
// 两者互补：前者省 prefill 计算，后者省整次推理。
// ============================================================

// ResponseCacheEnabled 响应缓存总开关（默认关闭）
var ResponseCacheEnabled = false

// ResponseCacheTTLSeconds 缓存有效期（秒）
var ResponseCacheTTLSeconds = 3600

// ResponseCacheDiscountRatio 命中时的计费折扣（1.0=全额，0=不计费）
// 命中不消耗 GPU，故默认按 10% 计费：既让用户受益，又避免被刷。
var ResponseCacheDiscountRatio = 0.1

// ResponseCacheOnlyDeterministic 仅缓存确定性请求（temperature 为 0 或未设置）。
// 打开可避免缓存到随机采样结果，强烈建议保持 true。
var ResponseCacheOnlyDeterministic = true

// ResponseCacheMinTokens 仅缓存「输出 token 数 >= 该值」的响应，
// 避免把短回复（成本极低）塞满缓存；0=不限制。
var ResponseCacheMinTokens = 0

// ResponseCacheMaxBodyKB 单条缓存响应体的最大体积（KB），超限不缓存
var ResponseCacheMaxBodyKB = 256

// ResponseCachePrefix 缓存键前缀
const ResponseCachePrefix = "allomax:rc:"
