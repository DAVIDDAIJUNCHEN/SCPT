package service

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// maskCode 验证码脱敏：真实通道落库前掩码（如 123456 → 1****6），mock 通道保留明文供教学演示。
func maskCode(code string) string {
	if len(code) <= 2 {
		return "******"
	}
	return code[:1] + "****" + code[len(code)-1:]
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

// aliyunPercentEncode RFC3986 编码：仅保留 A-Z a-z 0-9 - _ . ~
func aliyunPercentEncode(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~' {
			b.WriteByte(c)
		} else {
			b.WriteString(fmt.Sprintf("%%%02X", c))
		}
	}
	return b.String()
}

func (p AliyunSmsProvider) Send(phone, code, purpose string) error {
	if p.accessKeyId == "" || p.accessKeySecret == "" || p.signName == "" || p.templateCode == "" {
		return fmt.Errorf("阿里云短信未配置：需设置 SMS_ACCESS_KEY_ID/SMS_ACCESS_KEY_SECRET/SMS_SIGN_NAME/SMS_TEMPLATE_CODE")
	}

	// RPC 风格签名（V1.0, HMAC-SHA1），详见阿里云「短信服务 API 签名机制」
	params := map[string]string{
		"AccessKeyId":      p.accessKeyId,
		"Action":           "SendSms",
		"Format":           "JSON",
		"RegionId":         "cn-hangzhou",
		"SignatureMethod":  "HMAC-SHA1",
		"SignatureNonce":   fmt.Sprintf("%d%d", time.Now().UnixNano(), rand.Int63n(1e6)),
		"SignatureVersion": "1.0",
		"Timestamp":        time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"Version":          "2017-05-25",
		"PhoneNumbers":     phone,
		"SignName":         p.signName,
		"TemplateCode":     p.templateCode,
		"TemplateParam":    fmt.Sprintf(`{"code":"%s"}`, code),
	}

	// 1) 按字典序拼接规范化请求串
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var canonical strings.Builder
	for i, k := range keys {
		if i > 0 {
			canonical.WriteByte('&')
		}
		canonical.WriteString(aliyunPercentEncode(k))
		canonical.WriteByte('=')
		canonical.WriteString(aliyunPercentEncode(params[k]))
	}

	// 2) 待签名串: GET&%2F&<再次百分号编码的规范化串>
	toSign := "GET&%2F&" + aliyunPercentEncode(canonical.String())

	// 3) HMAC-SHA1，密钥为 AccessKeySecret + "&"
	mac := hmac.New(sha1.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(toSign))
	signature := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	// 4) 发起请求
	reqURL := "https://dysmsapi.aliyuncs.com/?" + canonical.String() + "&Signature=" + aliyunPercentEncode(signature)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(reqURL)
	if err != nil {
		model.RecordSmsLog(phone, maskCode(code), purpose, "aliyun", 0)
		return fmt.Errorf("阿里云短信请求失败: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Code    string `json:"Code"`
		Message string `json:"Message"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		model.RecordSmsLog(phone, maskCode(code), purpose, "aliyun", 0)
		return fmt.Errorf("阿里云短信响应解析失败: %v (body=%s)", err, string(body))
	}
	if result.Code != "OK" {
		model.RecordSmsLog(phone, maskCode(code), purpose, "aliyun", 0)
		return fmt.Errorf("阿里云短信发送失败: %s - %s", result.Code, result.Message)
	}

	model.RecordSmsLog(phone, maskCode(code), purpose, "aliyun", 1)
	log.Printf("[SMS-ALIYUN] sent to %s ok (purpose=%s)", phone, purpose)
	return nil
}

// ---------- 腾讯云 ----------
type TencentSmsProvider struct {
	secretId   string
	secretKey  string
	sdkAppId   string
	signName   string
	templateId string
}

func (TencentSmsProvider) Name() string { return "tencent" }

func (p TencentSmsProvider) Send(phone, code, purpose string) error {
	if p.secretId == "" || p.secretKey == "" {
		return fmt.Errorf("腾讯云短信未配置：需设置 SMS_ACCESS_KEY_ID/SMS_ACCESS_KEY_SECRET/SMS_SIGN_NAME/SMS_TEMPLATE_ID")
	}
	// TODO(commercial): 调用腾讯云 SMS（tencentcloud-sdk-go sms.v20210111）
	model.RecordSmsLog(phone, maskCode(code), purpose, "tencent", 0)
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
