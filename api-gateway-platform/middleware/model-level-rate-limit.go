package middleware

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// ============================================================
// AlloMax 二次开发：模型级限流（per-model RPM）
//
// 补齐星语缺失的「模型维度」限流粒度（现有仅 用户级 + 令牌级），
// 用于保护共享稀缺算力：限制热门大模型在窗口内的总请求数，
// 避免被少数人打满导致其他人不可用。
//
// 规则来自 setting.ModelLevelRateLimit（JSON），键为模型名，"*" 为兜底。
// Redis 优先，Redis 不可用时回退内存固定窗口（复用 takeWindowAllow）。
// ============================================================

const modelLevelRateLimitMark = "allomax:mrlm"

// ModelLevelRateLimit 模型级限流中间件
func ModelLevelRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !setting.ModelLevelRateLimitEnabled {
			c.Next()
			return
		}
		rules := setting.GetModelLevelRateLimitMap()
		if len(rules) == 0 {
			c.Next()
			return
		}

		var meta struct {
			Model string `json:"model"`
		}
		// body 可重放；非 JSON / 不可读路径直接放行
		if err := common.UnmarshalBodyReusable(c, &meta); err != nil || meta.Model == "" {
			c.Next()
			return
		}

		limit := rules[meta.Model]
		if limit <= 0 {
			limit = rules["*"]
		}
		if limit <= 0 {
			c.Next()
			return
		}

		window := setting.ModelLevelRateLimitWindowSeconds
		if window <= 0 {
			window = 60
		}
		key := fmt.Sprintf("%s:%s", modelLevelRateLimitMark, meta.Model)
		if !takeWindowAllow(c, key, limit, int64(window)) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": gin.H{
					"message": fmt.Sprintf(
						"模型 %s 已达到请求频率上限（每 %d 秒 %d 次），请稍后重试",
						meta.Model, window, limit),
					"type": "rate_limit_error",
					"code": "model_rate_limit_exceeded",
				},
			})
			return
		}
		c.Next()
	}
}
