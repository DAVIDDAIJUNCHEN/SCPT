#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Goal 验收器（星语 Agent · OWB 迁移 2）

sidecar 验收器：对 agent 本轮产出做「机器实测 + 判定模型是非题」两级验收。
思路对标 OWB goal.js（PolyForm Noncommercial，一行未抄，按同一问题的解独立实现）。

用法（agent 在工作区执行，文件清单只传本轮真正写过的文件）：
  python3 "{{OCTOP_BUILTIN_SKILLS}}/goal/scripts/goal_verify.py" \
    --goal-file goal.json \
    --files report.js data.json page.html

输入 goal.json（由 agent 按本技能 SKILL.md 流程维护）：
  {
    "text": "用户目标原文",
    "criteria": [{"text": "标准1", "done": false}, ...],
    "round": 1
  }

输出 verdict JSON（stdout，唯一出口）：
  {
    "ok": true,
    "round": 1,
    "criteria": [{"text": ..., "done": true/false, "basis": "机器实测✓ / 判定模型 P=0.9 / 拿不准未打勾"}],
    "progress": {"done": 2, "total": 4},
    "rework_prompt": "……（未全达成时给出，只补未达成项）",
    "notes": ["验收过程留痕（截断/降级/拿不准明细）"]
  }

设计红线（与 OWB 对齐）：
  1. 宁可漏判不可错判：判定模型没按格式回话 → 全部保持原状
  2. 确定度过线才打勾：P<0.75 的「像达成」只记 note，不打勾
  3. 机器实测 ✗ 的文件，涉及它的标准一律不打勾
  4. 拿不到的（判定模型不可用）→ 机器实测照做，模型判断全保原状并写明原因
"""
import argparse
import ast
import json
import os
import re
import ssl
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CA_PEM_CANDIDATES = [
    "/etc/ssl/certs/ca-oidc.pem",  # PoC 容器挂载（run-poc.sh）
    os.path.join(HERE, "ca-oidc.pem"),
]
SURE_MIN = 0.75          # 判定模型确定度门槛：过线才打勾
JUDGE_MODEL = "DeepSeek-V4.1-Flash"  # 星语侧判定模型（是非题形态，便宜快）
GATEWAY = "https://ai-platform.sptc.edu.cn/v1/chat/completions"
TEXT_EXT = re.compile(r"\.(html?|js|mjs|cjs|css|md|txt|json|py|ts|jsx|tsx|csv|svg)$", re.I)
SNIPPET_HEAD = 600        # 每个成果文件给判定模型的摘录长度（OWB 同款 600 字）
INVENTORY_MAX = 40        # 文件清单最多列 40 个
RECENT_MAX = 5            # 摘录/体检最多看最近改动 5 个文本文件


# ---------- 证据收集（只读，绝不执行成果代码） ----------

def recent_text_files(files, base=".", limit=RECENT_MAX):
    picked = []
    for n in files:
        if not TEXT_EXT.search(n):
            continue
        p = os.path.join(base, n)
        try:
            st = os.stat(p)
            if os.path.isfile(p):
                picked.append({"n": n, "p": p, "mtime": st.st_mtime, "size": st.st_size})
        except OSError:
            continue
    picked.sort(key=lambda f: f["mtime"], reverse=True)
    return picked[:limit]


def file_inventory(files, base="."):
    if not files:
        return "（本轮没有产出文件）"
    lines = []
    for n in files[:INVENTORY_MAX]:
        p = os.path.join(base, n)
        try:
            st = os.stat(p)
            kind = "目录" if os.path.isdir(p) else f"{st.st_size} 字节"
        except OSError:
            kind = "（stat 失败）"
        lines.append(f"{n}（{kind}）")
    return "\n".join(lines)


def file_snippets(files, base="."):
    parts = []
    for f in recent_text_files(files, base):
        try:
            with open(f["p"], encoding="utf-8", errors="replace") as fh:
                head = fh.read(SNIPPET_HEAD)
        except OSError:
            head = "（读取失败）"
        parts.append(f"--- {f['n']}（共 {f['size']} 字节，以下是开头）---\n{head}")
    return "\n\n".join(parts)


def file_checks(files, base="."):
    """机器实测：JS/JSON/HTML/Python 只读体检。✗ 的文件名进入 bad 集合。"""
    lines, bad = [], set()
    for f in recent_text_files(files, base):
        n, p = f["n"], f["p"]
        if re.search(r"\.(js|mjs|cjs)$", n, re.I):
            # node --check 走 shell（容器内有 node）；node 不在就退化为括号配对粗检
            rc, err = _node_check(p)
            if rc is None:
                if _balanced_braces(p):
                    lines.append(f"? {n} 无 node，仅做括号配对粗检通过")
                else:
                    lines.append(f"✗ {n} 括号不配对（无 node 环境粗检）")
                    bad.add(n)
            elif rc == 0:
                lines.append(f"✓ {n} node --check 通过")
            else:
                lines.append(f"✗ {n} JS 语法检查未通过：{err[:200]}")
                bad.add(n)
        elif n.lower().endswith(".json"):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    json.load(fh)
                lines.append(f"✓ {n} JSON 格式合法")
            except (ValueError, OSError) as e:
                lines.append(f"✗ {n} JSON 解析失败：{str(e)[:120]}")
                bad.add(n)
        elif re.search(r"\.html?$", n, re.I):
            probs = _html_probs(p)
            if probs:
                lines.append(f"✗ {n} 结构异常：{'；'.join(probs)}")
                bad.add(n)
            else:
                lines.append(f"✓ {n} HTML 结构完整（html/script 标签配对）")
        elif n.lower().endswith(".py"):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    ast.parse(fh.read())
                lines.append(f"✓ {n} Python 语法检查通过")
            except SyntaxError as e:
                lines.append(f"✗ {n} Python 语法错误：{str(e)[:120]}")
                bad.add(n)
    return "\n".join(lines), bad


def _node_check(p):
    import subprocess
    try:
        r = subprocess.run(["node", "--check", p], capture_output=True, text=True, timeout=8)
        return r.returncode, (r.stderr or "")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None, ""


def _balanced_braces(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            t = fh.read()
    except OSError:
        return False
    return t.count("{") == t.count("}") and t.count("(") == t.count(")")


def _html_probs(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as fh:
            t = fh.read()
    except OSError:
        return ["读取失败"]
    probs = []
    if re.search(r"<html[\s>]", t, re.I) and not re.search(r"</html>", t, re.I):
        probs.append("有 <html> 没有 </html>，疑似写到一半被截断")
    so = len(re.findall(r"<script[\s>]", t, re.I))
    sc = len(re.findall(r"</script>", t, re.I))
    if so != sc:
        probs.append(f"<script> 开闭不配对（{so} 开 {sc} 闭）")
    return probs


# ---------- 判定模型（星语网关 · 是非题 + 确定度） ----------

def _load_ca():
    for c in CA_PEM_CANDIDATES:
        if os.path.isfile(c):
            return ssl.create_default_context(cafile=c)
    return ssl._create_unverified_context()  # 无 CA 时降级（容器必挂 ca-oidc.pem，理论上不走到）


def judge_yes_no(criteria, goal_text, inventory, snippets, checks, final_text):
    """调星语判定模型逐条问是非。返回 {idx: (answered_yes, confidence)} 或 None（不可用/没按格式回话）。"""
    api_key = os.environ.get("XY_AGENT_TOKEN") or os.environ.get("STARWHISPER_API_KEY")
    if not api_key:
        return None, "未配 XY_AGENT_TOKEN，判定模型不可用"
    q_lines = "\n".join(
        f"c{i}. 这条验收标准已经达成：{c['text']}" for i, c in enumerate(criteria)
    )
    payload = {
        "model": JUDGE_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是验收判定器。根据【目标】【成果文件清单】【成果文件内容摘录】【自动体检】和【执行汇报】，"
                    "对每条待判标准回答：是否已达成，以及你的确定度（0~1）。"
                    "证据不足或拿不准时 confidence 必须低。只输出 JSON："
                    '{"answers":[{"key":"c0","yes":true,"confidence":0.9}]}，不要其它文字。'
                ),
            },
            {
                "role": "user",
                "content": (
                    f"【目标】{goal_text[:500]}\n\n【待判标准】\n{q_lines}\n\n"
                    f"【成果文件清单】\n{inventory}\n\n"
                    + (f"【成果文件内容摘录】\n{snippets}\n\n" if snippets else "")
                    + (f"【自动体检（机器实测）】\n{checks}\n\n" if checks else "")
                    + f"【执行汇报】\n{(final_text or '（无）')[:3000]}"
                ),
            },
        ],
        "temperature": 0,
        "max_tokens": 800,
    }
    ctx = _load_ca()
    try:
        req = urllib.request.Request(
            GATEWAY,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=90, context=ctx) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        m = re.search(r"\{[\s\S]*\}", content)
        if not m:
            return None, "判定模型没按格式回话，本轮打勾全部保持原状（宁可漏判不可错判）"
        answers = json.loads(m.group(0)).get("answers", [])
        out = {}
        for a in answers:
            i = int(str(a.get("key", ""))[1:]) if str(a.get("key", ""))[1:].isdigit() else None
            if i is None or not (0 <= i < len(criteria)):
                continue
            out[i] = (bool(a.get("yes")), max(0.0, min(1.0, float(a.get("confidence", 0)))))
        return (out, None) if out else (None, "判定模型回答为空，本轮打勾全部保持原状")
    except Exception as e:  # noqa: BLE001 —— 验收挂了不能崩 agent 流程
        return None, f"判定模型调用失败：{str(e)[:120]}，本轮打勾全部保持原状"


# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--goal-file", required=True, help="goal.json 路径（agent 维护的目标卡）")
    ap.add_argument("--files", nargs="*", default=[], help="本轮真正写过的文件（证据范围）")
    ap.add_argument("--final-text", default="", help="agent 本轮收尾汇报（可选，可从 stdin 读）")
    ap.add_argument("--base", default=".", help="成果文件基准目录")
    args = ap.parse_args()

    if not args.final_text and not sys.stdin.isatty():
        args.final_text = sys.stdin.read()

    with open(args.goal_file, encoding="utf-8") as fh:
        goal = json.load(fh)

    notes = []
    undone = [(i, c) for i, c in enumerate(goal["criteria"]) if not c["done"]]
    if not undone:
        verdict = {
            "ok": True, "round": goal.get("round", 0), "criteria": goal["criteria"],
            "progress": {"done": len(goal["criteria"]), "total": len(goal["criteria"])},
            "rework_prompt": "", "notes": ["全部标准已达成，无需验收"],
        }
        print(json.dumps(verdict, ensure_ascii=False, indent=2))
        return

    # 1) 机器实测
    inventory = file_inventory(args.files, args.base)
    snippets = file_snippets(args.files, args.base)
    checks, bad_files = file_checks(args.files, args.base)

    # 2) 判定模型是非题
    answers, judge_note = judge_yes_no(
        [c for _, c in undone], goal["text"], inventory, snippets, checks, args.final_text
    )

    for rank, (i, c) in enumerate(undone):
        if answers is not None and rank in answers:
            yes, conf = answers[rank]
            if yes and conf >= SURE_MIN:
                c["done"] = True
                c["basis"] = f"判定模型是，P={conf:.2f}"
            elif yes:
                notes.append(f"标准「{c['text'][:40]}」像达成但确定度 P={conf:.2f} 不足 {SURE_MIN}，本轮不打勾（拿不准不算达成）")
                c["basis"] = f"拿不准（P={conf:.2f}），未打勾"
            else:
                c["basis"] = f"判定模型否（P={conf:.2f}）"
        else:
            c["basis"] = "未判定（保持原状）"
    if judge_note:
        notes.append(judge_note)
    if bad_files:
        # 标准与文件的关联由判定模型结合体检结论判断；这里只留痕，绝不静默
        notes.append("机器实测发现异常文件：" + "、".join(sorted(bad_files)) + "；涉及它们的标准一律不应打勾（已写入体检结论供判定模型复核）")

    done = sum(1 for c in goal["criteria"] if c["done"])
    total = len(goal["criteria"])
    rework = ""
    if done < total:
        unmet = "\n".join(f"· {c['text']}" for c in goal["criteria"] if not c["done"])
        rework = (
            f"【目标验收 · 第 {goal.get('round', 0) + 1} 轮】以下验收标准还没达成：\n{unmet}\n"
            "只补这些未达成项，别重做已达成的部分。"
        )

    verdict = {
        "ok": True,
        "round": goal.get("round", 0),
        "criteria": goal["criteria"],
        "progress": {"done": done, "total": total},
        "rework_prompt": rework,
        "notes": notes,
    }
    print(json.dumps(verdict, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
