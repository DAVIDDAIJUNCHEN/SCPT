package controller

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

// AlloMax 二次开发：手机号验证码注册/登录
// 流程：SendPhoneCode 发码（短信/Mock）→ PhoneLogin 校验码
//       → 用户不存在则自动注册（验证码登录即注册），已存在直接登录
// 开关/通道：common.PhoneRegisterEnabled / service.NewSmsProvider()

var chinaPhonePattern = regexp.MustCompile(`^1[3-9][0-9]{9}$`)

// normalizeChinaPhone 中国大陆手机号归一化（容错 +86 / 86 前缀与空格）
func normalizeChinaPhone(raw string) (string, bool) {
	p := strings.TrimSpace(raw)
	p = strings.TrimPrefix(p, "+86")
	p = strings.TrimPrefix(p, "86")
	if !chinaPhonePattern.MatchString(p) {
		return "", false
	}
	return p, true
}

// SendPhoneCode GET /api/phone/verification?phone=138xxxxxxxx
// 生成验证码 → 注册到内存验证码表（10 分钟有效）→ 走短信 Provider 发送
func SendPhoneCode(c *gin.Context) {
	if !common.PhoneRegisterEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "手机号注册功能未启用",
		})
		return
	}
	phone, ok := normalizeChinaPhone(c.Query("phone"))
	if !ok {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}

	code := common.GenerateVerificationCode(common.SmsCodeLength)
	common.RegisterVerificationCodeWithKey(phone, code, common.PhoneVerificationPurpose)

	provider := service.NewSmsProvider()
	if err := provider.Send(phone, code, "login"); err != nil {
		common.ApiError(c, err)
		return
	}

	resp := gin.H{
		"success": true,
		"message": "",
	}
	// 仅 mock 通道：回传验证码便于开发与教学演示（生产通道不返回）
	if common.SmsProvider == "mock" && common.SmsMockReturnCode {
		resp["dev_code"] = code
	}
	c.JSON(http.StatusOK, resp)
}

// PhoneLogin POST /api/user/phone/login {"phone":"...","code":"..."}
// 验证码正确 → 查 phone 用户；不存在则自动注册并登录（验证码登录即注册）
func PhoneLogin(c *gin.Context) {
	if !common.PhoneRegisterEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "手机号登录功能未启用",
		})
		return
	}
	var req struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	phone, ok := normalizeChinaPhone(req.Phone)
	if !ok || strings.TrimSpace(req.Code) == "" {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	if !common.VerifyCodeWithKey(phone, req.Code, common.PhoneVerificationPurpose) {
		common.ApiErrorI18n(c, i18n.MsgUserVerificationCodeError)
		return
	}
	// 验证码一次性：校验通过即删除
	common.DeleteKey(phone, common.PhoneVerificationPurpose)

	user, err := model.GetUserByPhone(phone, false)
	if err != nil {
		// 用户不存在 → 自动注册
		user, err = autoRegisterByPhone(phone)
		if err != nil {
			common.ApiError(c, err)
			return
		}
	}
	if user.Status != common.UserStatusEnabled {
		common.ApiErrorI18n(c, i18n.MsgAuthUserBanned)
		return
	}
	setupLogin(user, c)
}

// autoRegisterByPhone 用手机号自动注册：username 用 u+手机号（手机号唯一保证用户名唯一），
// 随机密码（该用户以验证码登录，无需口令），DisplayName 脱敏展示。
func autoRegisterByPhone(phone string) (*model.User, error) {
	cleanUser := model.User{
		Username:      "u" + phone,
		Password:      common.GetRandomString(16),
		DisplayName:   "用户" + phone[len(phone)-4:],
		Phone:         phone,
		PhoneVerified: true,
		Role:          common.RoleCommonUser,
	}
	if err := cleanUser.Insert(0); err != nil {
		return nil, err
	}
	// 回读完整用户（Insert 已回填 Id，但完整读一遍确保 Setting/配额/AuthVersion 就绪）
	return model.GetUserById(cleanUser.Id, false)
}
