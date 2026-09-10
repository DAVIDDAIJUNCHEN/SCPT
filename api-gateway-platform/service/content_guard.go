package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// ============================================================
// AlloMax 二次开发：内容管控（ContentGuard）核心逻辑
//
// 能力下沉自 LiteLLM 串联方案验证通过的 guardrail：
//   输入侧 —— PII 脱敏（reshape 后转发）/ 有害内容拦截 / 注入检测
//   输出侧 —— 高风险词拦截
//
// 设计对齐 middleware.ModelGuard：全局默认 + per-token JSON 覆盖。
// 计费语义：
//   输入侧拦截 → 预扣费前返回 error → 天然 0 计费
//   输出侧拦截 → 中继返回 error → relay.go deferred Billing.Refund → 0 计费
// ============================================================

// contentGuardContextKey 中间件解析结果在 gin.Context 中的缓存键
const contentGuardContextKey = "content_guard_config"

// ContentGuardConfig 生效的内容管控配置（全局默认叠加 per-token 覆盖后的结果）
type ContentGuardConfig struct {
	Enabled        bool
	PIIRedact      bool
	HarmfulBlock   bool
	InjectionBlock bool
	OutputBlock    bool

	// BlockMode 拦截呈现方式："message"（返回合规提示正文）/ "error"（返回 4xx 错误）
	BlockMode string
	// HistorySanitize 会话防污染：历史消息命中时净化（true）还是整单拦截（false）
	HistorySanitize bool

	HarmfulWords   []string
	InjectionWords []string
	OutputWords    []string
}

// contentGuardTokenRule Token.ContentGuard 的 JSON 结构（指针用于区分「未设置」与 false）
type contentGuardTokenRule struct {
	Enabled          *bool    `json:"enabled,omitempty"`
	PIIRedact        *bool    `json:"pii_redact,omitempty"`
	HarmfulBlock     *bool    `json:"harmful_block,omitempty"`
	InjectionBlock   *bool    `json:"injection_block,omitempty"`
	OutputBlock      *bool    `json:"output_block,omitempty"`
	BlockMode        *string  `json:"block_mode,omitempty"`
	HistorySanitize  *bool    `json:"history_sanitize,omitempty"`
	ExtraOutputWords []string `json:"extra_output_words,omitempty"`
}

// InputEnabled 输入侧是否需要执行管控
func (c *ContentGuardConfig) InputEnabled() bool {
	return c != nil && c.Enabled && (c.PIIRedact || c.HarmfulBlock || c.InjectionBlock)
}

// OutputEnabled 输出侧是否需要执行管控
func (c *ContentGuardConfig) OutputEnabled() bool {
	return c != nil && c.Enabled && c.OutputBlock
}

// BuildContentGuardConfig 以全局设置为默认，叠加 per-token JSON 覆盖。
// tokenRuleJSON 为空表示纯全局配置（无 per-token 覆盖）。
func BuildContentGuardConfig(tokenRuleJSON string) *ContentGuardConfig {
	cfg := &ContentGuardConfig{
		Enabled:        setting.ContentGuardEnabled,
		PIIRedact:      setting.ContentGuardPIIRedact,
		HarmfulBlock:   setting.ContentGuardHarmfulBlock,
		InjectionBlock: setting.ContentGuardInjectionBlock,
		OutputBlock:    setting.ContentGuardOutputBlock,
		BlockMode:      setting.ContentGuardBlockMode,
		HistorySanitize: setting.ContentGuardHistorySanitize,
		HarmfulWords:   setting.SplitLinesToWords(setting.ContentGuardHarmfulWords),
		InjectionWords: setting.SplitLinesToWords(setting.ContentGuardInjectionWords),
		OutputWords:    setting.SplitLinesToWords(setting.ContentGuardOutputWords),
	}

	if strings.TrimSpace(tokenRuleJSON) == "" {
		return cfg
	}

	var rule contentGuardTokenRule
	if err := common.UnmarshalJsonStr(tokenRuleJSON, &rule); err != nil {
		// 配置非法时保持全局默认（不因配置错误阻塞请求）
		return cfg
	}
	if rule.Enabled != nil {
		cfg.Enabled = *rule.Enabled
	}
	if rule.PIIRedact != nil {
		cfg.PIIRedact = *rule.PIIRedact
	}
	if rule.HarmfulBlock != nil {
		cfg.HarmfulBlock = *rule.HarmfulBlock
	}
	if rule.InjectionBlock != nil {
		cfg.InjectionBlock = *rule.InjectionBlock
	}
	if rule.OutputBlock != nil {
		cfg.OutputBlock = *rule.OutputBlock
	}
	if rule.BlockMode != nil {
		cfg.BlockMode = *rule.BlockMode
	}
	if rule.HistorySanitize != nil {
		cfg.HistorySanitize = *rule.HistorySanitize
	}
	if len(rule.ExtraOutputWords) > 0 {
		for _, w := range rule.ExtraOutputWords {
			if w = strings.TrimSpace(w); w != "" {
				cfg.OutputWords = append(cfg.OutputWords, w)
			}
		}
	}
	return cfg
}

// CacheContentGuardConfig 由中间件调用，把已解析配置缓存到请求上下文（避免 relay 侧二次解析）
func CacheContentGuardConfig(c *gin.Context, cfg *ContentGuardConfig) {
	if c == nil || cfg == nil {
		return
	}
	c.Set(contentGuardContextKey, cfg)
}

// ResolveContentGuard 由 relay 链路调用：优先取中间件缓存，缺失则按全局设置构建
func ResolveContentGuard(c *gin.Context) *ContentGuardConfig {
	if c != nil {
		if v, ok := c.Get(contentGuardContextKey); ok {
			if cfg, ok := v.(*ContentGuardConfig); ok && cfg != nil {
				return cfg
			}
		}
	}
	return BuildContentGuardConfig("")
}

// ---------------- PII 脱敏 ----------------

// 注意：Go regexp(RE2) 不支持 lookaround，故用「候选匹配 + 手工数字边界校验」替代 (?<!\d)/(?!\d)
var (
	rePIIIDCard   = regexp.MustCompile(`[0-9]{17}[0-9Xx]`)
	rePIIPhone    = regexp.MustCompile(`1[3-9][0-9]{9}`)
	rePIIBankCard = regexp.MustCompile(`[0-9]{16,19}`)
)

func isASCIIDigit(b byte) bool { return b >= '0' && b <= '9' }

// piiReplaceInText 用占位符替换匹配区间；命中数与后方/前方仍为数字的候选均跳过，避免截断长数字串
func piiReplaceInText(text string, re *regexp.Regexp, label string) (string, bool) {
	locs := re.FindAllStringIndex(text, -1)
	if len(locs) == 0 {
		return text, false
	}
	var b strings.Builder
	b.Grow(len(text))
	last := 0
	hit := false
	for _, loc := range locs {
		s, e := loc[0], loc[1]
		if s > 0 && isASCIIDigit(text[s-1]) {
			continue
		}
		if e < len(text) && isASCIIDigit(text[e]) {
			continue
		}
		b.WriteString(text[last:s])
		b.WriteString("【已脱敏-" + label + "】")
		last = e
		hit = true
	}
	if !hit {
		return text, false
	}
	b.WriteString(text[last:])
	return b.String(), true
}

// RedactPII 对文本做 PII 脱敏，返回脱敏后文本与是否命中
func RedactPII(text string) (string, bool) {
	if text == "" {
		return text, false
	}
	// 顺序：身份证（18位）→ 手机号（11位）→ 银行卡（16~19位，兜底）
	// 身份证先替换可避免 18 位号码被银行卡规则重复处理；边界校验保证长数字串不被截断
	rules := []struct {
		re    *regexp.Regexp
		label string
	}{
		{rePIIIDCard, "身份证"},
		{rePIIPhone, "手机号"},
		{rePIIBankCard, "银行卡"},
	}
	cur := text
	changed := false
	for _, r := range rules {
		if next, hit := piiReplaceInText(cur, r.re, r.label); hit {
			cur = next
			changed = true
		}
	}
	return cur, changed
}

// RedactPIIInRequest 就地脱敏请求中的消息文本，返回被改写的消息条数。
// 只改内存中的 request 结构：其经 GenRelayInfo → info.Request → TextHelper DeepCopy
// → adaptor.ConvertOpenAIRequest → Marshal 后发往上游，故无需改写 body。
func RedactPIIInRequest(request dto.Request) int {
	req, ok := request.(*dto.GeneralOpenAIRequest)
	if !ok || req == nil {
		return 0
	}
	changedMessages := 0
	for i := range req.Messages {
		m := &req.Messages[i]
		if m.IsStringContent() {
			if next, hit := RedactPII(m.StringContent()); hit {
				m.SetStringContent(next)
				changedMessages++
			}
			continue
		}
		// 多模态：仅改写 text 分片，保留图片等其它内容
		contents := m.ParseContent()
		if len(contents) == 0 {
			continue
		}
		modified := false
		for j := range contents {
			if contents[j].Type != dto.ContentTypeText || contents[j].Text == "" {
				continue
			}
			if next, hit := RedactPII(contents[j].Text); hit {
				contents[j].Text = next
				modified = true
			}
		}
		if modified {
			m.Content = contents
			changedMessages++
		}
	}
	return changedMessages
}

// ---------------- 命中检测 ----------------

// containsAnyWord 词表命中检测；caseInsensitive 用于英文特征词
func containsAnyWord(text string, words []string, caseInsensitive bool) (string, bool) {
	if text == "" || len(words) == 0 {
		return "", false
	}
	haystack := text
	if caseInsensitive {
		haystack = strings.ToLower(text)
	}
	for _, w := range words {
		if w == "" {
			continue
		}
		needle := w
		if caseInsensitive {
			needle = strings.ToLower(w)
		}
		if strings.Contains(haystack, needle) {
			return w, true
		}
	}
	return "", false
}

// blockReasonOf 对给定文本执行有害/注入检测，命中返回原因
func blockReasonOf(text string, cfg *ContentGuardConfig) (string, bool) {
	if cfg == nil || text == "" {
		return "", false
	}
	if cfg.HarmfulBlock {
		if w, hit := containsAnyWord(text, cfg.HarmfulWords, false); hit {
			return "有害内容: " + w, true
		}
	}
	if cfg.InjectionBlock {
		if w, hit := containsAnyWord(text, cfg.InjectionWords, true); hit {
			return "注入检测: " + w, true
		}
	}
	return "", false
}

// CheckInputBlock 输入侧整体检测（对全部消息拼接文本），命中返回拦截原因。
// 注意：这是"严格模式"（历史消息净化关闭 / 非 OpenAI 协议时的回退路径），
// 会把历史消息也纳入判断，可能导致会话被永久卡死 —— 参见 CheckAndSanitizeInput。
func CheckInputBlock(request dto.Request, cfg *ContentGuardConfig) (string, bool) {
	if request == nil || cfg == nil || !cfg.Enabled {
		return "", false
	}
	if !cfg.HarmfulBlock && !cfg.InjectionBlock {
		return "", false
	}
	meta := request.GetTokenCountMeta()
	if meta == nil || meta.CombineText == "" {
		return "", false
	}
	return blockReasonOf(meta.CombineText, cfg)
}

// ============================================================
// 会话防污染：区分「最新输入」与「历史消息」
//
// 问题：原实现扫描全部消息拼接文本，一旦某一轮出现管控内容，该内容会长期留在
// 客户端会话历史中 → 之后每轮（哪怕用户发的是合规内容）都被命中拦截 →
// 整个任务窗口不可用（Agent 类客户端尤其明显，因为 Agent 会持续重发完整历史）。
//
// 解决：只对"最新一条 user 消息"做拦截；历史消息改为就地净化（替换为占位符）。
// 净化的内容不会到达模型，因此不构成绕过。
// ============================================================

// openAIMessageList 取出可逐条处理的消息列表（目前只有 OpenAI 协议可写）
func openAIMessageList(request dto.Request) (*dto.GeneralOpenAIRequest, bool) {
	req, ok := request.(*dto.GeneralOpenAIRequest)
	if !ok || req == nil || len(req.Messages) == 0 {
		return nil, false
	}
	return req, true
}

// messageText 读取一条消息的文本（多模态仅取 text 分片）
func messageText(m *dto.Message) string {
	if m == nil {
		return ""
	}
	if m.IsStringContent() {
		return m.StringContent()
	}
	var sb strings.Builder
	for _, part := range m.ParseContent() {
		if part.Type == dto.ContentTypeText {
			sb.WriteString(part.Text)
		}
	}
	return sb.String()
}

// replaceIgnoreCase 大小写不敏感地替换全部出现（不可用正则，避免 compile 开销与转义坑）
func replaceIgnoreCase(text, word, repl string) (string, bool) {
	if word == "" {
		return text, false
	}
	lowerText := strings.ToLower(text)
	lowerWord := strings.ToLower(word)
	if !strings.Contains(lowerText, lowerWord) {
		return text, false
	}
	var sb strings.Builder
	i := 0
	for {
		idx := strings.Index(lowerText[i:], lowerWord)
		if idx < 0 {
			sb.WriteString(text[i:])
			break
		}
		start := i + idx
		sb.WriteString(text[i:start])
		sb.WriteString(repl)
		i = start + len(word)
	}
	return sb.String(), true
}

// sanitizeMessage 就地净化一条消息中的命中词，返回是否有改动
func sanitizeMessage(m *dto.Message, cfg *ContentGuardConfig) bool {
	if m == nil || cfg == nil {
		return false
	}
	placeholder := setting.ContentGuardSanitizePlaceholder
	if placeholder == "" {
		placeholder = "【内容已被安全策略屏蔽】"
	}

	apply := func(text string) (string, bool) {
		changed := false
		if cfg.HarmfulBlock {
			for _, w := range cfg.HarmfulWords {
				if next, hit := replaceIgnoreCase(text, w, placeholder); hit {
					text, changed = next, true
				}
			}
		}
		if cfg.InjectionBlock {
			for _, w := range cfg.InjectionWords {
				if next, hit := replaceIgnoreCase(text, w, placeholder); hit {
					text, changed = next, true
				}
			}
		}
		return text, changed
	}

	if m.IsStringContent() {
		next, hit := apply(m.StringContent())
		if hit {
			m.SetStringContent(next)
		}
		return hit
	}

	contents := m.ParseContent()
	if len(contents) == 0 {
		return false
	}
	modified := false
	for j := range contents {
		if contents[j].Type != dto.ContentTypeText || contents[j].Text == "" {
			continue
		}
		if next, hit := apply(contents[j].Text); hit {
			contents[j].Text = next
			modified = true
		}
	}
	if modified {
		m.Content = contents
	}
	return modified
}

// CheckAndSanitizeInput 输入侧统一入口（会话防污染版）。
//
// 返回：(拦截原因, 是否拦截, 被净化的历史消息条数)
//   - 最新一条消息且角色为 user 命中 → 拦截（这是用户本次输入）
//   - 其他历史消息命中 → 就地净化为占位符，不拦截，让会话可以继续
//
// 净化关闭（cfg.HistorySanitize=false）时退化为旧的"整体拦截"语义。
// 非 OpenAI 协议无法逐条处理，同样退化为整体拦截（保守，不放过违规内容）。
func CheckAndSanitizeInput(request dto.Request, cfg *ContentGuardConfig) (string, bool, int) {
	if request == nil || cfg == nil || !cfg.Enabled {
		return "", false, 0
	}
	if !cfg.HarmfulBlock && !cfg.InjectionBlock {
		return "", false, 0
	}

	// 未开启净化 → 保持旧的严格语义
	if !cfg.HistorySanitize {
		if reason, hit := CheckInputBlock(request, cfg); hit {
			return reason, true, 0
		}
		return "", false, 0
	}

	req, ok := openAIMessageList(request)
	if !ok {
		// 非 OpenAI 协议：无法定位/改写单条消息，保守走整体拦截
		if reason, hit := CheckInputBlock(request, cfg); hit {
			return reason, true, 0
		}
		return "", false, 0
	}

	// 1) 最新一条消息是本次输入：命中即拦截
	lastIdx := len(req.Messages) - 1
	lastIsUserInput := strings.EqualFold(strings.TrimSpace(req.Messages[lastIdx].Role), "user")
	if lastIsUserInput {
		if reason, hit := blockReasonOf(messageText(&req.Messages[lastIdx]), cfg); hit {
			return reason, true, 0
		}
	}

	// 2) 其余（历史）消息：命中则净化，来源清洁后继续转发
	sanitized := 0
	for i := range req.Messages {
		if i == lastIdx && lastIsUserInput {
			continue // 已在上一步判定为合规
		}
		if sanitizeMessage(&req.Messages[i], cfg) {
			sanitized++
		}
	}
	return "", false, sanitized
}

// CheckOutputBlock 输出侧高风险词检测，命中返回拦截原因
func CheckOutputBlock(text string, cfg *ContentGuardConfig) (string, bool) {
	if cfg == nil || !cfg.Enabled || !cfg.OutputBlock || text == "" {
		return "", false
	}
	if w, hit := containsAnyWord(text, cfg.OutputWords, false); hit {
		return "输出管控-高风险词: " + w, true
	}
	return "", false
}

// ---------------- 输出侧：上下文读写 ----------------

// SetResponseText 由中继响应处理（如 OpenaiHandler）写入本次输出文本
func SetResponseText(c *gin.Context, text string) {
	if c == nil || text == "" {
		return
	}
	common.SetContextKey(c, constant.ContextKeyResponseText, text)
}

// CheckOutputGuardFromContext 读取上下文中的输出文本执行输出侧检查
func CheckOutputGuardFromContext(c *gin.Context, cfg *ContentGuardConfig) (string, bool) {
	if c == nil || cfg == nil || !cfg.OutputEnabled() {
		return "", false
	}
	text, ok := common.GetContextKeyType[string](c, constant.ContextKeyResponseText)
	if !ok || text == "" {
		return "", false
	}
	return CheckOutputBlock(text, cfg)
}

// ============================================================
// 拦截呈现方式（message / error）
//
// 背景：直接返回 4xx 时，客户端会把它渲染成"服务暂时不可用，请切换模型"，
// 终端用户完全看不出真实原因是内容触发，体验很差。
// 因此默认改为返回一条「合规提示」正文（HTTP 200），让用户看到的是"助手说不可回答"。
// 两种方式都不调用模型（输入侧在预扣费前拦截，天然 0 计费），也都会写审计日志。
// ============================================================

const (
	// BlockModeMessage 返回合规提示正文（HTTP 200，对话式）
	BlockModeMessage = "message"
	// BlockModeError 返回 4xx 错误对象（API 式）
	BlockModeError = "error"
)

// UseMessageMode 是否采用「返回合规提示正文」的呈现方式（默认 message）
func (c *ContentGuardConfig) UseMessageMode() bool {
	mode := ""
	if c != nil {
		mode = c.BlockMode
	}
	if strings.TrimSpace(mode) == "" {
		mode = setting.ContentGuardBlockMode
	}
	return !strings.EqualFold(strings.TrimSpace(mode), BlockModeError)
}

// RefusalText 生成合规提示正文（模板可由系统设置维护）
func RefusalText(reason string) string {
	tpl := strings.TrimSpace(setting.ContentGuardRefusalTemplate)
	if tpl == "" {
		tpl = "抱歉，你的提问未通过平台内容安全策略（%s），已被拦截。"
	}
	if strings.Contains(tpl, "%s") {
		return fmt.Sprintf(tpl, reason)
	}
	return tpl
}

// requestModelContextKey 本次请求的模型名缓存键（供拦截提示回填 model 字段）
const requestModelContextKey = "content_guard_request_model"

// CacheRequestModelName 从请求体读取模型名并缓存到上下文（best-effort，失败静默）。
// 之所以自己读而不是用 relayInfo.OriginModelName：后者依赖 ContextKeyOriginalModel，
// 而该 key 在生产代码中无人写入（仅测试写入），取值可能为空。
func CacheRequestModelName(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if v, ok := c.Get(requestModelContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	var meta struct {
		Model string `json:"model"`
	}
	name := ""
	if err := common.UnmarshalBodyReusable(c, &meta); err == nil {
		name = strings.TrimSpace(meta.Model)
	}
	c.Set(requestModelContextKey, name)
	return name
}

// GetRequestModelName 读取缓存的模型名
func GetRequestModelName(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if v, ok := c.Get(requestModelContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func contentGuardRefusalID(prefix string) string {
	return prefix + common.GetRandomString(24)
}

// WriteRefusalResponse 以「合规提示正文」形式返回 200 响应（替代 4xx 错误）。
// 支持 OpenAI（/v1/chat/completions）与 Claude（/v1/messages）两种客户端协议，
// 均覆盖流式与非流式。返回 true 表示已完整处理，调用方应直接 return。
// 其他协议（gemini / responses / realtime 等）返回 false，调用方回退到错误模式。
func WriteRefusalResponse(c *gin.Context, relayFormat types.RelayFormat, model string, isStream bool, text string) bool {
	if c == nil {
		return false
	}
	if strings.TrimSpace(model) == "" {
		model = GetRequestModelName(c)
	}
	if strings.TrimSpace(model) == "" {
		model = "content-guard"
	}
	switch relayFormat {
	case types.RelayFormatClaude:
		writeClaudeRefusal(c, model, isStream, text)
		return true
	case types.RelayFormatOpenAI:
		writeOpenAIRefusal(c, model, isStream, text)
		return true
	default:
		return false
	}
}

// ---- OpenAI 协议 ----

// BuildOpenAIRefusalBody 构造非流式 OpenAI 合规提示响应体（供输出侧替换上游正文使用）
func BuildOpenAIRefusalBody(model string, text string, usage *dto.Usage) []byte {
	if strings.TrimSpace(model) == "" {
		model = "content-guard"
	}
	payload := gin.H{
		"id":      contentGuardRefusalID("chatcmpl-"),
		"object":  "chat.completion",
		"created": time.Now().Unix(),
		"model":   model,
		"choices": []gin.H{{
			"index":         0,
			"message":       gin.H{"role": "assistant", "content": text},
			"finish_reason": "stop",
		}},
	}
	if usage != nil {
		payload["usage"] = usage
	} else {
		payload["usage"] = gin.H{"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return b
}

func writeOpenAIRefusal(c *gin.Context, model string, isStream bool, text string) {
	id := contentGuardRefusalID("chatcmpl-")
	created := time.Now().Unix()

	if !isStream {
		c.JSON(http.StatusOK, gin.H{
			"id":      id,
			"object":  "chat.completion",
			"created": created,
			"model":   model,
			"choices": []gin.H{{
				"index":         0,
				"message":       gin.H{"role": "assistant", "content": text},
				"finish_reason": "stop",
			}},
			"usage": gin.H{"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
		})
		return
	}

	// 流式：按 OpenAI SSE 协议输出，最后以 [DONE] 收尾
	c.Writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	chunk := func(delta gin.H, finishReason any) {
		b, err := json.Marshal(gin.H{
			"id":      id,
			"object":  "chat.completion.chunk",
			"created": created,
			"model":   model,
			"choices": []gin.H{{
				"index":         0,
				"delta":         delta,
				"finish_reason": finishReason,
			}},
		})
		if err != nil {
			return
		}
		_, _ = c.Writer.WriteString("data: " + string(b) + "\n\n")
	}
	chunk(gin.H{"role": "assistant", "content": ""}, nil)
	chunk(gin.H{"content": text}, nil)
	chunk(gin.H{}, "stop")
	_, _ = c.Writer.WriteString("data: [DONE]\n\n")
	c.Writer.Flush()
}

// ---- Claude 协议 ----

func writeClaudeRefusal(c *gin.Context, model string, isStream bool, text string) {
	id := contentGuardRefusalID("msg_")

	if !isStream {
		c.JSON(http.StatusOK, gin.H{
			"id":            id,
			"type":          "message",
			"role":          "assistant",
			"model":         model,
			"content":       []gin.H{{"type": "text", "text": text}},
			"stop_reason":   "end_turn",
			"stop_sequence": nil,
			"usage":         gin.H{"input_tokens": 0, "output_tokens": 0},
		})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.WriteHeader(http.StatusOK)

	emit := func(event string, payload gin.H) {
		b, err := json.Marshal(payload)
		if err != nil {
			return
		}
		_, _ = c.Writer.WriteString("event: " + event + "\ndata: " + string(b) + "\n\n")
	}

	emit("message_start", gin.H{
		"type": "message_start",
		"message": gin.H{
			"id": id, "type": "message", "role": "assistant", "model": model,
			"content": []gin.H{}, "stop_reason": nil, "stop_sequence": nil,
			"usage": gin.H{"input_tokens": 0, "output_tokens": 0},
		},
	})
	emit("content_block_start", gin.H{
		"type": "content_block_start", "index": 0,
		"content_block": gin.H{"type": "text", "text": ""},
	})
	emit("content_block_delta", gin.H{
		"type": "content_block_delta", "index": 0,
		"delta": gin.H{"type": "text_delta", "text": text},
	})
	emit("content_block_stop", gin.H{"type": "content_block_stop", "index": 0})
	emit("message_delta", gin.H{
		"type":  "message_delta",
		"delta": gin.H{"stop_reason": "end_turn", "stop_sequence": nil},
		"usage": gin.H{"output_tokens": 0},
	})
	emit("message_stop", gin.H{"type": "message_stop"})
	c.Writer.Flush()
}
