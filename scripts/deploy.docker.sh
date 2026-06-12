#!/usr/bin/env bash
# AI PM Docker 一键部署脚本。
# 适用场景：运维在目标服务器直接执行本脚本，脚本会拉取公开 GitHub 仓库、构建 Docker 镜像、启动容器并等待健康检查。
# 换服务器、换端口、换环境变量文件时，只需要覆盖下方同名环境变量，不需要修改脚本主体。

set -Eeuo pipefail

# ===== 可热插拔覆盖的部署参数 =====
# 非敏感参数可以写在这里；数据库、飞书、AI、COS 等密钥只从 AI_PM_ENV_FILE 指向的运行时 env 文件读取。
: "${APP_NAME:=ai-pm}"
: "${REPO_URL:=https://github.com/liushurui666/ai-pm.git}"
: "${GIT_BRANCH:=main}"
: "${DEPLOY_ROOT:=/srv/ai-pm}"
: "${SOURCE_DIR:=${DEPLOY_ROOT}/source}"
: "${AI_PM_ENV_FILE:=/etc/ai-pm/ai-pm.env}"
: "${AI_PM_IMAGE:=ai-pm:latest}"
: "${AI_PM_CONTAINER_NAME:=ai-pm}"
: "${AI_PM_WORKER_CONTAINER_NAME:=ai-pm-index-worker}"
: "${AI_PM_HOST_PORT:=3003}"
: "${AI_PM_CONTAINER_PORT:=3003}"
: "${REDIS_IMAGE:=redis:7-alpine}"
: "${REDIS_CONTAINER_NAME:=ai-pm-redis}"
: "${QDRANT_IMAGE:=qdrant/qdrant:latest}"
: "${QDRANT_CONTAINER_NAME:=ai-pm-qdrant}"
: "${RUN_MIGRATIONS:=1}"
: "${RUN_AUTH_MIGRATIONS:=0}"
: "${COMPOSE_PROJECT_NAME:=ai-pm}"
: "${COMPOSE_SERVICE:=ai-pm}"
: "${COMPOSE_FILE:=deploy/docker/docker-compose.example.yml}"
: "${PULL_SOURCE:=1}"
: "${BUILD_PULL:=1}"
: "${WAIT_HEALTH:=1}"
: "${HEALTHCHECK_PATH:=/login}"
: "${HEALTHCHECK_TIMEOUT:=60}"
: "${PRUNE_DANGLING_IMAGES:=0}"

log() {
  printf '[docker-deploy] %s\n' "$*"
}

fail() {
  printf '[docker-deploy][error] %s\n' "$*" >&2
  exit 1
}

warn() {
  printf '[docker-deploy][warn] %s\n' "$*" >&2
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "服务器缺少命令：$1"
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi

  fail "服务器缺少 Docker Compose。请安装 docker compose 插件或 docker-compose。"
}

require_runtime_env() {
  local name="$1"

  grep -Eq "^${name}=.+" "${AI_PM_ENV_FILE}" || fail "${AI_PM_ENV_FILE} 缺少 ${name}"
}

validate_runtime_env_file() {
  [[ -f "${AI_PM_ENV_FILE}" ]] || fail "缺少运行时环境变量文件：${AI_PM_ENV_FILE}。请先按 scripts/runtime.env.example 准备。"

  # 这些是生产容器启动的硬性底线：业务 MySQL、外部认证库连接串、会话密钥和公网域名缺任何一个都会导致运行时异常或登录跳转错误。
  require_runtime_env APP_URL
  require_runtime_env DATABASE_URL
  require_runtime_env AUTH_DATABASE_URL
  require_runtime_env BETTER_AUTH_SECRET

  if grep -Eq '^APP_URL=http://(localhost|127\.0\.0\.1|\[::1\])' "${AI_PM_ENV_FILE}"; then
    fail "${AI_PM_ENV_FILE} 的 APP_URL 仍指向 localhost。生产部署必须填写公网域名，例如 https://ai-pm.chainthink.cn。"
  fi

  if ! grep -Eq '^DATABASE_URL=mysql://' "${AI_PM_ENV_FILE}"; then
    fail "${AI_PM_ENV_FILE} 的 DATABASE_URL 必须是 MySQL 连接串。"
  fi

  if ! grep -Eq '^AUTH_DATABASE_URL=(postgresql|postgres)://' "${AI_PM_ENV_FILE}"; then
    fail "${AI_PM_ENV_FILE} 的 AUTH_DATABASE_URL 必须指向已部署好的外部认证 PostgreSQL，不能复用业务 MySQL。"
  fi

  grep -Eq '^FEISHU_APP_ID=.+' "${AI_PM_ENV_FILE}" || warn "未配置 FEISHU_APP_ID，飞书登录入口会不可用。"
  grep -Eq '^AI_API_KEY=.+' "${AI_PM_ENV_FILE}" || warn "未配置 AI_API_KEY，AI 能力会走兜底逻辑或不可用。"
}

checkout_source() {
  mkdir -p "${DEPLOY_ROOT}"

  if [[ ! -d "${SOURCE_DIR}/.git" ]]; then
    log "首次拉取代码：${REPO_URL}#${GIT_BRANCH} -> ${SOURCE_DIR}"
    git clone --branch "${GIT_BRANCH}" "${REPO_URL}" "${SOURCE_DIR}"
    return
  fi

  log "检查已有源码目录：${SOURCE_DIR}"
  if [[ -n "$(git -C "${SOURCE_DIR}" status --porcelain)" ]]; then
    fail "${SOURCE_DIR} 存在本地未提交改动。部署脚本不会覆盖运维手工改动，请先处理后再执行。"
  fi

  if [[ "${PULL_SOURCE}" == "1" ]]; then
    log "更新代码到远端最新 ${GIT_BRANCH}"
    git -C "${SOURCE_DIR}" fetch origin "${GIT_BRANCH}"
    git -C "${SOURCE_DIR}" checkout "${GIT_BRANCH}"
    git -C "${SOURCE_DIR}" pull --ff-only origin "${GIT_BRANCH}"
  else
    log "跳过 git pull，使用服务器当前源码。"
  fi
}

deploy_with_compose() {
  cd "${SOURCE_DIR}"
  [[ -f "${COMPOSE_FILE}" ]] || fail "找不到 compose 文件：${SOURCE_DIR}/${COMPOSE_FILE}"

  # Compose 变量插值只读取当前 shell 环境或 compose 所在目录的 .env，不会读取 env_file；
  # 因此这里显式 export，让同一个 compose 文件能热插拔到不同端口、不同镜像名和不同 env 文件。
  export AI_PM_ENV_FILE
  export AI_PM_IMAGE
  export AI_PM_CONTAINER_NAME
  export AI_PM_WORKER_CONTAINER_NAME
  export AI_PM_HOST_PORT
  export AI_PM_CONTAINER_PORT
  export REDIS_IMAGE
  export REDIS_CONTAINER_NAME
  export QDRANT_IMAGE
  export QDRANT_CONTAINER_NAME
  export RUN_MIGRATIONS
  export RUN_AUTH_MIGRATIONS
  export COMPOSE_PROJECT_NAME

  if [[ "${BUILD_PULL}" == "1" ]]; then
    log "构建镜像并拉取最新基础镜像：${AI_PM_IMAGE}"
    compose_cmd -f "${COMPOSE_FILE}" build --pull
  else
    log "构建镜像：${AI_PM_IMAGE}"
    compose_cmd -f "${COMPOSE_FILE}" build
  fi

  log "启动容器：${AI_PM_CONTAINER_NAME} (${AI_PM_HOST_PORT}->${AI_PM_CONTAINER_PORT})"
  compose_cmd -f "${COMPOSE_FILE}" up -d --remove-orphans

  log "当前容器状态"
  compose_cmd -f "${COMPOSE_FILE}" ps
}

wait_for_health() {
  [[ "${WAIT_HEALTH}" == "1" ]] || return 0

  if ! command -v curl >/dev/null 2>&1; then
    warn "服务器缺少 curl，跳过 HTTP 健康检查。"
    return 0
  fi

  local url="http://127.0.0.1:${AI_PM_HOST_PORT}${HEALTHCHECK_PATH}"
  local started_at
  started_at="$(date +%s)"

  log "等待应用可访问：${url}"
  while true; do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "健康检查通过：${url}"
      return 0
    fi

    if (( $(date +%s) - started_at >= HEALTHCHECK_TIMEOUT )); then
      warn "健康检查超时，输出最近容器日志帮助排查。"
      cd "${SOURCE_DIR}"
      compose_cmd -f "${COMPOSE_FILE}" logs --tail=80 "${COMPOSE_SERVICE}" || true
      fail "应用在 ${HEALTHCHECK_TIMEOUT}s 内未通过健康检查。"
    fi

    sleep 2
  done
}

prune_images() {
  if [[ "${PRUNE_DANGLING_IMAGES}" == "1" ]]; then
    # 只清理悬空镜像，不动有 tag 的历史镜像，避免误删其他业务正在使用的镜像。
    log "清理悬空镜像"
    docker image prune -f
  fi
}

main() {
  require_command git
  require_command docker
  validate_runtime_env_file
  checkout_source
  deploy_with_compose
  wait_for_health
  prune_images
  log "部署完成：${APP_NAME}，源码 ${SOURCE_DIR}，运行时 env ${AI_PM_ENV_FILE}"
}

main "$@"
