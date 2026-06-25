# AI PM 全链路测试用例矩阵

状态：执行中  
负责人：Codex QA  
最后更新：2026-06-25

## 目标

本矩阵覆盖 AI PM 从登录、工作台浏览、业务记录增删改查、成员权限、通知、AI 助手、索引队列、Bug AI 修复、部署脚本到异常恢复的全链路测试。每个用例都需要有可追溯证据：命令输出、接口响应、浏览器截图/DOM、数据库记录、队列记录、通知发送记录或构建日志。

## 执行环境

| 环境 | 用途 | 证据要求 |
| --- | --- | --- |
| 本地开发 `http://localhost:3004` | 快速回归、浏览器交互、接口验证 | dev server ready、浏览器 DOM/console、接口返回 |
| 腾讯云 MySQL `DATABASE_URL` | 真实业务数据验证 | 仅记录表名/ID/状态，不记录密钥 |
| Unified Auth `AUTH_DATABASE_URL` | 登录态、OAuth、会话过期 | 只记录状态码、回跳地址、用户标识类型 |
| 飞书/Resend/队列 worker | 通知和异步副作用 | job 状态、收件人脱敏、发送结果 |

## 必跑质量门禁

| ID | 门禁 | 命令/动作 | 通过标准 | 当前状态 |
| --- | --- | --- | --- | --- |
| GATE-001 | ESLint | `pnpm lint` | 退出码 0 | 通过，2026-06-24 |
| GATE-002 | 生产构建 | `pnpm build` | 退出码 0，无类型错误 | 通过，2026-06-24 |
| GATE-003 | Prisma Client | `pnpm db:generate` | 退出码 0 | 通过，2026-06-24 |
| GATE-004 | 业务迁移 | `pnpm db:migrate` | 所有迁移 applied | 通过，2026-06-24，无待应用迁移 |
| GATE-005 | AI 索引自检 | `pnpm ai-index:doctor` | 依赖可达项通过；缺外部依赖需记录 | 部分通过：代码依赖、Mastra、百炼通过；缺 `REDIS_URL` 与 `QDRANT_URL` |
| GATE-006 | 构建噪音检查 | `git diff --check` + `git status --short` | 无空白错误；无无关生成文件 | 通过，2026-06-24 |

## 登录与会话

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| AUTH-001 | 未登录访问工作台 | 访问 `/workbench?view=overview` | 跳转 `/login?client_id=ai-pm&redirect_uri=...` | 浏览器 URL |
| AUTH-002 | 未登录访问 Bug 深链 | 访问 `/bugs/{bugId}` | 跳转登录且保留回跳地址 | 浏览器 URL |
| AUTH-003 | 飞书登录 | 点击“使用飞书登录”完成 OAuth | 回到工作台，当前用户/成员可识别 | 浏览器 + `/api/dashboard` |
| AUTH-004 | Google 登录 | 使用 Google OAuth | 进入工作台，注册渠道为 Google | 浏览器 + 成员表 |
| AUTH-005 | GitHub 登录 | 使用 GitHub OAuth | 进入工作台，注册渠道为 GitHub | 浏览器 + 成员表 |
| AUTH-006 | 会话过期 | 清理/伪造 Cookie 后请求业务 API | 返回 401，前端一次性跳登录，不重复跳转 | 网络请求 + URL |
| AUTH-007 | Auth Service 短暂失败 | 模拟 Auth DB/Service 短暂不可用 | 不吞成空 session；前端显示可读错误或保持现场 | 服务端日志 |
| AUTH-008 | 退出登录 | 点击退出登录 | Cookie 清理，回到登录页，再访问工作台需登录 | 浏览器 |
| AUTH-009 | 登录回跳 host 一致性 | localhost/127.0.0.1 分别登录 | Cookie host 不错配，不出现登录成功后加载中 | 浏览器 |

## 工作台 Shell 与全局交互

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| SHELL-001 | 首屏加载 | 登录后访问 `/workbench` | 初始数据渲染，侧栏和顶部不闪乱 | 截图/DOM |
| SHELL-002 | 菜单切换 | 切换工作台、项目视图、版本大屏、任务、Bug、需求、成员、Chat | URL `view` 同步，内容正确切换 | 浏览器 DOM |
| SHELL-003 | 顶部工作区切换 | 打开顶部工作区入口切换工作区 | 数据刷新，失败时恢复旧工作区 | 浏览器 + API |
| SHELL-004 | 左下账号菜单 | 打开左下账号菜单 | 只显示身份和退出登录，不显示工作区 Select | 浏览器 DOM |
| SHELL-005 | 主题切换 | 连续切换系统/浅色/深色 | localStorage/cookie 同步，页面无重叠 | 浏览器 |
| SHELL-006 | 全局搜索 | 搜索项目/任务/Bug/需求关键词 | 结果分组正确，点击能跳目标视图 | 浏览器 |
| SHELL-007 | 日程抽屉 | 打开日程并切换只看我的 | 列表按日期展示，无数据时空态正常 | 浏览器 |
| SHELL-008 | 移动端布局 | 375px 宽访问主要视图 | 无横向溢出，顶部头像入口可用 | 截图 |

## 概览与报表

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| OVERVIEW-001 | 个人待办 | 打开工作台 | 当前用户待办/Bug/逾期统计正确 | UI + 数据比对 |
| OVERVIEW-002 | 待办跳转 | 点击待办任务或 Bug | 跳到对应任务/ Bug 视图 | 浏览器 |
| OVERVIEW-003 | 周报导出 | 点击周报导出 | 出现全局 loading，生成 `.md` 下载 | 浏览器/下载记录 |
| OVERVIEW-004 | 周报接口异常 | 临时断开模型配置 | 显示可读错误，不打开助手抽屉 | 浏览器 |

## 项目、版本与需求

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| PROJ-001 | 项目视图加载 | 打开项目视图 | 甘特/排期数据可见，版本筛选可用 | 浏览器 |
| PROJ-002 | 项目编辑 | 编辑项目负责人/状态/日期 | 单条记录保存，数据刷新 | API + DB |
| PROJ-003 | 排期拖拽 | 拖动/调整任务日期 | 保存 task start/due，排序不乱 | 浏览器 + DB |
| VERSION-001 | 新建版本 | 创建普通版本 | 版本出现在需求管理和版本大屏 | API + UI |
| VERSION-002 | 新建子版本 | 从父版本创建子版本 | 子版本继承父版本项目范围 | API + UI |
| VERSION-003 | 编辑版本 | 修改名称、状态、负责人、日期 | 版本详情和大屏同步更新 | UI + DB |
| VERSION-004 | 删除版本 | 管理员删除版本 | 有权限成功，无权限显示拒绝 | API |
| VERSION-005 | 版本大屏 | 切换版本、筛选状态/负责人 | KPI、排行、风险分布随版本变化 | 浏览器 |
| REQ-001 | 新建需求 | 在版本下创建需求 | 需求绑定版本，负责人身份正确 | API + DB |
| REQ-002 | 编辑需求 | 修改优先级、状态、负责人 | 保存成功，列表更新 | UI |
| REQ-003 | 删除需求 | 管理员删除需求 | 成功删除并清理索引 source | API + DB |
| REQ-004 | 飞书链接分析 | 填入 doc/wiki 链接分析 | 返回标题/摘要，投递 sync_feishu | API + 队列 |
| REQ-005 | 文档拆任务 | 选择版本和默认负责人拆任务 | 默认负责人覆盖 AI 识别负责人 | UI + DB |

## 任务管理

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| TASK-001 | 新建任务 | 从任务看板创建任务 | 任务绑定版本和负责人，入队通知 | UI + DB + job |
| TASK-002 | 编辑任务 | 修改标题、阶段、日期、负责人 | 单条更新，不触发全量写库 | API + DB |
| TASK-003 | 阶段拖拽 | 阶段看板跨列拖拽 | 状态变更，动画流畅，无重复卡片 | 浏览器 |
| TASK-004 | 同阶段排序 | 同列拖拽排序 | 本地偏好生效，刷新后顺序稳定 | localStorage |
| TASK-005 | 负责人视图转交 | 拖到另一负责人 | owner、ownerMemberId、邮箱、飞书身份同步 | DB |
| TASK-006 | 版本过滤 | 切换版本筛选 | 展示完整版本任务集，不受月份过滤 | UI |
| TASK-007 | 只读用户 | viewer 尝试编辑任务 | 控件禁用或 API 返回权限不足 | UI + API |

## Bug 管理与附件

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| BUG-001 | 新建 Bug | 创建 Bug 并选择负责人/版本 | Bug 落库，入队通知，不全量写库 | API + DB + job |
| BUG-002 | 编辑 Bug | 修改严重性、状态、负责人 | 详情页和列表同步 | UI + DB |
| BUG-003 | Bug 深链 | 打开 `/bugs/{bugId}` | 服务端预取，详情可编辑 | 浏览器 |
| BUG-004 | 附件上传 | 上传图片/文件 | COS 配置存在时返回 URL；缺配置有可读错误 | API |
| BUG-005 | 流转记录 | 修改状态多次 | flow records 按时间展示 | DB + UI |
| BUG-006 | 删除 Bug | 管理员删除 Bug | 删除主记录、附件、流转和索引 source | DB |
| BUG-007 | 只看我的 | 切换只看我的 | 只展示当前负责人相关 Bug | UI |
| BUGFIX-001 | 仓库列表 | 打开 AI 修复抽屉 | 拉取项目仓库，可覆盖 base branch | API + UI |
| BUGFIX-002 | 创建修复任务 | 提交 AI 修复 MR | 创建 job，Bug 流转为修复中 | API + DB |
| BUGFIX-003 | Worker 执行 | 运行 `pnpm bug-fix:worker` | 生成分支/提交/PR 或失败日志完整 | job logs |
| BUGFIX-004 | 取消任务 | 取消 queued/running job | 状态变 canceled，running 有合理限制 | API |

## 成员、权限与通知

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| MEMBER-001 | 成员列表 | 打开成员管理 | 展示注册渠道、角色、状态、最近活跃、通知渠道 | UI |
| MEMBER-002 | 飞书通讯录 | 打开添加成员 | 加载直接授权用户/部门/用户组成员；缺组权限显示 warning | API + UI |
| MEMBER-003 | 添加成员 | 从通讯录选择并保存 | 创建 workspace_member，飞书 open_id 正确 | DB |
| MEMBER-004 | 手动添加成员 | 不选飞书，仅填姓名/邮箱 | 可保存，注册渠道 fallback 为 email | UI + DB |
| MEMBER-005 | 修改角色 | owner/admin 修改角色 | 权限立即影响编辑/删除能力 | UI + API |
| MEMBER-006 | 禁用成员 | 切换状态 disabled | 成员不可作为有效负责人或显示禁用 | UI |
| MEMBER-007 | 最近活跃 | 当前用户访问工作台 | `lastActiveAt` 5 分钟节流刷新 | DB |
| MEMBER-008 | 飞书通知渠道 | 配置飞书渠道并创建任务/Bug | worker 发送 succeeded，目标是 `ou_...` | DB job |
| MEMBER-009 | 邮箱通知渠道 | 配置邮箱渠道并创建任务/Bug | Resend job succeeded；缺配置提示不入队 | DB job |
| MEMBER-010 | Webhook/TG 占位 | 尝试添加 Webhook/TG | 控件置灰，不误导可发送 | UI |
| PERM-001 | viewer 权限 | viewer 尝试成员/需求/Bug 删除 | UI 禁止或 API 403 | UI + API |
| PERM-002 | productMember 权限 | 创建/编辑需求但删除失败 | 权限符合模型 | UI + API |

## AI 助手与自动动作

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| AI-001 | 打开 Chat | 访问 `/workbench?view=assistant` | 全屏 ChatBox 加载，会话列表可用 | 浏览器 |
| AI-002 | 十轮只读对话 | 执行既有十轮脚本 | 流式非空、无泄露 tool/API、console 无异常 | 浏览器 + 日志 |
| AI-003 | 会话持久化 | 新建/切换/删除/清空/刷新 | 会话按 workspace 隔离 | localStorage |
| AI-004 | 停止/重试 | 生成中停止，再重新生成 | 状态释放，旧消息裁剪正确 | 浏览器 |
| AI-005 | 模型切换 | 切换每个可用模型发送“你好” | 只展示探活成功模型，回复非空 | 浏览器 + API |
| AI-006 | 周报下载 | 请求生成周报 | FileCard 下载 `.md`，不落库 | 浏览器 |
| AI-007 | 批量关闭任务 | “把我的所有任务完成” | 提交 assistant_action_jobs，worker 批量更新 | DB + worker |
| AI-008 | 批量关闭 Bug | “关闭所有未关闭 Bug” | 权限校验，批量更新，失败明细准确 | DB |
| AI-009 | 批量创建任务 | 多条任务描述归属给我 | ownerMemberId/email/openId 补齐，通知入队 | DB + job |
| AI-010 | 创建版本+需求 | 复合指令创建版本和需求 | 非关键字段自动补齐，顺序正确 | DB |
| AI-011 | 动作中断 | 模拟 worker/API 超时 | 助手不能编造已完成 | 浏览器 |
| AI-012 | 污染历史 | 带旧失败 tool/reasoning 的会话继续动作 | 服务端清洗历史，不触发 function.arguments 错误 | API |

## 自动索引 RAG

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| RAG-001 | 写入投递 | 新建/更新 task/bug/requirement/version | 轻量投递 `index_entity` | DB job |
| RAG-002 | Worker 索引 | 运行 `pnpm ai-index:worker` | source/chunk ready，Qdrant upsert 成功 | DB + Qdrant |
| RAG-003 | 删除清理 | 删除业务记录 | 投递 cleanup_source，MySQL/Qdrant 清理 | DB |
| RAG-004 | 管理员重建 | POST `/api/ai-index/rebuild` | 扫描当前工作区历史数据并投递 job | API |
| RAG-005 | 状态查询 | GET `/api/ai-index/status` | 返回当前工作区 source/job 状态 | API |
| RAG-006 | Knowledge tool | Chat 问文档/需求事实 | 使用 knowledge 检索，不编造来源 | Chat logs |
| RAG-007 | Eval | `pnpm ai-index:eval` | 输出 recallAtK/mrr；外部依赖缺失需记录 | 命令 |

## 工作区、部署与运维

| ID | 场景 | 操作 | 期望结果 | 证据 |
| --- | --- | --- | --- | --- |
| OPS-001 | 创建工作区 | 登录用户创建新工作区 | 写 workspaces + owner member，不受当前工作区权限限制 | API + DB |
| OPS-002 | Docker 构建 | `pnpm deploy:docker` dry-run 或脚本审查 | 校验 env，build 阶段不依赖真实 auth DB | 日志 |
| OPS-003 | 生产迁移 | 部署脚本执行业务迁移 | 默认只跑 MySQL；Auth 迁移需显式开关 | 日志 |
| OPS-004 | Worker 常驻 | dashboard/assistant/index workers | Redis 有则 BullMQ，无则 MySQL fallback | 日志 |
| OPS-005 | 环境缺失 | 缺 RESEND/COS/Qdrant/Redis | 功能降级可读，不影响主流程 | UI/API |

## 执行记录

### 2026-06-24 初始盘点

- 已确认项目没有统一 `pnpm test` 脚本；当前可自动执行门禁包括 `pnpm lint`、`pnpm build`、`pnpm db:generate`、`pnpm db:migrate`、`pnpm ai-index:doctor`、`pnpm ai-index:eval` 及各 worker。
- 已确认页面入口：`/`、`/login`、`/logout`、`/workbench`、`/bugs/[bugId]`。
- 已确认 API 入口：dashboard、records、members、workspaces、feishu/users、documents/analyze、requirements/analyze-link、assistant、assistant/models、assistant/weekly-report、ai-index、bug-fix-jobs、bug-attachments、project-repositories。
- 下一步从质量门禁和未登录/登录回跳开始执行，随后进入已登录浏览器全流程。

### 2026-06-24 自动门禁执行

- `pnpm lint`：通过。
- `pnpm db:generate`：通过，Prisma Client 生成成功。
- `pnpm build`：通过，Next.js 20 个路由完成构建。
- `pnpm db:migrate`：通过，当前 MySQL `ai_pm` 无待应用迁移。
- `pnpm ai-index:doctor`：脚本退出码 0；Qdrant JS client、Mastra workflow、百炼 API Key/Base URL、Embedding、Reranker 通过；`REDIS_URL`、`QDRANT_URL` 缺失，正式 BullMQ 和向量库写入链路不可验证。
- `pnpm ai-index:eval`：未带工作区参数时按预期失败并提示设置 `AI_INDEX_EVAL_WORKSPACE_ID` 或 `WORKSPACE_ID`；补 `AI_INDEX_EVAL_WORKSPACE_ID=ws-default` 后通过，结果 `total=0/evaluated=0`，说明评测工具可运行但当前工作区没有可评估样本。

### 2026-06-24 登录与核心视图冒烟

- AUTH-001/AUTH-002：无 Cookie 访问 `/workbench?view=members&workspaceId=ws-default` 与 `/bugs/bug-missing` 均 307 跳转登录，并保留完整 `redirect_uri`。
- AUTH-006：无 Cookie 请求 `/api/dashboard`、`/api/members`、`/api/feishu/users`、`/api/project-repositories`、`/api/ai-index/status`、`/api/assistant/models`、`POST /api/records`、`POST /api/assistant`、`POST /api/workspaces` 均返回 401 `{"error":"未登录"}`。
- 登录页 HTML：服务端返回 200，页面包含飞书、Google、GitHub 登录入口；自动化环境曾进入飞书授权页，未继续提交外部授权。
- MEMBER-001/MEMBER-002：已登录成员页加载成功，表格展示“最近活跃”列；添加成员抽屉字段齐全，飞书通讯录下拉可展开，当前选项为“稻草人、荔枝”；因飞书用户组权限缺失展示部分返回 warning。
- TASK-001 冒烟：任务看板加载成功，URL 切换到 `view=tasks`，阶段看板和“新建任务”入口可见。
- BUG-001 冒烟：Bug 管理加载成功，统计卡、表格和“提 Bug”入口可见。
- REQ-001 冒烟：需求管理加载成功，版本卡片和“新建版本”入口可见。
- VERSION-005 冒烟：版本大屏加载成功，版本切换、筛选器、KPI/排行/健康概览/负责人看板/进展看板可见。
- AI-001 冒烟：AI 助手全屏入口加载成功，历史消息、输入框、清空、导出、重新生成控件可见。
- 发现并修复：需求管理加载时控制台出现 Ant Design 警告 `[antd: Space] direction is deprecated`，根因是 `requirement-version-children` 仍使用 `Space direction="vertical"`；已改为 `orientation="vertical"`，后续 `pnpm lint` / `pnpm build` 回归通过。

### 2026-06-24 二次全链路推进

- 新增并执行 `pnpm exec tsx scripts/full-chain-crud-smoke.ts`：使用无通知渠道成员 `member-mpuz3752-u13tux` 做安全 owner，临时创建任务 `task-mqs25p6p-kwnvq4` 与 Bug `bug-mqs25p6p-7beuo1`，更新任务阶段为“进行中”、更新 Bug 状态为“定位中”，Bug 流转记录生成 2 条；删除后任务/Bug 主记录均不存在，Bug 流转子表级联清理为 0，测试记录未产生 dashboard 通知副作用，AI 索引创建 job 4 条、cleanup job 2 条。
- MEMBER-003：成员页刷新后当前用户“最近活跃”显示为“刚刚/1 分钟前”，其他未登录成员显示“从未登录”；左下角账号菜单只展示用户、当前工作区和“退出登录”，不再展示工作区切换控件。
- MEMBER-002 补充：浏览器当前 dev server `/api/feishu/users` 返回 2 个直接可读成员且状态 200；同进程外脚本直连飞书仍能复现 `contact:group:readonly` 用户组读取权限缺失 warning，说明重启 dev server 后需要复查通讯录 warning 是否与当前飞书 app 配置一致。
- SEARCH-001：顶部全局搜索输入 `Bug` 后按 Enter 打开全局搜索抽屉，展示任务/Bug 结果；点击 Bug 结果“打开”可跳转到 `/bugs/bug-mqq1ssv5-i3m9es?workspaceId=ws-default`。
- BUG-002：Bug 详情页加载成功，展示编辑 Bug 表单、复现材料区、AI 修复 MR 卡片和流转记录；发现 Ant Design 警告 `[antd: Drawer] width is deprecated`，根因为 AI 修复确认抽屉仍使用 `Drawer width={460}`，已改为 `size="default"`，重载后 warning 消失。
- TASK-001/REQ-001/VERSION-005 浏览器复查：任务看板、需求管理、版本大屏均可直接加载，控制台仅有 React DevTools/HMR 开发信息，无 error/warning。
- AI-001/AI-002：AI 助手页首次加载曾出现 hydration mismatch 与 `<script>` warning；根因是 ChatBox 首帧 `useState` 读取 localStorage 历史会话，服务端欢迎态和客户端历史态 DOM 不一致。已改为首帧使用确定性欢迎会话、mount 后再加载 localStorage；重载后控制台无 hydration/script warning，`/api/assistant/models` 返回 200。
- AI-003 回归：创建新聊天后连续发送 10 轮“只回复收到”的短对话，10 轮均生成非空助手气泡，最终 DOM 中 10 条测试回复均为“收到。”；期间控制台无 warning/error。
- 质量回归：`pnpm lint` 通过；`pnpm build` 通过，Next.js 20 个路由生产构建成功。

### 2026-06-24 服务层冒烟与需求写库修复

- 新增 `pnpm exec tsx scripts/full-chain-service-smoke.ts`：覆盖 `createDashboardMember/updateDashboardMember`、`createDashboardRecord/updateDashboardRecord/deleteDashboardRecord` 的任务、Bug、需求链路，以及 `createDashboardWorkspace`；脚本使用临时无通知渠道成员，结束后清理任务、Bug、需求、成员和临时工作区。
- 首次运行服务层脚本复现 REQ-001/REQ-002 风险：创建/更新需求仍会进入 `writeDatabase` 全量同步，公网 MySQL 在 `syncTasks -> prisma.projectTask.upsert` 超过 60 秒后报 `P2028 Transaction API error`。已修复为 `upsertDashboardRequirementDatabase/deleteDashboardRequirementDatabase` 单行写入/删除。
- 修复脚本运行环境问题：`access/permissions.ts` 原本从 `auth/unified-auth` 导入 `isAuthServiceConfigured`，导致 `tsx` 脚本间接解析 Unified Auth SDK `service-client` 运行时导出失败；已拆出 `src/lib/auth/settings.ts`，权限模块不再依赖 SDK 客户端。
- 服务层脚本复跑通过：run `service-e2e-1782307262510` 创建任务 `task-mqs3qav8-ar9hjw`、Bug `bug-mqs3qfvz-4ypn6f`、需求 `requirement-mqs3qlqq-tpocoi`、成员 `member-mqs3q7eb-iu350m`、工作区 `workspace-mqs3qq5i-suprws`；Bug 流转记录 2 条、通知副作用 0 条、索引 job 6 条；清理后 task/bug/requirement 均为 0。
- 临时数据兜底检查通过：标题/名称包含 `service-e2e-` 的任务、Bug、需求、成员、工作区均为 0。
- MEMBER-002 复核：脚本直连飞书通讯录 `listFeishuPeopleWithDiagnostics("")` 返回 83 人，无 warning；说明“添加成员只看到少数人”的根因是子部门分页/ID 展开，当前已恢复读取授权部门下级成员。
- AUTH-001/AUTH-006 复核：Codex 内置浏览器访问 `/workbench?view=members&workspaceId=ws-default` 跳转 `/login?client_id=ai-pm&redirect_uri=...`，登录页包含飞书、Google、GitHub 入口且控制台无 error/warning；无 Cookie 请求 `/api/dashboard`、`/api/feishu/users`、`/api/members`、`POST /api/records` 均返回 401 `未登录`。
- 本轮质量门禁：`pnpm exec tsx scripts/full-chain-crud-smoke.ts` 通过；`pnpm exec tsx scripts/full-chain-service-smoke.ts` 通过；`pnpm lint` 通过；`git diff --check` 通过；`pnpm build` 通过。

### 2026-06-24 认证与未授权接口矩阵脚本化

- 新增 `pnpm exec tsx scripts/full-chain-auth-smoke.ts`：无 Cookie 覆盖 26 个入口，包括 `/workbench`、`/bugs/{bugId}`、登录页、退出登录、dashboard、members、feishu/users、project-repositories、records、workspaces、documents/analyze、requirements/analyze-link、bug-attachments、bug-fix-jobs、ai-index、assistant、weekly-report。
- AUTH-001/AUTH-002：脚本验证 `/workbench?view=members&workspaceId=ws-default` 与 `/bugs/bug-missing?workspaceId=ws-default` 均返回 307，并跳转 `/login?client_id=ai-pm&redirect_uri=...`，回跳地址保留当前页面。
- AUTH-003 前置入口：脚本验证登录页返回 200，HTML 包含飞书、Google、GitHub 登录入口；当前脚本只检查入口存在，不代替真实 OAuth 授权。
- AUTH-008：脚本验证 `/logout` 返回 302 到站内 `/`，并下发 `better-auth.session_token` 与 `better-auth.session_data` 的 `Max-Age=0` 清理头；该检查不依赖真实 OAuth 登录态。
- AUTH-006：脚本验证 22 个业务 API 无 Cookie 时均返回 401 且 JSON error 为 `未登录`，未出现提前解析请求体导致的 400/500。
- 本轮回归：`pnpm exec tsx scripts/full-chain-auth-smoke.ts` 通过，`pnpm exec tsx scripts/full-chain-crud-smoke.ts` 通过，`pnpm exec tsx scripts/full-chain-service-smoke.ts` 通过；临时任务/Bug/需求/成员/工作区残留均为 0。
- 本轮质量门禁：`git diff --check` 通过；`pnpm lint` 通过；`pnpm build` 通过。

### 2026-06-24 基础设施队列与 Bug 修复仓储冒烟

- 新增 `pnpm exec tsx scripts/full-chain-infra-smoke.ts`：覆盖 MySQL AI 索引队列、MySQL Dashboard 副作用队列、Bug AI 修复仓储，不调用真实外部通知、不启动真实 Git 修复 worker。
- RAG-001/RAG-003 队列协议：脚本创建 `index_entity` 测试任务，验证 `enqueue -> claimNext -> fail(立即重试) -> claimNext -> complete`，最终 `ai_index_jobs.status=success` 且 `retryCount=1`。
- OPS-004 通知副作用队列：脚本创建非发送型 `refresh_project_metrics` 测试任务，先用未来 `nextRunAt` 避开 inline worker，再验证 `claimNext -> fail(立即重试) -> claimNext -> complete`，最终 `dashboard_side_effect_jobs.status=succeeded` 且 `retryCount=1`。
- BUGFIX-002/BUGFIX-003 仓储协议：脚本创建临时仓库与临时 Bug，验证 `createBugFixJob`、日志写入、检查结果写入、`claimNextBugFixJob` 或安全直写 preparing、`failBugFixJob`，并确认 Bug 回写 `aiFixLatestJobId` 与 `aiFixStatus=failed`。
- 安全边界：脚本发现全局队列有更高优先级历史任务时会恢复意外领取的任务为 pending/queued 并失败；所有测试数据使用 `infra-e2e-*` runLabel，finally 按外键顺序清理。
- 本轮执行：run `infra-e2e-1782308491793` 通过；AI 索引 job `cmqs4gitd0000qb9zh2iztuqw`、Dashboard 副作用 job `dashboardSideEffect-mqs4godm-d2149d52`、Bug 修复 job `cmqs4gvg70002qb9zgndcp1lq` 均完成预期状态机；残留检查 `infraAi/infraSide/infraBug/infraRepo` 均为 0。
- 本轮回归：`pnpm exec tsx scripts/full-chain-infra-smoke.ts`、`pnpm exec tsx scripts/full-chain-auth-smoke.ts`、`pnpm exec tsx scripts/full-chain-crud-smoke.ts`、`pnpm exec tsx scripts/full-chain-service-smoke.ts` 全部通过；临时 `infra-e2e-*`、`service-e2e-*`、`codex-e2e-*` 数据残留均为 0。
- 本轮质量门禁：`git diff --check` 通过；`pnpm lint` 通过；`pnpm build` 通过。

### 2026-06-24 AI 助手动作 Worker 冒烟

- 新增 `pnpm exec tsx scripts/full-chain-assistant-action-smoke.ts`：覆盖 `assistant_action_jobs` 的 `complete_tasks`、`close_bugs`、`assign_tasks`、`create_tasks` 四类动作，不经过模型、不发送真实通知。
- AI-007/AI-008/AI-009：脚本创建临时成员、任务和 Bug，验证 worker 将任务改为“已完成”、Bug 改为“已关闭”并追加 `AI 助手批量关闭` 流转、任务转交同步 `ownerMemberId/owner/email`、批量创建任务解析“我”为真实成员。
- OPS-004/RAG-001：动作完成后验证相关临时任务/Bug 投递 AI 索引刷新 job；无通知渠道测试成员不应产生 Dashboard 通知副作用 job，避免误发飞书/邮箱。
- 安全边界：脚本运行前检查是否存在非本次测试的 queued/running assistant action job；如存在则停止，避免全局 worker 抢走真实用户任务。所有测试数据使用 `assistant-action-e2e-*`，finally 清理。
- 本轮执行：run `assistant-action-e2e-1782308988186` 通过，4 个 action job 全部 `succeeded`，创建任务 2 条、索引刷新 job 5 条、通知 job 0 条；残留检查 `tasks/bugs/members/actionJobs/indexJobs/sideJobs` 均为 0。

### 2026-06-25 权限矩阵与身份匹配脚本化

- 新增 `pnpm exec tsx scripts/full-chain-permission-smoke.ts`：覆盖 8 个成员角色和 6 类高风险动作 `member:manage`、`bug:update/delete`、`requirement:create/update/delete` 的权限矩阵。
- PERM-001/PERM-002：脚本验证 owner/admin 全权限，productAdmin 可管需求但不能管成员/删 Bug，productMember 可创建和编辑需求但不能删除，frontend/backend 只能编辑 Bug 状态类动作，qa 可完整编辑和删除 Bug，viewer 全拒绝。
- AUTH-007/MEMBER-006：脚本验证禁用成员和未加入成员全部拒绝，并返回“成员已被禁用”“你还不是成员”的明确原因。
- 身份边界：脚本验证运行时只用 Unified Auth 的 `authUserId` 匹配 `workspace_members.identities[].providerUserId`，不会因为 email/openId 碰巧相同就误授予成员权限；工作区过滤不会串到其他 workspace。
- 本轮执行：`pnpm exec tsx scripts/full-chain-permission-smoke.ts` 通过，检查角色 8 个、动作 6 类、`emailGuessMatched=false`。

### 2026-06-25 外部依赖配置与本地降级冒烟

- 新增 `pnpm exec tsx scripts/full-chain-dependency-fallback-smoke.ts`：只读取配置状态和执行本地 fallback，不调用真实模型、不发邮件、不上传 COS、不访问 Qdrant/Redis。
- OPS-005：脚本验证 AI 配置解析、邮箱 Resend 必填项、COS 密钥成对配置、RAG Redis/Qdrant 缺失时仍有默认 MySQL/collection/lock 配置；密钥只输出布尔状态，不记录明文。
- REQ-004/REQ-005：脚本验证文档拆任务 fallback 可生成前端/后端/测试任务且日期合法，需求体检 fallback 可生成验收标准、前后端测试建议、完整度分数和 warning。
- BUG-004：脚本验证当前 COS 状态为 `configured`；真实文件上传仍需在已登录浏览器/API 场景里单独验证 COS PUT 结果。
- 本轮执行：`pnpm exec tsx scripts/full-chain-dependency-fallback-smoke.ts` 通过；当前环境 AI/COS/Email 为 configured，Redis/Qdrant 未配置但 fallback 配置存在，文档 fallback 生成 9 条任务，需求 fallback 完整度 85。

### 2026-06-25 部署与运行时配置冒烟

- 新增 `pnpm exec tsx scripts/full-chain-deploy-smoke.ts`：静态校验 package scripts、Dockerfile、Docker Compose、docker entrypoint、Docker/SSH/ops 部署脚本、运行时 env 样例、deploy env 样例和 `.dockerignore`，不执行真实 SSH/Docker 部署。
- OPS-002：脚本验证 Docker build 阶段使用占位 `AUTH_DATABASE_URL`/`BETTER_AUTH_SECRET`，并强制 `pnpm db:generate -> pnpm build` 顺序，避免构建期依赖真实 Auth PostgreSQL。
- OPS-003：脚本验证容器入口和非 Docker 部署脚本默认只执行业务 MySQL 迁移，Unified Auth 迁移必须通过 `RUN_AUTH_MIGRATIONS` / `RUN_AUTH_MIGRATE` / `DEPLOY_RUN_AUTH_MIGRATE` 显式打开。
- OPS-004：发现并修复部署缺口：compose 示例缺少 `bug-fix-worker`，Docker runner 镜像缺少 `git`；已补充 `bug-fix-worker` 常驻服务、`AI_PM_BUG_FIX_WORKER_CONTAINER_NAME` 覆盖变量、runner `git` 依赖和 Bug AI 修复运行时 env 样例。
- OPS-005：脚本验证 `.dockerignore` 排除 `.env/.env.*`、`node_modules`、`.next`、`.git` 和 `scripts/deploy.env`，避免部署镜像混入本地密钥或构建产物。
- 本轮执行：`pnpm exec tsx scripts/full-chain-deploy-smoke.ts` 通过，8 个检查组全部通过，覆盖 7 个 compose 服务、4 个 worker 命令、31 个运行时 env 键和 14 个远程部署 env 键。
- 本轮回归：`pnpm exec tsx scripts/full-chain-permission-smoke.ts`、`pnpm exec tsx scripts/full-chain-dependency-fallback-smoke.ts`、`git diff --check`、`pnpm lint`、`pnpm build` 均通过；本机缺少 `docker` 命令，未执行 `docker compose config` 语法解析。

### 2026-06-25 Bug 附件上传规则冒烟

- 新增 `pnpm exec tsx scripts/full-chain-bug-attachment-smoke.ts`：抽离 COS 签名/文件校验到 `src/lib/bug-attachments/cos.ts` 后，用 mock COS 覆盖附件上传成功、COS 失败、密钥缺失、类型错误、大小超限、文件名清洗、prefix/domain 默认值。
- BUG-004：脚本验证图片/视频 MIME 允许上传，`text/plain` 拒绝；成功路径使用 `PUT`、`Content-Type`、`x-cos-acl=public-read`，返回附件包含 key/url/type/mime/size/uploadedAt；COS 返回 403 时 API 层可转为 502 可读错误。
- 发现并修复：附件大小上限被调到 KB/B 级别时，旧文案会显示“文件不能超过 0MB”；已改为按 B/KB/MB 自适应展示。
- 安全边界：脚本默认不真实写入 COS，避免全链路回归反复留下公共测试对象；真实 COS PUT 使用已登录浏览器单独执行 8 字节 `image/png` 小文件验证。
- 真实上传验证：浏览器 POST `/api/bug-attachments` 返回 200，生成 `bug-materials/2026-06-25/25ff36c1-f736-490e-98d3-cfd4b3240c9e-codex-cos-smoke-1782353808608.png`，host 为 `ai-1350977987.cos.ap-guangzhou.myqcloud.com`，控制台无 warning/error。
- 本轮回归：`pnpm exec tsx scripts/full-chain-bug-attachment-smoke.ts`、`pnpm exec tsx scripts/full-chain-dependency-fallback-smoke.ts`、`pnpm exec tsx scripts/full-chain-auth-smoke.ts`、`git diff --check`、`pnpm lint`、`pnpm build` 均通过。

### 2026-06-25 Bug 修复仓库与安全边界冒烟

- 新增 `pnpm exec tsx scripts/full-chain-bug-fix-security-smoke.ts`：覆盖 Bug AI 修复的项目仓库配置、仓库匹配、Runner 输出解析、MR 标题/正文模板和 diff 安全边界；脚本不调用真实 GitHub、不启动真实 AI Runner、不创建真实 PR。
- BUGFIX-001：脚本真实写入 `project_repositories`，验证默认 provider/defaultBranch/packageManager/installCommand、`allowedPaths/blockedPaths/defaultReviewers` JSON 数组回读、项目专属仓库优先匹配、专属仓库禁用后回退到工作区默认仓库、禁用仓库不会出现在可选列表。
- BUGFIX-003：脚本验证安全白名单和默认阻断路径，覆盖空 diff、文件数超限、改动行数超限、`deploy/**`、`src/lib/auth/**`、`*.pem` 等高危路径拒绝；同时验证合法 diff 可通过。
- BUGFIX-003 补充：导出 `parseAiCodeRunnerOutput` 后，脚本验证结构化 JSON 输出和非 JSON 文本兜底都能生成可追踪结果；MR 标题包含 Bug 标题，正文包含 Bug ID、目标分支、变更摘要、测试结果和风险说明。
- 数据清理：所有仓库测试数据使用 `bugfix-security-e2e-*` runLabel，finally 只按本轮 `repoFullName` 清理，避免误删真实生产仓库配置。
- 本轮执行：脚本退出码 0；项目仓库匹配到项目 `1.4`，安全边界错误文案均符合预期。
- 本轮回归：`pnpm exec tsx scripts/full-chain-bug-fix-security-smoke.ts`、`pnpm exec tsx scripts/full-chain-infra-smoke.ts`、`git diff --check`、`pnpm lint`、`pnpm build` 均通过。

### 2026-06-25 工作区与登录身份归并冒烟

- 新增 `pnpm exec tsx scripts/full-chain-workspace-identity-smoke.ts`：使用真实 MySQL 创建临时工作区和成员，调用 `getDashboardData(user, workspaceId)` 模拟登录后的业务身份同步；不依赖真实 OAuth Cookie，不触碰真实业务工作区。
- OPS-001/AUTH-003：脚本验证空工作区首次登录会创建当前成员并授予 `owner`，成员身份写入 `workspace_members.identities[].providerUserId=auth_...`，并持久化到当前工作区。
- MEMBER-007：脚本验证新成员首次访问写入 `lastActiveAt`，5 分钟内再次访问不刷新，手动回拨到 6 分钟前后再次访问会刷新，确认最近活跃节流生效。
- MEMBER-003/AUTH-003：脚本验证已有唯一邮箱成员会被 GitHub 登录身份归并，不创建重复成员，并补齐 SDK `authUserId`，`registrationChannel` 更新为确认的 OAuth 来源。
- AUTH-003/MEMBER-003 历史兼容：脚本构造飞书历史 `ou_...` 成员和重复 `authUserId` 成员，验证登录时优先桥接唯一历史飞书成员、保留原角色、过滤 `ou_...@feishu.local` 占位邮箱，并从重复成员移除同一个 SDK `authUserId`。
- 数据清理：所有临时工作区/成员使用 `workspace-identity-e2e-*` runLabel，finally 删除工作区并依赖外键级联清理成员；残留检查 `workspaces=0/members=0`。
- 发现并修复：首次 `pnpm build` 发现脚本直接访问可选 `DashboardData.meta` 导致 TypeScript 失败；已加入 `getRequiredCurrentMember` 显式断言，运行期错误也会更准确。
- 本轮执行：`pnpm exec tsx scripts/full-chain-workspace-identity-smoke.ts` 通过，覆盖 owner 创建、邮箱归并、飞书历史桥接三个场景。
- 本轮回归：`pnpm exec tsx scripts/full-chain-workspace-identity-smoke.ts`、残留检查、`git diff --check`、`pnpm lint`、`pnpm build` 均通过。

### 2026-06-25 版本范围与项目继承冒烟

- 新增 `pnpm exec tsx scripts/full-chain-version-scope-smoke.ts`：使用真实 MySQL 创建临时项目、父版本、子版本、需求、任务和 Bug，故意提交错误 `project/versionName`，验证服务端按 `versionId` 统一回填版本名称和项目口径。
- VERSION-001/VERSION-002：脚本验证创建子版本时服务端按父版本回填 `parentVersionName/project`，不只依赖前端隐藏字段。
- REQ-001/TASK-001/BUG-001：脚本验证需求、任务、Bug 创建时均继承目标版本 `versionId/versionName/project`，避免版本大屏、任务看板和 Bug 管理口径错位。
- VERSION-005：脚本调用 `createVersionDashboardSnapshots`，验证父版本 scope 包含子版本，父版本大屏能汇总子版本需求/任务/Bug，子版本也能统计自身记录。
- VERSION-003：脚本验证编辑子版本名称时，同步更新该版本下需求、任务、Bug 的 `versionName/project`；子版本项目仍继承父版本，提交值不能覆盖。
- 发现并修复：首次运行复现项目/版本创建仍走 `writeDatabase` 全量同步，在 `syncTasks -> projectTask.upsert` 处触发 Prisma `P2028` 60 秒事务过期；已新增项目/版本单行 upsert 和版本关联记录小范围同步，避免版本操作重写整库。
- 发现并修复：任务/需求创建原本没有像 Bug 一样用 `versionId` 二次回填项目；已统一到 `withRecordVersionScope`，服务端兜底 API/AI/脚本直接写入场景。
- 数据清理：所有临时数据使用 `version-scope-e2e-*` runLabel，finally 直接清理项目、版本、需求、任务、Bug；残留检查均为 0。
- 本轮回归：`pnpm exec tsx scripts/full-chain-version-scope-smoke.ts`、残留检查、`git diff --check`、`pnpm lint`、`pnpm build` 均通过。

### 2026-06-25 成员添加通讯录刷新复核

- MEMBER-002：直连 `listFeishuPeopleWithDiagnostics("")` 复核当前飞书授权范围返回 83 位联系人且无 warning，说明飞书权限、用户组和子部门展开链路正常。
- 发现并修复：成员页原本进入后只加载一次 `/api/feishu/users`，如果旧会话曾缓存“只返回 2 人”的部分结果，添加成员下拉会持续使用旧联系人；已改为进入成员页短缓存加载，打开“添加成员”或“通知配置”时强制刷新。
- UI 补充：飞书联系人 Select 底部继续显示已加载人数，并新增“刷新”按钮，便于管理员在飞书授权调整或 dev server 热更新后立即重拉通讯录。
- 本轮回归：直连通讯录脚本返回 `count=83/warning=""`；`git diff --check`、`pnpm lint`、`pnpm build` 均通过。

### 2026-06-25 全链路冒烟套件统一入口

- 新增 `scripts/full-chain-smoke-suite.ts`，统一编排 23 个 `full-chain-*` 冒烟脚本，支持 `--group core|static|db|auth|all`、`--only id,id`、`--list` 和 `--bail`。
- 新增 package scripts：`pnpm full-chain:smoke` 默认跑核心链路，`pnpm full-chain:smoke:all` 跑全量链路，`pnpm full-chain:smoke:list` 输出用例清单。
- 分组策略：`static` 覆盖权限、覆盖清单、依赖降级、部署静态配置和 Bug 附件 mock；`auth` 覆盖未登录 API/页面保护与真实浏览器登录页；`db` 覆盖真实 MySQL 写入/清理；`core` 将登录、浏览器、静态、CRUD、工作区身份、版本范围等高价值链路合并成日常回归入口。
- 本轮执行：`pnpm full-chain:coverage` 通过，登记 23 个脚本/23 个 suite 用例/14 个 package 入口；`pnpm full-chain:smoke` 通过 20/20，用时约 215.6s，覆盖登录、浏览器未登录跳转、工作台 UI、周报、AI 助手 ChatBox、飞书通讯录、权限矩阵、覆盖清单、依赖降级、需求飞书链接 AI 体检、部署配置、Bug 附件 mock、Bug 修复安全边界、CRUD、成员管理、通知入队、AI 索引管理员重建、工作区身份和版本范围。

### 2026-06-25 浏览器 UI 冒烟脚本化

- 新增 `scripts/full-chain-browser-smoke.ts` 与 `pnpm full-chain:browser`：使用真实 Chromium 验证登录页渲染、未登录工作台跳转、移动端登录页布局；设置 `AI_PM_QA_STORAGE_STATE` 时还会覆盖已登录工作台 8 个一级视图。
- AUTH-001/AUTH-003/AUTH-006：浏览器脚本验证登录页返回 200，飞书、Google、GitHub 入口在渲染后可见；访问 `/workbench?view=members&workspaceId=ws-default` 会进入 `/login?...redirect_uri=...` 且登录入口可见。
- SHELL-008：375px 移动端登录页无横向溢出，`scrollWidth=clientWidth=375`，console 无 error/warning。
- 本轮执行：`pnpm full-chain:browser` 通过 4/4，其中已登录工作台视图因未设置 `AI_PM_QA_STORAGE_STATE` 明确跳过；当前 auth 分组已扩展为 `auth/auth-origin/browser` 3 个用例，并在 `pnpm full-chain:smoke` 中全部通过。

### 2026-06-25 已登录浏览器状态采集

- 新增 `scripts/capture-auth-storage-state.ts` 与 `pnpm full-chain:browser:login`：打开真实登录页，人工完成 Feishu/Google/GitHub OAuth 后等待回到 `/workbench`，校验 `/api/dashboard` 能识别当前成员，再保存 Playwright storageState。
- AUTH-003/AUTH-004/AUTH-005：采集脚本不打印 Cookie/token，默认写入已忽略的 `.ai-pm/qa-auth-storage-state.json`；保存后立即用全新浏览器上下文复放成员管理页和 `/api/dashboard`，确认 Cookie domain/path 可复用。
- `pnpm full-chain:browser` 现在会在未显式设置 `AI_PM_QA_STORAGE_STATE` 时自动复用 `.ai-pm/qa-auth-storage-state.json`，使本地日常回归可以直接覆盖已登录工作台 8 个一级视图。
- 本轮执行：`pnpm full-chain:coverage` 通过并确认 9 个 package 入口；`pnpm full-chain:browser` 在无默认 storageState 时通过匿名 4/4 且明确跳过已登录视图；`pnpm lint`、`pnpm build`、`pnpm exec tsc --noEmit --pretty false` 均通过。`pnpm full-chain:browser:login` 需要人工 OAuth，作为下一次真实登录态采集入口。

### 2026-06-25 工作台 Shell UI 契约冒烟

- 新增 `scripts/full-chain-workbench-ui-smoke.ts` 与 `pnpm full-chain:workbench-ui`：静态守住工作台 Shell 的视图枚举、桌面 Studio 菜单、移动导航、Chat/Studio 切换、`/workbench` URL 同步和侧栏折叠。
- SHELL-002/SHELL-004/SHELL-005/SHELL-006/SHELL-007：脚本验证左下角账号弹层关闭工作区 Select、顶部保留工作区切换、退出登录入口存在、顶部搜索可打开全局搜索抽屉、搜索覆盖项目/任务/Bug/需求版本/需求、日程抽屉覆盖里程碑/任务/Bug 且默认“只看我的”、主题切换绑定 `cycleMode`。
- 本轮执行：`pnpm full-chain:workbench-ui` 通过 6/6，`appViewCount=9/validViewCount=9`、Studio 菜单 7 项、移动导航 7 项、搜索实体 5 类、日程来源 3 类，并守住飞书通讯录强制刷新竞态。

### 2026-06-25 周报导出链路冒烟

- 新增 `scripts/full-chain-weekly-report-smoke.ts` 与 `pnpm full-chain:weekly-report`：不调用真实模型，构造最小 `DashboardData` 覆盖概览页周报导出、个人口径、Markdown 11 章模板、文件名清洗、AI Prompt 事实约束、接口登录保护和本地兜底契约。
- OVERVIEW-003/OVERVIEW-004：脚本验证当前登录用户导出个人周报时不会混入无关项目任务；`/api/assistant/weekly-report` 必须保留 `getSession` 登录保护、`workspaceId` 透传、未配置 AI 和 AI 失败时的本地固定模板 warning。
- UI 契约：概览页“导出周报”只触发专用接口，显示 `pm-global-loading`，完成后用 `createWeeklyReportFileName` 下载 `.md`，不打开旧助手抽屉。
- 本轮执行：`pnpm full-chain:weekly-report` 通过 4/4，生成文件名样例 `默认-工作区-周报-周报用户-个人周报-2026-06-25.md`，Markdown 包含 11 个章节且个人 scope 任务数 2、Bug 数 1。

### 2026-06-25 AI 索引管理员重建冒烟

- 新增 `scripts/full-chain-ai-index-admin-smoke.ts` 与 `pnpm full-chain:ai-index-admin`：使用真实 MySQL 创建临时工作区、版本、需求、任务、Bug 和一个历史飞书 source，执行 Mastra workspace rebuild，只验证入队和 API 契约，不启动 worker、不调用 Qdrant/Embedding。
- RAG-004：脚本验证管理员重建扫描从未入索引的历史业务数据，投递 `version/requirement/task/bug` 四类 `index_entity` job；带 `documentLink` 的需求额外投递 `sync_feishu`，已有飞书 source 投递 `rebuild_source`。
- RAG-005：脚本静态校验 `/api/ai-index/status` 与 `/api/ai-index/rebuild` 都保留 `getSession` 登录保护、`member:manage` 管理员权限校验，状态接口统计 source/job，重建接口走 Mastra workflow 并记录 `authUserId`。
- 本轮执行：`pnpm full-chain:ai-index-admin` 通过 2/2，临时 workspace 重建入队 6 条：`index_entity=4`、`sync_feishu=1`、`rebuild_source=1`，finally 级联清理临时工作区和队列数据。

### 2026-06-25 AI 助手 ChatBox 契约冒烟

- 新增 `scripts/full-chain-assistant-chat-smoke.ts` 与 `pnpm full-chain:assistant-chat`：不访问真实模型，覆盖 `/api/assistant`、模型列表、服务端流式运行时、tools/prompt、前端 ChatBox transport/session 和错误净化。
- AI-001/AI-002：脚本静态守住主接口登录保护、模型未配置 503、`toUIMessageStreamResponse` 错误净化、`getDashboardData(session?.user, workspaceId)` 数据读取和同源 Cookie/origin 透传。
- AI-003/AI-004/AI-005：脚本验证前端保留 110s SSE 超时、非 2xx JSON 错误解析、stream cleanup、workspace+session 隔离、regenerate 裁剪、停止生成、模型下拉、输入 300 字限制和 SSR 安全会话。
- AI-007/AI-008/AI-009/AI-012：脚本验证服务端历史只保留文本并截断 16 条、忽略旧 tool 残留、修复 JSON 外壳、首步强制批量创建/归属/完成/关闭工具、tools/prompt 禁止泄露内部工具和 API 路径。
- 本轮执行：`pnpm full-chain:assistant-chat` 通过 5/5，覆盖 route、stream、tools/prompt、frontend 和 error sanitizer；错误净化检查 8 类输入。

### 2026-06-25 需求飞书链接 AI 体检冒烟

- 新增 `scripts/full-chain-requirement-ai-smoke.ts` 与 `pnpm full-chain:requirement-ai`：不访问真实飞书和模型，覆盖飞书/Lark 链接解析、旧版 doc 识别边界、需求体检 fallback 输出、接口兜底契约和前端表单回填。
- REQ-004：脚本验证 `docx/wiki/larksuite` 链接可解析，无效 URL、非飞书域名、sheets 链接会给出用户可读错误；旧版 `doc` 链接先解析为 `doc`，由读取/API 阶段提示用户转新版 docx。
- REQ-004/REQ-005：脚本验证 AI 未配置或模型失败时 `createFallbackRequirementAnalysis` 仍输出摘要、验收标准、优先级、状态、缺失项、前后端和测试关注点，信息不足需求回到“待评审”。
- UI 契约：`RequirementAiLinkAnalyzer` 必须走 `fetchWithAuthRedirect("/api/requirements/analyze-link")`，并把分析结果写回 `title/priority/status/acceptance/aiSummary/aiRisks/aiMissingItems/aiFrontendNotes/aiBackendNotes/aiTestingNotes/aiCompletenessScore`。
- 本轮执行：`pnpm full-chain:requirement-ai` 通过 4/4，完整需求 fallback 得分 100，信息不足需求生成 4 个缺失项并保留 warning。

### 2026-06-25 认证 Origin 一致性冒烟

- 新增 `scripts/full-chain-auth-origin-smoke.ts` 与 `pnpm full-chain:auth-origin`：验证 `getRequestOriginFromHeaders/resolveTrustedRequestOrigin` 对代理头、本地 host 和非白名单域名的处理，并用真实 HTTP 请求覆盖 localhost/127.0.0.1 登录页和未登录工作台回跳。
- AUTH-009：脚本要求 `/workbench` 未登录重定向到同 origin 的 `/login`，且 `redirect_uri` 仍保持同一 origin，避免 localhost 与 127.0.0.1 混用造成 OAuth 成功后 Cookie 写到另一个 host。
- 本轮执行：`pnpm full-chain:auth-origin` 通过 5/5，覆盖 request-origin helper、`http://localhost:3004` 与 `http://127.0.0.1:3004` 登录页 200/OAuth 入口、未登录工作台 307 到同 origin `/login`，且 `redirect_uri` origin 与当前访问 origin 一致。

### 2026-06-25 覆盖清单防退化校验

- 新增 `scripts/full-chain-coverage-smoke.ts` 与 `pnpm full-chain:coverage`：静态校验 `scripts/full-chain-*.ts` 是否全部纳入统一 runner、package scripts 是否指向正确入口、测试矩阵是否记录关键用例 ID 与脚本、重要 API 路由是否在矩阵中可追踪。
- GATE-006：首次执行即捕获新脚本未写入测试计划的问题，补齐文档后该守门可避免后续新增脚本或入口“有文件但无人执行”。

### 2026-06-25 飞书通讯录全量读取冒烟

- 新增 `scripts/full-chain-feishu-contact-smoke.ts` 与 `pnpm full-chain:feishu-contact`：只读验证飞书通讯录授权范围、用户组/子部门展开、open_id 去重、搜索过滤和 `ou_...` 通知目标形态。
- MEMBER-002/MEMBER-003：脚本要求通讯录人数达到 `AI_PM_QA_FEISHU_MIN_PEOPLE`（默认 10）且无用户组读取 warning，避免添加成员下拉再次退化成只能看到少数直接授权成员。
- 安全边界：脚本不写 AI PM 数据库、不修改飞书通讯录、不发送消息；只输出人数、邮箱/头像覆盖数和少量成员姓名样本，不输出 token 或密钥。
- 本轮执行：`pnpm full-chain:feishu-contact` 通过，当前授权范围返回 83 人、头像 83 个、邮箱 3 个、warning 为空，搜索关键词 `11` 返回 8 人且命中探针成员；`pnpm full-chain:coverage` 通过，登记脚本 16 个；`pnpm full-chain:smoke` 通过 13/13，用时约 190.3s。

### 2026-06-25 成员管理写入冒烟

- 新增 `scripts/full-chain-member-management-smoke.ts` 与 `pnpm full-chain:member-management`：真实 MySQL 创建手动成员和飞书通知成员，验证角色/状态修改、邮箱/飞书通知渠道保存、Webhook 占位渠道保存和重复邮箱/open_id 拦截。
- MEMBER-003/MEMBER-004/MEMBER-005/MEMBER-006：脚本覆盖手动成员 `registrationChannel=email`、飞书 open_id 写入 identities/notification、角色改为 qa/frontend、状态改为 disabled，以及重复成员错误文案。
- MEMBER-008/MEMBER-009：脚本只保存通知渠道配置，不发送消息；同时对比项目、任务、Bug、需求、版本和通知 job 计数，确认成员配置仍走 `workspace_members` 单行写入，不触发全量业务表重写。
- 本轮执行：`pnpm full-chain:member-management` 通过，临时成员 2 个均落库并清理，重复创建/更新均被拒绝；业务行计数保持 `projects=14/tasks=154/bugs=9/requirements=8/versions=7/sideEffects=5` 不变；`pnpm full-chain:coverage` 通过，登记脚本 17 个；`pnpm full-chain:smoke` 通过 14/14，用时约 207.8s。

### 2026-06-25 通知渠道入队冒烟

- 新增 `scripts/full-chain-notification-smoke.ts` 与 `pnpm full-chain:notification`：使用临时成员配置飞书、邮箱和禁用 Webhook 占位渠道，直接验证 `dashboard_side_effect_jobs` 队列协议，不创建真实业务任务、不调用飞书或 Resend 发送。
- MEMBER-008/MEMBER-009：脚本按 `channelProvider/channelId` 拆分 `notify_owner` job；邮箱环境存在时预期飞书和邮箱各 1 条，缺 `RESEND_API_KEY` 或 `EMAIL_FROM` 时只预期飞书入队并输出邮箱降级原因。
- OPS-004：测试 job 设置未来 `nextRunAt`，保证 MySQL fallback inline worker 不会在冒烟期间抢任务真实发送；finally 按 runId 清理测试成员和 side-effect job。
- 覆盖清单补充：`scripts/full-chain-smoke-suite.ts` 将 notification 纳入 `core/db/all` 分组，`scripts/full-chain-coverage-smoke.ts` 额外检查 `full-chain:notification` package 入口，防止通知回归脚本失联。
- 本轮执行：`pnpm full-chain:notification` 通过，当前环境 `RESEND_API_KEY` 与 `EMAIL_FROM` 完整，脚本验证飞书/邮箱各 1 条 queued job；`pnpm full-chain:coverage` 通过，登记脚本 15 个；`pnpm full-chain:smoke` 通过 12/12，用时约 139.7s。
