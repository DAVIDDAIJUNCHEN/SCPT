---
name: gongwen
description: 必须用于起草或排版中文公文、正式材料（通知、请示、报告、函、纪要、决定等 15 种法定文种）以及按 GB/T 9704-2012 生成公文 DOCX。覆盖文种选择、行文规则、版式生成与验证。Must use for drafting or formatting Chinese official documents (15 statutory types) and generating GB/T 9704-2012 compliant DOCX.
metadata:
  octop:
    emoji: "📜"
    label:
      zh: "公文专家"
      en: "Gongwen Expert"
    summary:
      zh: "起草 15 种法定文种并按 GB/T 9704-2012 生成公文 DOCX。"
      en: "Draft 15 statutory document types and generate GB/T 9704-2012 DOCX."
---

# 公文专家

起草中文公文时使用本技能：先按《15 种法定文种写作要点》定文种、按行文规则组织内容，再用 GB/T 9704-2012 生成器输出可直接交付的 DOCX。

## 标准依据与边界

GB/T 9704-2012《党政机关公文格式》现行，2025-05-30 复审继续有效，适用于党政机关制发公文，其他单位参照执行。文种依据《党政机关公文处理工作条例》（中办发〔2012〕14 号）。

先读 `{{OCTOP_BUILTIN_SKILLS}}/gongwen/references/wenzhong-15.md` 定文种；需要版式细节时读 `{{OCTOP_BUILTIN_SKILLS}}/gongwen/references/gbt9704-2012-summary.md`；逐项复核时读 `{{OCTOP_BUILTIN_SKILLS}}/gongwen/references/formal-checklist.md`。

**能力边界**：只处理起草与排版，不判断单位身份、授权状态或盖章方式。不因「正式」「国企」「报告」等字样擅自使用红头——版式模式必须由用户明确选择。印章、签名章由使用者在生成后的 Word/WPS 中插入，本技能不伪造。

## 第一步：定文种

按 `{{OCTOP_BUILTIN_SKILLS}}/gongwen/references/wenzhong-15.md` 的速查表和决策树选择文种，重点核对：

- **行文方向**：向上（报告/请示/议案）、向下（决定/通知/批复…）、平行（函）、会议（纪要）
- **易混文种**：报告≠请示（报告不带请示事项）、通知≠通报、公告≠通告、函≠请示（不相隶属机关请求批准用函）
- **主体适格**：命令仅限法定主体；议案仅限政府

## 第二步：组织内容

按所选文种的结构模板组织正文（各文种详解见 wenzhong-15.md）：

- 请示：请示缘由＋请示事项＋「妥否，请批示」（一文一事、事前行文）
- 报告：工作情况＋问题＋下一步，不带请示事项
- 通知：批转/转发类正文极简；事务类写明事项、要求、时限
- 批复：引语（文号收悉）＋答复意见＋「特此批复」
- 函：商洽语气，「请予支持」「请予函复」
- 纪要：会议概况＋议定事项＋工作要求

层次序数依次用「一、」「（一）」「1.」「（1）」。

## 第三步：生成 DOCX

```bash
# 普通材料（方案、汇报，不绘红头），默认居中页码
node "{{OCTOP_BUILTIN_SKILLS}}/gongwen/scripts/generate_gongwen_docx.mjs" \
  --input source.md --output output.docx --format ordinary --title "文档标题"

# 正式发文（预印红头纸套打，最常用）
node "{{OCTOP_BUILTIN_SKILLS}}/gongwen/scripts/generate_gongwen_docx.mjs" \
  --input source.md --output output.docx --format formal --letterhead preprinted \
  --letterhead-reserve-mm 72 --org "发文机关名称" --doc-no "单位发〔2026〕1号" \
  --title "文档标题" --sender "落款单位" --date "2026年9月9日" --signer "签发人"

# 完整电子红头（仅明确要求时）
node "{{OCTOP_BUILTIN_SKILLS}}/gongwen/scripts/generate_gongwen_docx.mjs" \
  --input source.md --output output.docx --format formal --letterhead digital \
  --org "发文机关名称" --doc-no "单位发〔2026〕1号" --title "文档标题"
```

**格式与文种对应**：决议/决定/公报/公告/通告/意见/通知/通报/报告/请示/批复/议案 → `--format formal`；命令（令）→ `--format command`；函 → `--format letter`；纪要 → `--format minutes`；横排表格 → `--format horizontal-table`。

**常用参数**：

- 上行文（报告/请示/议案）必须传 `--signer`，生成器将其与文号同行编排
- 联合行文重复传 `--joint-org`，主办机关在前
- 附件重复传 `--attachment-file a.md` 并配 `--attachment-note`；分离装订加 `--attachment-detached`
- 抄送/印发机关/印发日期：`--cc`、`--print-org`、`--print-date`
- `--doc-no` 格式「单位发〔2026〕1号」，`--date` 格式「2026年9月9日」（月日不补零），不合格式会被拒绝

**输入格式**（Markdown）：标题层级按序数优先（`一、`→一级黑体，`（一）`→二级楷体，`1.`→三级仿宋，`（1）`→四级仿宋）；序数缺失时按 Markdown `#` 层级映射。

## 第四步：验证

```bash
# DOCX 结构完整性
unzip -t output.docx

# 版式校验（按格式选 profile）
node "{{OCTOP_BUILTIN_SKILLS}}/gongwen/scripts/verify_gongwen_docx.mjs" \
  --input output.docx --profile formal --letterhead preprinted

# 需要确认目标机器有标准小标宋/仿宋时，加严格字体校验
node "{{OCTOP_BUILTIN_SKILLS}}/gongwen/scripts/verify_gongwen_docx.mjs" \
  --input output.docx --profile formal --letterhead digital --require-standard-fonts
```

校验器覆盖版式要素；打印条件（双面套正、装订钉位）和目标 Word/WPS 实际字体仍需人工确认。若沙箱无 `unzip`，用 `python3 -c "import zipfile; zipfile.ZipFile('output.docx').testzip()"` 替代。

## 输出说明

- 版式检查通过后，可写「已按 GB/T 9704-2012 的相关版式参数生成」。
- 脚本零外部依赖（纯 Node 内置模块），无需 npm install。
- 生成器在字体缺失时会明确警告并记录替代字体；需要硬性阻止替代输出时加 `--require-standard-fonts`。
