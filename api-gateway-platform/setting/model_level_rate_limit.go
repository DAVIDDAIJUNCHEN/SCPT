package setting

import (
	"encoding/json"
	"strings"
)

// ============================================================
// AlloMax 二次开发：模型级限流（per-model RPM）
//
// 星语既有限流的粒度：
//   - 用户级：middleware/model-rate-limit.go（按 userId，全站请求数）
//   - 令牌级：Token.RateLimitRPM/TPM（按 token）
// 缺「模型维度」限流 —— 用于保护共享稀缺算力，
// 例如限制 deepseek-v4-pro 每分钟最多 N 次，避免被少数人打满。
// ============================================================

// ModelLevelRateLimitEnabled 模型级限流总开关（默认关闭）
var ModelLevelRateLimitEnabled = false

// ModelLevelRateLimitWindowSeconds 限流窗口（秒），默认 60
var ModelLevelRateLimitWindowSeconds = 60

// ModelLevelRateLimit 规则 JSON，形如：
//
//	{"DeepSeek-V4-Pro-0813": 30, "qwen3.8-flash-next": 120, "*": 0}
//
// 值 = 该模型在窗口内允许的最大请求数；0 或缺失 = 不限。
// 键 "*" 为兜底默认值。
var ModelLevelRateLimit = ""

// ModelLevelRateLimitFromString 供选项系统写入
func ModelLevelRateLimitFromString(s string) {
	ModelLevelRateLimit = s
}

// GetModelLevelRateLimitMap 解析规则（非法 JSON 返回空表，即不限流）
func GetModelLevelRateLimitMap() map[string]int {
	out := map[string]int{}
	s := strings.TrimSpace(ModelLevelRateLimit)
	if s == "" {
		return out
	}
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return map[string]int{}
	}
	return out
}
