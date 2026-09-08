package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// AlloMax 二次开发：自研几何图形+颜色人机校验（CAPTCHA）
// GET /api/phone/captcha  → 返回 challenge_id + svg + 题目
// 前端在“发送验证码”前弹出校验，用户点击目标图形后把坐标随发码请求一并提交

// GetCaptchaChallenge 生成人机校验挑战
func GetCaptchaChallenge(c *gin.Context) {
	ch := common.NewCaptchaChallenge()
	q := common.Question(ch)
	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"challenge_id": q.ChallengeID,
		"svg":          q.SVG,
		"prompt_cn":    q.PromptCN,
	})
}

// verifyCaptchaFromQuery 从发码请求解析并校验人机校验。
// 参数：captcha_id + captcha_x + captcha_y（点击坐标）。
// 通过返回 (true, "")；失败返回 (false, 提示消息)
func verifyCaptchaFromQuery(c *gin.Context) (bool, string) {
	id := c.Query("captcha_id")
	if id == "" {
		return false, "请完成人机验证"
	}
	x, errX := strconv.ParseFloat(c.Query("captcha_x"), 64)
	y, errY := strconv.ParseFloat(c.Query("captcha_y"), 64)
	if errX != nil || errY != nil {
		return false, "请完成人机验证"
	}
	if !common.VerifyCaptchaClick(id, x, y) {
		return false, "人机验证未通过，请重试"
	}
	return true, ""
}
