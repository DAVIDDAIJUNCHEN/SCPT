# 川邮·星语 · 全局开发计划（Master Plan）

> **项目定位**：把学校智算中心做成**类 DeepSeek 的一体化 AI 服务**——Chat 对话 + API 开放平台双入口、一个账号两边通用、校内免费配额 + 校外付费
> **文档版本**：v1.2（2026-09-19，S3 主体收尾、进入 S4 计费改造前时点）
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
| **Stage 2** | Chat 开发（OWUI 部署→账号打通→DeepSeek 化定制） | 09-18 起 | 🔵 **S1/S2 收工，S3 主体收尾，S4 待启动** | [stage2-chat/README.md](stage2-chat/README.md) |
| Stage 3 | 能力补全（RAG 知识库、代码沙箱、Anthropic 协议、文件解析增强） | 待排 | ⚪ 未启动 | — |
| Stage 4 | 商业化（错峰定价、分层配额、计费对账、并发分级、user_id 三重隔离） | 与 S2/S4 交错 | ⚪ 部分体检已做 | — |
| Stage 5 | 规模化与合规（生成式 AI 备案、算法备案、等保、收费报批、开放注册、B 端） | 6-12 月 | ⚪ 未启动 | — |

### Stage 2 内部里程碑
```
S1 基础部署 ✅ 09-18 ──→ S2 账号打通 ✅ 09-18 ──→ S3 定制打磨 🔵 进行中
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
| 模型精细授权 | per-user / per-group 替代当前「4 模型粗粒度白名单」 |
| Portal 遗留 5 项 | rAF visibilitychange、og 标签、公告死链、skip-link/noscript、base64 外置（省 60KB+） |

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
| ~~Portal~~ | ~~悬挂死链 `#announcement-link`~~ | 仍在，归入 P2 「Portal 5 项」 |

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

## 7. 下一步行动

- **第二批（计费三项）待启动**：4.1 赠金双账户 → 4.2 错峰时间倍率（最简，可插队）→ 4.3 月度赠金刷新。全走 SCPT 库。
- 并行可选：第三批 OIDC refresh_token grant、用量回流 Webhook
- **需大王线下推进**：三条子域 DNS 申请、校内收费合规报批
- **待确认**：SSRF 白名单是否收窄到 `10.32.1.3/32`（见 §5.1 技术债）

### 盘点方法论（2026-09-19 沉淀）

**台账会失真**——任务状态是「人写的」，代码与线上是「机器写的」。核对「是否完成」必须落到三源之一：
① 源码里 grep 得到 ② DB 查得到 ③ 线上 curl 得到。**不能只凭记忆或 commit message。**
本次盘点即清掉 10 项挂在 pending 但实际早已完成的条目（如 4 模式 pill 绑定、语音输入、gzip/HTTP2、SearXNG），
以及 2 项**已被取代**的工作（LiteLLM 4xx 特判 → 原生下沉）。后者尤需警惕：勾掉时应注明取代关系，否则误导后续排期。
