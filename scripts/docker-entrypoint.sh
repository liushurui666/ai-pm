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

if [ -z "${SESSION_SECRET:-}" ]; then
  echo "[docker-entrypoint][error] 缺少 SESSION_SECRET，生产会话无法安全签名。" >&2
  exit 1
fi

if [ "${NODE_ENV:-production}" = "production" ]; then
  if [ -z "${APP_URL:-}" ]; then
    echo "[docker-entrypoint][error] 缺少 APP_URL。生产登录跳转必须配置公网域名，例如 https://ai-pm.chainthink.cn。" >&2
    exit 1
  fi

  if is_local_url "${APP_URL}"; then
    echo "[docker-entrypoint][error] APP_URL 不能是 localhost，否则飞书登录后会跳回用户本机。" >&2
    exit 1
  fi

  if [ -n "${FEISHU_REDIRECT_URI:-}" ] && is_local_url "${FEISHU_REDIRECT_URI}"; then
    echo "[docker-entrypoint][error] FEISHU_REDIRECT_URI 仍指向 localhost。请改为 ${APP_URL}/api/auth/feishu/callback，并同步到飞书开放平台。" >&2
    exit 1
  fi
fi

if [ "${RUN_MIGRATIONS}" = "1" ]; then
  # 迁移放到容器启动阶段，运维只需要更新镜像并重启容器；如果由独立发布系统统一迁移，可设置 RUN_MIGRATIONS=0。
  echo "[docker-entrypoint] 执行数据库迁移"
  pnpm db:migrate
fi

echo "[docker-entrypoint] 启动应用：$*"
exec "$@"
