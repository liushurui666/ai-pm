#!/usr/bin/env sh
# 容器启动入口：统一做生产必需变量检查和数据库迁移，然后再启动 Next 服务。

set -eu

RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

is_local_url() {
  case "$1" in
    http://localhost*|http://127.0.0.1*|http://[::1]*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[docker-entrypoint][error] 缺少 DATABASE_URL，容器不会回退到本地数据库。" >&2
  exit 1
fi

if [ -z "${AUTH_DATABASE_URL:-}" ]; then
  echo "[docker-entrypoint][error] 缺少 AUTH_DATABASE_URL，Unified Auth 认证表需要独立 PostgreSQL。" >&2
  exit 1
fi

if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
  echo "[docker-entrypoint][error] 缺少 BETTER_AUTH_SECRET，Better Auth 会话无法安全签名。" >&2
  exit 1
fi

if [ "${NODE_ENV:-production}" = "production" ]; then
  if [ -z "${APP_URL:-}" ]; then
    echo "[docker-entrypoint][warn] 缺少 APP_URL。建议配置公网域名，例如 https://ai-pm.chainthink.cn，避免反向代理下登录跳转异常。" >&2
  fi

  if [ -n "${APP_URL:-}" ] && is_local_url "${APP_URL}"; then
    echo "[docker-entrypoint][warn] APP_URL 当前是 localhost，生产登录跳转可能回到用户本机。" >&2
  fi

  echo "[docker-entrypoint] 请确认 OAuth 控制台已配置 Better Auth 标准回调：/api/auth/oauth2/callback/feishu、/api/auth/callback/google、/api/auth/callback/github"
fi

if [ "${RUN_MIGRATIONS}" = "1" ]; then
  # 业务库和认证库边界不同：Prisma 只管理 AI PM 的 MySQL 业务表，Unified Auth CLI 只管理 Better Auth PostgreSQL 表。
  # 两个迁移都放到容器启动阶段，运维更新镜像并重启即可；如由独立发布系统统一迁移，可设置 RUN_MIGRATIONS=0。
  echo "[docker-entrypoint] 执行业务数据库迁移"
  pnpm db:migrate
  echo "[docker-entrypoint] 执行 Unified Auth 认证数据库迁移"
  pnpm exec unified-auth db migrate
  pnpm exec unified-auth doctor
fi

echo "[docker-entrypoint] 启动应用：$*"
exec "$@"
