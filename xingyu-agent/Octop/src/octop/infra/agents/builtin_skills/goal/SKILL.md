---
name: goal
description: 必须用于用户给出明确交付目标的任务（做一份文档/报表/网页/脚本/课件等可验收交付物）。把目标拆成可客观核验的标准，干活后用验收器实测+判定，未达标自动补跑，治「看起来做完了」。Must use when the user states a concrete deliverable goal; derive verifiable criteria, verify with machine checks + judge model, auto-rework unmet items.
metadata:
  octop:
    emoji: "🎯"
    label:
      zh: "目标验收循环"
      en: "Goal Acceptance Loop"
    summary:
      zh: "拆验收标准→产出→机器实测+判定模型验收→未达标精准补齐（上限 3 轮）。"
      en: "Derive criteria → build → verify by machine checks + judge → rework unmet only (max 3 rounds)."
---

# 目标验收循环（Goal）

用户给出明确交付目标时启用本技能：agent 说「已完成」≠文件真的落盘且能用。本技能建立验收闭环，确保打勾的每一条都是真的。

## 何时启用 / 何时不启用

- **启用**：用户要求产出可检验的交付物（文档/表格/网页/脚本/课件/报告），且目标是具体的。
- **不启用**：纯问答、闲聊、开放式探索（无明确「完成」判据的任务不要硬造标准）。

## 第一阶段：拆验收标准

开工前，把用户目标拆成 **3~6 条可客观核验**的标准，写入工作区 `goal.json`：

```json
{
  "text": "用户目标原文（≤500 字）",
  "criteria": [
    {"text": "生成 report.docx，能被 Word 打开", "done": false},
    {"text": "包含红头、正文、落款三部分", "done": false}
  ],
  "status": "active",
  "round": 0
}
```

拆标准的原则：
- 每条都能**对着成果文件判真假**；禁止「尽量」「良好」「美观」这类无法验收的词；
- 拆不出 3 条时宁少勿滥，2 条硬标准好过 6 条虚标准；
- 拆解拿不准时，直接用目标原文当唯一标准——**绝不让任务卡在拆解上**。

## 第二阶段：干活

按正常流程产出交付物。每一轮干活时心里对着未达成的标准做，别跑偏。

## 第三阶段：验收

本轮收尾时，**只拿这一轮真正写过/改过的文件**当证据（防止拿工作区旧文件打勾），执行验收器：

```bash
python3 "{{OCTOP_BUILTIN_SKILLS}}/goal/scripts/goal_verify.py" \
  --goal-file goal.json \
  --files report.docx data.xlsx page.html \
  --final-text "本轮完成情况汇报"
```

验收器做两层判定：
1. **机器实测**（硬证据）：JS 过 `node --check`、JSON 可解析、HTML 标签配对、Python 语法检查——标 ✗ 的文件涉及标准一律不打勾；
2. **判定模型是非题**（星语 DeepSeek-V4.1-Flash）：逐条问「这条标准达成了吗」+ 确定度；**确定度过线（P≥0.75）才打勾**，拿不准的只留痕不打勾。

验收器输出 verdict JSON，按其中 `rework_prompt` 行动：

- **全部达成**（`progress.done == total`）：把 `goal.json` 的 `status` 改为 `done`，向用户汇报目标卡（✓ 清单）并结束；
- **有未达成**：把 `goal.json` 的 `round` 加 1，**只补未达成项，别重做已达成的部分**，然后回到第二阶段；
- **round 达到 3 仍未全达成**：停止补跑，向用户如实汇报未达成项与原因（哪一步没跑通），**绝不静默假装完成**。

## 工程红线（每轮都适用）

1. **宁可漏判不可错判**：验收器没按格式回话/调用失败 → 全部保持原状，写明原因；
2. **打勾必须真实**：拿不准算没达成，否则目标卡退化成装饰品；
3. **证据范围收紧**：只认本轮真正写过的文件；
4. **失败要写明原因**：静默失败最坑（用户以为活没干好，其实是验收那步没跑通）；
5. **原子写 goal.json**：先写临时文件再 rename，断电不留半个 JSON。

## 判定模型配置

验收器从环境变量 `XY_AGENT_TOKEN`（或 `STARWHISPER_API_KEY`）读星语网关 token，调 `DeepSeek-V4.1-Flash` 做是非题判定（便宜快）。token 未配时自动降级为「仅机器实测」，模型判断全部保持原状并在 notes 写明。
