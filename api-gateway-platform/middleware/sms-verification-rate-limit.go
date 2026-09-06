package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// 短信验证码频控（AlloMax 二次开发 · 防短信轰炸）
// 双维度固定窗口：同一手机号 60s 内 1 次；同一 IP 60s 内 5 次；同一 IP 每日 20 次。
// Redis 不可用时回退到共享内存限流器 inMemoryRateLimiter（rate-limit.go 已初始化）。

const (
	SmsRateLimitMark         = "SMS"
	smsMaxPerPhone           = 1
	smsPhoneWindowSec        = 60
	smsMaxPerIp              = 5
	smsIpWindowSec           = 60
	smsIpDailyLimit          = 20
	smsIpDailyWindowSec      = 86400
)

// SmsVerificationRateLimit 挂到发码路由上
func SmsVerificationRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		phone := c.Query("phone")
		if phone == "" {
			phone = c.PostForm("phone")
		}

		checks := []struct {
			key   string
			max   int
			win   int64
			label string
		}{
			{fmt.Sprintf("%s:P:%s", SmsRateLimitMark, phone), smsMaxPerPhone, smsPhoneWindowSec,
				fmt.Sprintf("发送过于频繁，请 %d 秒后再试", smsPhoneWindowSec)},
			{fmt.Sprintf("%s:I:%s", SmsRateLimitMark, c.ClientIP()), smsMaxPerIp, smsIpWindowSec,
				fmt.Sprintf("发送过于频繁，请 %d 秒后再试", smsIpWindowSec)},
			{fmt.Sprintf("%s:D:%s", SmsRateLimitMark, c.ClientIP()), smsIpDailyLimit, smsIpDailyWindowSec,
				"今日发送次数已达上限，请明天再试"},
		}
		for _, chk := range checks {
			if !takeWindowAllow(c, chk.key, chk.max, chk.win) {
				c.JSON(http.StatusTooManyRequests,
					gin.H{"success": false, "message": chk.label})
				c.Abort()
				return
			}
		}
		c.Next()
	}
}

// takeWindowAllow 固定窗口放行判断（Redis 优先，失败回退内存）。只判断，不写响应。
func takeWindowAllow(c *gin.Context, key string, maxRequests int, windowSec int64) bool {
	allowed, _, _, err := redisFixedWindowTake(c.Request.Context(), key, maxRequests, windowSec)
	if err == nil {
		return allowed
	}
	return inMemoryRateLimiter.Request(key, maxRequests, windowSec)
}
