#!/usr/bin/env bash
# AI PM 运维一键部署脚本。
# 使用方式：把脚本放到应用服务器后直接执行；换环境时通过同名环境变量覆盖下方默认值，不需要改部署流程。

set -Eeuo pipefail

# ===== 运维可覆盖的默认配置 =====
# 这些值是非敏感部署参数，可以随脚本进入仓库；真正的数据库、飞书、AI 和 COS 密钥统一放到 RUNTIME_ENV_FILE。
: "${APP_NAME:=ai-pm}"
: "${REPO_URL:=https://github.com/liushurui666/ai-pm.git}"
: "${GIT_BRANCH:=main}"
: "${APP_ROOT:=/srv/ai-pm}"
: "${APP_PORT:=3003}"
: "${RUNTIME_ENV_FILE:=/etc/ai-pm/ai-pm.env}"
: "${RESTART_STRATEGY:=systemd}"
: "${SYSTEMD_SERVICE:=ai-pm}"
: "${PM2_PROCESS_NAME:=ai-pm}"
: "${CUSTOM_RESTART_COMMAND:=}"
: "${KEEP_RELEASES:=5}"
: "${RUN_INSTALL:=1}"
: "${RUN_MIGRATE:=1}"
: "${RUN_AUTH_MIGRATE:=${RUN_AUTH_MIGRATIONS:-0}}"
: "${RUN_BUILD:=1}"
: "${BEFORE_DEPLOY_HOOK:=}"
: "${AFTER_DEPLOY_HOOK:=}"

log() {
  printf '[ops-deploy] %s\n' "$*"
}

fail() {
  printf '[ops-deploy][error] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "服务器缺少命令：$1"
}

check_runtime_env_file() {
  [[ -f "${RUNTIME_ENV_FILE}" ]] || fail "缺少运行时环境变量文件：${RUNTIME_ENV_FILE}。请先按 scripts/runtime.env.example 准备。"

  # 部署前只校验最小启动条件；飞书、AI、COS 可以按功能逐步打开，但业务 MySQL、外部认证库连接串和 Better Auth 密钥是生产启动底线。
  grep -Eq '^DATABASE_URL=.+' "${RUNTIME_ENV_FILE}" || fail "${RUNTIME_ENV_FILE} 缺少 DATABASE_URL"
  grep -Eq '^AUTH_DATABASE_URL=.+' "${RUNTIME_ENV_FILE}" || fail "${RUNTIME_ENV_FILE} 缺少 AUTH_DATABASE_URL"
  grep -Eq '^BETTER_AUTH_SECRET=.+' "${RUNTIME_ENV_FILE}" || fail "${RUNTIME_ENV_FILE} 缺少 BETTER_AUTH_SECRET"
}

run_hook() {
  local hook_path="$1"
  local release_dir="$2"
  local current_dir="$3"
  local shared_dir="$4"

  if [[ -n "${hook_path}" ]]; then
    [[ -x "${hook_path}" ]] || fail "钩子脚本不存在或不可执行：${hook_path}"
    # 内部运维脚本只通过环境变量拿上下文，方便热插拔到健康检查、Nginx reload、通知等平台流程。
    RELEASE_DIR="${release_dir}" CURRENT_DIR="${current_dir}" SHARED_DIR="${shared_dir}" APP_NAME="${APP_NAME}" APP_PORT="${APP_PORT}" "${hook_path}"
  fi
}

restart_app() {
  local release_dir="$1"
  local current_dir="$2"
  local shared_dir="$3"

  case "${RESTART_STRATEGY}" in
    systemd)
      log "重启 systemd 服务：${SYSTEMD_SERVICE}"
      sudo systemctl restart "${SYSTEMD_SERVICE}"
      sudo systemctl --no-pager --full status "${SYSTEMD_SERVICE}" >/dev/null
      ;;
    pm2)
      require_command pm2
      log "使用 pm2 重启：${PM2_PROCESS_NAME}"
      cd "${current_dir}"
      PORT="${APP_PORT}" pm2 startOrRestart npm --name "${PM2_PROCESS_NAME}" -- start
      ;;
    custom)
      [[ -n "${CUSTOM_RESTART_COMMAND}" ]] || fail "RESTART_STRATEGY=custom 时必须提供 CUSTOM_RESTART_COMMAND"
      log "执行自定义重启命令"
      RELEASE_DIR="${release_dir}" CURRENT_DIR="${current_dir}" SHARED_DIR="${shared_dir}" APP_NAME="${APP_NAME}" APP_PORT="${APP_PORT}" bash -lc "${CUSTOM_RESTART_COMMAND}"
      ;;
    none)
      log "跳过重启，由外部发布系统接管"
      ;;
    *)
      fail "未知重启策略：${RESTART_STRATEGY}"
      ;;
  esac
}

prune_old_releases() {
  local releases_dir="$1"
  local old_releases

  old_releases="$(find "${releases_dir}" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((KEEP_RELEASES + 1))" || true)"
  if [[ -n "${old_releases}" ]]; then
    while IFS= read -r old_release; do
      [[ -n "${old_release}" ]] && rm -rf "${old_release}"
    done <<< "${old_releases}"
  fi
}

main() {
  require_command git
  require_command node
  require_command pnpm
  check_runtime_env_file

  local releases_dir="${APP_ROOT}/releases"
  local shared_dir="${APP_ROOT}/shared"
  local current_dir="${APP_ROOT}/current"

  mkdir -p "${releases_dir}" "${shared_dir}"
  ln -sfn "${RUNTIME_ENV_FILE}" "${shared_dir}/.env.production"

  local commit_sha
  commit_sha="$(git ls-remote "${REPO_URL}" "refs/heads/${GIT_BRANCH}" | awk '{print $1}')"
  [[ -n "${commit_sha}" ]] || fail "无法读取远端分支：${REPO_URL} ${GIT_BRANCH}"

  local release_name
  release_name="$(date +%Y%m%d%H%M%S)-${commit_sha:0:7}"
  local release_dir="${releases_dir}/${release_name}"

  if [[ -d "${release_dir}" ]]; then
    log "当前提交已存在 release：${release_dir}"
  else
    log "拉取代码：${REPO_URL}#${GIT_BRANCH}"
    git clone --depth 1 --branch "${GIT_BRANCH}" "${REPO_URL}" "${release_dir}"
  fi

  ln -sfn "${RUNTIME_ENV_FILE}" "${release_dir}/.env.production"
  ln -sfn "${RUNTIME_ENV_FILE}" "${release_dir}/.env"

  run_hook "${BEFORE_DEPLOY_HOOK}" "${release_dir}" "${current_dir}" "${shared_dir}"

  cd "${release_dir}"
  # 显式导出运行时变量，确保 Better Auth 认证库检查和 Next build 读取同一份配置。
  set -a
  # shellcheck disable=SC1090
  source "${RUNTIME_ENV_FILE}"
  set +a
  export NODE_ENV=production
  export PORT="${APP_PORT}"

  if [[ "${RUN_INSTALL}" == "1" ]]; then
    log "安装依赖"
    pnpm install --frozen-lockfile
  fi

  if [[ "${RUN_MIGRATE}" == "1" ]]; then
    log "执行业务数据库迁移"
    pnpm db:migrate
  fi

  if [[ "${RUN_AUTH_MIGRATE}" == "1" ]]; then
    # 认证 PostgreSQL 属于外部已部署依赖，默认不随 AI PM 发布操作；只有认证平台 schema 需要升级时才打开。
    log "执行 Better Auth 认证数据库迁移"
    pnpm auth-db:migrate
    pnpm auth-db:doctor
  fi

  if [[ "${RUN_BUILD}" == "1" ]]; then
    log "构建 Next.js 应用"
    pnpm build
  fi

  ln -sfn "${release_dir}" "${current_dir}"
  restart_app "${release_dir}" "${current_dir}" "${shared_dir}"
  run_hook "${AFTER_DEPLOY_HOOK}" "${release_dir}" "${current_dir}" "${shared_dir}"
  prune_old_releases "${releases_dir}"

  log "部署完成：${APP_NAME} -> ${release_dir}"
}

main "$@"
