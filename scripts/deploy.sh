#!/usr/bin/env bash
# AI PM 标准远程部署脚本。
# 设计目标：运维只改环境变量，不改脚本主体；同一套脚本可通过 DEPLOY_ENV_FILE 切换到测试、预发、生产或其他服务器。

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_DEPLOY_ENV_FILE="${ROOT_DIR}/scripts/deploy.env"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-${DEFAULT_DEPLOY_ENV_FILE}}"

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy][error] %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  local env_file="$1"

  if [[ -f "${env_file}" ]]; then
    # 部署配置通过 shell env 文件注入，便于运维系统按环境生成；allexport 可以让远端命令自然读取这些变量。
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
    log "已加载部署配置：${env_file}"
  elif [[ "${env_file}" != "${DEFAULT_DEPLOY_ENV_FILE}" ]]; then
    fail "指定的 DEPLOY_ENV_FILE 不存在：${env_file}"
  else
    log "未找到默认配置 scripts/deploy.env，将只使用当前 shell 环境变量。"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || fail "缺少环境变量：${name}"
}

shell_quote() {
  printf '%q' "$1"
}

build_ssh_command() {
  SSH_COMMAND=(ssh -p "${DEPLOY_SSH_PORT:-22}")

  if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
    SSH_COMMAND+=(-i "${DEPLOY_SSH_KEY}")
  fi

  if [[ -n "${DEPLOY_SSH_OPTIONS:-}" ]]; then
    # DEPLOY_SSH_OPTIONS 预留给内网跳板机、StrictHostKeyChecking 等场景；拆词交给 shell，保持运维侧可插拔。
    # shellcheck disable=SC2206
    local extra_options=(${DEPLOY_SSH_OPTIONS})
    SSH_COMMAND+=("${extra_options[@]}")
  fi
}

remote_run() {
  "${SSH_COMMAND[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"
}

upload_runtime_env() {
  local shared_dir="$1"
  local runtime_name="$2"
  local runtime_source="${DEPLOY_RUNTIME_ENV_SOURCE:-}"

  if [[ -n "${runtime_source}" ]]; then
    [[ -f "${runtime_source}" ]] || fail "DEPLOY_RUNTIME_ENV_SOURCE 指向的文件不存在：${runtime_source}"
    # 运行时密钥单独上传到 shared，不进入 release 包，避免回滚或代码包里混入数据库密码。
    remote_run "mkdir -p $(shell_quote "${shared_dir}")"
    rsync "${RSYNC_SSH_ARGS[@]}" --chmod=F600 "${runtime_source}" "${DEPLOY_USER}@${DEPLOY_HOST}:$(shell_quote "${shared_dir}/${runtime_name}")"
    log "已上传运行时环境变量到 shared/${runtime_name}"
  else
    log "未设置 DEPLOY_RUNTIME_ENV_SOURCE，将复用服务器上的 shared/${runtime_name}"
  fi
}

create_release_archive() {
  local archive_path="$1"

  # 用 git archive 只打包受版本控制的文件，天然排除 .env.local、node_modules、.next 和本地截图等临时资产。
  git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "当前目录不是 Git 仓库：${ROOT_DIR}"
  git -C "${ROOT_DIR}" archive --format=tar HEAD | gzip -9 > "${archive_path}"
  log "已生成发布包：${archive_path}"
}

remote_deploy_release() {
  local release_name="$1"
  local target_dir="$2"
  local runtime_name="$3"
  local archive_remote_path="$4"
  local app_name="${DEPLOY_APP_NAME:-ai-pm}"
  local app_port="${DEPLOY_PORT:-3003}"
  local keep_releases="${DEPLOY_KEEP_RELEASES:-5}"
  local run_install="${DEPLOY_RUN_INSTALL:-1}"
  local run_migrate="${DEPLOY_RUN_MIGRATE:-1}"
  local run_auth_migrate="${DEPLOY_RUN_AUTH_MIGRATE:-0}"
  local run_build="${DEPLOY_RUN_BUILD:-1}"
  local restart_strategy="${DEPLOY_RESTART_STRATEGY:-systemd}"
  local systemd_service="${DEPLOY_SYSTEMD_SERVICE:-${app_name}}"
  local restart_command="${DEPLOY_RESTART_COMMAND:-}"
  local before_script="${DEPLOY_BEFORE_REMOTE_SCRIPT:-}"
  local after_script="${DEPLOY_AFTER_REMOTE_SCRIPT:-}"

  remote_run bash -s -- \
    "${release_name}" \
    "${target_dir}" \
    "${runtime_name}" \
    "${archive_remote_path}" \
    "${app_name}" \
    "${app_port}" \
    "${keep_releases}" \
    "${run_install}" \
    "${run_migrate}" \
    "${run_auth_migrate}" \
    "${run_build}" \
    "${restart_strategy}" \
    "${systemd_service}" \
    "${restart_command}" \
    "${before_script}" \
    "${after_script}" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

release_name="$1"
target_dir="$2"
runtime_name="$3"
archive_path="$4"
app_name="$5"
app_port="$6"
keep_releases="$7"
run_install="$8"
run_migrate="$9"
run_auth_migrate="${10}"
run_build="${11}"
restart_strategy="${12}"
systemd_service="${13}"
restart_command="${14}"
before_script="${15}"
after_script="${16}"

releases_dir="${target_dir}/releases"
shared_dir="${target_dir}/shared"
current_dir="${target_dir}/current"
release_dir="${releases_dir}/${release_name}"
runtime_env_file="${shared_dir}/${runtime_name}"

remote_log() {
  printf '[remote-deploy] %s\n' "$*"
}

remote_fail() {
  printf '[remote-deploy][error] %s\n' "$*" >&2
  exit 1
}

run_hook() {
  local hook_path="$1"

  if [[ -n "${hook_path}" ]]; then
    [[ -x "${hook_path}" ]] || remote_fail "钩子脚本不存在或不可执行：${hook_path}"
    # 钩子只通过环境变量拿上下文，避免脚本和公司内部运维平台强绑定。
    RELEASE_DIR="${release_dir}" CURRENT_DIR="${current_dir}" SHARED_DIR="${shared_dir}" APP_NAME="${app_name}" APP_PORT="${app_port}" "${hook_path}"
  fi
}

command -v tar >/dev/null 2>&1 || remote_fail "服务器缺少 tar"
command -v node >/dev/null 2>&1 || remote_fail "服务器缺少 node"
command -v pnpm >/dev/null 2>&1 || remote_fail "服务器缺少 pnpm，请先安装或启用 corepack"

mkdir -p "${releases_dir}" "${shared_dir}" "${release_dir}"
[[ -f "${runtime_env_file}" ]] || remote_fail "缺少运行时环境变量文件：${runtime_env_file}"

tar -xzf "${archive_path}" -C "${release_dir}"
ln -sfn "${runtime_env_file}" "${release_dir}/${runtime_name}"
# Next 和 Prisma 默认会读 .env/.env.local/.env.production；这里额外挂 .env，兼容服务器上直接执行 pnpm start 的场景。
ln -sfn "${runtime_env_file}" "${release_dir}/.env"

run_hook "${before_script}"

cd "${release_dir}"
set -a
# Unified Auth CLI 直接执行 unified-auth.config.ts，不会自动加载 .env；远端迁移和构建前必须先导出运行时变量。
# shellcheck disable=SC1090
source "${runtime_env_file}"
set +a
export NODE_ENV=production
export PORT="${app_port}"

if [[ "${run_install}" == "1" ]]; then
  remote_log "安装依赖"
  pnpm install --frozen-lockfile
fi

if [[ "${run_migrate}" == "1" ]]; then
  remote_log "执行 Prisma 业务数据库迁移"
  pnpm db:migrate
fi

if [[ "${run_auth_migrate}" == "1" ]]; then
  # 认证 PostgreSQL 由外部认证平台/基础设施提前部署；这里默认不触碰，只有认证 schema 需要升级时才执行。
  remote_log "执行 Unified Auth 认证数据库迁移"
  pnpm exec unified-auth db migrate
  pnpm exec unified-auth doctor
fi

if [[ "${run_build}" == "1" ]]; then
  remote_log "构建 Next.js 应用"
  pnpm build
fi

ln -sfn "${release_dir}" "${current_dir}"

case "${restart_strategy}" in
  systemd)
    remote_log "重启 systemd 服务：${systemd_service}"
    sudo systemctl restart "${systemd_service}"
    sudo systemctl --no-pager --full status "${systemd_service}" >/dev/null
    ;;
  pm2)
    command -v pm2 >/dev/null 2>&1 || remote_fail "服务器缺少 pm2"
    remote_log "使用 pm2 重启：${app_name}"
    if [[ -n "${restart_command}" ]]; then
      bash -lc "${restart_command}"
    else
      PORT="${app_port}" pm2 startOrRestart npm --name "${app_name}" -- start
    fi
    ;;
  custom)
    [[ -n "${restart_command}" ]] || remote_fail "DEPLOY_RESTART_STRATEGY=custom 时必须提供 DEPLOY_RESTART_COMMAND"
    remote_log "执行自定义重启命令"
    RELEASE_DIR="${release_dir}" CURRENT_DIR="${current_dir}" SHARED_DIR="${shared_dir}" APP_NAME="${app_name}" APP_PORT="${app_port}" bash -lc "${restart_command}"
    ;;
  none)
    remote_log "跳过重启，由外部编排系统接管"
    ;;
  *)
    remote_fail "未知重启策略：${restart_strategy}"
    ;;
esac

run_hook "${after_script}"

remote_log "清理旧版本，仅保留最近 ${keep_releases} 个 release"
old_releases="$(find "${releases_dir}" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +"$((keep_releases + 1))" || true)"
if [[ -n "${old_releases}" ]]; then
  while IFS= read -r old_release; do
    [[ -n "${old_release}" ]] && rm -rf "${old_release}"
  done <<< "${old_releases}"
fi
rm -f "${archive_path}"

remote_log "部署完成：${release_dir}"
REMOTE_SCRIPT
}

main() {
  load_env_file "${DEPLOY_ENV_FILE}"
  require_command git
  require_command gzip
  require_command rsync
  require_command ssh
  require_env DEPLOY_HOST
  require_env DEPLOY_USER
  require_env DEPLOY_TARGET_DIR

  build_ssh_command
  RSYNC_SSH_ARGS=(-e "${SSH_COMMAND[*]}")

  local release_name="${DEPLOY_RELEASE_NAME:-$(date +%Y%m%d%H%M%S)-$(git -C "${ROOT_DIR}" rev-parse --short HEAD)}"
  local runtime_name="${DEPLOY_RUNTIME_ENV_NAME:-.env.production}"
  local archive_path
  local remote_archive_path="${DEPLOY_TARGET_DIR}/releases/${release_name}.tar.gz"
  archive_path="$(mktemp -t ai-pm-release.XXXXXX.tar.gz)"

  trap 'rm -f "${archive_path}"' EXIT

  create_release_archive "${archive_path}"
  remote_run "mkdir -p $(shell_quote "${DEPLOY_TARGET_DIR}/releases") $(shell_quote "${DEPLOY_TARGET_DIR}/shared")"
  upload_runtime_env "${DEPLOY_TARGET_DIR}/shared" "${runtime_name}"
  rsync "${RSYNC_SSH_ARGS[@]}" "${archive_path}" "${DEPLOY_USER}@${DEPLOY_HOST}:$(shell_quote "${remote_archive_path}")"
  log "已上传发布包到 ${DEPLOY_HOST}:${remote_archive_path}"
  remote_deploy_release "${release_name}" "${DEPLOY_TARGET_DIR}" "${runtime_name}" "${remote_archive_path}"
}

main "$@"
