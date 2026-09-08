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
	SmsRateLimitMark    = "SMS"
	smsMaxPerPhone      = 1
	smsPhoneWindowSec   = 60
	smsMaxPerIp         = 5
	smsIpWindowSec      = 60
	smsIpDailyLimit     = 20
	smsIpDailyWindowSec = 86400
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

// ============================================================================
// 取图（/api/phone/captcha）宽松频控 —— 与人机校验/短信频控分离
// 说明：获取几何图形挑战只是拉一张图（不消耗短信、不实际发码），
//
//	正常场景下用户"点错重试 / 换一张"会频繁请求，因此不能用短信频控
//	（60s 5 次）的限制把它卡死。这里用更宽松的防滥用阈值：
//	IP 60s 内 30 次   +  IP 每日 600 次，足以挡住真 bot，又不误伤真人。
//
// 真正的短信防轰炸仍由 /api/phone/verification 上的 SmsVerificationRateLimit 承担。
// ============================================================================
const (
	CaptchaRateLimitMark    = "CAPTCHA"
	captchaMaxPerIpWindow   = 30
	captchaIpWindowSec      = 60
	captchaIpDailyLimit     = 600
	captchaIpDailyWindowSec = 86400
)

// CaptchaRateLimit 挂到 captcha 取图路由上（宽松）
func CaptchaRateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		checks := []struct {
			key   string
			max   int
			win   int64
			label string
		}{
			{fmt.Sprintf("%s:I:%s", CaptchaRateLimitMark, c.ClientIP()), captchaMaxPerIpWindow, captchaIpWindowSec, "操作过于频繁，请稍后再试"},
			{fmt.Sprintf("%s:D:%s", CaptchaRateLimitMark, c.ClientIP()), captchaIpDailyLimit, captchaIpDailyWindowSec, "今日操作次数已达上限，请明天再试"},
		}
		for _, chk := range checks {
			if !takeWindowAllow(c, chk.key, chk.max, chk.win) {
				c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": chk.label})
				c.Abort()
				return
			}
		}
		c.Next()
	}
}
