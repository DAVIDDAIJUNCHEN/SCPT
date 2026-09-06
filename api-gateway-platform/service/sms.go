package service

import (
	"fmt"
	"log"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// SmsProvider 短信发送抽象（AlloMax 二次开发）
// 上线流程：mock → 配置 aliyun/tencent 的 AK/SK/签名/模板后切换
type SmsProvider interface {
	Name() string
	Send(phone, code, purpose string) error
}

// ---------- Mock ----------
type MockSmsProvider struct{}

func (MockSmsProvider) Name() string { return "mock" }

func (MockSmsProvider) Send(phone, code, purpose string) error {
	log.Printf("[SMS-MOCK] phone=%s code=%s purpose=%s（验证码已写入 sms_logs 表，可后台查询）",
		phone, code, purpose)
	model.RecordSmsLog(phone, code, purpose, "mock", 1)
	return nil
}

// ---------- 阿里云 ----------
type AliyunSmsProvider struct {
	accessKeyId     string
	accessKeySecret string
	signName        string
	templateCode    string
}

func (AliyunSmsProvider) Name() string { return "aliyun" }

func (p AliyunSmsProvider) Send(phone, code, purpose string) error {
	if p.accessKeyId == "" || p.accessKeySecret == "" {
		return fmt.Errorf("阿里云短信未配置：需设置 SMS_ACCESS_KEY_ID/SMS_ACCESS_KEY_SECRET/SMS_SIGN_NAME/SMS_TEMPLATE_CODE")
	}
	// TODO(commercial): 调用阿里云 Dysmsapi（dysmsapi-2017-05-25 SendSms）
	// 接入点：https://dysmsapi.aliyuncs.com
	model.RecordSmsLog(phone, code, purpose, "aliyun", 0)
	return fmt.Errorf("阿里云短信通道待接入：请在 service/sms.go 补全 SendSms 调用")
}

// ---------- 腾讯云 ----------
type TencentSmsProvider struct {
	secretId    string
	secretKey   string
	sdkAppId    string
	signName    string
	templateId  string
}

func (TencentSmsProvider) Name() string { return "tencent" }

func (p TencentSmsProvider) Send(phone, code, purpose string) error {
	if p.secretId == "" || p.secretKey == "" {
		return fmt.Errorf("腾讯云短信未配置：需设置 SMS_ACCESS_KEY_ID/SMS_ACCESS_KEY_SECRET/SMS_SIGN_NAME/SMS_TEMPLATE_ID")
	}
	// TODO(commercial): 调用腾讯云 SMS（tencentcloud-sdk-go sms.v20210111）
	model.RecordSmsLog(phone, code, purpose, "tencent", 0)
	return fmt.Errorf("腾讯云短信通道待接入：请在 service/sms.go 补全 SendSms 调用")
}

// NewSmsProvider 按 common.SmsProvider 配置返回实现（未知值回退 mock 并告警）
func NewSmsProvider() SmsProvider {
	switch common.SmsProvider {
	case "aliyun":
		return AliyunSmsProvider{
			accessKeyId:     envOr("SMS_ACCESS_KEY_ID", ""),
			accessKeySecret: envOr("SMS_ACCESS_KEY_SECRET", ""),
			signName:        envOr("SMS_SIGN_NAME", ""),
			templateCode:    envOr("SMS_TEMPLATE_CODE", ""),
		}
	case "tencent":
		return TencentSmsProvider{
			secretId:   envOr("SMS_ACCESS_KEY_ID", ""),
			secretKey:  envOr("SMS_ACCESS_KEY_SECRET", ""),
			sdkAppId:   envOr("SMS_SDK_APP_ID", ""),
			signName:   envOr("SMS_SIGN_NAME", ""),
			templateId: envOr("SMS_TEMPLATE_ID", ""),
		}
	default:
		if common.SmsProvider != "mock" {
			log.Printf("[SMS] 未知 provider %q，回退 mock", common.SmsProvider)
		}
		return MockSmsProvider{}
	}
}
