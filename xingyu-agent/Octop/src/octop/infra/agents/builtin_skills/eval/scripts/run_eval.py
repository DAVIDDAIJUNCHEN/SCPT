#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""run_eval.py — 评测 runner + 硬证据判分器（星语 Agent · OWB 迁移 8）

评测分两阶段：work（派活/出题）与 score（纯机器判分）。
判分只认硬证据：产物文件存在/可解析/格式正确——绝不调 LLM 判分。
思路对标 OWB eval 三条线（机器判分线），一行未抄，按同一问题独立实现。

用法：
  python3 run_eval.py --workspace /data/tmp/eval --list
  python3 run_eval.py --workspace /data/tmp/eval --case gw-basic --stage work          # 出题+落 prompt
  python3 run_eval.py --workspace /data/tmp/eval --case gw-basic --stage work --no-send  # 人工模式：只出题
  python3 run_eval.py --workspace /data/tmp/eval --case gw-basic --stage score        # 判分
  python3 run_eval.py --workspace /data/tmp/eval --case gw-basic --stage score --fake # 破坏实验（占位产物）

退出码：0=全过 / 2=有失败 / 1=错误
"""
import argparse
import ast
import io
import json
import os
import re
import subprocess
import sys
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CASES_DIR = os.path.join(HERE, "..", "cases")
DEFAULT_TIMEOUT_S = 600


# ---------- 题库加载 ----------

def load_case(case_id):
    p = os.path.join(CASES_DIR, case_id + ".json")
    if not os.path.isfile(p):
        sys.exit(f"[错误] 题目不存在：{case_id}（找 {p}）")
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def list_cases():
    out = []
    for n in sorted(os.listdir(CASES_DIR)):
        if n.endswith(".json"):
            with open(os.path.join(CASES_DIR, n), encoding="utf-8") as fh:
                c = json.load(fh)
            out.append({"id": c["id"], "title": c.get("title", ""), "checks": len(c.get("checks", []))})
    return out


# ---------- work 阶段 ----------

def stage_work(case, workspace, no_send):
    ts = time.strftime("%Y%m%d-%H%M%S")
    run_dir = os.path.join(workspace, case["id"], ts)
    os.makedirs(run_dir, exist_ok=True)
    # 题目预置材料（cases/<id>.files/）整目录拷入 run_dir（如 read-then-edit 的原文.docx）
    fix_dir = os.path.join(CASES_DIR, case["id"] + ".files")
    if os.path.isdir(fix_dir):
        import shutil
        for n in os.listdir(fix_dir):
            shutil.copy2(os.path.join(fix_dir, n), os.path.join(run_dir, n))
    prompt = (
        "【评测任务】请在工作目录中完成以下任务，产物只放在当前目录：\n"
        + case["prompt"]
        + "\n（完成后请明确列出你产出的文件名清单）"
    )
    with open(os.path.join(run_dir, "prompt.txt"), "w", encoding="utf-8") as fh:
        fh.write(prompt)
    meta = {"case": case["id"], "run_dir": run_dir, "started": ts,
            "timeout_s": case.get("timeout_s", DEFAULT_TIMEOUT_S)}
    with open(os.path.join(run_dir, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"stage": "work", **meta,
                      "sent": not no_send,
                      "next": "把 prompt.txt 发给 agent 执行（人工模式）或等待 agent 产出，"
                              "然后跑 --stage score"}, ensure_ascii=False))
    if no_send:
        print("[人工模式] prompt.txt 已生成，大王可亲自发给 agent", file=sys.stderr)
    # 派活由 agent 侧（本技能调用者）承接：run_dir 已备好，产物须落 run_dir


# ---------- 判分 check 实现（全部本地实测，零模型） ----------

def _read_text(path):
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def _zip_read(path, entry):
    with zipfile.ZipFile(path) as z:
        return z.read(entry).decode("utf-8", errors="replace")


def run_check(ck, run_dir):
    """返回 (ok: bool, note: str)。note 失败时必须含实测值。"""
    t = ck["type"]
    arts = ck.get("artifacts")  # 缺省用 case 级
    files = [os.path.join(run_dir, f) for f in arts] if arts else None
    if t == "file_exists":
        f = os.path.join(run_dir, ck["file"])
        if os.path.isfile(f):
            return True, f"存在（{os.path.getsize(f)} 字节）"
        return False, f"文件不存在：{ck['file']}"
    if t == "file_nonempty":
        f = os.path.join(run_dir, ck["file"])
        if os.path.isfile(f) and os.path.getsize(f) > 0:
            return True, f"{os.path.getsize(f)} 字节"
        size = os.path.getsize(f) if os.path.isfile(f) else -1
        return False, f"文件缺失或为空（{size} 字节）"
    if t == "zip_has_entry":
        f = os.path.join(run_dir, ck["file"])
        try:
            with zipfile.ZipFile(f) as z:
                names = z.namelist()
            if ck["entry"] in names:
                return True, f"含 {ck['entry']}"
            return False, f"zip 条目里没有 {ck['entry']}（实际 {len(names)} 个条目，前 5：{names[:5]}）"
        except (OSError, zipfile.BadZipFile) as e:
            return False, f"zip 打不开：{str(e)[:100]}"
    if t == "docx_text_contains":
        f = os.path.join(run_dir, ck["file"])
        try:
            xml = _zip_read(f, "word/document.xml")
        except (OSError, KeyError, zipfile.BadZipFile) as e:
            return False, f"读 docx 失败：{str(e)[:100]}"
        pat = re.compile(ck["pattern"])
        m = pat.search(xml)
        if m:
            return True, f"主文档命中「{ck['pattern']}」"
        return False, f"主文档不含「{ck['pattern']}」"
    if t == "docx_font":
        f = os.path.join(run_dir, ck["file"])
        try:
            xml = _zip_read(f, "word/document.xml")
        except (OSError, KeyError, zipfile.BadZipFile) as e:
            return False, f"读 docx 失败：{str(e)[:100]}"
        part = ck.get("part", "body")
        font = _docx_default_font(xml, part)
        if font and font == ck["font"]:
            return True, f"{part} 默认字体 = {font}"
        return False, f"{part} 默认字体 = {font or '（未检出）'}，期望 {ck['font']}"
    if t == "xlsx_formula":
        f = os.path.join(run_dir, ck["file"])
        try:
            with zipfile.ZipFile(f) as z:
                sheets = [n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml", n)]
                formulas = []
                for s in sheets:
                    xml = z.read(s).decode("utf-8", errors="replace")
                    formulas += re.findall(r"<f>([^<]+)</f>", xml)
        except (OSError, zipfile.BadZipFile) as e:
            return False, f"读 xlsx 失败：{str(e)[:100]}"
        want = ck["func"].upper()
        hit = [x for x in formulas if want in x.upper()]
        if hit:
            return True, f"公式命中 {want}：{hit[:3]}"
        return False, f"所有 sheet 公式（{len(formulas)} 条）中无 {want}"
    if t == "json_valid":
        f = os.path.join(run_dir, ck["file"])
        try:
            json.loads(_read_text(f))
            return True, "JSON 可解析"
        except (ValueError, OSError) as e:
            return False, f"JSON 解析失败：{str(e)[:100]}"
    if t == "json_field":
        f = os.path.join(run_dir, ck["file"])
        try:
            data = json.loads(_read_text(f))
        except (ValueError, OSError) as e:
            return False, f"JSON 解析失败：{str(e)[:100]}"
        if ck["field"] in data:
            return True, f"字段 {ck['field']} 存在"
        return False, f"顶层无字段 {ck['field']}（实际：{sorted(data)[:8]}）"
    if t == "py_compile":
        f = os.path.join(run_dir, ck["file"])
        try:
            ast.parse(_read_text(f))
            return True, "语法可编译"
        except (SyntaxError, OSError) as e:
            return False, f"语法错误：{str(e)[:120]}"
    if t == "sh_compile":
        f = os.path.join(run_dir, ck["file"])
        try:
            r = subprocess.run(["bash", "-n", f], capture_output=True, text=True, timeout=15)
            if r.returncode == 0:
                return True, "bash -n 通过"
            return False, f"bash -n 报错：{(r.stderr or '')[:120]}"
        except (OSError, subprocess.TimeoutExpired) as e:
            return False, f"bash 不可用：{str(e)[:80]}"
    if t == "text_contains":
        f = os.path.join(run_dir, ck["file"])
        try:
            txt = _read_text(f)
        except OSError as e:
            return False, f"读文件失败：{str(e)[:80]}"
        if re.search(ck["pattern"], txt):
            return True, f"命中「{ck['pattern']}」"
        head = re.sub(r"\s+", " ", txt[:80])
        return False, f"不含「{ck['pattern']}」（文件开头：{head}）"
    if t == "not_contains":
        f = os.path.join(run_dir, ck["file"])
        try:
            txt = _read_text(f)
        except OSError as e:
            return False, f"读文件失败：{str(e)[:80]}"
        m = re.search(ck["pattern"], txt)
        if not m:
            return True, f"确认不含「{ck['pattern']}」"
        return False, f"命中违禁内容「{m.group(0)[:40]}」"
    if t == "html_paired":
        f = os.path.join(run_dir, ck["file"])
        try:
            t2 = _read_text(f)
        except OSError as e:
            return False, f"读文件失败：{str(e)[:80]}"
        probs = []
        if re.search(r"<html[\s>]", t2, re.I) and not re.search(r"</html>", t2, re.I):
            probs.append("有 <html> 无 </html>")
        so, sc = len(re.findall(r"<script[\s>]", t2, re.I)), len(re.findall(r"</script>", t2, re.I))
        if so != sc:
            probs.append(f"script 开闭不配对（{so}/{sc}）")
        if not probs:
            return True, "html/script 配对完整"
        return False, "；".join(probs)
    return False, f"未知 check 类型：{t}"


def _docx_default_font(xml, part):
    """粗粒度取默认字体：body 看 w:docDefaults/w:rPrDefault；title 看第一个 heading 段的 rFonts。
    简化实现：全 docDefaults 的 eastAsia/ascii 任一命中即算 body 默认；title 取 styleId 含 heading 的段落 rPr。"""
    if part == "title":
        m = re.search(r'<w:style [^>]*w:styleId="Heading1".*?</w:style>', xml, re.S)
        seg = m.group(0) if m else ""
    else:
        m = re.search(r"<w:docDefaults>.*?</w:docDefaults>", xml, re.S)
        seg = m.group(0) if m else xml
    fm = re.search(r'w:eastAsia="([^"]+)"', seg) or re.search(r'w:ascii="([^"]+)"', seg)
    return fm.group(1) if fm else None


# ---------- score 阶段 ----------

def latest_run_dir(workspace, case_id):
    base = os.path.join(workspace, case_id)
    if not os.path.isdir(base):
        sys.exit(f"[错误] 没有运行目录：{base}（先跑 --stage work）")
    runs = sorted(d for d in os.listdir(base) if os.path.isdir(os.path.join(base, d)))
    return os.path.join(base, runs[-1])


def stage_score(case, workspace, fake):
    run_dir = latest_run_dir(workspace, case["id"])
    if fake:
        # 破坏实验：注入占位假产物，判分器必须 FAIL（题目才有区分力）
        for f in case.get("artifacts", []):
            p = os.path.join(run_dir, f)
            if not os.path.isfile(p):
                os.makedirs(os.path.dirname(p) or run_dir, exist_ok=True)
                with open(p, "w", encoding="utf-8") as fh:
                    fh.write("占位假产物（破坏实验注入）\n")
    detail, passed = [], 0
    for ck in case.get("checks", []):
        ok, note = run_check(ck, run_dir)
        passed += 1 if ok else 0
        detail.append({"check": _ck_desc(ck), "ok": ok, "note": note})
    total = len(case.get("checks", []))
    verdict = "PASS" if total and passed == total else "FAIL"
    result = {"case": case["id"], "run_dir": run_dir, "verdict": verdict,
              "passed": passed, "failed": total - passed, "total": total,
              "fake_mode": fake, "detail": detail}
    with open(os.path.join(run_dir, "result.json"), "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if verdict == "PASS" else 2


def _ck_desc(ck):
    t = ck["type"]
    if t in ("file_exists", "file_nonempty", "zip_has_entry", "docx_text_contains",
             "docx_font", "xlsx_formula", "json_valid", "json_field",
             "py_compile", "sh_compile", "text_contains", "not_contains", "html_paired"):
        extra = ck.get("file", "") or ""
        for k in ("pattern", "entry", "font", "func", "field"):
            if k in ck:
                extra += f":{ck[k]}"
        if "part" in ck:
            extra += f":{ck['part']}"
        return f"{t} {extra}".strip()
    return t


def scorecard(workspace, case_ids):
    """汇总成绩单 scorecard.md（一次全量跑后大王随取随看）"""
    lines = ["# 评测成绩单", "", f"时间：{time.strftime('%Y-%m-%d %H:%M:%S')}", "",
             "| 题目 | 判定 | 通过/总数 | 关键失败项 |", "|---|---|---|---|"]
    for cid in case_ids:
        try:
            run_dir = latest_run_dir(workspace, cid)
            rp = os.path.join(run_dir, "result.json")
            if not os.path.isfile(rp):
                continue
            with open(rp, encoding="utf-8") as fh:
                r = json.load(fh)
            fails = "；".join(d["check"] for d in r["detail"] if not d["ok"]) or "-"
            lines.append(f"| {cid} | {r['verdict']} | {r['passed']}/{r['total']} | {fails} |")
        except SystemExit:
            continue
    p = os.path.join(workspace, "scorecard.md")
    with open(p, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workspace", default="/data/tmp/eval", help="评测独立目录（绝不用主工作区）")
    ap.add_argument("--case", help="题目 id（缺省全量）")
    ap.add_argument("--stage", choices=["work", "score"], help="work=出题派活 / score=判分")
    ap.add_argument("--no-send", action="store_true", help="work 阶段只出题不派活（人工模式）")
    ap.add_argument("--fake", action="store_true", help="score 阶段注入占位产物做破坏实验")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--scorecard", action="store_true", help="生成汇总成绩单")
    args = ap.parse_args()

    if args.list:
        print(json.dumps(list_cases(), ensure_ascii=False, indent=2))
        return
    if args.scorecard:
        ids = [c["id"] for c in list_cases()]
        print(scorecard(args.workspace, ids))
        return
    if not args.case:
        sys.exit("[错误] 需要 --case 或 --list / --scorecard")
    case = load_case(args.case)

    if args.stage == "work":
        stage_work(case, args.workspace, args.no_send)
        return
    if args.stage == "score":
        sys.exit(stage_score(case, args.workspace, args.fake))
    sys.exit("[错误] 需要 --stage work|score")


if __name__ == "__main__":
    main()
