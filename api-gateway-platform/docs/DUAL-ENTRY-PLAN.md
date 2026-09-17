# 川邮·星语双入口建设 · 实施计划 v3.2

> 对标 DeepSeek 双入口结构（Chat 对话 + API 开放平台，一个账号通用）。
> v3 整合 v2 全部 23 项 + 三轮追加讨论：App 顺延阶段 5、Provider 范围补 SLO、Chat 类免费策略、repo 归属 SCPT monorepo、双流水线构建模式。
> v3.1 新增官网主页（Portal）作为三系统统一入口。
> **v3.2 变更：IP 先行**——子域名未申请前先按 IP 落地（Portal=10.255.12.210 根路径、Chat=:8443、API 平台=/console），Portal 改为** nginx 静态页**（非星语前端路由，避开双域 session cookie 问题）；域名到位后一键切换。**edu.cn 子域无需工信部 ICP 备案**（教育网审批体系），原"备案 1~4 周"关键路径作废。
> 唯一开发者（大王），代码项约 18~21 人日，到试运营 4~6 周。

## 0. 目标架构（一句话版）

**星语 = 唯一身份源 + 唯一模型后端；OWUI = Chat 前端；联邦式集成（OIDC 松耦合），非 DeepSeek 一体化。**

| 决策点 | 结论 |
|---|---|
| 双入口 | Chat（OWUI）+ API 平台（星语产品化） |
| **统一入口** | **静态 Portal**（nginx serve，`xingyu-chat/portal/index.html`，已写好）：公告条（拉星语 /api/notice）+ 聊天窗口卡（点击进 Chat）+ 双入口按钮。**点聊天框 → 未登录见登录页 / 已登录直达界面，由 Chat 侧自行处理，Portal 零判断** |
| **入口地址（IP 先行）** | Portal = `https://10.255.12.210/`；API 平台 = `https://10.255.12.210/console`（其余路径反代星语）；Chat = `https://10.255.12.210:8443`（OWUI 无 BASE_PATH，IP 阶段只能端口区分） |
| 身份 | 星语 OAuth2 Provider 三件套 + SLO，OWUI 接 OIDC 客户端 |
| 计费 | Chat 类免费（chat 组倍率≈0 + 月度大额赠金 + 模型白名单），API 按量计费 |
| App | 顺延阶段 5，试运营数据说话后再立项 |
| 对外口径 | 「Chat 免费，API 按量计费」（技术上确实做到） |

## 0.1 monorepo 布局与构建模式（v3 确认）

```
~/github/SCPT/                        # monorepo，remote DAVIDDAIJUNCHEN/SCPT
├── api-gateway-platform/   # 星语：流水线 A（Go 编译+前端 embed，tag 驱动发版）
├── API_TEST/
├── xingyu-chat/            # OWUI 部署配置：compose + .env + PWA + brand + setup.sh（无 Dockerfile）
└── xingyu-owui/            # 阶段 2 fork 源码：流水线 B（pin 上游 tag 为基线，与配置分目录）
```

**两条独立构建流水线，互不依赖：**

| | 流水线 A：星语 | 流水线 B：OWUI fork（阶段 2 起） |
|---|---|---|
| 触发 | 只改星语代码 | 只改 OWUI 前端 |
| 镜像 | `allomax-gateway:commercial` | `xingyu-owui:0.11.3-scpt.x` |
| 方式 | buildx（amd64）→ save/scp/load | SvelteKit+FastAPI 多阶段构建，同样 Mac build → save/scp/load |
| 另一边 | 容器照跑不动 | 容器照跑不动 |

- 阶段 1 用官方镜像 `ghcr.io/open-webui/open-webui:0.11.3`（pin 死），**零编译**
- VPS 上两套独立 compose：`/data/allomax/docker-compose.prod.yml` + `/data/xingyu-chat/docker-compose.yml`
- 仅同窗发版时两个都 build，顺序随意

---

## 阶段 1：地基 —— IP 先行部署（第 1~2 周）

| # | 任务 | 落点/要点 |
|---|---|---|
| 1.1 | **校内子域申请（并行启动，非关键路径）** | `ai.scpt.edu.cn` / `ai-chat` / `ai-platform` 三条内网 DNS + HTTPS 证书（优先问学校通配符/子域签发渠道）。**edu.cn 免工信部备案**；IP 方案先跑，域名到位一键切换 |
| 1.2 | VPS 试探 ghcr 连通性 | `ssh root@10.255.12.210 docker pull ghcr.io/open-webui/open-webui:0.11.3`；失败走 Mac pull → save/scp/load |
| 1.3 | **monorepo 建 `xingyu-chat/` 目录** | 与 api-gateway-platform 同级（SCPT 本就是 monorepo）；compose + .env.example + pwa/manifest.json + brand/ + scripts/setup.sh + **portal/**（静态页已写好） |
| 1.4 | 星语侧准备 | 建 `chat` 用户组（组倍率 0 或 0.01 留痕）+ OWUI 专用服务账号入组 + 模型白名单只放 flash 级（deepseek-v4-flash / glm-5.3-flash / qwen3.8-flash） |
| 1.5 | VPS 部署 OWUI 容器 | pin 0.11.3 + 数据卷 `/data/xingyu-chat` 持久化（告别 /tmp） |
| 1.6 | setup.sh 初始化脚本 | OWUI admin API 自动应用品牌+模型配置——POC 验证过的 `/openai/config/update` 脚本化，五分钟回到已知状态 |
| 1.7 | **nginx IP 版三入口 + 自签证书重签** | 配置已写好（`xingyu-chat/portal/nginx-ip.conf`）：根路径=Portal 静态页、其余=星语 3000、:8443=OWUI 8080（WS+流式+100M 上传）。**自签证书重签含 IP SAN + 未来三子域 SAN**（一次签好，切域名不换证）。星语 ServerAddress 补配 |
| 1.8 | 冒烟测试 | 12 模型拉通 + thinking 折叠（glm-5.3）+ 重启容器验证持久化 + Portal 三入口点击路径 |

## 阶段 2：换皮 —— 品牌与体验（第 2~3 周，与阶段 3 并行）

| # | 任务 | 要点 |
|---|---|---|
| 2.1 | 品牌资源 | logo / 图标 / 主题色（沿用星语色值方案）；**静态设计稿先确认再动手**，避免像素级返工 |
| 2.2 | PWA 白标 | `EXTERNAL_PWA_MANIFEST_URL` →「川邮·星语」上手机主屏（阶段 5 前菜） |
| 2.3 | **控制台跳转入口** | OWUI 挂按钮直跳星语控制台（余额/用量页），弥合两本账观感，一天工作量 |
| 2.4 | OWUI 侧限速 | 管理面板配用户/请求级 rate limit，防刷第一道墙 |
| 2.5 | i18n 锁 zh | 与星语 i18n 决策对齐（zh+en 锁定） |
| 2.8 | **Portal 静态页（v3.2 已完成初版）** | `xingyu-chat/portal/index.html` 已写好：导航栏 + 公告条（fetch 星语 `/api/notice`，同域反代无 CORS）+ 品牌口号「智汇星语·算启未来」+ **聊天窗口卡**（mac 风窗条 + 对话气泡 + 假输入框，整卡可点 → chat，登录态由 chat 侧自行处理）+ 双入口按钮。**纯静态零依赖**，nginx serve，改文案=改 HTML。品牌资源（2.1）到位后换 logo/色值/口号 |
| 2.6 | **fork OWUI → `xingyu-owui/`** | 基线 pin 上游 tag（v0.11.3）；深度定制走此流水线 B；**定制收敛在官方扩展点**（CSS 变量/i18n/manifest 尽量 env+admin API 完成），改源码集中在新组件文件少侵入上游 |
| 2.7 | **跟上游 merge 纪律** | 不追每次发版，固定每月/每季度 merge 一次上游 tag（安全补丁除外）——立项时定规矩，防 fork 烂在手里 |

## 阶段 3：身份源 —— OAuth2 Provider（第 2~5 周，核心开发，可先写代码不等域名）

| # | 任务 | 要点 |
|---|---|---|
| 3.1 | **Provider 三件套** | `/oauth/authorize` + `/oauth/token` + `/oauth/userinfo`，授权码模式 + PKCE，对接现有 session/token 体系（`/api/token` CRUD 可复用一半）。**唯一硬编码关键项** |
| 3.2 | 客户端注册管理 | 记录 OWUI 的 client_id/secret/回调地址（root 后台 CRUD） |
| 3.3 | **SLO 单点登出** | front/back-channel logout——星语封禁/改密码后 OWUI 已签发 JWT 立即失效（+1~2 天） |
| 3.4 | OWUI 接 OIDC | 配 `OPENID_PROVIDER_URL` 等环境变量族，首次登录跳星语授权页 |
| 3.5 | 端到端验收 | 手机号验证码登录 OWUI → 聊天 → 星语封禁该账号 → OWUI 下次请求被踢 |

## 阶段 4：计费与试运营（第 4~6 周，部分与阶段 3 并行）

| # | 任务 | 要点 |
|---|---|---|
| 4.1 | 赠金双账户 | `model/user.go` 加 `GrantedQuota`/`GrantedExpireAt` + `postConsumeQuotaWithResult` 改扣减顺序（赠金优先）——代码体检已定位 |
| 4.2 | 错峰定价 | 新增 `setting/ratio_setting/time_ratio.go`（落点 `composeTieredTextQuota`）——代码体检已定位 |
| 4.3 | Chat 月度赠金刷新 | chat 组每月大额赠金自动刷新（cron 或登录触发） |
| 4.4 | 分批试用 | 信息工程学院 20 人 → 全校师生；收集反馈迭代 |
| 4.5 | 监控报表 | 服务账号总量监控（防单点刷爆）+ OWUI 内部用量报表交叉核对 |

## 阶段 5：数据说话后的决策项（试运营 1~2 个月后评估）

| # | 任务 | 触发条件 |
|---|---|---|
| 5.1 | App 立项 | 日活 100+ 且移动端占比 30%+；PWA（阶段 2 已白标）→ 开源客户端（Conduit/Open MobileUI，GPL-3.0 注意二修开源义务）→ 自研（RN/Flutter，可包装横向课题：学生团队+软著+上架，复利型资产） |
| 5.2 | 按人计量深度集成 | 星语侧现在只见 OWUI 服务账号一个身份；需精确记账时做 id_token 携带星语 token |
| 5.3 | AGPL 合规处理 | 对外商业化前必须处理（OWUI BSD-3+品牌条款；星语 AGPL-3.0）；上架 App 需 ICP 备案 + App 备案（1~2 个月，立项即启动） |

---

## 三条泳道（单人开发排法）

```
泳道 A（基建）    ：1.2 → 1.3~1.8（IP 版三入口全部落地）→ 2.x
泳道 B（星语代码）：3.1~3.3（分支先写）→ 4.1~4.3
泳道 C（大王线下）：子域申请（三条 DNS + 证书问网络中心，一次提全）—— 非关键路径，IP 版先跑
```

## IP → 域名切换清单（域名到位当天执行，预计 0.5 天）

1. nginx server_name 改三子域（配置已按 `nginx-ip.conf` 文件末"域名切换节"预留步骤）
2. Portal 三处 chat 链接 `https://10.255.12.210:8443` → `https://ai-chat.scpt.edu.cn`
3. OWUI base_url → `https://ai-platform.scpt.edu.cn/v1`，去掉 `AIOHTTP_CLIENT_SESSION_SSL=false`
4. 星语 options 表 ServerAddress → `https://ai-platform.scpt.edu.cn`
5. 自签证书 SAN 已含三子域（1.7 一次签好），无需重签
6. IP 入口保留兜底（default_server），老书签不断

## v3 优化增补（体检式审视结果）

### A. 结构优化：阶段 2 一分为二
换皮里"env/配置能做的"（2.1~2.5）和"改源码的"（2.6~2.7）是两类工作，风险和维护成本差一个量级。**建议先全量做 2.1~2.5 + 2.8（Portal）用官方镜像/星语发版上线，fork（2.6）延后到明确知道"配置做不了什么"之后再动**——很可能白标 90% 需求 env+admin API 就够了，fork 可以只做最必要的 10%。**Portal（2.8）不依赖 fork**：它是星语自己的路由代码，跟 Provider 同一条流水线 A，甚至可以和 3.1 同分支开发。

### B. 公共流程抽取：构建产物流转脚本化
星语已验证的 build → save/scp/load 流程，OWUI fork 镜像（阶段 2.6 起）完全复用。**建议在 `xingyu-chat/scripts/` 下写 `ship.sh <镜像名> <tag>`**：Mac 本地 build → 压缩 → scp → VPS load → tag 切换 → compose up -d，一条命令完成。两条流水线共用，消除手工重复。

### C. 备份盲区：OWUI 数据卷必须进日备
星语 PG 已有日备，但 **OWUI 数据卷（/data/xingyu-chat，师生聊天记录）不在任何备份里**。新增任务：把它纳入 VPS 日备（tar 到备份盘或 rsync 回 Mac，量小可日备全量）。

### D. 监控补项：OWUI 容器纳入探针
星语已有健康探针，**OWUI 容器没有**。1.5 部署时顺手加：compose healthcheck + 外部拨测（域名生效后 UptimeRobot 类，或复用星语探针脚本）。

### E. 排序优化：1.4 星语侧准备提前到与 1.2 并行
chat 组/服务账号/白名单纯后台配置，不依赖 VPS 或域名，**第 1 天就能做**，不必排在 ghcr 试探后。

### F. 发版窗口纪律：周五不上线
Provider 三件套和 fork 镜像都是"改了就要观测"的变更。定规矩：**发版只排周二~周四，周五及节前只观测不发版**——单人开发没有同事兜底，出问题只能自己爬起来修。

### G. 关键路径再确认
真正的关键路径是 **1.1 域名备案 → 1.7 HTTPS → 3.4/3.5 OIDC 端到端**。泳道 B 代码再快，3.4 之前上不了线。**备案期间用临时域名（cloudflared quick tunnel 已有）先做 3.4/3.5 的联调**，域名到位后一键切换——不等备案白空转 3 周。

### I. Portal 站位与 DS 对标细节（v3.1 新增）
**为什么门户页放在星语而不是单独建站**：DS 主页是独立营销站，但对我们——① 星语前端本来就有被砍掉的主页位（index.tsx redirect 空壳），零新增系统；② 门户必须知道登录态才能智能跳转（已登录点 API 按钮→控制台），放星语天然共享 session；③ 少养一个站点/nginx 配置。**结构对标**：DS 主页 = 产品公告条（V4.1-Flash 发布）+ 品牌口号（探索未至之境）+ 双按钮（和 DeepSeek 对话 / 使用 API 开放平台）；我们同构 = 公告条（复用星语 Notice 系统数据）+ 口号（随品牌资源 2.1 定）+ 双按钮（和星语对话→chat.xxx / 使用 API 开放平台→按登录态分流）。**开发量约 2 人日**，静态页 + 一条跳转逻辑，无后端改动（公告条读现有 Notice API）。**注意**：改 index.tsx 去 redirect 后，老用户书签是根路径，redirect 到 /dashboard 的习惯要保留兼容（根路径带 `?app=api` 参数或导航栏"控制台"入口兜底）。

### H. 回滚预案具体化
OWUI 数据卷 + 星语 PG 的回滚点制度沿用星语镜像 tag 惯例：每次发版前 `docker tag ... rollback-YYYYMMDD-x` 留点，**回滚 = tag 切回 + up -d**，五分钟内完成。

## 技术债清单（顺手清）

- AlloMax 给 DeepSeek-V4.1-Flash 加 `--reasoning-parser`（现在不出 thinking，前端无解）
- OWUI 数据从 /tmp 迁 VPS（1.5 一并解决）
- VPS options 表补配 ServerAddress

## 风险与已知缝隙（交底）

| 风险 | 影响 | 缓解 |
|---|---|---|
| ghcr 拉取被卡（Mac 已复现） | 阻塞 1.5 | 预案：VPS pull 试探 → 失败走 Mac save/scp/load |
| OWUI 每用户 api_key 星语不认 | 阶段 4 按人计量粗粒度 | 服务账号+组倍率+OWUI 报表交叉核对；精确记账留 5.2 |
| fork 维护成本随定制深度非线性上升 | 阶段 2 长期负担 | 定制收敛扩展点 + 月度 merge 纪律（2.6/2.7） |
| 域名备案 1~4 周 | 关键路径 | 临时域名联调（优化 G），不空转 |
| 单点故障：星语挂→登录+模型全断 | 联邦式固有代价 | 星语已有探针+日备；接受此代价换运维隔离 |
| AGPL-3.0（星语） | 对外商用前必须处理 | 5.3，校内使用不阻塞 |
