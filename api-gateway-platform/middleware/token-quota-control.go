package middleware

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// AlloMax 二次开发：per-token 能力管控（对标 litellm key 级限制）
//
// 配置字段（Token）：
//   RateLimitRPM   int 每分钟请求数上限（0=不限制）
//   MaxConcurrency int 最大并发请求数（0=不限制）
//
// 语义：RPM / 并发超限 → HTTP 429（rate_limit_exceeded）。
// Redis 优先；Redis 不可用时 RPM 回退共享内存限流器，并发回退内存原子计数。
//
// 说明：TPM 与模型级参数钳制依赖请求体解析，见 M2b。

const (
	tokenQuotaRpmMark        = "allomax:tqr"
	tokenQuotaConcMark       = "allomax:tqc"
	tokenQuotaConcTTLSeconds = 90 // 并发计数自动过期兜底（防异常未释放）
)

// ---------------- 内存并发计数（Redis 不可用时） ----------------

var memConcurrency = map[string]*int32{}
var memConcurrencyMu sync.Mutex

func memConcurrencyIncr(key string) int {
	memConcurrencyMu.Lock()
	defer memConcurrencyMu.Unlock()
	p, ok := memConcurrency[key]
	if !ok {
		v := int32(0)
		p = &v
		memConcurrency[key] = p
	}
	return int(atomic.AddInt32(p, 1))
}

func memConcurrencyDecr(key string) {
	memConcurrencyMu.Lock()
	defer memConcurrencyMu.Unlock()
	if p, ok := memConcurrency[key]; ok {
		atomic.AddInt32(p, -1)
	}
}

// ---------------- 主中间件 ----------------

// TokenQuotaControl per-token 请求速率与并发管控
func TokenQuotaControl() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenKey := c.GetString("token_key")
		if tokenKey == "" {
			c.Next() // 非 token 认证路径（playground 等）跳过
			return
		}
		// 强制读 DB：令牌缓存可能不含管控字段（Redis 缓存旧 schema），DB 拿权威值
		token, err := model.GetTokenByKey(tokenKey, true)
		if err != nil || token == nil {
			c.Next() // 已过 TokenAuth，取不到规则时放行
			return
		}

		// ---- 并发上限（进入时计数，handler 完成后释放）----
		if token.MaxConcurrency > 0 {
			concKey := fmt.Sprintf("%s:%d", tokenQuotaConcMark, token.Id)
			cur := concIncr(c.Request.Context(), concKey)
			if cur > token.MaxConcurrency {
				concDecr(concKey)
				abortQuota429(c, fmt.Sprintf("并发请求数超过限制（%d），请稍后重试", token.MaxConcurrency))
				return
			}
			defer concDecr(concKey)
		}

		// ---- RPM（固定窗口 60s）----
		if token.RateLimitRPM > 0 {
			rpmKey := fmt.Sprintf("%s:%d", tokenQuotaRpmMark, token.Id)
			if !takeWindowAllow(c, rpmKey, token.RateLimitRPM, 60) {
				abortQuota429(c, fmt.Sprintf("请求频率超过限制（%d 次/分钟），请稍后重试", token.RateLimitRPM))
				return
			}
		}

		// ---- TPM（固定窗口 60s，Redis；粗粒度估算：body 字节/4 + 预估输出 2048）----
		if token.RateLimitTPM > 0 && common.RDB != nil {
			if err := takeTokenWindow(c, token.Id, token.RateLimitTPM); err != nil {
				abortQuota429(c, fmt.Sprintf("token 消耗超过限制（%d/分钟），请稍后重试", token.RateLimitTPM))
				return
			}
		}

		// ---- 模型级能力管控（ModelGuard：禁用模型 / 输出上限 / 思考档位白名单）----
		if token.ModelGuard != "" {
			if err := applyModelGuard(c, token); err != nil {
				abortModelGuard(c, err)
				return
			}
		}

		c.Next()
	}
}

func abortQuota429(c *gin.Context, message string) {
	c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
		"error": gin.H{
			"message": message,
			"type":    "rate_limit_error",
			"code":    "rate_limit_exceeded",
		},
	})
}

func concIncr(ctx context.Context, key string) int {
	if common.RDB != nil {
		cur, err := common.RDB.Incr(ctx, key).Result()
		if err == nil {
			if cur == 1 {
				common.RDB.Expire(ctx, key, tokenQuotaConcTTLSeconds*time.Second)
			}
			return int(cur)
		}
	}
	return memConcurrencyIncr(key)
}

func concDecr(key string) {
	if common.RDB != nil {
		common.RDB.Decr(context.Background(), key)
		return
	}
	memConcurrencyDecr(key)
}

// ---------------- TPM ----------------

const tokenQuotaTpmMark = "allomax:tqt"

// takeTokenWindow 按估算消耗累计 token（INCRBY + 首窗 EXPIRE）。超限返回 error。
func takeTokenWindow(c *gin.Context, tokenId int, limitPerMin int) error {
	if common.RDB == nil {
		return nil // 无 Redis 时 TPM 不做硬限制（RPM/并发已有内存回退）
	}
	est := estimateRequestTokens(c)
	key := fmt.Sprintf("%s:%d", tokenQuotaTpmMark, tokenId)
	ctx := c.Request.Context()
	cur, err := common.RDB.IncrBy(ctx, key, int64(est)).Result()
	if err != nil {
		return nil // Redis 异常时不拦截，避免误杀
	}
	if cur == int64(est) {
		common.RDB.Expire(ctx, key, 60*time.Second)
	}
	if cur > int64(limitPerMin) {
		return fmt.Errorf("tpm limit exceeded")
	}
	return nil
}

func estimateRequestTokens(c *gin.Context) int {
	// 粗粒度：输入 = body 字节数/4（约等于字符→token 估算），输出按 2048 兜底
	bodyLen := 0
	if storage, err := common.GetBodyStorage(c); err == nil {
		if bs, err := storage.Bytes(); err == nil {
			bodyLen = len(bs)
		}
	}
	est := bodyLen/4 + 2048
	if est < 1 {
		est = 2048
	}
	return est
}

// ---------------- ModelGuard（模型级能力管控） ----------------

// ModelGuardRule 与 Token.ModelGuard JSON 对应
type ModelGuardRule struct {
	// 全局默认（无 per-model 命中时生效）
	Disabled         bool                   `json:"disabled,omitempty"`
	MaxOutputTokens  int                    `json:"max_output_tokens,omitempty"`
	ReasoningEfforts []string               `json:"reasoning_efforts,omitempty"`
	Models           map[string]ModelGuardModel `json:"models,omitempty"`
}

type ModelGuardModel struct {
	Disabled         bool     `json:"disabled,omitempty"`
	MaxOutputTokens  int      `json:"max_output_tokens,omitempty"`
	ReasoningEfforts []string `json:"reasoning_efforts,omitempty"`
}

type modelGuardError struct {
	status  int
	message string
	code    string
}

func (e *modelGuardError) Error() string { return e.message }

func applyModelGuard(c *gin.Context, token *model.Token) error {
	var rule ModelGuardRule
	if err := common.UnmarshalJsonStr(token.ModelGuard, &rule); err != nil {
		return nil // 配置非法时放行（不因配置错误阻塞请求）
	}

	// 读取请求体关键字段（body 已可重放；非 JSON/不可读路径跳过）
	var meta struct {
		Model           string `json:"model"`
		MaxTokens       int    `json:"max_tokens"`
		ReasoningEffort string `json:"reasoning_effort"`
	}
	if err := common.UnmarshalBodyReusable(c, &meta); err != nil {
		return nil
	}
	if meta.Model == "" {
		return nil
	}

	// 命中 per-model 配置；未命中回退全局
	gm, hasModel := rule.Models[meta.Model]
	cfg := ModelGuardModel{
		Disabled:         rule.Disabled,
		MaxOutputTokens:  rule.MaxOutputTokens,
		ReasoningEfforts: rule.ReasoningEfforts,
	}
	if hasModel {
		cfg.Disabled = gm.Disabled
		cfg.MaxOutputTokens = gm.MaxOutputTokens
		cfg.ReasoningEfforts = gm.ReasoningEfforts
	}
	// 规则全空 → 无管控
	if !cfg.Disabled && cfg.MaxOutputTokens <= 0 && len(cfg.ReasoningEfforts) == 0 {
		return nil
	}

	if cfg.Disabled {
		return &modelGuardError{http.StatusForbidden,
			fmt.Sprintf("模型 %s 已被禁用，无法调用", meta.Model), "model_disabled"}
	}
	if cfg.MaxOutputTokens > 0 && meta.MaxTokens > cfg.MaxOutputTokens {
		return &modelGuardError{http.StatusBadRequest,
			fmt.Sprintf("模型 %s 的输出长度上限为 %d tokens（请求 %d）",
				meta.Model, cfg.MaxOutputTokens, meta.MaxTokens), "max_tokens_exceeded"}
	}
	if len(cfg.ReasoningEfforts) > 0 && meta.ReasoningEffort != "" {
		allowed := false
		for _, e := range cfg.ReasoningEfforts {
			if e == meta.ReasoningEffort {
				allowed = true
				break
			}
		}
		if !allowed {
			return &modelGuardError{http.StatusBadRequest,
				fmt.Sprintf("模型 %s 不支持 reasoning_effort=%s（允许：%v）",
					meta.Model, meta.ReasoningEffort, cfg.ReasoningEfforts),
				"reasoning_effort_not_allowed"}
		}
	}
	return nil
}

func abortModelGuard(c *gin.Context, err error) {
	if mge, ok := err.(*modelGuardError); ok {
		c.AbortWithStatusJSON(mge.status, gin.H{
			"error": gin.H{
				"message": mge.message,
				"type":    "model_guard_error",
				"code":    mge.code,
			},
		})
		return
	}
	c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{
		"error": gin.H{
			"message": err.Error(),
			"type":    "model_guard_error",
			"code":    "guard_error",
		},
	})
}
