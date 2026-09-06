package common

import "os"

// 手机号注册 / 短信验证码配置（AlloMax 二次开发）
// 环境变量覆盖（compose 中已预留）：
//   PHONE_REGISTER_ENABLED=true|false
//   SMS_PROVIDER=mock|aliyun|tencent
//   SMS_MOCK_RETURN_CODE=true|false   (mock 模式下 API 响应回传验证码，开发/教学便利)

var (
	PhoneRegisterEnabled     = true
	SmsProvider              = "mock"
	SmsMockReturnCode        = true
	SmsCodeLength            = 6
	SmsCodeValidMinutes      = 10 // 与 VerificationValidMinutes 保持一致即可，单独可调
	SmsSendIntervalSeconds   = 60 // 同一手机号发码最小间隔（秒）
	SmsDailySendLimitPerIp   = 20 // 同 IP 每日发码上限（防短信轰炸）
)

func init() {
	if v := os.Getenv("PHONE_REGISTER_ENABLED"); v != "" {
		PhoneRegisterEnabled = v != "false" && v != "0"
	}
	if v := os.Getenv("SMS_PROVIDER"); v != "" {
		SmsProvider = v
	}
	if v := os.Getenv("SMS_MOCK_RETURN_CODE"); v != "" {
		SmsMockReturnCode = v != "false" && v != "0"
	}
}
