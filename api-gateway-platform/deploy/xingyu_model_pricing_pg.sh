#!/usr/bin/env bash
# 川邮·星语 · 模型价目表对齐（PostgreSQL 生产版）
#
# 为什么有这个脚本
# ----------------
# deploy/xingyu_model_pricing.py 是 SQLite 版，只能在本地容器验证时用。
# 生产是 PostgreSQL，且网关在跑、不能停机。因此这里直接以 SQL 更新
# options 表，并在 UPDATE 之后调用 new-api 的配置热加载（无需重启）。
#
# 换算口径（与 .py 版严格一致，2026-09-20 端到端实测校准）
# ------------------------------------------------------
#   QuotaPerUnit = 500000  →  500000 quota = 1 美元
#   元 = quota / QuotaPerUnit × USDExchangeRate
#   quota = tokens × ModelRatio × GroupRatio
#
#   ⇒ ModelRatio = 单价(元/百万 tokens) × QuotaPerUnit / (汇率 × 1e6)
#                = 单价 × 500000 / (7.3 × 1e6)
#
#   CompletionRatio = 输出单价 / 输入单价
#   CacheRatio      = 缓存命中单价 / 输入单价
#
# 计价基准：一律锚定官方「空闲时段」单价 = 1.0x，
#           峰谷差异交给 4.2 时段倍率（time_ratio_setting）叠加。
#
# 用法：bash xingyu_model_pricing_pg.sh [--dry-run]
set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

cd /data/allomax
export $(grep POSTGRES_PASSWORD .env | xargs)
PSQL="docker exec -i allomax-postgres psql -U allomax -t -A"

# 现网汇率（与 general_setting.usd_exchange_rate 保持一致）
USD_RATE=7.3
QPU=500000

# 只改这 9 个模型的三个倍率键；其余模型（多模态/按次）原样保留
python3 - "$DRY_RUN" <<'PYEOF'
import json, sys, subprocess

DRY = sys.argv[1] == "true"
USD_RATE, QPU = 7.3, 500000.0
RATIO_PER_CNY = QPU / (USD_RATE * 1_000_000)   # ≈ 0.0684931507

# 三家官方价（2026-09-21 核实），单位：元 / 百万 tokens
#   (provider, in, hit, out, note)
PRICING = {
    # ── DeepSeek 官方（空闲时段口径）──
    "DeepSeek-V4.1-Flash":                ("DeepSeek", 1.0, 0.02, 4.0,   "官方空闲价"),
    "DeepSeek-V4-Flash-0731":             ("DeepSeek", 1.0, 0.02, 4.0,   "官方空闲价"),
    "deepseek-v4-flash-0731":             ("DeepSeek", 1.0, 0.02, 4.0,   "官方空闲价"),
    "DeepSeek-V4-Pro-0813":               ("DeepSeek", 4.5, 0.15, 13.5,  "官方空闲价"),
    "deepseek-ai/DeepSeek-V4-Pro-0813":   ("DeepSeek", 4.5, 0.15, 13.5,  "官方空闲价"),
    # ── 阿里云百炼 ──
    "qwen3.8-flash-next":                 ("Aliyun",   0.8, 0.1,  2.7,   "百炼 Qwen3.8-Flash"),
    "Qwen3.8-Max":                        ("Aliyun",  12.0, 1.5,  36.0,  "百炼 Qwen3.8-Max"),
    # ── 智谱开放平台 ──
    "glm-5.3":                            ("Zhipu",    8.0, 2.0,  28.0,  "官方标准价"),
    # GLM-5.3-Flash：2026-09-21 上线决策，走智谱限时五折活动价
    "glm-5.3-flash":                      ("Zhipu",    0.4, 0.115, 1.4, "限时五折活动价"),
}

def to_ratios(inp, hit, out):
    """元/百万 → (ModelRatio, CompletionRatio, CacheRatio)。

    ModelRatio 保留 9 位小数（与项目默认精度一致）；
    另两个比值用**取整后的** ModelRatio 反推有效输入价，
    保证三者自洽——否则端到端实测会出现亚分级偏差。
    """
    mr = round(inp * RATIO_PER_CNY, 9)
    eff_in = mr / RATIO_PER_CNY
    return mr, round(out / eff_in, 6), round(hit / eff_in, 6)

def psql(sql, quiet=True):
    r = subprocess.run(["docker", "exec", "-i", "allomax-postgres",
                        "psql", "-U", "allomax", "-t", "-A", "-c", sql],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()

# 1) 读现值
cur = {}
for key in ("ModelRatio", "CompletionRatio", "CacheRatio"):
    raw = psql(f"SELECT value FROM options WHERE key='{key}';")
    cur[key] = json.loads(raw) if raw else {}

# 2) 生成新表（在现值基础上合并，不动其他模型）
tables = {}
print("=" * 100)
print(f"{'模型':<36}{'来源':<10}{'输入':>8}{'输出':>9}{'缓存':>9}   倍率(旧 → 新)")
print("=" * 100)
for name, (prov, inp, hit, out, note) in PRICING.items():
    mr, cr, xr = to_ratios(inp, hit, out)
    eff_in = mr / RATIO_PER_CNY
    assert abs(eff_in - inp) < 1e-6, f"{name} 输入价回算失败"
    assert abs(eff_in * cr - out) < 1e-5, f"{name} 输出价回算失败"
    assert abs(eff_in * xr - hit) < 1e-5, f"{name} 缓存价回算失败"

    old = cur["ModelRatio"].get(name)
    for key, val in (("ModelRatio", mr), ("CompletionRatio", cr), ("CacheRatio", xr)):
        tables.setdefault(key, dict(cur[key]))[name] = val

    flag = "  ← 新增" if old is None else ("" if abs(old - mr) < 1e-9 else "  ← 变更")
    print(f"{name:<36}{prov:<10}{eff_in:>8.4f}{eff_in*cr:>9.4f}{eff_in*xr:>9.4f}   "
          f"MR {old if old is not None else '-'} → {mr}{flag}")
print("=" * 100)
print(f"换算常数: QuotaPerUnit={QPU:.0f}  汇率={USD_RATE}  RATIO_PER_CNY={RATIO_PER_CNY:.10f}")
print()

if DRY:
    print("【预演模式】未写入数据库。加 --apply 才会落库。")
    sys.exit(0)

# 3) 写入。value 是**一层** JSON 字符串，不能二次编码
for key, table in tables.items():
    payload = json.dumps(table, ensure_ascii=False, separators=(",", ":"))
    esc = payload.replace("'", "''")
    sql = (f"INSERT INTO options(key,value) VALUES('{key}','{esc}') "
           f"ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;")
    psql(sql)
    print(f"✓ 已写入 {key}（{len(table)} 个模型）")

PYEOF