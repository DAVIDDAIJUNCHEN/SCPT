package setting

import "strings"

// ============================================================
// AlloMax 二次开发：内容管控（ContentGuard）全局开关与规则
//
// 能力下沉自 LiteLLM 串联方案中验证通过的 guardrail：
//   - 输入侧：PII 脱敏（reshape 后转发）/ 有害内容拦截 / 注入检测
//   - 输出侧：高风险词拦截
//
// 设计对齐 setting/sensitive.go 的既有模式（全局变量 + 系统选项持久化），
// per-token 覆盖见 Token.ContentGuard。
// ============================================================

// ContentGuardEnabled 内容管控总开关（false 时所有子项均不生效，便于灰度与一键回滚）
var ContentGuardEnabled = false

// ---- 输入侧 ----

// ContentGuardPIIRedact PII 脱敏（手机号/身份证/银行卡 → 占位符后放行，非拦截）
var ContentGuardPIIRedact = false

// ContentGuardHarmfulBlock 有害内容拦截（命中即 400）
var ContentGuardHarmfulBlock = false

// ContentGuardInjectionBlock 提示注入检测（命中即 400）
var ContentGuardInjectionBlock = false

// ---- 输出侧 ----

// ContentGuardOutputBlock 输出侧高风险词拦截（命中即 400，且不计费）
var ContentGuardOutputBlock = false

// ---- 词表（换行分隔，可通过系统设置维护）----

// ContentGuardHarmfulWords 有害内容词表
var ContentGuardHarmfulWords = strings.Join([]string{
	"制作炸弹", "贩卖毒品", "儿童色情", "邪教组织", "血腥暴力",
}, "\n")

// ContentGuardInjectionWords 提示注入特征词表
var ContentGuardInjectionWords = strings.Join([]string{
	"忽略以上", "忽略之前", "忽略你的系统提示",
	"ignore previous", "ignore all instructions",
	"越狱", "jailbreak",
}, "\n")

// ContentGuardOutputWords 输出侧高风险词表
var ContentGuardOutputWords = strings.Join([]string{
	"稳赚不赔", "保证收益", "100%安全",
}, "\n")

// ---- 拦截呈现方式 ----

// ContentGuardBlockMode 拦截后的呈现方式（决定终端用户体验）：
//
//	"message"（默认）—— 返回 HTTP 200 + 一条对话式「合规提示」作为助手回复。
//	                     客户端只会看到模型说"你的提问不合规"，不会弹"服务故障/请切换模型"。
//	"error"          —— 返回 HTTP 4xx + 错误对象（error.code=sensitive_words_detected）。
//	                     适合程序化调用方按错误码处理，但终端用户会看到报错。
//
// 说明：两种方式都**不做模型调用**（输入侧在预扣费前拦截，天然 0 计费），
// 且都会在 logs 表留下审计记录，便于合规追溯。
var ContentGuardBlockMode = "message"

// ContentGuardRefusalTemplate 合规提示正文模板，其中 %s 会被替换为具体拦截原因
var ContentGuardRefusalTemplate = "抱歉，你的提问未通过平台内容安全策略（%s），已被拦截。请调整表述后重试，如需帮助可联系平台管理员。"


// SplitLinesToWords 把换行分隔的词表转为切片（去空白、去空行）
func SplitLinesToWords(s string) []string {
	out := make([]string, 0, 8)
	for _, w := range strings.Split(s, "\n") {
		w = strings.TrimSpace(w)
		if w != "" {
			out = append(out, w)
		}
	}
	return out
}
