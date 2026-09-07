package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// 管理面未知 IP 登录告警（P0-1.2 方案 B）
// 配置(环境变量):
//   ADMIN_IP_WHITELIST=1.2.3.4,10.0.0.1  已知管理员 IP（逗号分隔）
//   FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx 飞书告警机器人
// 留空 ADMIN_IP_WHITELIST => 不限制（全放行，仅当日志）
// 留空 FEISHU_WEBHOOK_URL => 不推送

const (
	envAdminIPWhitelist = "ADMIN_IP_WHITELIST"
	envFeishuWebhook    = "FEISHU_WEBHOOK_URL"
)

// adminWhitelistIPs 返回已知管理员 IP 集合
func adminWhitelistIPs() map[string]struct{} {
	raw := os.Getenv(envAdminIPWhitelist)
	s := make(map[string]struct{})
	for _, p := range strings.Split(raw, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			s[p] = struct{}{}
		}
	}
	return s
}

// isKnownAdminIP 判断 IP 是否在白名单内（白名单为空时视为全部允许）
func isKnownAdminIP(ip string) bool {
	whitelist := adminWhitelistIPs()
	if len(whitelist) == 0 {
		return true
	}
	if ip == "" {
		return false
	}
	_, ok := whitelist[ip]
	return ok
}

// notifyUnknownAdminLogin 管理员从未知 IP 登录时推送飞书告警（含用户名）
func notifyUnknownAdminLogin(username, ip string) {
	webhook := os.Getenv(envFeishuWebhook)
	if webhook == "" {
		return
	}
	now := time.Now().Format("2006-01-02 15:04:05")
	msg := "[川邮·星语 · 安全告警]\n管理员从非白名单 IP 登录\n👤 管理员: " + username + "\n🌐 IP: " + ip + "\n🕒 时间: " + now

	payload := map[string]interface{}{
		"msg_type": "text",
		"content": map[string]string{
			"text": msg,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		common.SysError("notifyUnknownAdminLogin marshal: " + err.Error())
		return
	}

	// 异步发送，避免阻塞登录
	go func() {
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Post(webhook, "application/json", bytes.NewReader(body))
		if err != nil {
			common.SysError("notifyUnknownAdminLogin post: " + err.Error())
			return
		}
		resp.Body.Close()
	}()
}
