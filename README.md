# AI PM

一个基于 Next.js、React、TypeScript 和 Ant Design 的 AI 项目管理平台。

## 本地开发

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

默认访问 `http://localhost:3000`。如果端口被占用，Next 会自动切换到可用端口。

本地开发使用本机 MySQL。当前默认连接串为：

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

## 飞书登录与协同集成

复制 `.env.example` 为 `.env.local`，填入飞书企业内部应用配置：

```bash
cp .env.example .env.local
```

必填登录配置：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_REDIRECT_URI`
- `SESSION_SECRET`

需求模块权限由站内“成员管理”维护，并按工作区生效。配置飞书登录后，首个进入某个工作区的用户会自动成为该工作区 `owner`，后续首次进入的用户会作为 `viewer` 只读成员登记，再由 `owner / admin` 调整角色；`owner / admin / productAdmin` 可以删除需求和版本，`productMember` 可以创建和编辑但不能删除，`viewer` 只读。本地演示模式如果还没有成员，会保留完整管理权限，方便开发调试。

飞书开放平台里需要把 `FEISHU_REDIRECT_URI` 配到应用的重定向 URL，例如：

```txt
http://localhost:3000/api/auth/feishu/callback
```

项目管理主数据不写入飞书云文档。AI PM 平台会把项目、任务、风险、需求、文档、洞察、Bug 和 AI 修复任务保存到 MySQL；首次启动时如果数据库为空，系统会从内置种子数据初始化。后续通过“新建项目 / 新建任务 / 登记风险 / 新建需求 / 新建文档 / 登记 Bug”创建的记录会由站内 API 持久化到数据库，刷新页面后仍然保留。

飞书只承担三件事：

- OAuth 登录，确保用户来自企业内部应用授权。
- 通讯录负责人选择，保存负责人 `open_id / user_id / union_id / email` 到站内记录。
- 根据成员管理里的通知开关，通过飞书机器人给负责人发送通知。

飞书应用需要开通并发布这些能力：

- 飞书 OAuth 登录与用户信息读取
- 通讯录部门读取、通讯录用户读取
- 机器人发送消息

负责人下拉框能展示哪些人，取决于飞书开放平台里“通讯录权限范围”。如果只看到自己，需要把应用的通讯录权限范围调整为全员或目标部门，并重新发布应用。

如果未配置飞书登录，系统会保留本地演示模式；配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 后，首页会要求先使用飞书登录。

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

项目提供可由运维直接执行的远程部署脚本，核心思路是“脚本固定、环境变量可替换”：换测试服、预发服或正式服时，只需要切换 `DEPLOY_ENV_FILE` 指向的配置文件。

```bash
cp scripts/deploy.env.example scripts/deploy.env
cp .env.example .env.production
```

在 `scripts/deploy.env` 中填写服务器 SSH、目标目录、端口、重启方式等部署变量；在 `.env.production` 中填写运行时密钥，例如 `DATABASE_URL`、`SESSION_SECRET`、`FEISHU_*`、`AI_*`、`TENCENT_COS_*`。真实的 `scripts/deploy.env` 和 `.env.production` 已被 `.gitignore` 忽略，不要提交。

执行部署：

```bash
pnpm deploy:remote
```

部署脚本会：

- 用 `git archive` 打包当前提交，避免把 `.env.local`、`.next`、`node_modules` 等本地文件带到服务器。
- 上传到 `${DEPLOY_TARGET_DIR}/releases/{时间戳-commit}`，并把运行时 env 放到 `${DEPLOY_TARGET_DIR}/shared`。
- 在服务器执行 `pnpm install --frozen-lockfile`、`pnpm db:migrate`、`pnpm build`。
- 切换 `${DEPLOY_TARGET_DIR}/current` 软链，再按 `DEPLOY_RESTART_STRATEGY` 选择 `systemd`、`pm2`、`custom` 或 `none` 重启。
- 可通过 `DEPLOY_BEFORE_REMOTE_SCRIPT` 和 `DEPLOY_AFTER_REMOTE_SCRIPT` 插入内部运维脚本，适合接入 Nginx reload、健康检查、通知等流程。

如果要部署到另一台服务器，复制一份配置文件即可：

```bash
DEPLOY_ENV_FILE=/opt/deploy-configs/ai-pm-prod.env pnpm deploy:remote
```

使用 `DEPLOY_RESTART_STRATEGY=systemd` 时，服务器上的服务建议把工作目录指向 `current` 软链，例如：

```ini
[Service]
WorkingDirectory=/srv/ai-pm/current
ExecStart=/usr/bin/pnpm start -- -p 3003
Restart=always
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
