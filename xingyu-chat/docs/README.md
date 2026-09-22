# 川邮·星语 · 全局开发计划（Master Plan）

> **项目定位**：把学校智算中心做成**类 DeepSeek 的一体化 AI 服务**——Chat 对话 + API 开放平台双入口、一个账号两边通用、校内免费配额 + 校外付费
> **文档版本**：v1.3（2026-09-19，**S3 收尾完成**、进入 S4 计费改造前时点）
> **维护约定**：每阶段收工/启动时更新本文档的进度看板与阶段索引

---

## 1. 战略定位（2026-09-16 拍板）

对标 DeepSeek 的产品结构：
- `chat.deepseek.com`（免费对话）+ `platform.deepseek.com`（API 付费）双入口、账号通用
- 我方映射：**星语 = 唯一身份源 + 唯一后端**；Chat 入口（OWUI 定制）与 API 平台（星语产品化）并列，双双指回星语

**四项核心决策（2026-09-16 16:32 大王拍板）**：
1. Chat 前端 = 开源改造（Open WebUI），**体验对齐 DeepSeek**
2. 免费策略 = 校内配额内免费 + 校外付费
3. 优先级 = 计费改造与 Chat 前端并行推进
4. 范围 = 先校内使用，合规不作为当前阻塞项（但对外前是硬门槛）

## 2. 现有资产盘点（截至 2026-09-17）

### 2.1 生产运行
| 资产 | 状态 |
|---|---|
| 星语网关（VPS 10.255.12.210） | ✅ 生产运行，v-20260914-mig-rebind，累计 14694 请求 |
| 启用渠道 | ✅ 12 个：DeepSeek-V4-Flash-0731(×2 DGX)、qwen3.8-flash-next、glm-5.3-flash、Qwen3-VL-30B、Qwen2-Audio-7B、FLUX.2-klein-4B、MinerU2.5、Qwen3-ASR-1.7B、cosyvoice-v3、DeepSeek-V4.1-Flash、GLM-5.3 |
| AlloMax 算力 | ✅ 104 卡（H20-141G×40、H100×8、H800×8、RTX4090×48） |
| 运维基建 | ✅ 注册短信（阿里云）、PG 日备、后台 2FA、健康探针、git 基线 |

### 2.2 计费体系（2026-09-16 代码级体检结论）
**底子远比预期厚，仅 3 项需写代码，其余全靠配置**：
- ✅ 已有：预扣-结算-精算主链路、模型/输出倍率、**缓存命中折扣**、分组倍率、订阅套餐三表、模型级限流、响应缓存折扣 0.1、充值折扣、违规扣费
- 🔧 待写代码（仅 3 项，全走 SCPT 库）：① 错峰定价 time_ratio.go ② 赠金/充值双账户 ③ 套餐绑定并发

### 2.3 已完成开发
| 交付物 | 状态 |
|---|---|
| Portal 主页 v9.2（StarWhisper 门户） | ✅ 8.9 分收工，详见 [stage1-portal/README.md](stage1-portal/README.md) |
| nginx 双入口配置 | ✅ 已写好待上 VPS |
| OWUI POC（Mac 本地 3080） | ✅ 12 模型接入 + reasoning 1752 字透传验证 |

### 2.4 代码库（铁律）
- **`~/github/SCPT/api-gateway-platform` = 唯一生产源**（可编译，tag 驱动）
- ⚠️ 工作区 `allomax-gateway` 开发主线**编译不过**（M2 半成品），禁止用于构建
- 部署链路：buildx amd64（+GOPROXY=goproxy.cn）→ save/scp → load → rollback tag → compose up

## 3. 阶段路线图与进度看板

| 阶段 | 内容 | 周期 | 状态 | 文档 |
|---|---|---|---|---|
| **Stage 0** | 星语网关生产化（短信/备份/2FA/探针/脱敏） | 已完成 | ✅ | — |
| **Stage 1** | Portal 主页（StarWhisper 门户，24+ 轮迭代） | 09-16~09-17 | ✅ **收工 8.9 分** | [stage1-portal/README.md](stage1-portal/README.md) |
| **Stage 2** | Chat 开发（OWUI 部署→账号打通→DeepSeek 化定制） | 09-18 起 | 🟢 **S1/S2 收工，S3 收尾完成（含 S3.6），S4 待启动** | [stage2-chat/README.md](stage2-chat/README.md) |
| Stage 3 | 能力补全（RAG 知识库、代码沙箱、Anthropic 协议、文件解析增强） | 待排 | ⚪ 未启动 | — |
| Stage 4 | 商业化（错峰定价、分层配额、计费对账、并发分级、user_id 三重隔离） | 与 S2/S4 交错 | ⚪ 部分体检已做 | — |
| Stage 5 | 规模化与合规（生成式 AI 备案、算法备案、等保、收费报批、开放注册、B 端） | 6-12 月 | ⚪ 未启动 | — |

### Stage 2 内部里程碑
```
S1 基础部署 ✅ 09-18 ──→ S2 账号打通 ✅ 09-18 ──→ S3 定制打磨 ✅ 09-19（含 S3.6 收尾）
                                                    ↓
                                          S4 计费三项 ← 下一步
                                          S4 星语侧并行（不阻塞）
```

**S2 收工快照（2026-09-18）**：S2.1~S2.4 全过 + 超额 B1/B1+/B2（跨端口 SSO 双向互通，根因 SameSite=Strict 跨端口被浏览器判跨站 → 改 Lax；退出互通走标准 RP-initiated logout + nginx mirror/auth_request 三处接线）。详见 [stage2-chat/README.md](stage2-chat/README.md) §收工总结。

## 4. 三条合规红线（对外服务前必须处理）

1. **生成式 AI 服务备案 + 算法备案**：未备案即对外服务 = 违规。校内试运行不触发，**开放校外注册前是硬门槛**
2. **事业单位经营性收费**：需学校/物价审批，收费主体（学校 vs 校办公司）需先定
3. **AGPL-3.0**（星语是 new-api fork）：对外商用前须处理（换 MIT 底座或下沉自研护栏）。OWUI 品牌条款类似：校内不改品牌免费，白标分发需企业许可

## 5. 关键技术债与遗留项汇总

> 更新于 2026-09-19（全局盘点：三源核对 + 线上实测，清掉 10 项失真状态）

### 5.1 分批执行计划（剩余全部工作）

**第一批 · 安全收口（P0，2026-09-22 实测立项）**

> 背景：实测发现 AlloMax 模型 NodePort（10.32.1.3:305xx-307xx）**无 key 即可推理**（`/v1/models` 与 `/v1/chat/completions` 无鉴权返回 200），全校网络可达即可白嫖。"token 不外流"的前提是端口本身有门。

| # | 任务 | 要点 |
|---|---|---|
| S-1 | 在役模型全部加 API key | vLLM `VLLM_API_KEY` / SGLang `--api-key`，每模型独立 key，只配到星语渠道；AlloMax Web UI 改部署参数（需大王手动操作） |
| S-2 | 节点防火墙白名单 | 30500-30800 段限制源 IP = 星语 VPS 10.255.12.210 + 管理机；与智算中心网络管理员协调 iptables |
| S-3 | 星语侧 token 治理 | 限流（与第四批合并执行）+ 单 token 日用量异常告警（飞书）+ 续约复核最小授权 |
| S-4 | 外部平台接入策略 | 电信平台等一律走星语发 token（可计费/可撤销/可限额），**绝不直发 AlloMax key** —— 唯一入口即控制 |

**模型分层授权（2026-09-22 立项，方案已核实代码落点）**

> 目标：按用户层级（学生/教师/合作单位等）分配 Chat 与 API 平台可用模型，替代现状「模型广场人人可见全部 + Chat 仅 admin/普通二分」。
> **代码体检结论：两侧原生能力均已具备，仅需 1 处代码改动（星语 OIDC 补 groups claim）+ 配置编排**：

| # | 任务 | 要点 |
|---|---|---|
| M-1 | 星语侧建用户分组 | `users.Group`（管理后台用户编辑已原生支持选组）→ `abilities` 表按 (group, model, channel) 开模型 → 模型广场 pricing.go 已按 `user.Group` 过滤（零改动） |
| M-2 | 星语 OIDC userinfo 补 `groups` claim | `controller/oidc_provider.go` OIDCUserinfo 返回值加 `"groups": []string{user.Group}`（唯一代码改动，~3 行） |
| M-3 | OWUI 开启 OIDC 组映射 | `ENABLE_OAUTH_GROUP_MANAGEMENT=true` + `OAUTH_GROUPS_CLAIM=groups`（OWUI 原生支持，utils/oauth.py update_user_groups 自动进组/退组）；建对应层级组，per-group `access_grants` 开模型（现白名单机制已验证过该表） |
| M-4 | svc-chat 服务账号归组 | OWUI 调星语的服务 token 归入对应组，使 Chat 可用模型 = 该层级 API 可用模型 |
| M-5 | 分层定价联动（可选） | `GroupRatio` 按组差异化倍率（如 partner 组 1.2x），原生支持无需开发 |

**第二批 · 计费三项（阶段 4 的地基，可立即开工）**

| # | 任务 | 要点 |
|---|---|---|
| 4.1 | 赠金/充值双账户 | `users.GrantedQuota` 拆两个账本，扣减有先后（先赠金后充值），赠金设有效期 |
| 4.2 | 错峰时间倍率 | `setting/ratio_setting/time_ratio.go`（新文件），计费最后一步乘时段系数 → 引导免费 Chat 流量到低谷 |
| 4.3 | Chat 月度赠金自动刷新 | 按自然月重置 svc-chat 额度，替代人工批配额。**依赖 4.1 先落地** |

**第三批 · 账号续期与用量对账**

| 任务 | 要点 |
|---|---|
| OIDC refresh_token grant（星语侧） | 现只签 authorization_code，OWUI 拿不到 refresh_token → access_token 到期即需重走 OIDC。补齐后单点会话可无感续期 |
| 用量回流 Webhook | Chat 消耗实时推给星语报表。现状只按渠道维度粗看，无法逐会话对账（「两本账对不齐」） |

**第四批 · 运维缺口补齐**

| 任务 | 要点 |
|---|---|
| 接口限流（用户级/模型级） | 现仅登录接口有 CriticalRateLimit（已调 200）；正式 API 调用缺细粒度限流，单用户可打满算力 |
| **外部拨测** | 🔴 **当前监控最大盲区**：healthcheck.sh 在 VPS 本机跑，发现不了「容器活着但服务假死」及网络层不可达 |

**域名到位后 · 六步切换清单（预估 0.5 天）**

① 证书重签含三子域 SAN → ② nginx server_name 切换 → ③ options 表 ServerAddress 改域名 → ④ OWUI 的 `OPENID_END_SESSION_ENDPOINT` / OAuth 端点改域名 → ⑤ OIDC redirect_uri 与 post_logout 白名单改域名 → ⑥ 退出 cloudflared quick tunnel
> ⚠️ 阻塞于线下：`ai` / `ai-chat` / `ai-platform.scpt.edu.cn` 三条子域 DNS 申请 + 正式证书

**P2 收尾 · 打磨与加固**

| 项 | 要点 |
|---|---|
| OIDC 错误码规范化 | 拒绝授权的文案与错误码归一 |
| `SESSION_COOKIE_SECURE=true` | 现为 false（自签 IP + http 兼容）。**切域名 + 正式证书后必须开** |
| 模型精细授权 | per-user / per-group 替代当前「4 模型粗粒度白名单」→ **已升级为第一批 M-1~M-5 完整方案（2026-09-22），见 §5.1** |
| ~~Portal 遗留 5 项~~ | ✅ **2026-09-19 全部完成**（S3.6）。rAF visibilitychange / og 标签 / 公告死链 / skip-link+noscript / base64 外置 —— 详见 §5.3 |

**P3 合规（对外服务前硬门槛，校内不阻塞）**

| 项 | 要点 |
|---|---|
| 生成式 AI 服务备案 + 算法备案 | 开放校外注册前必须完成 |
| 事业单位经营性收费报批 | 收费主体（学校 vs 校办公司）需先定 |
| AGPL-3.0 处置 | 星语是 new-api fork，对外商用前须换 MIT 底座或下沉自研护栏 |

**技术债**

| 项 | 优先级 |
|---|---|
| `users.phone` 空串默认值需代码级根治（现为 DB 层绕过） | P2 |
| DeepSeek-V4.1-Flash `thinking=0` → AlloMax 侧加 `--reasoning-parser` | P1 |
| SSRF `fetch_setting.ip_list` 白名单范围待收敛（现含 `10.32.0.0/12`，疑应收到 `10.32.1.3/32`） | P1 |

### 5.2 已失效/被取代（勿再排期）

| 来源 | 项 | 处置 |
|---|---|---|
| ~~星语~~ | ~~ServerAddress 未配~~ | ✅ 已配（S2 期间核实更正） |
| ~~星语~~ | ~~OIDC Provider 端点缺失~~ | ✅ 已完成（S2.1，含 /oidc/* 全家桶） |
| ~~形态 B~~ | ~~拦截改 4xx → 星语 0 计费~~ | ✅ 被取代：原生 ContentGuard 下沉后已内置，不再依赖 LiteLLM 4xx 特判。**工作本身已被取代，不是未做** |
| ~~Portal~~ | ~~悬挂死链 `#announcement-link`~~ | ✅ S3.6 已修：href 改为按 Notice API 数据注入 |

### 5.3 S3 收尾验收快照（2026-09-19）

> 本轮把「S3 主体收尾」欠的三件事一次清完：**性能优化 + Portal 5 项 + 线上产物核验**。

#### A. 性能优化（puppeteer 实测驱动，非猜测）

**首屏真实传输量（gzip 后）**

| 页面 | 优化前 | 优化后 | 手段 |
|---|---|---|---|
| Portal 主页 | 106 KB | **106 KB**（HTML 24KB） | base64 外置 |
| 平台登录页 | 4.4 MB | **0.89 MB** | i18n 懒加载 + 路由分割 |
| Chat 首屏 | 12.2 MB | 见 stage2-chat | — |

**主包瘦身**：`index.js` 3585 KB → **1499 KB（-58%）**。
根因是 **7 种语言包全部静态引入**，其中 `fr/ru/ja/vi/zhTW` 共 5 种本项目用不上，约 **2.2 MB 死重**。
修法：`en`/`zhCN` 保静态（首屏必需），其余改 `import()`；登录/忘记密码/OTP 三路由加 `lazy-auth-route.tsx` 懒加载。

**Portal HTML**：95203 B → **31129 B（-67%）**。两个内联 base64（favicon 36KB + logo 14KB）经 sha256 比对与 `assets/` 目录已有文件**完全一致**，直接换 URL 引用，零新增文件。

> ⚠️ **量测陷阱（已踩）**：`curl` 不带 `Accept-Encoding` 时拿到的是未压缩原文，
> 会误判「压缩没生效」。nginx `gzip on` 且 `gzip_types` 覆盖 js/css 时，
> `1499KB → 399KB`。**量首屏体积必须带 `-H 'Accept-Encoding: gzip'`**。

#### B. Portal 遗留 5 项（全部完成并实测）

| # | 项 | 实测证据 |
|---|---|---|
| ① | rAF visibilitychange | 切后台 `pausedStable: true`，回前台 `resumedChanged: true` |
| ② | og / twitter 分享卡片 | 5 og + 4 twitter，供校内工作群转发 |
| ③ | 公告「查看详情」死链 | href 改为按 Notice API 的 `link`/`url` 注入（限站内/ https，防 `javascript:` 注入） |
| ④ | skip-link + noscript | Tab 聚焦 `left: -9999px → 0`，文案随 zh/en 切换 |
| ⑤ | base64 外置 | 残留 base64 = **0**，HTML -67% |

**⚠️ 关键坑：`display` 覆盖 `[hidden]`**
`.announcement{display:flex}` 会**覆盖浏览器对 `[hidden]` 的默认 `display:none`** →
`hidden` 属性完全失效 → 公告数据到达前渲染出一个**空胶囊**（只有「公告」二字）。
补 `.announcement[hidden]{display:none}` 后修复。**凡显式设过 `display` 的元素，用 `hidden` 属性隐藏时必须补 `[hidden]{display:none}`。**

**⚠️ 关键坑：rAF 自续帧必须受门控**
`tick()` 末尾自调 `requestAnimationFrame(tick)`，只 `cancelAnimationFrame` 外部句柄是**取消不掉的**——
下一帧立刻自续，后台暂停形同虚设（实测 `pausedStable=false`）。
必须写成 `if (running) rafId = requestAnimationFrame(tick)`。

#### C. 线上核验（三端 + 产物）

| 目标 | 结果 |
|---|---|
| Portal 443 | HTTP 200 / 0.11s |
| 星语登录页 | HTTP 200 / 0.15s |
| Chat 8443 | HTTP 200 / 0.07s |
| OIDC discovery | `end_session_endpoint` 正常 |
| 线上 Portal 浏览器实测 | 4 请求、0 JS 错误、公告条正常 |

> 上一轮 `perf-lang` 部署后的 502 已自愈：`perf-lang` 与 `commercial-mig` 现指向**同一镜像 ID
> `8989495ea642`**，容器 `Up (healthy)`。
> **教训**：镜像切换后 nginx 侧会有短暂 502，需等容器健康检查通过再验证。

**回滚点**：Portal `index.html.bak-20260919-s36`｜星语镜像 `rollback-20260919-lang`

## 6. 文档归档约定（本目录的用法）

```
xingyu-chat/docs/
├── README.md            ← 本文档：全局计划 + 进度看板（每阶段更新）
├── stage1-portal/       ← 已收工阶段的完整总结（决策/迭代史/踩坑/教学复盘）
└── stage2-chat/         ← 进行中阶段的执行计划（任务/命令/验收标准）
```

**约定**：
1. 阶段**启动时**建 `stageN-xxx/README.md` 写详细计划；**收工时**改写为总结文档
2. 每次阶段切换更新本文档 §3 进度看板 + §5 遗留项
3. 阶段文档必须含：目标、决策及理由、任务清单与验收、踩坑记录、教学复盘——目的是**后期可追溯开发进展，并可直接作为产教融合教学素材**

---

## 6.1 全项目文档索引（2026-09-19 建立）

**为什么要这张表**：项目跨三个库、多轮开发，文中出现 11 个 `README.md`，看文件名完全分不清主题。此表是**唯一的路标**——找不到文档时先看这里。

### A. 自研文档（写给我们自己的，需要维护）

| 主题 | 文件 | 内容一句话 |
|---|---|---|
| **全局计划** | [`xingyu-chat/docs/README.md`](../../xingyu-chat/docs/README.md) | **本文档**。战略定位、阶段看板、分批执行计划、技术债 |
| 双入口实施计划 | [`docs/DUAL-ENTRY-PLAN.md`](DUAL-ENTRY-PLAN.md) | Chat + API 双入口总设计 v3.2（IP 先行方案、18~21 人日排期） |
| 阶段总结 · Portal | `xingyu-chat/docs/stage1-portal/README.md` | Stage 1 收工总结（8.9 分，24+ 轮迭代史、踩坑、教学复盘） |
| 阶段计划 · Chat | `xingyu-chat/docs/stage2-chat/README.md` | Stage 2 Chat 开发计划（对齐 DeepSeek 体验的定制项与验收） |
| 部署手册 · S1 | `xingyu-chat/deploy/DEPLOY-S1.md` | OWUI + SearXNG + nginx 双入口上线执行手册（逐步带验证命令） |
| 部署手册 · VPS | [`deploy/DEPLOY-VPS.md`](../deploy/DEPLOY-VPS.md) | 星语网关 VPS 生产部署（M3，16C/64G 环境，PG+Redis 全容器化） |
| 二开说明 | [`docs/stage1/二开说明-川邮星语.md`](stage1/二开说明-川邮星语.md) | 相对上游 new-api 的全部改动清单 |
| 交接文档 | [`docs/stage1/完整开发文档-交接版.md`](stage1/完整开发文档-交接版.md) | 可交接的完整开发文档（架构/模块/接口） |
| 商用与许可 | [`docs/stage1/商用与License说明.md`](stage1/商用与License说明.md) | AGPL 二开的商用边界与合规说明 |
| 向领导汇报 | [`docs/stage1/向领导汇报-精简版.md`](stage1/向领导汇报-精简版.md) | 阶段成果汇报精简版 |
| 项目定位说明 | [`docs/COMMERCIAL.md`](COMMERCIAL.md) | 本体是什么、基于哪个上游 commit、分支策略 |

### B. 上游文档（open-webui / new-api 自带，**不改名、不翻译**）

| 文件 | 说明 |
|---|---|
| `README.md` + `README.{zh_CN,zh_TW,en,fr,ja}.md` | 上游六语言 README。**改中文版会阻断上游合流**，且与 AGPL 署名冲突 |
| `AGENTS.md` / `CLAUDE.md` / `web/AGENTS.md` | AI 协作工具链的编码约定（new-api 上游自带） |
| `THIRD-PARTY-LICENSES.md` | 第三方依赖许可证台账。**是合规工程产物，非普通文档，勿动** |
| `docs/authentication.md`、`docs/channel/*`、`docs/plugin-api/*`、`docs/installation/BT.md` 等 | 上游技术参考手册（认证、渠道配置、插件 API、安装） |
| `docs/translation-glossary*.md` | 上游翻译术语表 |
| `pkg/billingexpr/expr.md` | 计费表达式语法说明 |
| `constant/README.md`、`relaykit/README.md`、`electron/README.md`、`web/src/components/data-table/README.md` | 各子模块的实现说明 |
| `static/README.md`、`static/BRANDING.md`（OWUI，多处副本） | **品牌资产边界声明**。声明 Open WebUI 标识符不可移除，改动前必读 |

### C. 工作区文档（`01_项目文档/`，按主题分目录，命名已合格）

```
01_项目文档/
├── 分析与评估/    星语能力评估、四维对比与试运营裁决
├── 测试与验证/    内容管控实现与验证报告、三项新增能力验证、试运营测试清单
├── 手册与设计/    ContentGuard 管理员说明、登录注册与 API 系统设计、交接版 PDF
├── 汇报与交付/    阶段总结与领导汇报、商用化路线图、清理记录
├── 凭据归档/      加密归档（不入库）
└── 参考(AlloMax)/ AlloMax 网关探查计划、平台知识速览
```

### D. 命名规则（此后新增文档照此执行）

| 文档类型 | 命名规则 | 示例 |
|---|---|---|
| 阶段计划/总结 | `stageN-<主题>/README.md` | `stage2-chat/README.md` |
| 执行手册 | `DEPLOY-<范围>.md` | `DEPLOY-S1.md`、`DEPLOY-VPS.md` |
| 一次性分析/报告 | `<主题>_<日期>.md` | `星语vs原方案_2026-09-19.md` |
| 教程/参考 | `<主题>-guide.md` | `billing-guide.md` |
| **禁止** | 裸 `README.md`（除目录索引与阶段目录）、`新建文档.md`、`文档1.md` | — |

> **⚠️ 不做的三件事（避免破坏上游）**：
> ① 不重命名上游 `README.zh_CN.md` 等六语言文件——会阻断 `git fetch upstream` 后的合流，且带 AGPL 署名性质
> ② 不重命名 `AGENTS.md` / `CLAUDE.md`——工具链按固定文件名识别，改名即失效
> ③ 不把 `THIRD-PARTY-LICENSES.md` 当普通文档归档——它是合规产物，须与 Docker 镜像、前端产物、Electron 安装包同行

### E. 已执行的整理动作（2026-09-19）

| 动作 | 说明 | 提交 |
|---|---|---|
| `deploy/README.md` → `deploy/DEPLOY-VPS.md` | 与 `docs/README.md` 概念相撞（一个是我方部署手册、一个是上游宣传页），改名消歧；同步 6 处引用 | SCPT `6404683` |
| 根 `README.md` 加路标 | 在二开说明横幅补一行指向本文档，从仓库首页即可找到索引。**只改英文版**，五个上游翻译版未动 | SCPT `6404683` |

> 其余 9 个 README 经评估**不改**：上游工具链文件（`AGENTS.md`/`CLAUDE.md`）、上游子模块说明（`constant/`、`relaykit/`、`electron/`、`web/src/components/data-table/`、`docs/plugin-api/`）、阶段目录索引（`stageN-*/README.md` 符合命名规则）——改名成本高于收益。

## 7. 下一步行动

- **第一批（安全收口）P0 待执行**：S-1 在役模型加 API key（大王手动改 AlloMax 部署参数）→ S-2 节点防火墙白名单 → S-3/S-4 token 治理与接入策略
- **模型分层授权**：M-1~M-5 方案已定稿（仅 1 处代码改动：星语 OIDC 补 groups claim），与安全收口无依赖，可并行开工
- **第二批（计费三项）待启动**：4.1 赠金双账户 → 4.2 错峰时间倍率（最简，可插队）→ 4.3 月度赠金刷新。全走 SCPT 库。
- 并行可选：第三批 OIDC refresh_token grant、用量回流 Webhook
- **需大王线下推进**：三条子域 DNS 申请、校内收费合规报批
- **待确认**：SSRF 白名单是否收窄到 `10.32.1.3/32`（见 §5.1 技术债）

### 盘点方法论（2026-09-19 沉淀）

**台账会失真**——任务状态是「人写的」，代码与线上是「机器写的」。核对「是否完成」必须落到三源之一：
① 源码里 grep 得到 ② DB 查得到 ③ 线上 curl 得到。**不能只凭记忆或 commit message。**
本次盘点即清掉 10 项挂在 pending 但实际早已完成的条目（如 4 模式 pill 绑定、语音输入、gzip/HTTP2、SearXNG），
以及 2 项**已被取代**的工作（LiteLLM 4xx 特判 → 原生下沉）。后者尤需警惕：勾掉时应注明取代关系，否则误导后续排期。
