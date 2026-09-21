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
# ⚠️ 写库姿势：handleConfigUpdate 里 Slice/Struct 分支走 json.Unmarshal，
#    value 必须是**一层** JSON 字符串。用 psql 写入时注意 $$ ... $$ 引号，
#    里面的双引号是 JSON 的一部分，不要再转义一层。
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
$PSQL -c "INSERT INTO options(key,value) VALUES('time_ratio_setting.location','\"Asia/Shanghai\"')
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"
$PSQL -c "INSERT INTO options(key,value) VALUES('time_ratio_setting.rules','$RULES')
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;"

echo "=== 写入后 ==="
$PSQL -c "SELECT key||' = '||left(value,200) FROM options WHERE key LIKE 'time_ratio%' ORDER BY key;"

echo
echo "=== JSON 合法性校验 ==="
python3 - <<'PYEOF'
import json, subprocess
def get(k):
    r = subprocess.run(["docker","exec","-i","allomax-postgres","psql","-U","allomax","-t","-A",
                        "-c", f"SELECT value FROM options WHERE key='{k}';"],
                       capture_output=True, text=True, check=True)
    return r.stdout.strip()

rules = json.loads(get("time_ratio_setting.rules"))
print(f"✓ rules 是合法 JSON，共 {len(rules)} 条：")
for r in rules:
    days = "-".join(str(d) for d in r["days"]) if r["days"] else "工作日"
    print(f"    {r['name']:<8} {days:<10} {r['start_hour']:>2}:00 - {r['end_hour']:>2}:00   x{r['ratio']}")
loc = json.loads(get("time_ratio_setting.location"))
print(f"✓ location = {loc}")
en = get("time_ratio_setting.enabled")
print(f"✓ enabled  = {en}  ({'已启用' if en=='true' else '未启用'})")
PYEOF