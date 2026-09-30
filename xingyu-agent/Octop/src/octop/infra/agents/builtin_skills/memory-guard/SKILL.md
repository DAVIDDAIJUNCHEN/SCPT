---
name: memory-guard
description: 记忆防线。治理星语 Agent 长期记忆库：拦截密钥明文、拦截「XX 已修好」类过期能力断言、清理任务日志类低值记忆。用户提到记忆泄露/凭据入库/记忆越攒越多/记了不该记的，或任务收尾时主动巡检。Memory hygiene: block secrets & stale capability claims, purge task-log noise.
metadata:
  octop:
    emoji: "🛡️"
    label:
      zh: "记忆防线"
      en: "Memory Guard"
    summary:
      zh: "密钥拒记→拒过期能力断言→低值记忆清理，直接治理 memory.sqlite。"
      en: "Block secrets & stale claims, purge noise, govern memory.sqlite."
---

# 记忆防线（Memory Guard）

星语 Agent 的长期记忆由 octop-memory 管线自动从对话中提炼晋升（raw_events → candidates → atoms），**agent 自己没有记忆写入工具，凭据和错误断言会趁人不注意被自动晋升**。线上已发生过真事故：cosyvoice 凭据片段被原样晋升进长期记忆。本技能是这套自动管线的防线。

## 三道防线

1. **密钥拒记**：记忆库是明文 SQLite，还会随 recall 注入每一次请求的系统提示词——密钥落库等于既写盘又外发。命中密钥模式 → 立即隔离。
2. **拒过期能力断言**：「内置 XX 工具现已支持 YY，此前的问题已解决」这类断言过期得最快、错得最贵，且写下它的那一刻恰好最自信。能力好不好用的时候试一次就知道，不该靠记。
3. **低值记忆清理**：一次性任务参数、运行日志、命令行回显不是长期记忆，是任务日志。攒多了挤占 recall 预算，稀释真正有用的用户偏好。

## 何时执行

- **任务收尾巡检**（推荐）：一次交付完成时跑 `guard`，顺手治一遍
- **用户点名**：用户说「查一下记忆」「别记这个」「把 XX 从记忆里删掉」
- **可疑信号**：对话里出现过密钥/密码/token 后必跑

## 执行方式

工作区内执行（只读安全模式先看后改）：

```bash
# 1) 干跑：只报发现，不改库
python3 "{{OCTOP_BUILTIN_SKILLS}}/memory-guard/scripts/memory_guard.py" guard --dry-run

# 2) 实治：隔离密钥/断言 + 清理低值（自动先备份）
python3 "{{OCTOP_BUILTIN_SKILLS}}/memory-guard/scripts/memory_guard.py" guard

# 3) 复检：确认防线内已无命中
python3 "{{OCTOP_BUILTIN_SKILLS}}/memory-guard/scripts/memory_guard.py" guard --dry-run
```

输出 verdict JSON（唯一出口）：`{quarantined, purged, kept, findings:[...]}`。

## 巡检红线

1. **只治 atoms + candidates**：raw_events 是 L0 审计层，设计上不可变、不进系统提示词，一律不动
2. **隔离优于删除**：置 `superseded_by='memory-guard'` + `deprecated_at`，recall 查询带 `deprecated_at IS NULL` 过滤，隔离即从召回消失；留原行可回溯
3. **判据要求主语和断言同时命中**（能力断言），不误伤「报销系统已换成飞书」这类真·世界事实
4. **拿不准的不动**：宁可漏拦不可错杀，发现可疑但不命中规则的记忆写进 findings 备注，让用户定夺
5. **改库前必备份**：`memory.sqlite.guard-bak-<ts>` 同目录留底
6. **复检才算完**：实治后必须再跑一次 dry-run 确认防线内已无命中

## 判据（自研规则，思路对标 OWB 事故记录，一行未抄）

**密钥模式**（任一命中即隔离）：
- `sk-` 开头 16+ 位、GitHub PAT（ghp_/gho_/ghu_/ghs_/ghr_）、Slack（xox[baprs]-）、AWS AKIA
- Bearer 头、`password|api_key|secret|token` 赋值式、中文「密码/口令/密钥(是/为/:)」
- 凭据片段标记：`凭据的第[一二三…]部分`、`token (前|后)半段`、`结尾应为 ...XXXX`

**过期能力断言**（主语 ∧ 断言同时命中）：
- 主语：工具/接口/api/服务端/后端/内置/系统/代码/程序/bug/渠道/模型/网关/端口/服务
- 断言：已解决/已修复/已修好/现已支持/已生效/已可用/已正常/不再有/问题不存在

**低值任务日志**（words 任一）：
- 运行参数回显：`提供的.*运行参数`、`参数[:：]`
- 一次性执行记录：`(运行|执行|调用).*(失败|成功|报错)`、`端口.*未运行`、`HTTP [0-9]`
- 只含当次任务细节（无跨会话价值）

## 边界

- 本技能治理**已入库**的记忆（事后防线）。事前防线靠行为准则：密钥不抄写不转述不落盘（用 `$(cat token.txt)` 式命令替换，见线上已验证做法）
- 判据是对抗性的，规则会有漏网。发现新泄露模式 → 更新本 SKILL.md 判据节 → commit
