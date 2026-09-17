# Stage 2 · Chat 开发计划（Open WebUI 定制 · 对齐 DeepSeek 体验）

> **阶段周期**：预计 2026-09-18 起，3-4 周
> **前置状态**：✅ Portal 主页已收工（8.9 分）；✅ OWUI POC 已在 Mac 本地跑通（12 模型接入 + reasoning 透传验证）
> **目标**：学生打开 Chat 入口 → 登星语账号 → 直接对话，思考链折叠效果如 DeepSeek；主页「和星语对话」按钮直达

---

## 0. 架构决策（已拍板，2026-09-16/17）

### 0.1 选型结论：Open WebUI（弃 LibreChat / LobeChat）

| 候选 | 许可 | 结论 |
|---|---|---|
| **Open WebUI** ✅ | BSD-3 + 品牌条款（校内不改品牌 = 免费无限制） | **选定**：reasoning 折叠原生一等公民 + SearXNG 联网开箱 + 多用户 RBAC + Pipelines 扩展点 |
| LibreChat | MIT 可白标 | 备选：自带预算体系与计费改造协同，但 reasoning 要额外适配 |
| LobeChat | 社区许可，分发需商业授权 | ❌ 排除：与商业化目标冲突 |
| NextChat | MIT | 仅作极简 UI 参考 |

**选型关键依据**：DeepSeek 的灵魂是「深度思考展示」——OWUI 原生支持从流式 delta 的 `reasoning_content` 字段捕获（星语正好返回该字段）并渲染为可折叠 UI，这块**零改造**即出效果。

**⚠️ 使用风险**：OWUI 安全公告多（约 147 个 advisory，含 SSRF/路径穿越/OAuth 接管）→ 上线后必须跟踪版本及时更新。

### 0.2 总体架构

```
学生浏览器
  ├── https://10.255.12.210        → 443 nginx → Portal 主页 + 星语 API 平台
  └── https://10.255.12.210:8443   → nginx → OWUI Chat（8080 容器）
                                        ├── SearXNG 容器（联网搜索）
                                        └── 星语网关（唯一后端，12 模型）
                    
身份与计费原则：
  · 星语 = 唯一身份源（OIDC Provider）+ 唯一模型后端
  · Chat 对话不扣学生个人 API 配额 → 走 Chat 服务账号 + 内部渠道计费
```

### 0.3 代码库铁律（不可违反）

- **改星语 Go 代码一律走 `~/github/SCPT/api-gateway-platform`（生产源，可编译）**
- 工作区 `03_项目源码/allomax-gateway`（开发主线）**编译不过**（M2 手机号功能半成品，commit 5b9210b 引用未实现方法），**禁止用它构建部署**
- 部署链路：SCPT 库 buildx amd64（需临时加 `ENV GOPROXY=https://goproxy.cn,direct`）→ save/scp → VPS docker load → tag rollback 留点 → compose up

---

## S1 基础部署（1-2 天）—— 先跑起来，全程不动生产代码

### S1.1 VPS 容器部署
| 任务 | 要点 |
|---|---|
| docker 部署 OWUI | 镜像 ghcr.io/open-webui/open-webui:main；VPS 直连 ghcr 慢（实测 13min+），可 Mac PyPI 路线构建镜像再传，或 VPS 直接拉耐心等 |
| 环境变量 | `WEBUI_AUTH=true`、`ENABLE_OLLAMA_API=false`、**`AIOHTTP_CLIENT_SESSION_SSL=false`**（星语自签证书 CN 与 IP 不匹配，aiohttp 不认 CA bundle，只有这个变量有效——POC 踩坑验证） |
| 挂载 | `/data/owui/data` → 容器 `/app/backend/data`（持久化用户/会话） |
| docker 部署 SearXNG | `searxng/searxng:latest`，端口 8888 内部；环境 `SEARXNG_BASE_URL`；OWUI 侧 Admin → Settings → Web Search → SearXNG 填 `http://searxng:8888/search?q=<query>` |
| 星语接入 | Admin → Settings → Connections → OpenAI API：`https://10.255.12.210/v1` + 管理员 token（POC 已验证 12 模型全列出） |

### S1.2 证书与 nginx
| 任务 | 要点 |
|---|---|
| 重签自签证书 | 加 IP SAN `10.255.12.210`，顺手把未来三个子域 SAN 写进去（chat.xxx / api.xxx / portal.xxx，域名定了就不用重签） |
| nginx-ip.conf 上 VPS | 已写好在 `portal/nginx-ip.conf`；443 保留 Portal+星语，**8443 反代 OWUI**（⚠️ OWUI 0.11.3 不支持 BASE_PATH，路径反代 `/chat/` 会与内部绝对路径冲突，POC 拍板走独立端口方案；conf 里已留 `/chat/` 块作备选，含 WS 升级 + proxy_buffering off + 100m） |
| 防火墙 | 确认 8443 仅校园网可达 |

### S1.3 DeepSeek 风格初始化
| 任务 | 要点 |
|---|---|
| 默认模型 | Admin → Settings → Interface：默认模型设 glm-5.3-flash 或 DeepSeek-V4-Flash（快速响应优先） |
| 界面裁剪 | 关闭不用的功能入口（Artifacts/代码执行按需留），左侧导航先不动（S3 再裁） |
| reasoning 验证 | 用 glm-5.3 实测思考链折叠效果（POC 已验证 1752 字透传） |

### S1.4 后端遗留修复（AlloMax 侧）
- DeepSeek-V4.1-Flash 的 thinking 输出为 0 → 需在 AlloMax 部署侧加 `--reasoning-parser`（POC 发现，与 OWUI 无关）

**S1 验收**：浏览器打开 `https://10.255.12.210:8443` 能登录（OWUI 本地账号）、选 glm-5.3 出思考链折叠、联网搜索可用；主页按钮直达。

---

## S2 账号打通（3-5 天）—— 一个账号两边通用（本阶段技术核心）

### S2.1 星语补 OIDC Provider 端点（走 SCPT 库）
现状：`controller/oauth.go` 已有 GenerateOAuthCode/HandleOAuth 雏形（GitHub 登录用），但**不是完整 OAuth2 Provider**（无对外 `/oauth/authorize` 路由）。

| 任务 | 要点 |
|---|---|
| 补标准端点 | `/oauth/authorize`（授权页）、`/oauth/token`（换 token）、`/oauth/userinfo`；复用现有 session 鉴权 |
| OAuth 客户端表 | client_id/client_secret/redirect_uri 注册（先硬编码 OWUI 一个客户端，不做管理界面） |
| scope | 先只做 `openid profile`（拿 username/email/avatar），不做细粒度授权 |
| 构建 | SCPT 库 → buildx amd64 → rollback tag → 部署（铁律见 0.3） |

### S2.2 OWUI 对接 OIDC
| 任务 | 要点 |
|---|---|
| 环境变量族 | `ENABLE_OAUTH_SIGNUP=true`、`OAUTH_PROVIDER_NAME=XingYu`、`OAUTH_CLIENT_ID/SECRET`、`OAUTH_AUTHORIZATION_ENDPOINT/TOKEN_ENDPOINT/USERINFO_ENDPOINT` 指回星语 |
| 注意 | OWUI 一次只能配 1 个 OIDC（够用）；OAuth 账号接管风险 → 确认 `OAUTH_MERGE_ACCOUNTS_BY_EMAIL` 策略谨慎开 |

### S2.3 Chat 服务账号 + 内部渠道（计费隔离）
| 任务 | 要点 |
|---|---|
| 建服务账号 | 星语建 `svc-chat` 用户 + 专属 token，配额单独批（如每月 N 亿 token 预算） |
| OWUI 指向内部渠道 | OWUI 的 Connections 不再直接用管理员 token，改用 svc-chat token → 所有 Chat 流量归到内部渠道，**与学生个人 API 配额完全隔离** |
| 用量回流 | 先用星语日志区分（渠道维度天然可查）；Webhook 用量回流放 S4 |

### S2.4 自动开通流水线（可延后）
- 星语注册成功 → 自动给 Chat 发访问权限（OIDC signup 天然实现「有星语账号就有 Chat」）→ 此步实际只剩「默认用户组 + 模型可见性」配置

**S2 验收**：学生用星语账号在 8443 单点登录；OWUI 里看不到个人 API key；星语后台能看到 Chat 渠道维度用量。

---

## S3 定制打磨（1-2 周，切片迭代）—— 像.DeepSeek

按「先骨架后皮肤」顺序，每片独立可验收：

| # | 切片 | 内容 | 技术点 |
|---|---|---|---|
| 3.1 | **极简单栏布局** | 裁掉左栏 Workspace/模型管理多级导航，默认全屏对话 | Svelte 组件裁剪，改 `src/lib/components/layout` |
| 3.2 | **4 模式 pill** | Instant / Expert / Deep Think / Vision 映射星语模型池（flash / pro / thinking / VL-30B） | 输入框旁 pill 组，切换即换 model 参数；同会话可切（DeepSeek 同款） |
| 3.3 | **主题配色** | 对齐 DeepSeek 深色板 + 星语品牌色 #4562f0 | Tailwind 调色板 + CSS 变量，与 Portal 视觉统一 |
| 3.4 | 思考块样式 | 折叠组件基础上微调（「已深度思考 N 秒」样式） | 现有 reasoning 组件改样式 |
| 3.5 | 品牌替换 | 「Open WebUI」→「川邮·星语 Chat」；favicon 换圆徽 | ⚠️ 品牌条款：校内使用不改品牌条款约束的是「分发」，自用重命名风险低，但**对外服务前须评估** |
| 3.6 | Portal 小项顺手清 | rAF visibilitychange、og 标签、公告链接 | 见 stage1 README §7 |

**构建注意**：OWUI 前端是 Svelte + Vite，本地 `npm run build` 后容器挂载或重打镜像；Mac 上 ghcr 拉不动的问题用 PyPI 路线绕（POC 已验证）。

**S3 验收**：并排截图对比 DeepSeek 官网，布局/模式切换/思考折叠三大标志性体验对齐。

---

## S4 星语侧并行改造（与 S2/S3 交错，不阻塞 Chat 主线）

| 任务 | 依赖 | 说明 |
|---|---|---|
| Webhook 用量回流 | S2.3 之后 | Chat 消耗实时推给星语后台报表 |
| 模型池扩容 | 无 | 按师生反馈接新模型（AlloMax 侧部署 → 星语建渠道 → OWUI 自动可见） |
| 计费三项（体检结论） | 无 | ① 错峰定价 `setting/ratio_setting/time_ratio.go`（新文件，计费最后一步乘时段系数）② 赠金/充值双账户（`users.GrantedQuota` + 扣减顺序）③ 套餐绑定并发（token-quota-control 读 UserSubscription）—— 全走 SCPT 库 |

---

## 风险清单

| 风险 | 等级 | 对策 |
|---|---|---|
| OWUI 安全漏洞（147 advisory） | 🔴 | 版本锁定 + 定期更新；8443 限校园网；不上传敏感文件 |
| OWUI 不支持 BASE_PATH | 🟡 | 已定独立端口 8443 方案；域名方案（子域反代）作为后续升级 |
| 星语 OIDC Provider 二开工作量超预期 | 🟡 | oauth.go 雏形可扩；先做最小可用（单客户端、无细粒度 scope） |
| AGPL（星语是 new-api fork） | 🟡 | 校内使用不触发；**对外服务前必须处理**（换 MIT 底座或合规评估） |
| 免费 Chat 吃算力 | 🟡 | svc-chat 配额封顶 + 错峰引导（S4 计费改造） |
| 合规（生成式 AI 备案） | 🔴 | 校内试运行不阻塞；**对外开放注册前是硬门槛** |

---

## 执行顺序总览

```
S1 基础部署 ──────┐
                  ├─→ S2 账号打通 ─→ S3 定制打磨 ─→ 收尾验收
S4 星语侧改造 ────┘（并行，不阻塞）
```

**立即可做**：S1 全程纯部署+配置，零生产代码改动，零风险，大王确认即开。
