package common

import (
	"testing"
)

// ============================================================================
// Think Guard —— 通过渠道级 param_override 实现的思考抑制配置
//
// 背景：glm-5.3-flash / qwen3.8-flash-next / DeepSeek-V4.1-Flash 是
// always-thinking 模型，在 agent 场景（WorkBuddy 等）下思考链会吃光输出
// 预算，导致首字 30~40s 甚至正文 0 字。该能力原先由本地 Python 代理
// (vllm-gateway-proxy.py v3.2) 承担，现下沉到星语网关。
//
// 策略（与本地代理 v3.2 实测结论一一对应）：
//   1. glm-5.3-flash → Effort Clamp：强制 reasoning_effort=low。
//      不动 enable_thinking——关掉会让推理泄漏进 content（正文 1697 字、
//      中文占比仅 25%）。保留思考通道使其被 parser 正常切分。
//   2. qwen3.8-flash-next / DeepSeek-V4.1-Flash → Disable Thinking：
//      chat_template_kwargs.enable_thinking=false + reasoning_effort=none。
//      两者必须同时设——仅 enable_thinking=false 压不住 reasoning_effort
//      （实测 V4.1 在 effort=low 下仍思考 7900 字、首字 93s）。
//
// 渠道映射（生产）：
//   渠道 3  = qwen3.8-flash-next    → disableThinkingOverride
//   渠道 4  = glm-5.3-flash         → effortClampOverride
//   渠道 12 = DeepSeek-V4.1-Flash   → disableThinkingOverride
//
// 本文件把这些生产配置 JSON 原样固化为「配置规格测试」：任何对语义的
// 破坏性改动（如 set 语义变为 keep_origin、conditions 失效）都会在此
// 被拦截。
// ============================================================================

// effortClampOverride 是 glm-5.3-flash 渠道（4）的 param_override 配置。
// 注意：渠道 4 只服务 glm-5.3-flash 一个模型，无需 model 条件。
func effortClampOverride() map[string]interface{} {
	return map[string]interface{}{
		"operations": []interface{}{
			map[string]interface{}{
				"path":  "reasoning_effort",
				"mode":  "set",
				"value": "low",
			},
		},
	}
}

// disableThinkingOverride 是 qwen3.8-flash-next（渠道 3）与
// DeepSeek-V4.1-Flash（渠道 12）的 param_override 配置。
// 渠道 3 的 models 字段含两个别名（qwen3.8-flash-next 及历史小写变体），
// 且重试时可能落到其他渠道，故保留 model 白名单条件做精确匹配。
func disableThinkingOverride(models []string) map[string]interface{} {
	conditions := make([]interface{}, 0, len(models))
	for _, m := range models {
		conditions = append(conditions, map[string]interface{}{
			"path":  "model",
			"mode":  "full",
			"value": m,
		})
	}
	return map[string]interface{}{
		"operations": []interface{}{
			map[string]interface{}{
				"path":       "chat_template_kwargs.enable_thinking",
				"mode":       "set",
				"value":      false,
				"conditions": conditions,
				"logic":      "OR",
			},
			map[string]interface{}{
				"path":       "reasoning_effort",
				"mode":       "set",
				"value":      "none",
				"conditions": conditions,
				"logic":      "OR",
			},
		},
	}
}

// ---- Effort Clamp（glm-5.3-flash，渠道 4）----

func TestThinkGuardEffortClampInjectsLow(t *testing.T) {
	// 客户端不传任何 reasoning 参数：注入 effort=low
	input := []byte(`{"model":"glm-5.3-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":100}`)
	out, err := ApplyParamOverride(input, effortClampOverride(), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"glm-5.3-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":100,"reasoning_effort":"low"}`, string(out))
}

func TestThinkGuardEffortClampForcesOverClientValue(t *testing.T) {
	// 客户端传 effort=high（如 WorkBuddy supportsReasoning=true）：强制覆盖为 low
	input := []byte(`{"model":"glm-5.3-flash","reasoning_effort":"high","messages":[{"role":"user","content":"hi"}]}`)
	out, err := ApplyParamOverride(input, effortClampOverride(), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"glm-5.3-flash","reasoning_effort":"low","messages":[{"role":"user","content":"hi"}]}`, string(out))
}

func TestThinkGuardEffortClampDoesNotTouchEnableThinking(t *testing.T) {
	// 关键语义：不动 enable_thinking / chat_template_kwargs——
	// 关掉会让 glm 的推理泄漏进 content（本地代理 v3.2 实测）
	input := []byte(`{"model":"glm-5.3-flash","chat_template_kwargs":{"temperature":0.7},"messages":[]}`)
	out, err := ApplyParamOverride(input, effortClampOverride(), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"glm-5.3-flash","chat_template_kwargs":{"temperature":0.7},"messages":[],"reasoning_effort":"low"}`, string(out))
}

func TestThinkGuardEffortClampUnconditionalWithinChannel(t *testing.T) {
	// 渠道 4 只服务 glm-5.3-flash，set 无条件覆盖（FORCE 语义）。
	// 这里验证即使 model 字段不同也覆盖——因为白名单靠渠道隔离而非条件。
	input := []byte(`{"model":"glm-5.3-flash","reasoning_effort":"medium"}`)
	out, err := ApplyParamOverride(input, effortClampOverride(), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"glm-5.3-flash","reasoning_effort":"low"}`, string(out))
}

// ---- Disable Thinking（qwen3.8-flash-next 渠道 3 / DeepSeek-V4.1-Flash 渠道 12）----

func TestThinkGuardDisableThinkingInjectsBothFields(t *testing.T) {
	// 客户端不传参数：注入 ctk.enable_thinking=false + effort=none（两者必须同时）
	input := []byte(`{"model":"qwen3.8-flash-next","messages":[{"role":"user","content":"hi"}],"max_tokens":100}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"qwen3.8-flash-next"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"qwen3.8-flash-next","messages":[{"role":"user","content":"hi"}],"max_tokens":100,"chat_template_kwargs":{"enable_thinking":false},"reasoning_effort":"none"}`, string(out))
}

func TestThinkGuardDisableThinkingForcesOverClientEffort(t *testing.T) {
	// 客户端传 effort=low：覆盖为 none（仅 enable_thinking=false 压不住 effort）
	input := []byte(`{"model":"DeepSeek-V4.1-Flash","reasoning_effort":"low","messages":[]}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"DeepSeek-V4.1-Flash"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"DeepSeek-V4.1-Flash","reasoning_effort":"none","messages":[],"chat_template_kwargs":{"enable_thinking":false}}`, string(out))
}

func TestThinkGuardDisableThinkingPreservesSiblingCtkKeys(t *testing.T) {
	// 嵌套 set 不得破坏 chat_template_kwargs 里的其他键（sjson 深写入语义）
	input := []byte(`{"model":"qwen3.8-flash-next","chat_template_kwargs":{"temperature":0.7},"messages":[]}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"qwen3.8-flash-next"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"qwen3.8-flash-next","chat_template_kwargs":{"temperature":0.7,"enable_thinking":false},"messages":[],"reasoning_effort":"none"}`, string(out))
}

func TestThinkGuardDisableThinkingModelWhitelistSkipsOthers(t *testing.T) {
	// 白名单外的模型（重试落错渠道时）：完全不注入
	input := []byte(`{"model":"some-other-model","reasoning_effort":"high","messages":[]}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"qwen3.8-flash-next", "DeepSeek-V4.1-Flash"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"some-other-model","reasoning_effort":"high","messages":[]}`, string(out))
}

func TestThinkGuardDisableThinkingMultipleModelsORLogic(t *testing.T) {
	// 多模型白名单 OR 逻辑：第二个名字命中
	input := []byte(`{"model":"DeepSeek-V4.1-Flash","messages":[]}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"qwen3.8-flash-next", "DeepSeek-V4.1-Flash"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"DeepSeek-V4.1-Flash","messages":[],"chat_template_kwargs":{"enable_thinking":false},"reasoning_effort":"none"}`, string(out))
}

func TestThinkGuardDisableThinkingClientAlreadyDisabled(t *testing.T) {
	// 客户端已显式 enable_thinking=false：set 结果一致（幂等），且补上 effort=none
	input := []byte(`{"model":"DeepSeek-V4.1-Flash","chat_template_kwargs":{"enable_thinking":true},"messages":[]}`)
	out, err := ApplyParamOverride(input, disableThinkingOverride([]string{"DeepSeek-V4.1-Flash"}), nil)
	if err != nil {
		t.Fatalf("ApplyParamOverride returned error: %v", err)
	}
	assertJSONEqual(t, `{"model":"DeepSeek-V4.1-Flash","chat_template_kwargs":{"enable_thinking":false},"messages":[],"reasoning_effort":"none"}`, string(out))
}
