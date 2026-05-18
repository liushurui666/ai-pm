# AI PM

一个基于 Next.js、React、TypeScript 和 Ant Design 的 AI 项目管理平台前端 MVP。

## 本地开发

```bash
pnpm install
pnpm dev
```

默认访问 `http://localhost:3000`。如果端口被占用，Next 会自动切换到可用端口。

## 飞书登录与真实数据

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

真实项目数据通过飞书多维表格读取。默认不需要手动创建多维表格，也不需要手动填写 `FEISHU_BITABLE_APP_TOKEN`。

首次启动时，系统会用飞书应用身份自动创建：

- 一个名为 `AI PM 项目管理平台` 的飞书文件夹
- 一个同名多维表格
- 多维表格内的 `项目 / 任务 / 风险 / 需求 / 文档 / 洞察` 数据表

创建结果会写入本地 `.ai-pm/feishu-workspace.json`，该文件已被 Git 忽略，不会提交到仓库。

如果你希望把项目管理文件夹创建到某个指定飞书目录下，可以配置：

```txt
FEISHU_PARENT_FOLDER_TOKEN=fldxxxxxxxxxxxxxxxx
```

如果你已经有多维表格，也可以手动配置 `FEISHU_BITABLE_APP_TOKEN=base_xxx` 覆盖自动创建逻辑。系统会在这个多维表格里查找这些数据表：

- `项目`
- `任务`
- `风险`
- `需求`
- `文档`
- `洞察`

如果上述表不存在，系统会按生产字段自动创建，并把 `负责人` 字段创建为飞书“人员”字段。后续新建项目、任务、风险时，负责人会从飞书通讯录选择，并写入人员字段；创建成功后会尝试通过飞书机器人给负责人发送通知。

如果你的表名不一致，或者一个多维表格里有多套同名/近似表，可以再手动指定 table id：

- `FEISHU_PROJECTS_TABLE_ID`
- `FEISHU_TASKS_TABLE_ID`
- `FEISHU_RISKS_TABLE_ID`
- `FEISHU_REQUIREMENTS_TABLE_ID`
- `FEISHU_DOCUMENTS_TABLE_ID`
- `FEISHU_INSIGHTS_TABLE_ID`

建议多维表格字段名：

- 项目表：`项目名称`、`负责人`、`状态`、`进度`、`健康度`、`截止日期`、`团队人数`、`风险数`、`摘要`
- 任务表：`标题`、`阶段`、`负责人`、`项目名称`、`优先级`、`截止日期`、`AI提示`
- 风险表：`标题`、`等级`、`负责人`、`项目名称`、`应对措施`
- 需求表：`标题`、`优先级`、`状态`、`项目名称`、`验收标准`
- 文档表：`标题`、`类型`、`更新时间`、`AI摘要`
- 洞察表：`内容`

平台中的“新建项目 / 新建任务 / 登记风险 / 新建需求 / 新建文档”会调用 `/api/records`。如果识别到对应数据表，会把记录写入飞书多维表格；如果未识别到，会在当前页面临时创建，方便本地开发和演示。

写入字段默认使用上述中文字段名。若你的多维表格字段名不同，需要同步调整 `src/data/feishu-dashboard.ts` 里的 `createFieldsForType`。

飞书应用需要开通并发布这些能力：

- 云空间创建文件夹
- 多维表格应用与数据表读取、写入、创建
- 多维表格字段读取
- 通讯录用户读取
- 机器人发送消息

自动创建的文件夹和多维表格会由应用创建。若使用已有多维表格，则需要把飞书应用加入目标多维表格协作者，并给编辑权限。

如果未配置飞书登录，系统会保留本地演示模式；配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 后，首页会要求先使用飞书登录。

## AI 助手模型配置

AI 项目助手支持 OpenAI-compatible 的 Chat Completions 接口。把模型密钥放在 `.env.local` 或部署平台环境变量中：

```txt
AI_API_KEY=sk_xxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

`AI_BASE_URL` 默认使用 DeepSeek 兼容接口，也可以替换成其他兼容服务的 base URL。配置后 `/api/assistant` 会把当前项目、任务、风险、需求、文档等上下文发送给模型；如果模型接口不可用，会自动退回本地规则分析，避免影响页面使用。

`.env.local` 已在 `.gitignore` 中忽略。不要把真实密钥写入仓库；如果密钥已经出现在聊天、截图或提交记录中，建议立即在服务商后台轮换。

## 功能范围

- 项目驾驶舱
- AI 项目助手
- 项目健康度与风险预警
- 任务看板
- 需求、风险、文档、报表入口
- 飞书 OAuth 登录
- 飞书多维表格真实数据源适配
- 飞书多维表格记录创建接口
