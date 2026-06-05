# AI PM

一个基于 Next.js、React、TypeScript 和 Ant Design 的 AI 项目管理平台。

## 本地开发

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

默认访问 `http://localhost:3004`。当前 `pnpm dev` 固定使用 3004，统一认证登录页和 `/api/auth/*` 也挂在同一个 origin 下。

本地开发使用本机 MySQL 保存 AI PM 业务数据。当前默认连接串为：

```txt
DATABASE_URL=mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm
```

如果本机还没有库，可以用 MySQL 管理员账号执行一次：

```bash
mysql -h 127.0.0.1 -P 3306 -uroot -p -e "CREATE DATABASE IF NOT EXISTS ai_pm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -h 127.0.0.1 -P 3306 -uroot -p -e "CREATE USER IF NOT EXISTS 'ai_pm'@'%' IDENTIFIED BY 'ai_pm_local'; GRANT ALL PRIVILEGES ON ai_pm.* TO 'ai_pm'@'%'; FLUSH PRIVILEGES;"
pnpm db:migrate
```

`prisma.config.ts` 会优先读取 `.env.local`，本地没有配置 `DATABASE_URL` 时会回退到上面的本机 MySQL 地址；生产环境必须显式配置 `DATABASE_URL`。腾讯云 MySQL 的连接串格式如下：

```txt
DATABASE_URL=mysql://用户名:密码@腾讯云MySQL地址:3306/数据库名
```

统一认证使用独立 PostgreSQL 保存 Better Auth 用户、账号、session 和验证码表。当前本地默认连接串为：

```txt
AUTH_DATABASE_URL=postgresql://ai_pm_auth:ai_pm_auth_local@localhost:5432/ai_pm_auth
```

如果本机还没有认证库，可以用 PostgreSQL 管理员账号执行一次：

```bash
createdb ai_pm_auth
createuser ai_pm_auth
psql -d ai_pm_auth -c "ALTER USER ai_pm_auth WITH PASSWORD 'ai_pm_auth_local';"
psql -d ai_pm_auth -c "GRANT ALL PRIVILEGES ON DATABASE ai_pm_auth TO ai_pm_auth;"
pnpm dlx @rc-tool/unified-auth-hosted-service db migrate
```

## 统一认证与协同集成

AI PM 使用 Unified Auth 黑盒认证。业务代码通过 `@rc-tool/unified-auth-sdk` 读取当前用户和会话，登录页、OAuth start/callback、session/context 接口由 `@rc-tool/unified-auth-hosted-service` 内嵌到 AI PM 自己的 Next.js 路由：

- `/login`
- `/logout`
- `/api/auth/*`

本地不需要额外启动认证服务；AI PM 自己只保留业务成员、权限、项目和任务数据，认证用户、OAuth 账号绑定、session 和 cookie 全部由 Better Auth 管理。

复制 `.env.example` 为 `.env.local`，先准备统一认证基础配置：

```bash
cp .env.example .env.local
```

本地常用配置：

```txt
APP_URL=http://localhost:3004
NEXT_PUBLIC_APP_URL=http://localhost:3004
DATABASE_URL=mysql://ai_pm:ai_pm_local@localhost:3306/ai_pm
AUTH_DATABASE_URL=postgresql://ai_pm_auth:ai_pm_auth_local@localhost:5432/ai_pm_auth
BETTER_AUTH_SECRET=本地随机密钥
```

AI PM 已提交 `unified-auth.config.ts`，CLI 会直接读取这份配置，不再通过一串命令参数生成 env：

```bash
pnpm dlx @rc-tool/unified-auth-hosted-service db migrate
pnpm dlx @rc-tool/unified-auth-hosted-service doctor
```

真实 OAuth provider 按需配置，内嵌 Unified Auth 登录和飞书通讯录/机器人能力会复用这组飞书企业内部应用：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `APP_URL`，生产环境填写公网访问地址，例如 `https://ai-pm.chainthink.cn`

需求模块权限由站内“成员管理”维护，并按工作区生效。配置 Unified Auth 后，首个进入某个工作区的用户会自动成为该工作区 `owner`，后续首次进入的用户会作为 `viewer` 只读成员登记，再由 `owner / admin` 调整角色；`owner / admin / productAdmin` 可以删除需求和版本，`productMember` 可以创建和编辑但不能删除，`viewer` 只读。

飞书开放平台里需要把 Better Auth 标准回调 URL 配到应用的重定向 URL，例如：

```txt
http://localhost:3004/api/auth/oauth2/callback/feishu
```

生产环境不要继续使用 localhost，公网部署应配置成：

```txt
APP_URL=https://ai-pm.chainthink.cn
https://ai-pm.chainthink.cn/api/auth/oauth2/callback/feishu
```

Google 和 GitHub 使用 Better Auth 内置回调路径：

```txt
https://ai-pm.chainthink.cn/api/auth/callback/google
https://ai-pm.chainthink.cn/api/auth/callback/github
```

如果站点前面有 Nginx、负载均衡或网关，也要透传 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`，否则服务端只能看到容器内地址，登录成功后就可能跳回 `localhost:3003`。

Docker 生产容器启动时会对公网地址变量打印警告，但不会因为飞书配置错误直接退出；登录错误由 Unified Auth 登录页统一展示。

项目管理主数据不写入飞书云文档。AI PM 平台会把项目、任务、风险、需求、文档、洞察、Bug 和 AI 修复任务保存到 MySQL；首次启动时如果数据库为空，系统会从内置种子数据初始化。后续通过“新建项目 / 新建任务 / 登记风险 / 新建需求 / 新建文档 / 登记 Bug”创建的记录会由站内 API 持久化到数据库，刷新页面后仍然保留。

飞书只承担三件事：

- Unified Auth 登录，确保用户来自已配置的企业 OAuth provider。
- 通讯录负责人选择，保存负责人 `open_id / user_id / union_id / email` 到站内记录。
- 根据成员管理里的通知开关，通过飞书机器人给负责人发送通知。

飞书应用需要开通并发布这些能力：

- 飞书 OAuth 登录与用户信息读取
- 通讯录部门读取、通讯录用户读取
- 机器人发送消息

负责人下拉框能展示哪些人，取决于飞书开放平台里“通讯录权限范围”。如果只看到自己，需要把应用的通讯录权限范围调整为全员或目标部门，并重新发布应用。

如果未配置真实 OAuth，登录页只会展示 provider 入口但无法完成第三方授权；本地联调需要至少配置一个真实的 Feishu / Google / GitHub provider。

## AI 助手模型配置

AI 项目助手支持 OpenAI-compatible 的 Chat Completions 接口。把模型密钥放在 `.env.local` 或部署平台环境变量中：

```txt
AI_API_KEY=sk_xxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

`AI_BASE_URL` 默认使用 DeepSeek 兼容接口，也可以替换成其他兼容服务的 base URL。配置后 `/api/assistant` 会把当前项目、任务、风险、需求、文档等上下文发送给模型；如果模型接口不可用，会自动退回本地规则分析，避免影响页面使用。

文档知识库支持上传 `.docx / .txt / .md / .csv / .json` 文档。上传后 `/api/documents/analyze` 会提取文档文本，调用 AI 拆解任务，并把生成的任务保存到任务看板；若模型接口暂时不可用，页面会明确提示并使用本地规则兜底。

`.env.local` 已在 `.gitignore` 中忽略。不要把真实密钥写入仓库；如果密钥已经出现在聊天、截图或提交记录中，建议立即在服务商后台轮换。

## 远程部署

项目提供 Docker 与脚本两种部署方式。优先推荐 Docker，运维不用在宿主机维护 Node/pnpm 进程。

### Docker 部署

服务器只需要准备 Docker、Compose 和运行时密钥文件。现在推荐使用 `scripts/deploy.docker.sh`，脚本会自动拉取公开仓库、构建镜像、执行容器启动迁移并等待健康检查。

```bash
sudo mkdir -p /etc/ai-pm
sudo cp scripts/runtime.env.example /etc/ai-pm/ai-pm.env
sudo chmod 600 /etc/ai-pm/ai-pm.env
sudo vim /etc/ai-pm/ai-pm.env
```

运行时 env 至少要包含这些生产必填项：

```txt
APP_URL=https://ai-pm.chainthink.cn
DATABASE_URL=mysql://用户名:密码@业务数据库地址:端口/数据库名
AUTH_DATABASE_URL=postgresql://用户名:密码@认证数据库地址:端口/数据库名
BETTER_AUTH_SECRET=replace-with-a-long-random-string
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
```

首次部署或更新都执行同一个脚本：

```bash
bash scripts/deploy.docker.sh
```

如果运维想在服务器上直接从公网拉脚本，也可以这样执行：

```bash
curl -fsSL https://raw.githubusercontent.com/liushurui666/ai-pm/main/scripts/deploy.docker.sh | bash
```

脚本默认使用：

- 仓库：`https://github.com/liushurui666/ai-pm.git`
- 分支：`main`
- 源码目录：`/srv/ai-pm/source`
- 运行时 env：`/etc/ai-pm/ai-pm.env`
- 宿主机端口：`3003`
- 容器端口：`3003`

换环境时直接覆盖同名变量：

```bash
AI_PM_ENV_FILE=/etc/ai-pm/test.env AI_PM_HOST_PORT=3004 AI_PM_CONTAINER_NAME=ai-pm-test AI_PM_IMAGE=ai-pm:test bash scripts/deploy.docker.sh
```

容器启动时会检查 `APP_URL`、`DATABASE_URL`、`AUTH_DATABASE_URL` 和 `BETTER_AUTH_SECRET`，并默认执行 `pnpm db:migrate` 与 `unified-auth db migrate/doctor`。如果数据库迁移由外部发布系统统一控制，可设置 `RUN_MIGRATIONS=0`。

手动调试 Compose 时仍可直接执行：

```bash
cd /srv/ai-pm/source
AI_PM_ENV_FILE=/etc/ai-pm/ai-pm.env docker compose -f deploy/docker/docker-compose.example.yml up -d --build
```

### 脚本部署

脚本部署适合不使用 Docker 的服务器：

- `scripts/deploy.ops.sh`：给运维在目标服务器上直接执行，脚本内置仓库、分支、目录、端口、服务名等非敏感默认值。
- `scripts/deploy.sh`：给开发机或发布机通过 SSH 推送到远端，适合接入外部 CI/CD。

#### 运维服务器一键执行

运维只需要在服务器上先准备一次运行时密钥文件：

```bash
sudo mkdir -p /etc/ai-pm
sudo cp scripts/runtime.env.example /etc/ai-pm/ai-pm.env
sudo chmod 600 /etc/ai-pm/ai-pm.env
sudo vim /etc/ai-pm/ai-pm.env
```

之后直接执行：

```bash
bash scripts/deploy.ops.sh
```

这条脚本会从 `main` 拉取 `https://github.com/liushurui666/ai-pm.git`，发布到 `/srv/ai-pm`，执行依赖安装、数据库迁移、构建，并重启 `ai-pm` systemd 服务。换环境时不用改脚本，直接覆盖变量即可：

```bash
APP_ROOT=/data/apps/ai-pm APP_PORT=3004 SYSTEMD_SERVICE=ai-pm-test bash scripts/deploy.ops.sh
```

如果要接内部运维脚本，可以用这些钩子：

```bash
BEFORE_DEPLOY_HOOK=/opt/company/hooks/before-ai-pm.sh AFTER_DEPLOY_HOOK=/opt/company/hooks/after-ai-pm.sh bash scripts/deploy.ops.sh
```

使用 `RESTART_STRATEGY=systemd` 时，服务器上的服务建议把工作目录指向 `current` 软链，例如：

```ini
[Service]
WorkingDirectory=/srv/ai-pm/current
Environment=NODE_ENV=production
Environment=PORT=3003
ExecStart=/usr/bin/pnpm exec next start -p 3003
Restart=always
```

#### 发布机 SSH 推送

```bash
cp scripts/deploy.env.example scripts/deploy.env
cp .env.example .env.production
```

在 `scripts/deploy.env` 中填写服务器 SSH、目标目录、端口、重启方式等部署变量；在 `.env.production` 中填写运行时密钥，例如 `DATABASE_URL`、`AUTH_DATABASE_URL`、`BETTER_AUTH_SECRET`、`FEISHU_*`、`AI_*`、`TENCENT_COS_*`。真实的 `scripts/deploy.env` 和 `.env.production` 已被 `.gitignore` 忽略，不要提交。

执行部署：

```bash
pnpm deploy:remote
```

部署脚本会：

- 用 `git archive` 打包当前提交，避免把 `.env.local`、`.next`、`node_modules` 等本地文件带到服务器。
- 上传到 `${DEPLOY_TARGET_DIR}/releases/{时间戳-commit}`，并把运行时 env 放到 `${DEPLOY_TARGET_DIR}/shared`。
- 在服务器执行 `pnpm install --frozen-lockfile`、`pnpm db:migrate`、`pnpm exec unified-auth db migrate`、`pnpm build`。
- 切换 `${DEPLOY_TARGET_DIR}/current` 软链，再按 `DEPLOY_RESTART_STRATEGY` 选择 `systemd`、`pm2`、`custom` 或 `none` 重启。
- 可通过 `DEPLOY_BEFORE_REMOTE_SCRIPT` 和 `DEPLOY_AFTER_REMOTE_SCRIPT` 插入内部运维脚本，适合接入 Nginx reload、健康检查、通知等流程。

如果要部署到另一台服务器，复制一份配置文件即可：

```bash
DEPLOY_ENV_FILE=/opt/deploy-configs/ai-pm-prod.env pnpm deploy:remote
```

## Bug 复现材料上传

Bug 管理支持上传复现步骤的图片或视频材料。文件会通过服务端接口上传到腾讯云 COS，并在 Bug 记录中保存文件 URL、对象 Key、类型和大小。

当前 COS 默认配置：

```txt
TENCENT_COS_BUCKET=ai-1350977987
TENCENT_COS_REGION=ap-guangzhou
TENCENT_COS_DOMAIN=ai-1350977987.cos.ap-guangzhou.myqcloud.com
TENCENT_COS_BUG_PREFIX=bug-materials
```

还需要在 `.env.local` 中配置腾讯云 API 密钥：

```txt
TENCENT_COS_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
TENCENT_COS_SECRET_KEY=xxxxxxxxxxxxxxxx
```

默认单文件限制为 200MB，可通过 `BUG_ATTACHMENT_MAX_BYTES` 调整。腾讯云 COS `PUT Object` 支持 5GB 以内对象；更大的视频建议改为分块上传。

## 功能范围

- 项目驾驶舱
- AI 项目助手
- 项目健康度与风险预警
- 任务看板
- 需求、风险、文档、报表入口
- 飞书 OAuth 登录
- 站内项目数据源持久化
- 上传文档自动拆解任务
- Bug 复现图片/视频材料上传到腾讯云 COS
- 飞书通讯录负责人关联
- 飞书机器人负责人通知
