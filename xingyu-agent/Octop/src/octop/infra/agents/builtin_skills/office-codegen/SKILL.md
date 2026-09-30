---
name: office-codegen
description: 必须用于通过编写 CommonJS 代码直接生成 Word/Excel/PowerPoint 文件（代码生成式 Office，方案 B）。当需要产出正式交付级 docx（含 GB/T 9704 公文版式）、多 sheet 带公式 Excel、或 PPT 课件时使用，agent 写 Node.js 脚本 require docx/exceljs/pptxgenjs 三件套出稿。Must use for code-generated Office files via docx/exceljs/pptxgenjs.
metadata:
  octop:
    emoji: "📊"
    label:
      zh: "Office 代码生成"
      en: "Office Codegen"
    summary:
      zh: "写 Node.js 代码直出 docx/xlsx/pptx，含 GB/T 9704 公文版式与公式表格。"
      en: "Generate docx/xlsx/pptx by writing Node.js code with docx/exceljs/pptxgenjs."
---

# Office 代码生成（方案 B：run_node + docx/exceljs/pptxgenjs）

不依赖 Office 引擎，通过**写 CommonJS 脚本**直接生成 Office 文件。三件套：`docx`（Word）、`exceljs`（Excel）、`pptxgenjs`（PowerPoint）。

## 环境（镜像已预置，skin-1j+）

- Node.js 20（镜像 apt 层预装 `/usr/bin/node`）
- 三件套库位置：镜像内置 `/opt/office-libs/node_modules/`（ENV `OFFICE_LIBS_PATH`）
- 旧版镜像（skin-1i 及以前）无 node，若容器缺失则手动补：
  ```bash
  apt-get update && apt-get install -y nodejs npm
  mkdir -p /opt/office-libs && cd /opt/office-libs
  npm install docx exceljs pptxgenjs --registry=https://registry.npmmirror.com
  ```

## 标准用法：resolve-libs.js 解析库路径

**所有脚本必须用 `resolveLib` 引库，禁止硬编码绝对路径**：

```javascript
const { resolveLib } = require(require("path").join(__dirname, "resolve-libs.js"));
const { Document, Packer, Paragraph, TextRun } = require(resolveLib("docx"));
```

`resolve-libs.js` 依次尝试：容器预置路径 → cwd/node_modules → skill 目录 node_modules → NODE_PATH。

脚本模板在 `{{OCTOP_BUILTIN_SKILLS}}/office-codegen/scripts/`：

- `gb9704-docx.js` — GB/T 9704-2012 公文 docx（红头/二号小标宋标题/三号仿宋正文/28磅行距/版记/页码）
- `multisheet-excel.js` — 多 sheet 带公式 Excel（总评公式 + 跨表 MAX/MIN/AVERAGE/COUNTIF 统计）
- `pptx-sample.js` — PPT 课件（封面 + 目录页）

输出路径：`node 脚本.js [输出文件名]`，argv 第 2 参可选，缺省落当前目录。

## 关键版式参数速查（GB/T 9704-2012）

| 项目 | 值 | 换算 |
|---|---|---|
| 版心边距 | 上37 下35 左28 右26 mm | 1mm ≈ 56.6929 twip |
| 标题 | 二号方正小标宋简体 | 44 半磅，居中 |
| 正文 | 三号仿宋_GB2312 | 32 半磅，首行缩进 2 字符（640 twip） |
| 行距 | 28 磅固定值 | line: 560, lineRule: EXACT |
| 红头 | 发文机关标志 | 60 半磅红字（FF0000） |
| 版记 | 抄送/印发 | 四号（28 半磅）仿宋 |

## 生成后验证

用 `execute` 工具做 XML 级抽验（docx/xlsx 均为 zip）：

```bash
cd /tmp && mkdir -p d && cd d && unzip -o ../通知-GB9704.docx word/document.xml
grep -o 'w:eastAsia="[^"]*"' word/document.xml | sort | uniq -c   # 字体分布
grep -o 'w:pgMar[^/]*' word/document.xml                            # 页边距
```

Excel 公式验证：解包后查 `xl/worksheets/sheet1.xml` 的 `<f>` 标签。

## 典型工作流

1. 用户要 Office 文件 → 本技能生效
2. 从 `{{OCTOP_BUILTIN_SKILLS}}/office-codegen/scripts/` 拷贝最接近的模板到 cwd
3. 按需改内容（公文用 bodyPara 辅助函数；表格加列改 columns）
4. `node 脚本.js 输出名` 出稿
5. XML 级验证版式/公式 → 交付
