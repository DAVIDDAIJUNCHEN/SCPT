# 川邮·星语 · 全局开发计划（Master Plan）

> **项目定位**：把学校智算中心做成**类 DeepSeek 的一体化 AI 服务**——Chat 对话 + API 开放平台双入口、一个账号两边通用、校内免费配额 + 校外付费
> **文档版本**：v1.1（2026-09-18，S2 收工、S3 启动时点）
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
| **Stage 2** | Chat 开发（OWUI 部署→账号打通→DeepSeek 化定制） | 09-18 起 | 🔵 **S1/S2 收工，S3 进行中** | [stage2-chat/README.md](stage2-chat/README.md) |
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

| 来源 | 项 | 优先级 |
|---|---|---|
| Portal | rAF 后台暂停、og 标签、公告链接、base64 外置、skip-link/noscript | P2/P3 |
| ~~星语~~ | ~~ServerAddress 未配~~ | ✅ 已配（S2 期间核实更正） |
| ~~星语~~ | ~~OIDC Provider 端点缺失~~ | ✅ 已完成（S2.1，含 /oidc/* 全家桶） |
| OWUI | DeepSeek-V4.1-Flash thinking=0（需 AlloMax 加 --reasoning-parser） | P1 |

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

- **S3 定制打磨进行中**（开工顺序：S3.1 单栏布局 → S3.2 模式 pill → S3.4 思考块 → B3 授权页，外加 UI 对齐三件套：默认浅色 / 校徽+登录页背景对齐 Portal / 登录页流星动画）
- 并行可选：星语计费三项（错峰定价最简可插队）、S4 Webhook 用量回流
