# 星语 Agent（Octop 二开）

星语生态的 L5 办公 Agent 层，基于腾讯云 [Octop](https://github.com/TencentCloud/Octop)（MIT）二次开发。

## 上游追踪（upstream）

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/TencentCloud/Octop |
| 基准 commit | `232030f46c5450801ca87809f8a4da57aefc5a05`（tag v1.0.2b4，2026-09-27 release） |
| 获取方式 | git clone（VPS 镜像源 gh-proxy.com 转拉）→ tar 打包（排除 .git）→ 入本仓库 |
| 同步策略 | 手动跟版：上游发重要版本时，拉上游 diff 重放本仓库改动（改动尽量靠外围，见施工单三铁律） |

### 本仓库内嵌上游源码

`Octop/` 目录 = 上游 v1.0.2b4 完整源码快照（去除 .git）。后续星语 Agent 的修改直接在该目录内进行，git 历史由本仓库承载，不再保留嵌套 git。

**注意**：`Octop/` 内部自带 `.gitignore`，不影响本仓库追踪其源码文件。

## 目录结构

```
xingyu-agent/
├── Octop/           # 上游 v1.0.2b4 源码快照 + 星语二开改动（Phase 1 起）
├── rescue-proxy/    # 0.7 已交付：DeepSeek 特殊 token 泄漏还原 sidecar
└── tmp/             # 过程性分析材料（openworkbuddy-analysis），待清理
```

## 改造策略（施工单三铁律）

1. **改动越靠外围，rebase 越轻松**——预置内容/skill/配置优先，fork 核心改动能不做就不做
2. **不与闭源内核对抗**——harness-agent/memory/browser 以 wheel 分发，主循环/记忆/浏览器运行时不改
3. **先验证需求再付规模**——验证教师真实需求率前只跑 1 实例

完整计划见施工单：`星语Agent-Octop二次开发计划与施工单_2026-09-27.md`（星语工作区 01_项目文档）。

## 法律边界

MIT 允许 fork/改名/换 logo/商用/闭源分发；唯一义务 = LICENSE/NOTICE 保留原版权声明（1.4 施工项将补 "based on TencentCloud/Octop (MIT)" 声明）。
