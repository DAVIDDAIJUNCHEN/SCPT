#!/usr/bin/env bash
# 川邮·星语 · 4.2 时段倍率配置写入（PostgreSQL 生产版）
#
# 规则（Asia/Shanghai），顺序敏感，不可调换：
#   1) WEEKEND  周六周日全天         ×1.0   ← 必须最先，否则工作日夜间档会在周末误触发
#   2) VALLEY   工作日 22:00-次日08:00 ×0.5  ← 跨零点，必须排在 PEAK 之前
#   3) PEAK     工作日 09:00-12:00   ×2.0
#              工作日 14:00-18:00   ×2.0
#   其余时段（08-09 / 12-14 / 18-22）不命中，按 1.0x（官方空闲价）
#
# ⚠️ 写库姿势（踩过坑，务必区分两种类型）：
#   - Slice/Struct 字段（rules）：handleConfigUpdate 走 json.Unmarshal，
#     value 必须是**一层** JSON 字符串（如 [{"name":...}]）。
#   - string 字段（location）：直接赋给 config 变量，**不做 json.Unmarshal**，
#     所以 value 必须是裸值（Asia/Shanghai），写成 "Asia/Shanghai" 会把引号
#     一起存进去，最终 LoadLocation(`"Asia/Shanghai"`) 虽然能容错加载，
#     但前端展示会出现多余引号。
#   - bool 字段（enabled）：同理，裸值 true。
set -euo pipefail

cd /data/allomax
export $(grep POSTGRES_PASSWORD .env | xargs)
PSQL="docker exec -i allomax-postgres psql -U allomax -t -A"

RULES='[{"name":"WEEKEND","days":[0,6],"start_hour":0,"end_hour":24,"ratio":1.0},{"name":"VALLEY","days":[],"start_hour":22,"end_hour":8,"ratio":0.5},{"name":"PEAK","days":[],"start_hour":9,"end_hour":12,"ratio":2.0},{"name":"PEAK","days":[],"start_hour":14,"end_hour":18,"ratio":2.0}]'

echo "=== 写入前 ==="
$PSQL -c "SELECT coalesce(string_agg(key||'='||left(value,80), ' | '),'(无)') FROM options WHERE key LIKE 'time_ratio%';"

# 逐键 UPSERT
$PSQL -c "INSERT INTO options(key,value) VALUES('time_ratio_setting.enabled','true')
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"
$PSQL -c "INSERT INTO options(key,value) VALUES('time_ratio_setting.location','Asia/Shanghai')
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"
$PSQL -c "INSERT INTO options(key,value) VALUES('time_ratio_setting.rules','$RULES')
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"

echo "=== 写入后 ==="
$PSQL -c "SELECT key||' = '||left(value,200) FROM options WHERE key LIKE 'time_ratio%' ORDER BY key;"

echo
echo "=== 严格自检（含类型断言，防「多一层引号」复发）==="
python3 - <<'PYEOF'
import json, subprocess, sys

def get(k):
    r = subprocess.run(["docker","exec","-i","allomax-postgres","psql","-U","allomax","-t","-A",
                        "-c", f"SELECT value FROM options WHERE key='{k}';"],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()

fail = []

# --- rules：必须是合法 JSON 数组 ---
rules = json.loads(get("time_ratio_setting.rules"))
assert isinstance(rules, list) and rules, "rules 应为非空数组"
print(f"✓ rules 是合法 JSON 数组，共 {len(rules)} 条：")
for r in rules:
    days = "-".join(str(d) for d in r["days"]) if r["days"] else "工作日"
    print(f"    {r['name']:<8} {days:<10} {r['start_hour']:>2}:00 - {r['end_hour']:>2}:00   x{r['ratio']}")

# --- location：必须是裸值，不能带引号（string 字段不做 json.Unmarshal）---
raw_loc = get("time_ratio_setting.location")
if raw_loc.startswith('"') or raw_loc.endswith('"'):
    fail.append(f"location 带多余引号：{raw_loc!r}（应为裸值 Asia/Shanghai）")
else:
    loc = raw_loc
    print(f"✓ location = {loc}（裸值，无多余引号）")

# --- enabled：必须是裸 true/false ---
raw_en = get("time_ratio_setting.enabled")
if raw_en not in ("true", "false"):
    fail.append(f"enabled 值异常：{raw_en!r}（应为裸值 true/false）")
else:
    print(f"✓ enabled  = {raw_en}  ({'已启用' if raw_en == 'true' else '未启用'})")

# --- 规则顺序断言：WEEKEND 必须最先；VALLEY(跨零点) 必须先于 PEAK ---
names = [r["name"] for r in rules]
if names and names[0] != "WEEKEND":
    fail.append(f"规则顺序错误：WEEKEND 必须排在首位，实际首位是 {names[0]}")
vi = names.index("VALLEY") if "VALLEY" in names else -1
pi = names.index("PEAK")   if "PEAK"   in names else -1
if vi >= 0 and pi >= 0 and vi > pi:
    fail.append("规则顺序错误：VALLEY(22:00-08:00 跨零点) 必须排在 PEAK 之前")
if not fail:
    print("✓ 规则顺序正确（WEEKEND 首位 → VALLEY → PEAK）")

if fail:
    print("\n✗ 自检未通过：")
    for f in fail:
        print("   -", f)
    sys.exit(1)
print("\n✓ 全部自检通过")
PYEOF