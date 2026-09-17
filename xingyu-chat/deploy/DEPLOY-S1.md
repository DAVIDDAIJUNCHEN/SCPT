# S1 基础部署执行手册（OWUI + SearXNG + nginx 双入口）

> 目标：VPS 10.255.12.210 上跑起 OWUI Chat（127.0.0.1:8080）+ SearXNG（容器网），
> nginx 443 = Portal+星语、8443 = OWUI 独立入口。
> 本手册为唯一执行依据，每步带验证命令，做完一步勾一步。

## ✅ 执行状态（2026-09-17 完成）

| 步骤 | 状态 | 结果 |
|---|---|---|
| S1.1 容器启动 | ✅ | owui (healthy) + searxng (up)，8 容器全家福全绿 |
| S1.2 证书 + nginx | ✅ | 825 天自签证书（IP+三子域 SAN）；443/8443 双入口全 200 |
| S1.3 OWUI 接星语 | ⏳ 待做 | 需浏览器注册管理员 + 填星语令牌（见下） |

**最终验证（Mac 侧实测）**：Portal 443 → 200；星语 /api/status → 200；OWUI 8443 → 200 + `{"status":true}`；80 → 301 跳 443；SearXNG 中文搜索 9 条结果、unresponsive 清零。

**S1.2 实际变更**：
- `/etc/nginx/conf.d/allomax.conf` 已由 `xingyu-ip.conf` 替换（备份在 `/etc/nginx.bak-20260917-*`）
- 443 的 `/chat/` 子路径反代已实测**不可行**（OWUI 全部绝对路径 `/static` `/api`，撞星语路由 404），已删除该块，Chat 入口 = **8443 独立端口**
- Portal `CHAT_URL` 已改为固定 8443 并重新上传
- 证书：`/data/nginx/cert/xy.crt|xy.key`

## 前置状态（2026-09-17 15:00 实测）

| 项 | 状态 |
|---|---|
| OWUI 镜像 | ✅ 已在 VPS（ghcr.io/open-webui/open-webui:main，7.16GB，2026-09-04 构建） |
| SearXNG 镜像 | ⏳ 后台拉取中（`nohup docker pull`，日志 `/tmp/pull-searxng.log`，pid 2159632） |
| 数据目录 | ❓ `/data/owui/data`、`/data/searxng`（上次创建命令遇网络中断，未确认） |
| docker 网络 | ❓ `owui-net`（同上） |
| **VPS 连通性** | ❌ **2026-09-17 14:41 后整机失联**（22/443/8443/traceroute 全断，同网段 103 与 node006 正常）→ 需现场/网管确认后再执行本手册 |

---

## S1.1 容器启动

```bash
# 0) 从 Mac 上传部署资产（VPS 恢复后）
scp ~/github/SCPT/xingyu-chat/deploy/docker-compose.owui.yml root@10.255.12.210:/data/owui/
scp ~/github/SCPT/xingyu-chat/deploy/searxng-settings.yml root@10.255.12.210:/data/searxng/settings.yml
scp ~/github/SCPT/xingyu-chat/portal/nginx-ip.conf root@10.255.12.210:/data/owui/nginx-ip.conf
scp -r ~/github/SCPT/xingyu-chat/portal/ root@10.255.12.210:/data/xingyu-chat/portal/

# 1) 补齐目录与网络（幂等）
ssh root@10.255.12.210
mkdir -p /data/owui/data /data/searxng /data/xingyu-chat/portal /data/nginx/cert
docker network ls | grep -q owui-net || docker network create owui-net

# 2) 确认镜像（SearXNG 拉取是否完成）
tail -3 /tmp/pull-searxng.log
docker images | grep -E 'open-webui|searxng'
# 若 searxng 缺失：docker pull searxng/searxng:latest

# 3) 启动（compose 文件内已含环境变量：AIOHTTP SSL 关闭、SearXNG 引擎、内存上限）
cd /data/owui && docker compose up -d
docker compose ps          # 两个容器都应为 healthy/running
docker logs owui --tail 20 # 无 ERROR 即可
```

**验证**：
```bash
curl -s http://127.0.0.1:8080/health | head -1          # OWUI 健康
curl -s 'http://127.0.0.1:8888/search?q=test&format=json' | head -c 200
# ↑ 返回 JSON（非 403 Forbidden）= formats:json 生效
```

## S1.2 证书重签 + nginx 上线

```bash
# 1) 备份现有 nginx 配置（铁律：动 nginx 前先留回滚点）
cp -r /etc/nginx /etc/nginx.bak-$(date +%Y%m%d-%H%M)
# 若 nginx 为容器部署，先 docker ps 找配置挂载点再备份

# 2) 重签自签证书（含 IP SAN + 未来三子域，域名到位后不再换）
cd /data/nginx/cert
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout xy.key -out xy.crt \
  -subj "/C=CN/ST=Sichuan/O=SCPT/CN=10.255.12.210" \
  -addext "subjectAltName=IP:10.255.12.210,DNS:ai.scpt.edu.cn,DNS:ai-chat.scpt.edu.cn,DNS:ai-platform.scpt.edu.cn"
openssl x509 -in xy.crt -noout -ext subjectAltName   # 确认 SAN 列表

# 3) 上线新配置（旧配置位置先探测：nginx -t 看主配置 include 路径）
cp /data/owui/nginx-ip.conf /etc/nginx/conf.d/xingyu-ip.conf   # 按实际路径调整
nginx -t && systemctl reload nginx   # 容器部署则 docker exec <nginx> nginx -s reload

# 4) 防火墙：8443 仅校园网可达（若用 ufw/iptables，按现有策略补一条）
```

**验证**（Mac 侧）：
```bash
curl -sk https://10.255.12.210/ -o /dev/null -w "%{http_code}\n"        # 200 Portal
curl -sk https://10.255.12.210:8443/ -o /dev/null -w "%{http_code}\n"   # 200 OWUI
curl -sk https://10.255.12.210/api/status -o /dev/null -w "%{http_code}\n"  # 200 星语
```

**回滚**：`rm /etc/nginx/conf.d/xingyu-ip.conf && cp /etc/nginx.bak-*/…（恢复原配置）&& nginx -s reload`

## S1.3 OWUI 初始化 + 星语接入

```text
1) 首个注册账号自动成为管理员：浏览器开 https://10.255.12.210:8443 注册（大王账号）
2) 星语侧建 Chat 服务账号 + 令牌：
   星语后台 → 用户 → 新建用户 chat-service（无限额或专用套餐）→ 生成令牌 sk-xxx
3) OWUI 管理台 → 设置 → 外部连接 → OpenAI API：
   - URL  https://10.255.12.210/v1（预置环境变量已带，核对即可）
   - Key  sk-xxx（替换 compose 里的 placeholder 后 docker compose up -d 重建，或直接在 UI 改）
   - 点「验证」应列出 12 个模型
4) 联网搜索核对：管理台 → 设置 → 联网搜索 → 引擎 searxng
   （compose 已预置 RAG_WEB_SEARCH_* 环境变量）
5) 默认模型设 glm-5.3-flash；实测一条 thinking 模型对话看折叠效果
```

**验收清单**：
- [ ] `https://10.255.12.210:8443` 登录后能选到 12 个星语模型
- [ ] glm-5.3-flash 对话正常，思考链折叠如 DeepSeek
- [ ] 开联网搜索提问时事，回答带引用
- [ ] Portal「和星语对话」按钮直达 Chat
- [ ] `docker compose ps` 两容器 healthy

## 已知坑（POC + S1 实战实测，勿再踩）

| 坑 | 规避 |
|---|---|
| 星语网关自签证书 → OWUI 报 SSL 错 | `AIOHTTP_CLIENT_SESSION_SSL=false`（compose 已带） |
| OWUI 0.11.3 无 BASE_PATH | 不做子路径，走 8443 独立端口；443 `/chat/` 实测撞星语路由（`/api/config` 404），已弃用 |
| SearXNG 默认禁 JSON | settings.yml 显式 `formats: [html, json]` |
| SearXNG 无 secret_key 秒退 | 已生成并写入 settings.yml |
| SSH 长命令被代理掐断 | 长任务一律 `nohup … &` 落 VPS 后台 |
| thinking 模型 content 为空 | 验证时 max_tokens 给大（≥4096） |
| **bind-mount 单文件不存在 → Docker 自动建目录** | 容器 exit 127 反复重启。scp 必须传到 compose 挂载的确切路径（`/data/searxng/settings.yml`），改文件后必须 `docker rm` + `up -d` 重建（restart 不重挂载） |
| **OWUI 启动卡死：HF 下载 embedding 模型** | 加 `HF_ENDPOINT=https://hf-mirror.com`；但 hf-mirror 元数据走得通、**大文件字节流仍走 xet CDN（海外）照样卡死**。终极解法：本地 Mac 下载 all-MiniLM-L6-v2 → 组装 HF cache 结构（blobs+snapshots 软链+refs）→ tar 打包（本地 gzip -t 校验）→ scp → `--strip-components=1` 解压到 `/data/owui/data/cache/embedding/models/` → 重启 |
| **SearXNG 引擎选择（校园网实测）** | baidu → CAPTCHA 风控；bing → SearXNG 2026.9 版解析层 0 结果（网络通、HTML 通、引擎层问题）；**sogou + chinaso → 稳定 9-10 条中文结果**，最终方案 |
| **keep_only 只裁不启** | `keep_only` 保留引擎但 enabled=False，必须再加 `engines:` 段显式 `disabled: false` |
| **校园网链路抖动** | scp 大文件可能中途 502 断，传完必须双端 md5 校验；tar 包打包也可能被中断，上传前 `gzip -t` 本地先验 |

## VPS 失联事件记录（2026-09-17）

- 14:41 SSH 正常（docker ps 可见网关全家桶）
- 14:44 起 ping/22/443/8443 全断，traceroute 死在第 5 跳
- 同网段 10.255.12.103 与 10.32.1.25 均正常 → 非本机网络问题，是 210 主机/网线/交换机口/断电
- **星语生产网关跑在这台机器上，失联期间对外服务全停**
- 恢复后第一步：`docker ps` 核对 5 容器 + `docker logs allomax-gateway --tail 50`
