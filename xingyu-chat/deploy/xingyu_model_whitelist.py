#!/usr/bin/env python3
"""
川邮·星语 · Chat 模型白名单收敛脚本（幂等，可反复执行）

作用
----
把「学生/教师可见的对话模型」限定为白名单，重量级算力（glm-5.3 等）仅管理员可用。

原理（OWUI 原生机制，不硬编码、不改源码）
-----------------------------------------
1. `model` 表 = 「已注册模型」。只有注册过的模型才能被普通用户使用；
   未注册的接入模型（base model）默认 **仅管理员可用**
   （见 backend/open_webui/utils/access_control/__init__.py: check_model_access / get_filtered_models）。
2. 因此：关掉 BYPASS_MODEL_ACCESS_CONTROL 后，
   - 管理员：BYPASS_ADMIN_ACCESS_CONTROL 默认 True → 仍看到全部模型，不受影响；
   - 普通用户：只看到 `model` 表里已注册且被授权的条目。

本脚本做的事
-----------
A. 为白名单中的每个接入模型，在 `model` 表创建一条「明亮化」注册记录
   （带中文显示名 / 简介 / 能力标签），使普通用户可见可用；
B. 为每条注册记录授予 `principal_type='user'` + `principal_id='*'` 的公开读权限
   （= 所有登录用户可读；注意**不能**用 group，空组成员匹配不上）；
C. **不动**任何非白名单模型 —— 它们保持「未注册」状态，天然仅管理员可见。
D. 写入前自检（base_model_id 必须 NULL / 授权必须 user/* / 白名单授权齐全），
   不通过则回滚不写入。

⚠️ 两个致命坑（都踩过，见文件内注释）
1. `base_model_id` **必须为 NULL**。填自己或同名 id 会让 OWUI 跳过 `info` 注入，
   导致普通用户**一个模型都看不到**（管理员正常）——2026-09-18 线上事故根因。
2. 授权 principal 必须是 `user` + `*`，不能用 group（default 组无成员）。

⚠️ 改完必须**重启容器**才生效（DB 结果有进程内缓存）：
    docker compose -f /data/docker-compose.owui.yml restart owui

用法
----
    docker cp xingyu_model_whitelist.py owui:/tmp/
    docker exec owui python3 /tmp/xingyu_model_whitelist.py            # 应用
    docker exec owui python3 /tmp/xingyu_model_whitelist.py --dry-run  # 预演
"""

import json
import sqlite3
import sys
import time
import uuid

DB = '/app/backend/data/webui.db'
DRY = '--dry-run' in sys.argv

# ────────────────────────────────────────────────────────────────
# 白名单：连接模型 id → 学生侧展示信息
#
# 只列**网关实测可用**且适合普通用户的模型。加/减条目后重跑脚本即可。
# glm-5.3（重量级算力）刻意不列入 → 普通用户不可见，管理员仍可在后台直接选。
#
# ⚠️ 命名铁律：角色名必须与**实测行为**一致，不能凭模型名猜。
#    2026-09-18 实测（同一 prompt，非流式，max_tokens=2048）：
#      glm-5.3-flash          → 2.98s，reasoning 868ch，强制思考  → 其实是「慢 + 思考」
#      DeepSeek-V4.1-Flash    → 0.48s，reasoning 0ch，不思考      → 其实是「最快」
#      deepseek-v4-flash-0731 → 2.01s，reasoning 0ch              → 中等
#      Qwen3-VL-30B-A3B       → 0.27s，reasoning 0ch，支持视觉    → 最快 + 多模态
#
#    上一版把 glm-5.3-flash 命名为「极速」、DeepSeek-V4.1-Flash 命名为「深度思考」，
#    与实测**完全相反**，直接导致用户投诉「极速很慢、思考的不思考」。
#    本版已按实测对调。**任何改名都必须先跑一遍实测再动这个列表。**
#
# 命名格式：显示名 + 真实模型 id 都写出来，方便用户对照（大王 2026-09-18 要求）。
# 形如「星语·极速 · DeepSeek-V4.1-Flash」——OWUI 下拉菜单直接渲染 name 字段。
# ────────────────────────────────────────────────────────────────
WHITELIST = [
    {
        # 实测 0.28s / 不思考 / 三色轮测 3/3 支持视觉 → 最快档，且能看图
        'id': 'DeepSeek-V4.1-Flash',
        'name': '星语·极速 · DeepSeek-V4.1-Flash',
        'description': '实测最快（约 0.3 秒首响），不附加思考过程，回答干脆。也支持上传图片。日常问答、翻译、润色、代码片段、看图首选。',
        'tags': ['极速', '视觉', '日常'],
    },
    {
        # 实测 1.38s / 强制思考 333ch / 支持视觉 → 会思考但慢
        'id': 'glm-5.3-flash',
        'name': '星语·深度思考 · glm-5.3-flash',
        'description': '每次回答前先推理一遍（实测推理 300+ 字），较慢但更严谨。适合算法推导、代码调试、论文思路梳理等需要想清楚的问题。也支持上传图片。',
        'tags': ['深度思考', '视觉', '慢而严谨'],
    },
    {
        # 实测 0.27s / 不思考 / 支持视觉
        'id': 'Qwen3-VL-30B-A3B-Instruct',
        'name': '星语·视觉 · Qwen3-VL-30B',
        'description': '专注看图：公式识别、图表解读、截图排错、板书转文字。实测响应约 0.3 秒。',
        'tags': ['视觉', '多模态'],
    },
    {
        # 实测 0.42s / 不思考 / 不支持图像输入
        'id': 'deepseek-v4-flash-0731',
        'name': '星语·通用 · deepseek-v4-flash-0731',
        'description': '均衡型通用对话模型，回答稳定、篇幅适中。不支持上传图片。拿不准选哪个时用这个。',
        'tags': ['通用', '均衡'],
    },
]

# ────────────────────────────────────────────────────────────────
# 公开读权限的 principal
#
# ⚠️ 关键：必须是 `user` + `*`（所有用户），**不能**用 group。
#    见 backend/open_webui/models/access_grants.py:get_accessible_resource_ids
#    —— group 授权只对「组成员」生效；default 组默认没有成员，
#       授权后会导致普通用户一个模型都看不到（2026-09-18 实测踩坑）。
# ────────────────────────────────────────────────────────────────
PUBLIC_PRINCIPAL_TYPE = 'user'
PUBLIC_PRINCIPAL_ID = '*'


def upsert_model(c, spec, owner_id):
    """在 model 表插入或更新一条注册记录，返回 model id。"""
    now = int(time.time())
    cols = [r[1] for r in c.execute('PRAGMA table_info(model)')]
    meta = {
        'description': spec['description'],
        'tags': [{'name': t} for t in spec['tags']],
        'profile_image_url': '',
        'capabilities': {'vision': spec['id'].lower().find('vl') >= 0},
    }
    payload = {
        'id': spec['id'],
        'user_id': owner_id,
        # ⚠️⚠️ 必须为 NULL（=「直接覆写同名 base model」），**绝不能填自己或同名 id**。
        #    见 backend/open_webui/utils/models.py:get_all_models 的 `info` 注入逻辑：
        #
        #      for custom_model in custom_models:
        #          if custom_model.base_model_id is None:      # ← 走这里才会注入 info
        #              model = base_model_lookup.get(custom_model.id)
        #              if model and custom_model.is_active:
        #                  model['info'] = custom_model.model_dump()
        #          elif custom_model.is_active:
        #              if custom_model.id in existing_ids:
        #                  continue                            # ← 同名却被跳过，info 永不注入
        #
        #    base_model_id 填了值（哪怕等于自己）会进 elif 分支，而该 id 又确实存在于
        #    上游模型列表 → 直接 continue，`info` 永远缺失。随后 get_filtered_models 里
        #    `info = model.get('info')` 为 None → model_infos 为空 → accessible_model_ids
        #    为空集 → **普通用户一个模型都看不到**（管理员因 elif 兜底仍能看全部，
        #    所以表现为「只有学生看不到」）。2026-09-18 线上事故根因。
        'base_model_id': None,
        'name': spec['name'],
        'params': json.dumps({}),
        'meta': json.dumps(meta, ensure_ascii=False),
        'access_control': None,
        'is_active': 1,
        'created_at': now,
        'updated_at': now,
    }
    row = c.execute('SELECT id FROM model WHERE id=?', (spec['id'],)).fetchone()
    fields = [k for k in payload if k in cols]
    if row:
        sets = ','.join(f'{k}=?' for k in fields if k != 'id')
        vals = [payload[k] for k in fields if k != 'id'] + [spec['id']]
        c.execute(f'UPDATE model SET {sets} WHERE id=?', vals)
        return spec['id'], 'updated'
    sql = f'INSERT INTO model ({",".join(fields)}) VALUES ({",".join("?" * len(fields))})'
    c.execute(sql, [payload[k] for k in fields])
    return spec['id'], 'created'


def upsert_grant(c, model_id, principal_type, principal_id):
    """给注册模型授予公开读权限（幂等）。"""
    now = int(time.time())
    cols = [r[1] for r in c.execute('PRAGMA table_info(access_grant)')]
    hit = c.execute(
        'SELECT id FROM access_grant WHERE resource_type=? AND resource_id=? '
        'AND principal_type=? AND principal_id=? AND permission=?',
        ('model', model_id, principal_type, principal_id, 'read'),
    ).fetchone()
    payload = {
        'id': str(uuid.uuid4()),
        'resource_type': 'model',
        'resource_id': model_id,
        'principal_type': principal_type,
        'principal_id': principal_id,
        'permission': 'read',
        'created_at': now,
    }
    fields = [k for k in payload if k in cols]
    if hit:
        return 'exists'
    sql = f'INSERT INTO access_grant ({",".join(fields)}) VALUES ({",".join("?" * len(fields))})'
    c.execute(sql, [payload[k] for k in fields])
    return 'granted'


def self_check(c):
    """自检：把最容易踩的两个坑直接指出来，别等线上才发现。"""
    problems = []

    # 坑 1：base_model_id 非 NULL → info 不注入 → 普通用户看不到模型
    bad = c.execute(
        'SELECT id, base_model_id FROM model WHERE base_model_id IS NOT NULL'
    ).fetchall()
    for r in bad:
        problems.append(
            f'base_model_id 必须为 NULL，但 {r["id"]} = {r["base_model_id"]!r}'
        )

    # 坑 2：授权 principal 用了 group → 空组匹配不上 → 看不到模型
    bad_grants = c.execute(
        "SELECT resource_id, principal_type, principal_id FROM access_grant "
        "WHERE resource_type='model' AND principal_type != 'user'"
    ).fetchall()
    for r in bad_grants:
        problems.append(
            f'授权 principal 必须用 user/*，但 {r["resource_id"]} 用了 '
            f'{r["principal_type"]}/{r["principal_id"]}'
        )

    # 坑 3：白名单模型缺公开读授权
    for spec in WHITELIST:
        n = c.execute(
            "SELECT COUNT(*) FROM access_grant WHERE resource_type='model' "
            "AND resource_id=? AND principal_type='user' AND principal_id='*' "
            "AND permission='read'",
            (spec['id'],),
        ).fetchone()[0]
        if n == 0:
            problems.append(f'{spec["id"]} 缺少 user/* 公开读授权')

    return problems


def main():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row

    # 模型归属：取任意 admin 作为 owner（has_base_model_access 会校验 owner）
    admin = c.execute("SELECT id, email FROM user WHERE role='admin' ORDER BY created_at LIMIT 1").fetchone()
    if not admin:
        print('❌ 未找到 admin 用户，中止')
        return 1
    owner_id = admin['id']
    print(f'模型归属 admin: {admin["email"]}')

    print(f'公开授权对象: {PUBLIC_PRINCIPAL_TYPE} / {PUBLIC_PRINCIPAL_ID}（所有登录用户）')
    print(f'\n白名单 {len(WHITELIST)} 个模型：')
    for spec in WHITELIST:
        mid, action = upsert_model(c, spec, owner_id)
        gact = upsert_grant(c, mid, PUBLIC_PRINCIPAL_TYPE, PUBLIC_PRINCIPAL_ID)
        print(f'  {mid:34s} 注册={action:8s} 授权={gact}')

    # 自检（写入前发现问题就中止）
    problems = self_check(c)
    if problems:
        c.rollback()
        print('\n❌ 自检未通过，已回滚：')
        for p in problems:
            print(f'   - {p}')
        print('\n   提示：base_model_id 必须为 NULL；授权必须用 user/*。')
        c.close()
        return 1

    if DRY:
        c.rollback()
        print('\n[dry-run] 自检通过，已回滚未写入')
    else:
        c.commit()
        total = c.execute('SELECT COUNT(*) FROM model').fetchone()[0]
        grants = c.execute('SELECT COUNT(*) FROM access_grant').fetchone()[0]
        print(f'\n✅ 已提交，自检通过。model 表={total} 条，access_grant={grants} 条')
        print('   非白名单模型保持未注册 → 普通用户不可见，管理员不受影响。')
        print()
        print('   ⚠️ 改完必须重启容器才生效（DB 有进程内缓存）：')
        print('      docker compose -f /data/docker-compose.owui.yml restart owui')
    c.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())