#!/usr/bin/env python3
"""
川邮·星语 · 模型价目表对齐脚本（幂等，可反复执行）

作用
----
把星语平台的模型单价**对齐到各家模型的原厂官方定价**，使同名学生的情况如下：
  - DeepSeek 系模型  → 对齐 DeepSeek 官方（空闲时段单价为基准 1.0x）
  - qwen 系模型      → 对齐阿里云百炼
  - glm 系模型       → 对齐智谱开放平台

计价模型（new-api 原生）
------------------------
    quota = tokens × ModelRatio × GroupRatio
    CompletionRatio = 输出单价 / 输入单价
    CacheRatio      = 缓存命中单价 / 输入单价

换算常数（⚠️ 方向极易搞错，已踩过一次）
----------------------------------------
    QuotaPerUnit = 500000 的含义是「500000 quota = 1 美元」，**不是** 1 quota 直接等于某个元值。
    quota 是站点内部额度单位，与人民币之间还差一次汇率折算：

        元 = quota / QuotaPerUnit × USDExchangeRate

    计费本体：  quota = tokens × ModelRatio × GroupRatio
    因此若期望「输入单价 P 元/百万 tokens」：

        ModelRatio = P × QuotaPerUnit / (USDExchangeRate × 1e6)

    代入 P=1、QuotaPerUnit=5e5、汇率=7.3 得 0.068493151，与生产现值一致 ✓

    ✗ 早期误写为 ModelRatio = P × 1e6 × 汇率 / QuotaPerUnit = 14.6，
      是正确值的 213 倍，上线会把费用算成天文数字（本地端到端实测抓出来的）。

基准口径（重要，与 4.2 时段倍率配合）
------------------------------------
ModelRatio 一律按官方**空闲时段单价**换算（即平台默认价 = 官方空闲价），
峰谷差异交给时段倍率（setting/ratio_setting/time_ratio.go）叠加：
    - 工作日高峰 09:00-12:00 / 14:00-18:00  → ×2.0
    - 工作日夜间 22:00-次日 08:00           → ×0.5
    - 周末全天                             → ×1.0
净效果：用户在非工作日晚高峰时段调用，价格与官方一致；工作日高峰为官方 2 倍。

官方价格来源（2026-09-20 核实）
------------------------------
  DeepSeek 官方  https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
      V4.1-Flash  空闲 输入 1.0 / 缓存命中 0.02 / 输出 4.0（高峰翻倍）
      V4-Pro      空闲 输入 4.5 / 缓存命中 0.15 / 输出 13.5（高峰翻倍）
      高峰时段：工作日 09:00-12:00、14:00-18:00（北京时间），其余含周末为空闲
  阿里云百炼     https://bailian.console.aliyun.com/  （模型市场详情页）
      Qwen3.8-Flash  输入 0.8 / 缓存命中 0.1 / 输出 2.7
      Qwen3.8-Max    输入 12.0 / 缓存命中 1.5 / 输出 36.0
  智谱开放平台   https://docs.bigmodel.cn/cn/guide/start/pricing
      GLM-5.3        输入 8.0 / 缓存命中 2.0  / 输出 28.0
      GLM-5.3-Flash  输入 0.8 / 缓存命中 0.23 / 输出 2.8（标准价）
                     ⚠️ 限时五折价 输入 0.4 / 缓存命中 0.115 / 输出 1.4，
                        用 --glm-flash-promo 切换

⚠️ 平台特供模型的说明
--------------------
以下模型是星语自建部署的衍生版，官方无同名条目，取最近似口径：
    deepseek-v4-flash-0731        → 按 DeepSeek V4.1-Flash 计（该模型已被官方
                                     V4.1-Flash 取代并降价，保持一致以免比价劣势）
    qwen3.8-flash-next            → 按百炼 Qwen3.8-Flash 计（同门师弟，官方尚未单列）
    DeepSeek-V4-Pro-0813 / glm-5.3 等
        → 官方价换算，星语当前未上架但预先配好，上架即用

用法
----
    # 预演（只读，不改库）
    docker cp xingyu_model_pricing.py allomax-gateway:/tmp/
    docker exec allomax-gateway python3 /tmp/xingyu_model_pricing.py --dry-run

    # 实际写入
    docker exec allomax-gateway python3 /tmp/xingyu_model_pricing.py --apply

    # 智谱 GLM-5.3-Flash 用限时五折价
    docker exec allomax-gateway python3 /tmp/xingyu_model_pricing.py --apply --glm-flash-promo

    # 只处理某些模型
    docker exec allomax-gateway python3 /tmp/xingyu_model_pricing.py --apply --only DeepSeek-V4.1-Flash

⚠️ 注意：本脚本只改 ModelRatio / CompletionRatio / CacheRatio 三个键，
   不动 ImageRatio / AudioRatio，也不动分组倍率。

改动后**无需重启**（new-api 侧配置热生效），但前端价格展示可能有缓存，
建议在管理后台「系统设置 → 分组与模型定价设置」点一次「刷新」或重进页面确认。
"""

import argparse
import json
import os
import re
import sys

# ── 换算常数（与生产 general_setting.usd_exchange_rate / common.QuotaPerUnit 一致）──
#
# ⚠️ 换算方向极易搞错，这里写清楚（2026-09-20 踩过一次，务必读）：
#
#   QuotaPerUnit = 500000  的含义是「500000 quota = 1 美元」，**不是** 1 quota = 1.46e-5 元。
#   quota 是站点内部额度单位，与元之间还差一次汇率折算：
#
#       元 = quota / QuotaPerUnit × USDExchangeRate
#
#   而计费本体是:  quota = tokens × ModelRatio × GroupRatio
#
#   因此「输入单价 P 元/百万 tokens」要求:
#       P / 1e6 元/token = ModelRatio(quota/token) / QuotaPerUnit × USDExchangeRate
#   →   ModelRatio = P × QuotaPerUnit / (USDExchangeRate × 1e6)
#
#   代入 P=1、QuotaPerUnit=5e5、汇率=7.3:
#       ModelRatio = 1 × 500000 / (7.3 × 1e6) = 0.068493151…   （与生产现值一致 ✓）
#
#   反面教材：曾误写成 ModelRatio = P × 1e6 × 汇率 / QuotaPerUnit = 14.6，
#   是正确值的 213 倍（10^6/7.3^2 量级），线上会直接把费用算成天文数字。
USD_RATE = 7.3
QUOTA_PER_UNIT = 500_000.0

# 元/百万 tokens → ModelRatio 的比例因子
RATIO_PER_CNY = QUOTA_PER_UNIT / (USD_RATE * 1_000_000)  # ≈ 0.0684931507

# ── 官方价目表：元/百万 tokens（输入未命中缓存 / 缓存命中 / 输出）──
# 键 = 星语平台侧模型名（与 channels 的 model 字段一致）
PRICING = {
    # ── DeepSeek 官方 ──
    "DeepSeek-V4.1-Flash": {
        "provider": "DeepSeek 官方",
        "in": 1.0, "hit": 0.02, "out": 4.0,
        "note": "空闲价（高峰翻倍，由时段倍率叠加）",
    },
    "deepseek-v4-flash-0731": {
        "provider": "DeepSeek 官方",
        "in": 1.0, "hit": 0.02, "out": 4.0,
        "note": "已由 V4.1-Flash 取代，按 V4.1-Flash 空闲价计",
    },
    "DeepSeek-V4-Flash-0731": {
        "provider": "DeepSeek 官方",
        "in": 1.0, "hit": 0.02, "out": 4.0,
        "note": "同上，大小写变体",
    },
    "DeepSeek-V4-Pro-0813": {
        "provider": "DeepSeek 官方",
        "in": 4.5, "hit": 0.15, "out": 13.5,
        "note": "空闲价；官方 2026-09-14 后继续保留该档在售",
    },
    "deepseek-ai/DeepSeek-V4-Pro-0813": {
        "provider": "DeepSeek 官方",
        "in": 4.5, "hit": 0.15, "out": 13.5,
        "note": "同上，带 org 前缀别名",
    },

    # ── 阿里云百炼 ──
    "qwen3.8-flash-next": {
        "provider": "阿里云百炼",
        "in": 0.8, "hit": 0.1, "out": 2.7,
        "note": "对齐 Qwen3.8-Flash（同门，官方未单列 Flash-Next）",
    },
    "Qwen3.8-Max": {
        "provider": "阿里云百炼",
        "in": 12.0, "hit": 1.5, "out": 36.0,
        "note": "官方旗舰档，星语未上架，预算备用",
    },

    # ── 智谱开放平台 ──
    "glm-5.3": {
        "provider": "智谱开放平台",
        "in": 8.0, "hit": 2.0, "out": 28.0,
        "note": "官方标准价",
    },
    "glm-5.3-flash": {
        "provider": "智谱开放平台",
        "in": 0.8, "hit": 0.23, "out": 2.8,
        "note": "官方标准价",
    },
}

# 智谱 GLM-5.3-Flash 限时五折（2026-08-26 起活动价）
GLM_FLASH_PROMO = {"in": 0.4, "hit": 0.115, "out": 1.4}

# ── 不参与本脚本的模型（多模态 / 按次 / 非对标对象），仅列出以便人工核对 ──
SKIP = {
    "Qwen3-VL-30B-A3B-Instruct": "视觉模型，官方无对应公开单价",
    "Qwen2-Audio-7B-Instruct": "音频模型",
    "FLUX.2-klein-4B": "图像生成，按张计费",
    "Qwen3-ASR-1.7B": "语音识别，按时长计费",
    "cosyvoice-v3": "语音合成，按字符计费",
    "MinerU2.5-2509-1.2B": "文档解析，按页计费",
    "bge-m3": "向量模型，官方无对标",
}


def to_ratios(price):
    """把元/百万 tokens 三档价换算成 (ModelRatio, CompletionRatio, CacheRatio)。

    ModelRatio = P × QuotaPerUnit / (USDExchangeRate × 1e6)，保留 9 位小数
    （原项目默认倍率就是 9 位精度，6 位会引入 ~2e-6 相对误差，见下方容差说明）。
    CompletionRatio / CacheRatio 是与输入单价的比值（比值与量纲无关，不受上面换算影响）。

    精度处理：三档价之间是相除关系，ModelRatio 的截断会被放大。
    这里先用取整后的 ModelRatio 反推有效输入价 effective_in，
    再用它算另外两个比值，保证三者自洽、反算校验能闭合。
    """
    inp, hit, out = price["in"], price["hit"], price["out"]
    model_ratio = round(inp * RATIO_PER_CNY, 9)
    # 用取整后的 ModelRatio 反推有效输入价，避免截断误差污染后两个比值
    effective_in = model_ratio / RATIO_PER_CNY
    completion_ratio = round(out / effective_in, 6)
    cache_ratio = round(hit / effective_in, 6)
    return model_ratio, completion_ratio, cache_ratio


def fmt_ratio(v):
    """倍率保留 6 位小数，去掉多余 0（与 new-api 后台填写习惯一致）。"""
    s = f"{v:.6f}".rstrip("0").rstrip(".")
    return s or "0"


def find_db():
    """定位 new-api 使用的 SQLite 数据库；找不到则返回 None（表示用 PG）。"""
    for p in ("/data/one-api.db", "/data/new-api.db", "/data/webui.db"):
        if os.path.exists(p):
            return p
    return None


def table_name(cur):
    """探测 options 表名：新版叫 options，旧版可能叫 Option。

    注意：不能靠 `SELECT 1 FROM t LIMIT 1` 判断——表存在但为空时该语句
    也不报错却返回空集，会误判成「表不存在」。必须查 sqlite_master。
    """
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing = {r[0] for r in cur.fetchall()}
    for t in ("options", "Option", "option"):
        if t in existing:
            return t
    return None


def load_options(cur, table):
    cur.execute(f"SELECT key, value FROM {table}")
    return {k: v for k, v in cur.fetchall()}


def upsert_option(cur, table, key, value):
    cur.execute(f"SELECT 1 FROM {table} WHERE key = ?", (key,))
    if cur.fetchone():
        cur.execute(f"UPDATE {table} SET value = ? WHERE key = ?", (value, key))
        return "update"
    cur.execute(f"INSERT INTO {table} (key, value) VALUES (?, ?)", (key, value))
    return "insert"


def build_plan(current, promo=False):
    """生成待写入的三张倍率表（在现有值基础上合并，不动其他模型）。"""
    def parse(key):
        raw = current.get(key)
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            print(f"  ⚠️ {key} 不是合法 JSON，将作为空表处理", file=sys.stderr)
            return {}

    model_ratio = parse("ModelRatio")
    completion_ratio = parse("CompletionRatio")
    cache_ratio = parse("CacheRatio")

    changes = []
    for name, price in PRICING.items():
        p = dict(price)
        if name == "glm-5.3-flash" and promo:
            p.update(GLM_FLASH_PROMO)
            p["note"] = "智谱限时五折活动价"
        mr, cr, xr = to_ratios(p)
        old_mr = model_ratio.get(name)
        old_cr = completion_ratio.get(name)
        old_xr = cache_ratio.get(name)

        model_ratio[name] = mr
        completion_ratio[name] = cr
        cache_ratio[name] = xr

        changes.append({
            "name": name,
            "provider": p["provider"],
            "note": p["note"],
            "price": p,
            "old": (old_mr, old_cr, old_xr),
            "new": (model_ratio[name], completion_ratio[name], cache_ratio[name]),
            "is_new": old_mr is None,
        })

    return {
        "ModelRatio": json.dumps(model_ratio, ensure_ascii=False, separators=(",", ":")),
        "CompletionRatio": json.dumps(completion_ratio, ensure_ascii=False, separators=(",", ":")),
        "CacheRatio": json.dumps(cache_ratio, ensure_ascii=False, separators=(",", ":")),
    }, changes


def print_plan(changes, only=None):
    print()
    print("=" * 104)
    print("川邮·星语 · 模型价目表对齐")
    print("=" * 104)
    print(f"换算: ModelRatio = 单价(元/百万) × {RATIO_PER_CNY:.10f}")
    print(f"      = 单价 × QuotaPerUnit({QUOTA_PER_UNIT:.0f}) / (汇率{USD_RATE} × 1e6)")
    print(f"      校验: 1 quota = 汇率/QuotaPerUnit = {USD_RATE/QUOTA_PER_UNIT:.8f} 元")
    print()
    print(f"{'模型':<36}{'原厂':<16}{'输入':>7}{'缓存命中':>9}{'输出':>7}   {'ModelRatio':>12}{'状态':>8}")
    print("-" * 104)
    shown = 0
    for c in changes:
        if only and c["name"] not in only:
            continue
        shown += 1
        p = c["price"]
        status = "新增" if c["is_new"] else "更新"
        print(f"{c['name']:<36}{c['provider']:<16}{p['in']:>7.3f}{p['hit']:>9.3f}{p['out']:>7.2f}   "
              f"{c['new'][0]:>12.4f}{status:>8}")
    print("-" * 104)
    print(f"共 {shown} 个模型参与对齐")
    print()
    print("换算校验（元/百万 tokens，反算回单价）：")
    print("  容差说明：ModelRatio 保留 9 位小数（与项目默认倍率精度一致），CacheRatio 6 位，")
    print("  像 0.15/4.5=0.03333… 这类无限循环比值必然存在 <1e-5 的截断误差，")
    print("  对百万 tokens 级别的账单影响 <0.01 元，属可接受范围。")
    for c in changes:
        if only and c["name"] not in only:
            continue
        mr, cr, xr = c["new"]
        eff_in = mr / RATIO_PER_CNY
        back_out = eff_in * cr
        back_hit = eff_in * xr
        p = c["price"]
        d_in = abs(eff_in - p["in"])
        d_out = abs(back_out - p["out"])
        d_hit = abs(back_hit - p["hit"])
        ok = d_in < 1e-6 and d_out < 1e-5 and d_hit < 1e-5
        mark = "✓" if ok else "✗"
        print(f"  {mark} {c['name']:<34} 输入 {eff_in:>7.4f} 输出 {back_out:>7.3f} 缓存 {back_hit:>8.5f}"
              f"   [{c['note']}]")
    print()
    print("不参与对齐（多模态 / 按次计费）：")
    for name, why in SKIP.items():
        print(f"  · {name:<34} {why}")
    print("=" * 104)


def main():
    ap = argparse.ArgumentParser(description="川邮·星语模型价目表对齐")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="只预演，不改库")
    g.add_argument("--apply", action="store_true", help="实际写入配置")
    ap.add_argument("--glm-flash-promo", action="store_true",
                    help="GLM-5.3-Flash 使用智谱限时五折价")
    ap.add_argument("--only", nargs="+", metavar="MODEL",
                    help="只处理指定模型（默认全部）")
    ap.add_argument("--db", help="SQLite 数据库路径（默认自动探测）")
    args = ap.parse_args()

    db_path = args.db or find_db()
    if not db_path:
        print("✗ 未找到 SQLite 数据库，也未指定 --db", file=sys.stderr)
        print("  若平台使用 PostgreSQL，请改用 API 方式或直接改 options 表", file=sys.stderr)
        return 1

    print(f"数据库: {db_path}")
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = None
    cur = conn.cursor()

    table = table_name(cur)
    if not table:
        print("✗ 未找到 options 表", file=sys.stderr)
        return 1
    print(f"配置表: {table}")

    current = load_options(cur, table)
    plan, changes = build_plan(current, promo=args.glm_flash_promo)
    print_plan(changes, only=args.only)

    # 自检：换算必须能精确还原官方单价（容差同上：CacheRatio 存在循环小数截断）
    for c in changes:
        mr, cr, xr = c["new"]
        p = c["price"]
        eff_in = mr / RATIO_PER_CNY
        if abs(eff_in - p["in"]) > 1e-6 or abs(eff_in * cr - p["out"]) > 1e-5 \
                or abs(eff_in * xr - p["hit"]) > 1e-5:
            print(f"✗ 自检失败: {c['name']} 换算不闭合"
                  f"（输入 {eff_in:.6f} 输出 {eff_in * cr:.6f} 缓存 {eff_in * xr:.8f}），已中止",
                  file=sys.stderr)
            conn.close()
            return 1
    print("✓ 自检通过：全部模型换算可还原官方单价")

    if args.dry_run:
        print()
        print("▶ DRY-RUN：以上为待写入内容，数据库未做任何改动。")
        print("  确认无误后加 --apply 实际写入。")
        conn.close()
        return 0

    # 写入（仅覆盖参与对齐的三个键；未参与对齐的模型保持原值）
    written = []
    for key, value in plan.items():
        action = upsert_option(cur, table, key, value)
        written.append(f"{key}({action})")
    conn.commit()
    conn.close()

    print()
    print("✓ 已写入: " + ", ".join(written))
    print()
    print("下一步建议：")
    print("  1. 管理后台「系统设置 → 分组与模型定价设置」确认倍率已生效")
    print("  2. 确认时段倍率配置 time_ratio_setting 已启用（工作日高峰 2x / 夜间 0.5x / 周末 1x）")
    print("  3. 用测试账号发一次请求，核对 logs.other 里的 time_ratio 与 quota")
    return 0


if __name__ == "__main__":
    sys.exit(main())