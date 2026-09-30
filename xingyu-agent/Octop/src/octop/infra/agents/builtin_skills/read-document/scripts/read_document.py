#!/usr/bin/env python3
"""read_document.py — Office/zip 文件拍平读取（OWB 迁移 4）

把 .docx/.xlsx/.pptx/.zip 解包为纯文本给模型读：
- 内嵌图片变占位符
- 表格分行/分单元格
- XML 标签降噪，只留文本
- 超长截断（默认 20000 字）并标注

零第三方依赖（stdlib only，容器内 python3 直跑）。
"""
import sys
import zipfile
import argparse
import re
import os
import xml.etree.ElementTree as ET

MAX_CHARS_DEFAULT = 20000

# ---- 命名空间 ----
NS_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
NS_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
NS_P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def _clip(text, max_chars):
    if len(text) <= max_chars:
        return text, False
    return text[:max_chars], True


def _cell_texts(p_elem):
    """docx: 段落元素 -> 纯文本"""
    parts = []
    for node in p_elem.iter():
        tag = node.tag
        if tag == NS_W + "t" and node.text:
            parts.append(node.text)
        elif tag == NS_W + "tab":
            parts.append("\t")
        elif tag == NS_W + "br":
            parts.append("\n")
    return "".join(parts)


def flatten_docx(zf):
    out = []
    try:
        xml_data = zf.read("word/document.xml")
    except KeyError:
        return "[docx 无 word/document.xml]"
    root = ET.fromstring(xml_data)
    body = root.find(NS_W + "body")
    if body is None:
        return "[docx 无 body]"

    # 图片占位：收集所有引用名
    media = [n for n in zf.namelist() if n.startswith("word/media/")]

    def walk(elem):
        for child in elem:
            tag = child.tag
            if tag == NS_W + "p":
                text = _cell_texts(child)
                # 段内图片检测
                blips = child.findall(".//" + NS_A + "blip")
                for b in blips:
                    rid = b.get(
                        "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed",
                        "?",
                    )
                    text += f" [图片: rid={rid}]"
                if text.strip():
                    out.append(text)
            elif tag == NS_W + "tbl":
                out.append("[表格]")
                for row in child.findall(NS_W + "tr"):
                    cells = []
                    for tc in row.findall(NS_W + "tc"):
                        cell_text = " ".join(
                            _cell_texts(p) for p in tc.findall(".//" + NS_W + "p")
                        ).strip()
                        cells.append(cell_text)
                    out.append(" | ".join(cells))
                out.append("[/表格]")
            elif tag in (NS_W + "sectPr",):
                continue
            else:
                walk(child)

    walk(body)
    if media:
        out.append(f"\n[内嵌图片 {len(media)} 张: {', '.join(m.split('/')[-1] for m in media[:10])}]")
    return "\n".join(out)


def _col_of(ref):
    """A1 -> 0, B2 -> 1"""
    m = re.match(r"([A-Z]+)", ref or "")
    if not m:
        return 0
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return col - 1


def flatten_xlsx(zf):
    out = []
    # 共享字符串
    shared = []
    if "xl/sharedStrings.xml" in zf.namelist():
        sroot = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in sroot.findall(NS_MAIN + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS_MAIN + "t")))

    # sheet 名映射（workbook.xml 顺序 vs rels）
    sheet_names = []
    if "xl/workbook.xml" in zf.namelist():
        wroot = ET.fromstring(zf.read("xl/workbook.xml"))
        for sh in wroot.iter(NS_MAIN + "sheet"):
            sheet_names.append(sh.get("name", "?"))

    sheets = sorted(
        n for n in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)
    )
    for i, sheet_path in enumerate(sheets):
        name = sheet_names[i] if i < len(sheet_names) else sheet_path
        out.append(f"## Sheet: {name}")
        root = ET.fromstring(zf.read(sheet_path))
        for row in root.iter(NS_MAIN + "row"):
            cells = []
            for c in row.findall(NS_MAIN + "c"):
                v = c.find(NS_MAIN + "v")
                f = c.find(NS_MAIN + "f")
                t = c.get("t", "")
                if f is not None and f.text:
                    val = f"={f.text}"
                    if v is not None and v.text:
                        val += f" (={v.text})"
                elif v is not None and v.text:
                    val = shared[int(v.text)] if t == "s" and v.text.isdigit() else v.text
                else:
                    val = ""
                cells.append(val)
            if any(x.strip() for x in cells):
                out.append(" | ".join(cells))
        out.append("")
    return "\n".join(out)


def flatten_pptx(zf):
    out = []
    slides = sorted(
        (n for n in zf.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
        key=lambda n: int(re.search(r"(\d+)", n).group(1)),
    )
    for i, sp in enumerate(slides, 1):
        out.append(f"## Slide {i}")
        root = ET.fromstring(zf.read(sp))
        # a:t 文本
        for t in root.iter(NS_A + "t"):
            if t.text and t.text.strip():
                out.append(t.text)
        # 图片
        for _ in root.iter(NS_A + "blip"):
            out.append("[图片]")
        out.append("")
    return "\n".join(out)


def flatten_zip(zf):
    out = ["[zip 文件清单]"]
    total = 0
    for info in zf.infolist():
        if not info.is_dir():
            out.append(f"{info.filename}  ({info.file_size} B)")
            total += 1
        if total >= 200:
            out.append("... (清单截断至 200 项)")
            break
    return "\n".join(out)


def flatten(path, max_chars):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".docx", ".xlsx", ".pptx") or zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if ext == ".docx" or "word/document.xml" in names:
                text = flatten_docx(zf)
            elif ext == ".xlsx" or "xl/workbook.xml" in names:
                text = flatten_xlsx(zf)
            elif ext == ".pptx" or any(n.startswith("ppt/slides/") for n in names):
                text = flatten_pptx(zf)
            else:
                text = flatten_zip(zf)
    else:
        # 纯文本类
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                text = f.read(max_chars + 1)
        except OSError as e:
            return f"[读取失败: {e}]"
    text, clipped = _clip(text, max_chars)
    if clipped:
        text += f"\n\n[已截断至 {max_chars} 字，原文更长——请分段读取或调大 --max-chars]"
    return text


def main():
    ap = argparse.ArgumentParser(description="Office/zip 文件拍平读取")
    ap.add_argument("file", help="目标文件路径")
    ap.add_argument("--max-chars", type=int, default=MAX_CHARS_DEFAULT)
    args = ap.parse_args()
    if not os.path.isfile(args.file):
        print(f"[文件不存在: {args.file}]", file=sys.stderr)
        sys.exit(1)
    print(flatten(args.file, args.max_chars))


if __name__ == "__main__":
    main()
