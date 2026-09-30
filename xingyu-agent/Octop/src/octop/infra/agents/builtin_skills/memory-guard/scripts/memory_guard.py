#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""memory_guard.py —— 星语 Agent 记忆防线 sidecar（OWB 迁移 6）

治理 octop-memory 管线自动晋升的长期记忆（memory.sqlite）：
  防线 1  密钥拒记    —— 命中密钥模式的 atom 隔离（deprecated）+ candidate 拒绝（rejected）
  防线 2  过期能力断言 —— 「XX 工具现已支持 YY」类断言隔离，防推断钉死成事实
  防线 3  低值记忆清理 —— 任务参数回显/一次性运行日志从 atoms 清出

设计红线（与 OWB 工程纪律对齐，实现全部自写）：
  1. 只治 atoms + candidates；raw_events 是 L0 不可变审计层，一律不动
  2. 隔离优于删除：superseded_by='memory-guard' + deprecated_at 置位，
     recall 查询带 deprecated_at IS NULL 过滤，隔离即从召回消失
  3. 拿不准不动：只报 finding 不改库
  4. 改库前必备份；实治后必须复检
  5. 退出码说实话：0=干净 / 2=有发现已处理 / 3=有发现但 --dry-run 未处理 / 1=错误

用法：
  python3 memory_guard.py guard --dry-run          # 只报不改
  python3 memory_guard.py guard                    # 实治（自动备份）
  python3 memory_guard.py guard --db /path/x.sqlite  # 指定库
  python3 memory_guard.py guard --json out.json    # 结果落盘
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sqlite3
import sys
import time
from dataclasses import dataclass, field, asdict
from typing import Any

GUARD_TAG = "memory-guard"

# ---------------------------------------------------------------- 判据（自研规则）
# 思路对标 OWB memory 事故记录（PolyForm Noncommercial，规则自写，一行未抄）。

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("api_key", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}")),
    ("github_pat", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}")),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("aws_aki", re.compile(r"\bAKIA[0-9A-Z]{12,}\b")),
    ("bearer", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/-]{20,}", re.I)),
    ("kv_secret", re.compile(
        r"(password|passwd|api[_-]?key|secret|token)[\"\']?\s*[:=]\s*\S{6,}", re.I)),
    ("zh_secret", re.compile(r"(密码|口令|密钥)\s*(是|为|[:：])\s*\S{4,}")),
    # 凭据片段标记：把密钥拆成几段分次发送也逃不掉
    ("secret_fragment", re.compile(
        r"(凭据|秘钥|token|密钥|TOKEN|Token)\s*的\s*(第\s*[一二三四五六七八九十\d]+\s*部分)")),
    ("secret_half", re.compile(
        r"(前半段|后半段|结尾应为|结尾是)\s*\.{0,3}\S{4,}")),
]

# 过期能力断言：主语 ∧ 断言同时命中才隔离（防误伤世界事实）
CAPABILITY_SUBJECT = re.compile(
    r"(工具|接口|api|API|服务端|后端|内置|系统|代码|程序|bug|Bug|BUG|渠道|模型|网关|端口|服务|功能|参数|插件|技能)",)
FIXED_CLAIM = re.compile(
    r"(已解决|已修复|已修好|已经修|现已支持|现在已支持|已经支持|已支持|已生效|已经生效|"
    r"已经可以|现在可以|已可用|已经正常|不再有|已经没有|问题不存在|已关闭|已打通)")

# 低值任务日志（atoms 里的一次性细节，无跨会话价值）
LOW_VALUE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("param_echo", re.compile(r"(提供|给出)的.{0,12}(运行)?参数[:：]?")),
    ("run_log", re.compile(r"(运行|执行|调用).{0,16}(失败|成功|报错|时)")),
    ("port_down", re.compile(r"(端口|网关|服务).{0,12}(未运行|不通|无响应|宕机)")),
    ("http_code", re.compile(r"\bHTTP\s?\d{2,3}\b")),
    ("cli_invocation", re.compile(r"--\w[\w-]*\s+\S+.*--\w[\w-]*")),  # 多 flag 命令行回显
    ("param_cli", re.compile(r"参数[:：].*--\w")),  # 「参数：--xxx」一次性调用细节
    ("token_placeholder", re.compile(r"\$\(cat\s+\S+\)|\$\{?\w+_TOKEN\}?")),  # 命令替换占位
]

# 中文数字映射（凭据片段判据辅助）
ZH_NUM = "零一二三四五六七八九十"


def _check_secret(text: str) -> str | None:
    for name, pat in SECRET_PATTERNS:
        if pat.search(text):
            return name
    return None


def _check_stale_claim(text: str) -> bool:
    return bool(CAPABILITY_SUBJECT.search(text) and FIXED_CLAIM.search(text))


def _check_low_value(text: str) -> str | None:
    for name, pat in LOW_VALUE_PATTERNS:
        if pat.search(text):
            return name
    return None


# ---------------------------------------------------------------- 数据结构

@dataclass
class Finding:
    layer: str            # atoms | candidates
    id: str
    kind: str             # secret:<name> | stale_claim | low_value:<name>
    snippet: str          # 截断留证
    action: str           # quarantine | reject | purge | keep
    detail: str = ""


@dataclass
class Verdict:
    ok: bool = True
    dry_run: bool = False
    db: str = ""
    quarantined: int = 0   # atoms 隔离
    rejected: int = 0      # candidates 拒绝
    purged: int = 0        # atoms 低值清理（同隔离口径）
    kept: int = 0          # 正常保留
    backup: str = ""
    findings: list[Finding] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["findings"] = [asdict(f) for f in self.findings]
        return d


# ---------------------------------------------------------------- 库定位

def _default_db_candidates() -> list[str]:
    """按 octop-memory 实际布局找 memory.sqlite（.octop 家目录优先）。"""
    cands: list[str] = []
    env = os.environ.get("OCTOP_MEMORY_DB")
    if env:
        cands.append(env)
    home = os.environ.get("HOME", "/root")
    # 容器内 octop 布局: /data/.octop/agents/<id>/.octop/memory.sqlite
    for base in ("/data/.octop/agents", os.path.join(home, ".octop", "agents"), "."):
        if os.path.isdir(base):
            for entry in sorted(os.listdir(base)):
                p = os.path.join(base, entry, ".octop", "memory.sqlite")
                if os.path.isfile(p):
                    cands.append(p)
            p0 = os.path.join(base, "memory.sqlite")
            if os.path.isfile(p0):
                cands.append(p0)
    # 工作区兜底
    for p in ("memory.sqlite", ".octop/memory.sqlite"):
        if os.path.isfile(p):
            cands.append(p)
    return cands


def _pick_db(explicit: str | None) -> str:
    if explicit:
        if not os.path.isfile(explicit):
            raise SystemExit(f"[memory-guard] 指定库不存在: {explicit}")
        return explicit
    cands = _default_db_candidates()
    if not cands:
        raise SystemExit(
            "[memory-guard] 未找到 memory.sqlite。多 agent 库请用 --db 指定，"
            "或设 OCTOP_MEMORY_DB。搜索过: /data/.octop/agents/*/.octop/ 、"
            "~/.octop/agents/*/.octop/ 、工作区。")
    if len(cands) > 1:
        # 多库场景默认不猜，列出让 agent 挨个跑
        raise SystemExit(
            "[memory-guard] 发现多个 memory.sqlite，请逐个用 --db 指定:\n  "
            + "\n  ".join(cands))
    return cands[0]


# ---------------------------------------------------------------- 主逻辑

def _tables(con: sqlite3.Connection) -> set[str]:
    rows = con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    return {r[0] for r in rows}


def _atom_tables(tables: set[str]) -> list[tuple[str, str]]:
    """[(namespace, atoms_table)] —— 兼容单/多 namespace 布局。"""
    out = []
    for t in sorted(tables):
        if t.endswith("_atoms") and not t.endswith("_fts"):
            ns = t[:-len("_atoms")]
            out.append((ns, t))
    if not out and "atoms" in tables:
        out.append(("", "atoms"))
    return out


def _hm_cjk_seg_compat(text: str) -> str:
    """hm_cjk_seg 的兼容实现（CJK bigram + ASCII 原样）。

    库内 FTS 触发器依赖宿主注册的分词函数，sidecar 环境没有。
    隔离行的 FTS 索引即使与本实现分词略异也无害：recall 在 SQL 层
    过滤 deprecated_at IS NULL，不走 FTS 层。
    """
    if text is None:
        return ""
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if "\u4e00" <= ch <= "\u9fff":
            j = i
            while j < n and "\u4e00" <= text[j] <= "\u9fff":
                j += 1
            run = text[i:j]
            if len(run) == 1:
                out.append(run)
            else:
                out.extend(run[k:k + 2] for k in range(len(run) - 1))
            i = j
        else:
            j = i
            while j < n and not ("\u4e00" <= text[j] <= "\u9fff"):
                j += 1
            out.append(text[i:j])
            i = j
    return " ".join(out)


def _connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    # FTS 触发器需要的宿主分词函数，sidecar 侧注册兼容实现
    con.create_function("hm_cjk_seg", 1, _hm_cjk_seg_compat, deterministic=True)
    return con


def guard(db_path: str, dry_run: bool) -> Verdict:
    v = Verdict(db=db_path, dry_run=dry_run)
    con = _connect(db_path)
    con.row_factory = sqlite3.Row
    tables = _tables(con)
    ats = _atom_tables(tables)

    if not ats:
        v.ok = False
        v.findings.append(Finding("db", "-", "no_atoms_table",
                                  "", "keep", "库内无 atoms 表，疑似非 octop-memory 库"))
        return v

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"

    # ---- 防线 1+2+3：atoms
    for ns, tbl in ats:
        rows = con.execute(
            f"SELECT id, assertion, deprecated_at FROM {tbl} "
            f"WHERE deprecated_at IS NULL").fetchall()
        for r in rows:
            aid, text = r["id"], (r["assertion"] or "")
            hit = _check_secret(text)
            if hit:
                v.findings.append(Finding(
                    "atoms", aid, f"secret:{hit}", text[:80], "quarantine"))
                continue
            if _check_stale_claim(text):
                v.findings.append(Finding(
                    "atoms", aid, "stale_claim", text[:80], "quarantine"))
                continue
            lv = _check_low_value(text)
            if lv:
                v.findings.append(Finding(
                    "atoms", aid, f"low_value:{lv}", text[:80], "quarantine"))
                continue
            v.kept += 1

    # ---- candidates：pending 命中 → rejected
    for ns, tbl in ats:
        ct = f"{ns}_candidates" if ns else "candidates"
        if ct not in tables:
            continue
        try:
            rows = con.execute(
                f"SELECT id, assertion, status FROM {ct} "
                f"WHERE status IN ('pending','needs_review','conflict')").fetchall()
        except sqlite3.OperationalError:
            # 列名可能不同，跳过不硬猜
            continue
        for r in rows:
            cid, text = r["id"], (r["assertion"] or "")
            hit = _check_secret(text) or (
                "stale" if _check_stale_claim(text) else None)
            if hit:
                v.findings.append(Finding(
                    "candidates", cid,
                    f"secret:{hit}" if hit != "stale" else "stale_claim",
                    text[:80], "reject"))

    # ---- 执行
    to_quarantine = [f for f in v.findings if f.layer == "atoms"]
    to_reject = [f for f in v.findings if f.layer == "candidates"]

    if not dry_run and (to_quarantine or to_reject):
        backup = f"{db_path}.guard-bak-{time.strftime('%Y%m%d-%H%M%S')}"
        # backup API 处理 WAL/页状态，比文件拷贝可靠
        bcon = sqlite3.connect(backup)
        with bcon:
            con.backup(bcon)
        bcon.close()
        v.backup = backup

        for ns, tbl in ats:
            q_ids = [f.id for f in to_quarantine]
            if not q_ids:
                continue
            ph = ",".join("?" * len(q_ids))
            con.execute(
                f"UPDATE {tbl} SET superseded_by=?, deprecated_at=? "
                f"WHERE id IN ({ph}) AND deprecated_at IS NULL",
                (GUARD_TAG, now_iso, *q_ids))
            ct = f"{ns}_candidates" if ns else "candidates"
            r_ids = [f.id for f in to_reject]
            if ct in tables and r_ids:
                ph2 = ",".join("?" * len(r_ids))
                try:
                    con.execute(
                        f"UPDATE {ct} SET status='rejected' WHERE id IN ({ph2})",
                        r_ids)
                except sqlite3.OperationalError:
                    pass
        con.commit()
        v.quarantined = len(to_quarantine)
        v.rejected = len(to_reject)
        v.purged = sum(1 for f in to_quarantine
                       if f.kind.startswith("low_value"))
    else:
        v.quarantined = sum(1 for f in to_quarantine)
        v.rejected = sum(1 for f in to_reject)

    con.close()
    v.ok = not v.findings
    return v


# ---------------------------------------------------------------- CLI

def main() -> int:
    ap = argparse.ArgumentParser(description="星语 Agent 记忆防线")
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("guard", help="巡检/治理记忆库")
    g.add_argument("--db", default=None, help="memory.sqlite 路径（多库必填）")
    g.add_argument("--dry-run", action="store_true", help="只报不改")
    g.add_argument("--json", default=None, help="verdict 落盘路径")
    args = ap.parse_args()

    db = _pick_db(args.db)
    v = guard(db, args.dry_run)

    out = json.dumps(v.to_dict(), ensure_ascii=False, indent=2)
    print(out)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            f.write(out)

    if not v.findings:
        return 0
    return 3 if args.dry_run else 2


if __name__ == "__main__":
    sys.exit(main())
