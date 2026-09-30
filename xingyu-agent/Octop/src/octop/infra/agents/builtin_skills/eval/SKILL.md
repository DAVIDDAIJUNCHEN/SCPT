---
name: eval
description: 评测框架。10 题校园场景题库 + 硬证据判分器，验证 agent 是「真做完」还是「看起来做完」。用户要求评测/验收/跑题库/回归测试时使用。Evaluation harness: campus-scenario tasks scored by hard evidence only.
metadata:
  octop:
    emoji: "🏁"
    label:
      zh: "评测框架"
      en: "Eval Harness"
    summary:
      zh: "校园题库→agent 做题→产物落盘→硬证据判分，区分真做完与看起来做完。"
      en: "Campus tasks → agent works → artifacts → hard-evidence scoring."
---

# 评测框架（Eval）

星语 Agent 每次换镜像/加技能后，「看起来能干活」和「真做完」是两回事。本技能用一套**判分只认硬证据**（文件存在/可解析/格式正确）的题库做回归验收，反向验收 goal/office-codegen/read-document 等所有施工项。

## 何时跑

- 新镜像上线后（skin-1k、1l…）全量跑一遍（回归）
- 改动 builtin 技能 / providers / middleware 后跑相关题
- 大王演示前跑一遍出成绩单

## 题库结构

题库在本技能 `cases/` 目录，一题一个 JSON（UTF-8）：

```json
{
  "id": "gw-basic",
  "title": "生成一份红头通知 docx",
  "prompt": "（发给 agent 的任务原文）",
  "skill_hint": "gongwen / office-codegen / read-document / goal …",
  "artifacts": ["通知.docx"],
  "checks": [
    {"type": "file_exists"},
    {"type": "zip_has_entry", "entry": "word/document.xml"},
    {"type": "docx_text_contains", "pattern": "通知"},
    {"type": "docx_font", "part": "body", "font": "仿宋"},
    {"type": "json_valid"},
    {"type": "py_compile"},
    {"type": "text_contains", "pattern": "总评"},
    {"type": "sh_compile"},
    {"type": "not_contains", "pattern": "TODO"}
  ]
}
```

出题原则（每题都必须过这三关）：
1. **产物先定义**：先想清楚「真做完」的产物是什么文件，再写 prompt；
2. **判分零主观**：每条 check 只看产物文件本身，不问模型「好不好」；
3. **破坏实验**：出完题先喂一份故意缺要素的产出，判分器必须判 FAIL——判不出假的题是废题。

## 执行方式

评测分两个阶段，**判分永远独立于做题**：

### 阶段一：做题（本技能驱动，逐题派活）

```bash
python3 "{{OCTOP_BUILTIN_SKILLS}}/eval/scripts/run_eval.py" --workspace /data/tmp/eval --list
python3 "{{OCTOP_BUILTIN_SKILLS}}/eval/scripts/run_eval.py" --workspace /data/tmp/eval --case gw-basic --stage work
```

- 每题一个独立子目录 `/data/tmp/eval/<id>/<run_ts>/`，**绝不用主工作区**（评测产物不污染真记忆、不混进交付目录）；
- `--stage work` 生成 `prompt.txt` 后按 SKILL.md「派活话术」把任务发给用户侧 agent 执行；产物应落在该子目录；
- 支持人工模式：`--no-send` 只出题不派活，大王想亲自考 agent 时直接拿 `prompt.txt` 粘贴。

### 阶段二：判分（纯机器，不调任何模型）

```bash
python3 "{{OCTOP_BUILTIN_SKILLS}}/eval/scripts/run_eval.py" --workspace /data/tmp/eval --case gw-basic --stage score
```

判分器只看产物目录里的文件，逐条 check 实测，输出成绩单：

```json
{"case": "gw-basic", "verdict": "FAIL", "passed": 2, "failed": 2,
 "detail": [{"check": "docx_font:body:仿宋", "ok": false, "note": "正文字体=Calibri"}],
 "evidence": "…实测明细…"}
```

## 判分器 check 类型（硬证据，全部本地实测）

| type | 判什么 |
|---|---|
| `file_exists` | 产物文件存在且非空 |
| `file_nonempty` | 文件存在且 >0 字节 |
| `zip_has_entry` | zip/docx/xlsx/pptx 含指定内部条目 |
| `docx_text_contains` | docx 主文档 XML 含指定文本 |
| `docx_font` | docx 指定部分（title/body）默认字体==期望 |
| `xlsx_formula` | xlsx 某列含指定公式函数（如 ROUND） |
| `json_valid` | JSON 可解析 |
| `json_field` | JSON 顶层字段存在 |
| `py_compile` | Python 语法可编译 |
| `sh_compile` | bash -n 通过 |
| `text_contains` | 文本文件含指定文本/正则 |
| `not_contains` | 文本文件不含指定文本/正则（防占位符/TODO） |
| `html_paired` | HTML html/script 标签配对 |
| `timeout_s` | 整题时限（缺省 600s，runner 强制） |

判分红线：**失败必须写明实测值**（「字体=Calibri」而非「字体不对」），让大王一眼看出 agent 差在哪。

## 题库（10 题，覆盖四类能力）

| # | id | 考什么 | 反向验收 |
|---|---|---|---|
| 1 | gw-basic | 红头通知 docx（仿宋正文+方标宋标题） | gongwen/迁移3 |
| 2 | xlsx-gradebook | 成绩单 Excel（ROUND 公式+及格人数统计） | office-codegen |
| 3 | ppt-course | 3 页课件 PPTX（标题+页数） | office-codegen |
| 4 | js-form-val | 表单校验 JS（node --check 通过+函数存在） | 代码能力 |
| 5 | py-stat-script | 统计脚本（py_compile+输出 JSON 字段） | 代码+执行 |
| 6 | html-page | 完整 HTML 页（标签配对+无占位符） | 代码能力 |
| 7 | read-then-edit | 先拍平读 docx 再补段落（原内容保留） | read-document/迁移4 |
| 8 | goal-loop | 明确交付目标（goal.json 落盘+标准全勾） | goal/迁移2 |
| 9 | md-lesson-plan | 教案 Markdown（分节标题+表格） | jiaoan |
| 10 | json-config | 配置 JSON（可解析+字段+无 TODO） | 基础格式 |

## 派活话术（做题阶段发给 agent 的包装）

```
【评测任务】请在工作目录中完成以下任务，产物只放在当前目录：
<prompt 原文>
（完成后请明确列出你产出的文件名清单）
```

要点：任务原文不带「提示用哪个技能」的偏袒信息；要求 agent 自己列产物清单，判分只认目录里的实际文件。

## 红线

1. **判分零模型**：score 阶段不调任何 LLM，全本地实测——判分器自己不能「看起来判对了」；
2. **隔离**：评测一律在 `/data/tmp/eval/` 独立目录，评测记忆治理跑 memory-guard 复检；
3. **破坏实验**：新题入库前必须先喂假产出验证判 FAIL（`--stage score --fake` 可自动注入占位产物做破坏实验）；
4. **成绩单落盘**：`result.json` + 汇总 `scorecard.md` 留在工作目录，随取随看；
5. **判分器改动后自吃狗粮**：判分器自身改逻辑后，全量重跑旧题防回归。
