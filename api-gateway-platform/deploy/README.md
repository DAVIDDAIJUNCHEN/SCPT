# AlloMax API 网关 · VPS 生产部署文档

> 版本：M3 / 2026-09-02
> 目标环境：16C / 64G / 1T 主盘 + 20T 数据盘，无域名（IP:端口访问）
> 部署方式：Docker Compose 全容器化（gateway + PostgreSQL + Redis）

---

## 0. 架构总览

```
VPS (IP:3000 对外)
├── gateway  (allomax-gateway:commercial)  ← 业务主服务（Go 单二进制，内含前端静态资源）
├── postgres 16   ← 业务数据库（用户/令牌/渠道/日志）
└── redis 7       ← 缓存 + 限流（RPM/并发/TPM 依赖）+ 短信验证码频控
数据目录：${DATA_DIR:-/data/allomax}/  （绑定到你 20T 数据盘）
```

> 无 Redis 时系统可运行但 **TPM/分布式限流不生效**（RPM/并发降级内存模式），生产必须带 Redis。

---

## 1. VPS 环境准备（一次性）

```bash
# 1.1 安装 Docker（如已装跳过）
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# 1.2 数据盘挂载（20T 盘，如 /dev/vdb）
lsblk                                   # 确认数据盘设备名
mkfs.ext4 /dev/vdb                     # 首次使用才格式化（⚠️ 会清空该盘）
mkdir -p /data/allomax
mount /dev/vdb /data/allomax
echo '/dev/vdb /data/allomax ext4 defaults 0 2' >> /etc/fstab
df -h | grep allomax                    # 确认挂载

# 1.3 防火墙放行（按你的安全策略）
# 若用 ufw:  ufw allow 3000/tcp   若用 firewalld: firewall-cmd --add-port=3000/tcp
# 仅对可信来源开放 3000，不要对全公网裸奔（可配 nginx + basic auth 或安全组限制）

# 1.4 时间同步
timedatectl set-timezone Asia/Shanghai
```

---

## 2. 获取部署包与镜像

### 方案 A：离线镜像（推荐，已在本机打好包）

在**你的 Mac**（工作区）执行导出，已生成：

```bash
# 本机（构建过镜像后）
docker save allomax-gateway:commercial | gzip > allomax-gateway-commercial.tar.gz
# ~313MB 镜像 → ~100-150MB tar.gz
```

传到 VPS（scp / rsync / 网盘均可）：

```bash
scp allomax-gateway-commercial.tar.gz root@<VPS-IP>:/data/allomax/
```

VPS 上加载：

```bash
docker load < /data/allomax/allomax-gateway-commercial.tar.gz
docker images | grep allomax     # 确认 allomax-gateway:commercial 出现
```

### 方案 B：VPS 上直接构建（网络好时）

```bash
git clone https://github.com/DAVIDDAIJUNCHEN/api-gateway-platform.git
cd api-gateway-platform
docker build -f deploy/Dockerfile.commercial -t allomax-gateway:commercial .
```

---

## 3. 配置 .env

```bash
cd /data/allomax
cp api-gateway-platform/deploy/.env.example .env
chmod 600 .env
vi .env
```

必须修改的项（全部改为强随机值）：

```bash
# 生成方法：
#   openssl rand -hex 32          → SESSION_SECRET
#   openssl rand -base64 18       → POSTGRES_PASSWORD / REDIS_PASSWORD
```

| 变量 | 必改 | 说明 |
|---|---|---|
| `SESSION_SECRET` | ✅ | 会话签名密钥（多实例一致） |
| `POSTGRES_PASSWORD` | ✅ | 业务库密码 |
| `REDIS_PASSWORD` | ✅ | Redis 密码 |
| `DATA_DIR` | 视盘而定 | 默认 `/data/allomax`，改到你数据盘实际挂载点 |
| `SMS_PROVIDER` | 上线前 | `mock`（现用，验证码写日志+sms_logs 表）→ 接真实短信改 `aliyun`/`tencent` 并配 AK/签名 |

手机号注册开关默认开启（`PHONE_REGISTER_ENABLED=true`），无需改。

---

## 4. 启动

```bash
cd /data/allomax
# 方案 A：docker-compose 文件随代码仓库
git clone <repo> 或 scp deploy/ 目录上来
# 目录建议结构：
# /data/allomax/
# ├── .env
# ├── docker-compose.prod.yml
# └── allomax-gateway-commercial.tar.gz (加载后可删)

docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps    # 三个服务均 Up + healthy
```

---

## 5. 初始化管理员（首次必做）

新版 **不再有默认 root/123456**，首次访问走向导：

```bash
# 浏览器打开 http://<VPS-IP>:3000 → 跳转初始化页
# 或命令行初始化：
curl -s -X POST http://<VPS-IP>:3000/api/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<强密码>","confirmPassword":"<强密码>"}'
```

> ⚠️ 初始化后立刻登录控制台 → 修改/确认管理员密码强度；系统设置里可关闭「注册」（内部/教学场景按需）。

---

## 6. 配置模型渠道（关键）

平台只是网关，**模型能力来自上游渠道**。两种上游：

### 6.1 AlloMax 实例池（推荐，内网模型）
```bash
# 控制台 → 渠道 → 添加渠道
#   类型: OpenAI
#   名称: AlloMax-vLLM
#   代理地址(BaseURL): http://<模型实例vLLM地址>/v1   ← 例如 node 上的 30551 端口
#   API Key: <实例令牌>
#   模型: deepseek-v4-pro-0813, deepseek-flash-v4-0731 等
#   分组: default
```

### 6.2 第三方厂商（如 DeepSeek 官方 / OpenAI）
```bash
# 同上，BaseURL 填厂商地址，Key 填厂商 Key
```

### 验证模型可用
```bash
# 先建一个 API 令牌（控制台 → 令牌 → 添加，额度设好）
curl -s http://<VPS-IP>:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-你的令牌" \
  -H "Content-Type: application/json" \
  -d '{"model":"deepseek-v4-pro-0813","messages":[{"role":"user","content":"你好"}]}'
```

---

## 7. 功能验证清单（部署验收）

| # | 验证项 | 方法 | 预期 |
|---|---|---|---|
| 1 | 手机号注册/登录 | 登录页 → 手机号验证码登录 | Mock 弹测试验证码，登录进控制台 |
| 2 | 令牌管控 | 建令牌时填 RPM=5 → 快速连调 | 第 6 次起 HTTP 429 |
| 3 | 模型调用 | 调已配置渠道模型 | 正常返回 |
| 4 | 额度扣减 | 调用后看令牌用量 | token 数正确扣减 |
| 5 | 订阅/充值（可选） | 控制台运营设置 | 按需开启 |

> 更完整的五层门禁验收可复用验收工具（`model-acceptance-suite`，README 见工作区），
> 配置 base_url/token/model 后 `python -m mas run` 即可。

---

## 8. 运维手册

### 常用命令
```bash
docker compose -f docker-compose.prod.yml logs -f gateway   # 看业务日志
docker compose -f docker-compose.prod.yml restart gateway   # 重启网关
docker exec -it allomax-postgres psql -U allomax -d allomax # 进数据库
docker exec allomax-redis redis-cli -a <密码> ping          # Redis 探活
```

### 备份（数据在 /data/allomax/postgres 与 redis 卷）
```bash
# PostgreSQL 逻辑备份（推荐定时）
docker exec allomax-postgres pg_dump -U allomax -d allomax -Fc \
  > /data/backup/allomax_$(date +%F).dump

# 定时任务示例（crontab -e）：每日 02:30 备份，保留 30 天
30 2 * * * docker exec allomax-postgres pg_dump -U allomax -d allomax -Fc > /data/backup/allomax_$(date +\%F).dump && find /data/backup -name '*.dump' -mtime +30 -delete
```

### 升级（拉新代码 → 构建 → 滚动重启）
```bash
# 方式一（镜像）：本机重新 build 导出 → VPS docker load → up -d
# 方式二（VPS 构建）：git pull && docker build ... && docker compose up -d
# 数据库自动迁移（AutoMigrate），旧数据保留；升级前先 pg_dump 备份
```

---

## 9. 故障排查

| 症状 | 排查 |
|---|---|
| 服务起不来 | `docker compose ps` + `docker compose logs gateway`；多为端口占用/密码不符 |
| 登录后无数据 | 检查 postgres healthy；`docker compose logs postgres` |
| 手机号发码 500 | `SMS_PROVIDER` 配置问题；mock 模式下看 gateway 日志 `[SMS-MOCK]` |
| 调用模型 503 no available channel | 渠道未配/模型未填/分组不符（见 §6） |
| 429 rate_limit_exceeded | 触发了令牌 RPM/TPM/并发限制，正常行为 |
| 时区错乱 | 检查 `TZ=Asia/Shanghai` 与系统时间 |

---

## 10. 安全基线（务必执行）

1. ✅ 修改所有默认密码（.env + 管理员账号）
2. ✅ `SESSION_SECRET` 必须为随机强值（泄露可伪造会话）
3. ⚠️ 3000 端口不要对全公网开放；加 Nginx 反代 + HTTPS（有域名后）+ 安全组限制
4. ⚠️ 定期备份（见 §8）
5. ⚠️ 接真实短信前先申请签名模板，配 `SMS_PROVIDER` 并移除 mock 回显
6. ⚠️ 生产环境把 `SMS_MOCK_RETURN_CODE` 置为 false（防验证码泄露）

---

## 11. 一键部署（第三方傻瓜式）

若无特殊定制，直接使用 `deploy/deploy.sh` 可一键完成构建+启动+引导：

```bash
# 前置：仅需 docker + docker compose v2
cd <仓库>/
chmod +x deploy/deploy.sh
./deploy.sh --all          # 构建镜像 → 生成/校验 .env → 启动 → 冒烟 → 初始化指引

# 分步执行（按需）
./deploy.sh --build        # 仅构建镜像
./deploy.sh --up           # 仅启动容器
./deploy.sh --smoke        # 冒烟测试平台状态
./deploy.sh --gen-secrets  # 自动生成 SESSION_SECRET/POSTGRES/REDIS 随机密钥
./deploy.sh --init         # 显示管理员初始化指引
```

> 数据目录默认 `/data/allomax`，可用环境变量 `DATA_DIR=/path` 覆盖；服务端口默认 3000，可用 `PORT=8080 ./deploy.sh` 覆盖。

---

## 12. 平台功能说明（二开新增）

本平台在 New API 基础上二次开发，除原生能力外新增：

| 功能 | 用途 | 使用 |
|---|---|---|
| **手机号注册/登录** | 免邮箱，实名手机号验证码登录即注册 | 登录页切换"手机号"模式 |
| **真实短信** | 阿里云 Dysmsapi 真发验证码，落库脱敏 | `.env` 配 `SMS_PROVIDER=aliyun` + AK/SK/签名/模板 |
| **两步验证 2FA** | 管理员 TOTP 双因素 | 管理员 → 个人设置 → 两步验证 → 扫码绑定 |
| **审计日志页** | 操作审计(谁改了什么) + 登录日志台账 | 侧边栏 → 审计日志（admin） |
| **未知IP告警** | 管理员非白名单 IP 登录 → 飞书通知(含用户名) | `.env` 配 `ADMIN_IP_WHITELIST` + `FEISHU_WEBHOOK_URL` |
| **用量分析** | 总览/按模型·用户·渠道 调用量/额度/Token | 侧边栏 → 用量分析（admin） |
| **能力管控** | per-token RPM/TPM/并发/配额熔断 + 模型白名单 | 令牌编辑 → 能力管控配置 |

### 真实短信接入（阿里云）
```bash
# .env 配置
SMS_PROVIDER=aliyun
SMS_ACCESS_KEY_ID=<RAM子账号AK>
SMS_ACCESS_KEY_SECRET=<SK>
SMS_SIGN_NAME=<审核通过的签名，如"川邮智算中心">
SMS_TEMPLATE_CODE=<短信模板CODE，变量必须为 ${code}>
SMS_MOCK_RETURN_CODE=false
```

### 未知 IP 告警配置
```bash
# .env 配置；白名单留空 = 全放行仅记录（不拦截），填入已知管理员IP(逗号分隔)即告警
ADMIN_IP_WHITELIST=203.0.113.1,198.51.100.2
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
```

