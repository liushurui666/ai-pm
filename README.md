# AI PM

一个基于 Next.js、React、TypeScript 和 Ant Design 的 AI 项目管理平台。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认访问 `http://localhost:3000`。如果端口被占用，Next 会自动切换到可用端口。

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

飞书开放平台里需要把 `FEISHU_REDIRECT_URI` 配到应用的重定向 URL，例如：

```txt
http://localhost:3000/api/auth/feishu/callback
```

项目管理主数据不写入飞书云文档。AI PM 平台会把项目、任务、风险、需求、文档和洞察保存到站内数据文件：

```txt
.ai-pm/app-database.json
```

这个目录已被 Git 忽略，不会提交到仓库。首次启动时如果数据文件不存在，系统会从内置种子数据初始化；后续通过“新建项目 / 新建任务 / 登记风险 / 新建需求 / 新建文档”创建的记录会由 `/api/records` 持久化到站内数据源，刷新页面后仍然保留。

飞书只承担三件事：

- OAuth 登录，确保用户来自企业内部应用授权。
- 通讯录负责人选择，保存负责人 `open_id / user_id / union_id / email` 到站内记录。
- 创建成功后通过飞书机器人给负责人发送通知。

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

## 功能范围

- 项目驾驶舱
- AI 项目助手
- 项目健康度与风险预警
- 任务看板
- 需求、风险、文档、报表入口
- 飞书 OAuth 登录
- 站内项目数据源持久化
- 上传文档自动拆解任务
- 飞书通讯录负责人关联
- 飞书机器人负责人通知
