package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// ============================================================
// AlloMax 二次开发：响应缓存（Response Cache）
//
// 与「DeepSeek 提示词缓存」的区别：
//   - prompt cache：供应商侧对相同前缀做 KV 缓存，仍调用模型、仍占 GPU
//   - 本响应缓存：网关侧缓存「完全相同请求」的完整响应，命中不调用模型、不占 GPU
//
// v1 范围（有意收紧，确保安全）：
//   - 仅非流式请求
//   - 默认仅缓存确定性请求（temperature 为 0 或未设置）
//   - 键 = 整个请求体的 sha256（最保守，杜绝误命中）
//   - 命中仍计费，但按 ResponseCacheDiscountRatio 打折（默认 10%）
// ============================================================

// ResponseCacheStats 简易运行计数（用于观测）
var (
	responseCacheHitCount  int64
	responseCacheMissCount int64
	responseCacheStoreSkip int64
)

// GetResponseCacheStats 返回 (hit, miss, storeSkipped)
func GetResponseCacheStats() (int64, int64, int64) {
	return responseCacheHitCount, responseCacheMissCount, responseCacheStoreSkip
}

// isDeterministicRequest 判断请求是否为确定性请求（temperature 为 0 或未设置）
func isDeterministicRequest(request dto.Request) bool {
	req, ok := request.(*dto.GeneralOpenAIRequest)
	if !ok || req == nil {
		return false
	}
	if req.Temperature == nil {
		return true // 未设置 → 采用上游默认（固定值）
	}
	return *req.Temperature == 0
}

// isStreamRequest 判断是否流式
func isStreamRequest(request dto.Request) bool {
	req, ok := request.(*dto.GeneralOpenAIRequest)
	if !ok || req == nil {
		return false
	}
	return req.Stream != nil && *req.Stream
}

// ResponseCacheKeyOf 计算请求的缓存键；ok=false 表示该请求不参与缓存
func ResponseCacheKeyOf(request dto.Request, modelName string) (string, bool) {
	if request == nil {
		return "", false
	}
	if isStreamRequest(request) {
		return "", false // v1 仅非流式
	}
	if setting.ResponseCacheOnlyDeterministic && !isDeterministicRequest(request) {
		return "", false
	}
	raw, err := common.Marshal(request)
	if err != nil {
		return "", false
	}
	sum := sha256.Sum256(raw)
	return setting.ResponseCachePrefix + modelName + ":" + hex.EncodeToString(sum[:]), true
}

// GetResponseCacheBody 读取缓存
func GetResponseCacheBody(ctx context.Context, key string) ([]byte, bool) {
	if key == "" || common.RDB == nil {
		return nil, false
	}
	body, err := common.RDB.Get(ctx, key).Bytes()
	if err != nil || len(body) == 0 {
		return nil, false
	}
	return body, true
}

// SetResponseCacheBody 写入缓存（超限/异常静默跳过，不影响主流程）
func SetResponseCacheBody(ctx context.Context, key string, body []byte) {
	if key == "" || common.RDB == nil || len(body) == 0 {
		return
	}
	maxBytes := setting.ResponseCacheMaxBodyKB * 1024
	if maxBytes <= 0 {
		maxBytes = 256 * 1024
	}
	if len(body) > maxBytes {
		responseCacheStoreSkip++
		return
	}
	ttl := setting.ResponseCacheTTLSeconds
	if ttl <= 0 {
		ttl = 3600
	}
	_ = common.RDB.Set(ctx, key, body, time.Duration(ttl)*time.Second).Err()
}

// StoreResponseCacheFromBody 在响应成功后写缓存（usage 用于「最小输出 token」过滤）
func StoreResponseCacheFromBody(c *gin.Context, request dto.Request, modelName string, body []byte, usage *dto.Usage) {
	if !setting.ResponseCacheEnabled || c == nil {
		return
	}
	key, ok := ResponseCacheKeyOf(request, modelName)
	if !ok {
		return
	}
	if setting.ResponseCacheMinTokens > 0 && usage != nil {
		if int(usage.CompletionTokens) < setting.ResponseCacheMinTokens {
			responseCacheStoreSkip++
			return
		}
	}
	SetResponseCacheBody(c.Request.Context(), key, body)
}

// ServeFromResponseCache 处理缓存命中：写回缓存响应 + 按折扣结算。
// 返回 true 表示已完全处理（调用方应直接 return，不再走中继）。
//
// 计费说明：命中不消耗 GPU，故按 ResponseCacheDiscountRatio 对「预估费用」打折结算。
// 这里刻意只走 SettleBilling（复用已建立的 BillingSession），
// 不走 PostTextConsumeQuota —— 后者假设完整中继上下文（已选渠道、组级阶梯计费已准备），
// 在「未选渠道」的缓存命中路径上不成立。
func ServeFromResponseCache(c *gin.Context, relayInfo *relaycommon.RelayInfo, key string, body []byte) bool {
	if c == nil || key == "" || len(body) == 0 {
		return false
	}

	// 标记命中
	common.SetContextKey(c, constant.ContextKeyResponseCacheHit, true)
	responseCacheHitCount++
	logger.LogInfo(c, "response cache hit")

	// 计费：按折扣结算
	if relayInfo != nil {
		ratio := setting.ResponseCacheDiscountRatio
		if ratio < 0 {
			ratio = 0
		}
		if ratio > 1 {
			ratio = 1
		}
		base := relayInfo.FinalPreConsumedQuota
		if base < 0 {
			base = 0
		}
		discounted := int(math.Round(float64(base) * ratio))
		if err := SettleBilling(c, relayInfo, discounted); err != nil {
			logger.LogError(c, "response cache hit settle billing failed: "+err.Error())
		}
		logger.LogInfo(c, fmt.Sprintf("response cache hit billed %d (base %d, ratio %.2f)",
			discounted, base, ratio))
	}

	c.Data(http.StatusOK, "application/json", body)
	return true
}
