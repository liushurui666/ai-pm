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

真实项目数据通过飞书多维表格读取。至少配置 `FEISHU_BITABLE_APP_TOKEN` 和一个表 ID：

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

如果未配置飞书登录，系统会保留本地演示模式；配置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET` 后，首页会要求先使用飞书登录。

## 功能范围

- 项目驾驶舱
- AI 项目助手
- 项目健康度与风险预警
- 任务看板
- 需求、风险、文档、报表入口
- 飞书 OAuth 登录
- 飞书多维表格真实数据源适配
