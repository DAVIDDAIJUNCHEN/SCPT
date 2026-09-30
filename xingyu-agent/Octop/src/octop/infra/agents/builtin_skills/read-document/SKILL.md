---
name: read-document
description: 必须用于审阅/修改前读取 Office 或压缩类二进制文件（.docx/.xlsx/.pptx/.zip 等）。把文件拍平为纯文本（内嵌图片变占位符、表格分行、XML 降噪）输出给模型，模型才能真正看到内容而非只看文件名。Must use before reviewing or editing any Office/zip binary file.
metadata:
  octop:
    emoji: "📄"
    label:
      zh: "文档拍平读取"
      en: "Read Document"
    summary:
      zh: "解包 docx/xlsx/pptx/zip 为纯文本：图片占位、表格分行、XML 降噪。"
      en: "Flatten docx/xlsx/pptx/zip into plain text for model reading."
---

# 文档拍平读取（OWB read_document 对标）

Office 文件本质是 zip + XML，直接 `cat` 只会看到二进制乱码。**任何「审阅/修改/汇总 Office 文件」的任务，第一步必须先拍平读取**，否则是盲改。

## 用法

```bash
python3 "{{OCTOP_BUILTIN_SKILLS}}/read-document/scripts/read_document.py" <文件路径> [--max-chars 20000]
```

输出纯文本到 stdout（截断到 max-chars，默认 20000，末尾标注截断位置）。

## 支持格式与拍平规则

| 格式 | 拍平规则 |
|---|---|
| .docx | word/document.xml → 按段落分行；表格每单元格用 ` \| ` 分隔；w:t 取文本；内嵌图片 `[图片: media/xxx.png]` 占位 |
| .xlsx | 每个 sheet 一节（`## Sheet: 名`）；逐行输出，单元格 `值 \| ` 分隔；公式单元格显示 `=公式`；共享字符串已解引用 |
| .pptx | 每页一节（`## Slide N`）；文本框逐行；图片占位 |
| .zip | 列文件清单（路径 + 大小），不递归解包内容 |
| 其他文本类 | 原样输出（前 20000 字） |

## 与 40% 写保护的配合

拍平读取后若要重写原文件，**必须走 safe_write.py**（见行为准则）：
- 新内容比现文件缩水 ≥40% → 直接拦截，退出码 2
- 需明示 `--overwrite` 才放行

## 行为准则（防低级事故）

1. **先读后写**：没拍平读过就不许重写 Office 文件
2. **缩水即拦截**：重写使内容损失 ≥40% 时停下，向用户确认是否真的要砍
3. **不猜内容**：拍平输出里没有的信息，不要编造
4. Office 文件重写走 office-codegen 技能重新生成，不要尝试原地 patch XML
