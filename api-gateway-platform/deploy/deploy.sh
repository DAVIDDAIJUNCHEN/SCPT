#!/usr/bin/env bash
# ============================================================
# 川邮·星语 API 网关 — 一键部署脚本（第三方傻瓜式部署）
# 用法：
#   chmod +x deploy.sh
#   ./deploy.sh            # 默认自动构建 + 启动
#   ./deploy.sh --build    # 仅构建镜像
#   ./deploy.sh --up       # 仅启动(docker compose up)
#   ./deploy.sh --init     # 引导初始化管理员 + 配置提示
#   ./deploy.sh --smoke    # 冒烟测试(健康检查 + 平台状态)
# 前置：已安装 docker + docker compose (v2)，可选数据盘
# ============================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/deploy/docker-compose.prod.yml"
ENV_EXAMPLE="$REPO_DIR/deploy/.env.example"
DATA_DIR="${DATA_DIR:-/data/allomax}"
IMAGE_TAG="allomax-gateway:commercial"

log()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn() { echo -e "\033[1;33m[deploy]\033[0m $*"; }
die()  { echo -e "\033[1;31m[deploy]\033[0m $*" >&2; exit 1; }

# ---------- 前置检查 ----------
require_docker() {
  command -v docker >/dev/null 2>&1 || die "未检测到 docker，请先安装：curl -fsSL https://get.docker.com | bash"
  docker compose version >/dev/null 2>&1 || die "需要 docker compose v2，请升级 docker"
}

setup_env() {
  mkdir -p "$DATA_DIR"
  if [ ! -f "$DATA_DIR/.env" ]; then
    cp "$ENV_EXAMPLE" "$DATA_DIR/.env" || die "复制 .env 失败"
    warn "已生成 $DATA_DIR/.env"
    warn "⚠️  请编辑 $DATA_DIR/.env，至少修改以下强随机值："
    warn "    SESSION_SECRET、POSTGRES_PASSWORD、REDIS_PASSWORD"
    warn "    生成建议：openssl rand -hex 32 / openssl rand -base64 18"
    warn "    短信：SMS_PROVIDER=mock 先跑通，接真实短信再改 aliyun 并配 AK/签名"
    warn "    如需一键生成随机密钥，可运行： ./deploy.sh --gen-secrets"
  fi
}

gen_secrets() {
  local env="$DATA_DIR/.env"
  [ -f "$env" ] || die "没有 $env，先运行 ./deploy.sh"
  local s=$(openssl rand -hex 32)
  local p=$(openssl rand -base64 18 | tr '/+' '_-')
  local r=$(openssl rand -base64 18 | tr '/+' '_-')
  sed -i.bak -E "s|^SESSION_SECRET=.*|SESSION_SECRET=$s|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$p|; s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$r|" "$env"
  log "已生成随机密钥并写入 .env（备份在 .env.bak）"
}

build() {
  log "构建镜像 $IMAGE_TAG ..."
  ( cd "$REPO_DIR" && docker build -f deploy/Dockerfile.commercial -t "$IMAGE_TAG" . )
  log "镜像构建完成"
}

up() {
  setup_env
  log "启动服务 (DATA_DIR=$DATA_DIR) ..."
  ( cd "$DATA_DIR" && cp "$COMPOSE_FILE" ./docker-compose.prod.yml && \
    docker compose -f docker-compose.prod.yml up -d )
  log "服务已启动，等待健康检查..."
  sleep 15
  docker compose -f "$DATA_DIR/docker-compose.prod.yml" ps
}

smoke() {
  local port="${PORT:-3000}"
  log "冒烟测试：平台状态 http://127.0.0.1:$port/api/status"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/api/status" || true)
  [ "$code" = "200" ] && log "✅ 平台正常 (HTTP $code)" || warn "⚠️  平台状态异常 (HTTP $code)"
  echo "   请在浏览器打开 http://<服务器IP>:$port 完成管理员初始化向导"
}

init_wizard() {
  local port="${PORT:-3000}"
  log "管理员初始化指引："
  echo "  1. 浏览器打开 http://<服务器IP>:$port → 自动跳转初始化页"
  echo "  2. 或命令行："
  echo "     curl -X POST http://127.0.0.1:$port/api/setup \\"
  echo "       -H 'Content-Type: application/json' \\"
  echo "       -d '{\"username\":\"admin\",\"password\":\"<强密码>\",\"confirmPassword\":\"<强密码>\"}'"
  warn "初始化后登录控制台 → 系统设置 → 按需配置渠道/定价/令牌"
}

MODE="${1:---all}"
require_docker
case "$MODE" in
  --build) build ;;
  --up) up ;;
  --init) init_wizard ;;
  --smoke) smoke ;;
  --gen-secrets) gen_secrets ;;
  --all)
    build
    up
    smoke
    init_wizard
    ;;
  -h|--help)
    echo "用法: ./deploy.sh [--build|--up|--init|--smoke|--gen-secrets|--all]"
    ;;
  *) die "未知参数: $MODE (参考 ./deploy.sh --help)" ;;
esac
