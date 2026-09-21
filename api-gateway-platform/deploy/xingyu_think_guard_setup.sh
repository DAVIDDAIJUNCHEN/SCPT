#!/usr/bin/env bash
# =============================================================================
# Think Guard 上线脚本：将思考抑制配置写入渠道级 param_override
#
# 背景：glm-5.3-flash / qwen3.8-flash-next / DeepSeek-V4.1-Flash 是
# always-thinking 模型，agent 场景下思考链吃光输出预算（首字 30~40s、
# 正文 0 字）。原由本地 Python 代理（vllm-gateway-proxy.py v3.2）承担，
# 现下沉到星语网关渠道级 param_override，零代码改动。
#
# 策略（与本地代理 v3.2 实测结论一一对应，单测 relay/common/
# think_guard_override_test.go 固化了全部语义）：
#   渠道 3  (qwen3.8-flash-next)   → DisableThinking: ctk.enable_thinking=false + effort=none
#   渠道 4  (glm-5.3-flash)        → EffortClamp:    reasoning_effort=low（不动 enable_thinking）
#   渠道 12 (DeepSeek-V4.1-Flash)  → DisableThinking: ctk.enable_thinking=false + effort=none
#
# 语义要点（踩坑经验）：
#   1. 必须用 operations 格式 + 嵌套路径 "chat_template_kwargs.enable_thinking"。
#      legacy 顶层 set 会整个替换 chat_template_kwargs 对象，丢失兄弟键。
#   2. DisableThinking 两字段必须同时注入：仅 enable_thinking=false 压不住
#      reasoning_effort（实测 V4.1 在 effort=low 下仍思考 7900 字、首字 93s）。
#   3. 渠道 3/12 保留 model 白名单条件（渠道含别名/重试可能落错渠道）；
#      渠道 4 单模型独占，无条件 set（FORCE 语义）。
#   4. 写库后渠道缓存随 SyncChannelCache 定时刷新（无需重启容器），
#      但生产 channel_update_frequency 默认 600s，如需立即生效可重启。
#   5. SQL 字符串只用单层引号 '$OVERRIDE'：JSON 内无单引号，
#      三引号 ''' 会被 PostgreSQL 解析成内容里的字面引号（脏数据）。
#
# 用法（本脚本通过 ssh 远程执行 psql，Mac/VPS 上均可运行）：
#   bash xingyu_think_guard_setup.sh          # 写入配置
#   bash xingyu_think_guard_setup.sh --check  # 仅自检不写入
#   bash xingyu_think_guard_setup.sh --reset  # 清除三渠道的 param_override
# =============================================================================
set -euo pipefail

SSH_TARGET="${SSH_TARGET:-root@10.255.12.210}"
PSQL_CMD='cd /data/allomax && export $(grep POSTGRES_PASSWORD .env|xargs) && docker exec -i allomax-postgres psql -U allomax -t -A'

# ---- 渠道 4: glm-5.3-flash → Effort Clamp（无条件 set，单模型独占渠道）----
OVERRIDE_CLAMP='{"operations":[{"path":"reasoning_effort","mode":"set","value":"low"}]}'

# ---- 渠道 3: qwen3.8-flash-next → Disable Thinking（model 白名单条件）----
OVERRIDE_DISABLE_QWEN='{"operations":[{"path":"chat_template_kwargs.enable_thinking","mode":"set","value":false,"conditions":[{"path":"model","mode":"full","value":"qwen3.8-flash-next"}],"logic":"OR"},{"path":"reasoning_effort","mode":"set","value":"none","conditions":[{"path":"model","mode":"full","value":"qwen3.8-flash-next"}],"logic":"OR"}]}'

# ---- 渠道 12: DeepSeek-V4.1-Flash → Disable Thinking（model 白名单条件）----
OVERRIDE_DISABLE_DS41='{"operations":[{"path":"chat_template_kwargs.enable_thinking","mode":"set","value":false,"conditions":[{"path":"model","mode":"full","value":"DeepSeek-V4.1-Flash"}],"logic":"OR"},{"path":"reasoning_effort","mode":"set","value":"none","conditions":[{"path":"model","mode":"full","value":"DeepSeek-V4.1-Flash"}],"logic":"OR"}]}'

run_sql() {
  printf "%s" "$1" | ssh -o ConnectTimeout=10 "$SSH_TARGET" "$PSQL_CMD"
}

MODE="${1:-}"

echo "================ Think Guard 配置自检 ================"
echo "[渠道现状]"
CH_NOW=$(run_sql "SELECT id, name, coalesce(param_override,'') FROM channels WHERE id IN (3,4,12) ORDER BY id;")
echo "$CH_NOW"

if [ "$MODE" = "--check" ]; then
  echo "[--check] 仅自检，不写入。退出。"
  exit 0
fi

if [ "$MODE" = "--reset" ]; then
  echo "[--reset] 清除三渠道 param_override ..."
  run_sql "UPDATE channels SET param_override='' WHERE id IN (3,4,12);"
  echo "已清除。验证："
  run_sql "SELECT id, coalesce(param_override,'(空)') FROM channels WHERE id IN (3,4,12) ORDER BY id;"
  exit 0
fi

echo
echo "================ 写入配置 ================"
# 渠道 3: qwen3.8-flash-next
run_sql "UPDATE channels SET param_override='$OVERRIDE_DISABLE_QWEN' WHERE id=3;"
# 渠道 4: glm-5.3-flash（单模型独占渠道，无条件 set）
run_sql "UPDATE channels SET param_override='$OVERRIDE_CLAMP' WHERE id=4;"
# 渠道 12: DeepSeek-V4.1-Flash（models 仅此一模型）
run_sql "UPDATE channels SET param_override='$OVERRIDE_DISABLE_DS41' WHERE id=12;"

echo
echo "================ 写后自检（逐字段断言）================"
echo "[1] 三个渠道的 param_override 均非空："
run_sql "SELECT id, name, CASE WHEN param_override IS NULL OR param_override='' THEN 'BAD 空' ELSE 'OK 已写入' END FROM channels WHERE id IN (3,4,12) ORDER BY id;"
echo
echo "[2] 渠道 3：两个操作 + model 条件："
run_sql "SELECT id, CASE WHEN param_override LIKE '%chat_template_kwargs.enable_thinking%' THEN 'OK' ELSE 'BAD' END AS has_ctk, CASE WHEN param_override LIKE '%\"value\":false%' THEN 'OK' ELSE 'BAD' END AS has_false, CASE WHEN param_override LIKE '%\"value\":\"none\"%' THEN 'OK' ELSE 'BAD' END AS has_none, CASE WHEN param_override LIKE '%qwen3.8-flash-next%' THEN 'OK' ELSE 'BAD' END AS has_model_cond FROM channels WHERE id=3;"
echo
echo "[3] 渠道 4：clamp low，无 ctk 操作："
run_sql "SELECT id, CASE WHEN param_override LIKE '%\"value\":\"low\"%' THEN 'OK' ELSE 'BAD' END AS has_low, CASE WHEN param_override LIKE '%enable_thinking%' THEN 'WARN 含 ctk（预期应无）' ELSE 'OK 无 ctk' END AS no_ctk FROM channels WHERE id=4;"
echo
echo "[4] 渠道 12：两个操作 + model 条件："
run_sql "SELECT id, CASE WHEN param_override LIKE '%chat_template_kwargs.enable_thinking%' THEN 'OK' ELSE 'BAD' END AS has_ctk, CASE WHEN param_override LIKE '%\"value\":\"none\"%' THEN 'OK' ELSE 'BAD' END AS has_none, CASE WHEN param_override LIKE '%DeepSeek-V4.1-Flash%' THEN 'OK' ELSE 'BAD' END AS has_model_cond FROM channels WHERE id=12;"
echo
echo "[5] JSON 合法性 + 前后无脏引号（三渠道分别解析）："
for cid in 3 4 12; do
  JSON=$(run_sql "SELECT param_override FROM channels WHERE id=$cid;")
  echo -n "  渠道 $cid: "
  echo "$JSON" | python3 -c "import json,sys; s=sys.stdin.read().strip(); assert s.startswith('{') and s.endswith('}'), 'dirty quotes'; json.loads(s); print('OK JSON 合法且无脏引号')" 2>/dev/null || echo "BAD JSON 不合法或含脏引号"
done
echo
echo "================ 完成 ================"
echo "提示：渠道缓存随 SyncChannelCache 定时刷新（默认 600s），或重启容器立即生效。"
echo "回滚：bash $0 --reset"
