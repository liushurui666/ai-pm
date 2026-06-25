# AI PM 全链路测试用例矩阵

状态：执行中  
负责人：Codex QA  
最后更新：2026-06-24  

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

- 新增 `pnpm exec tsx scripts/full-chain-auth-smoke.ts`：无 Cookie 覆盖 25 个入口，包括 `/workbench`、`/bugs/{bugId}`、登录页、dashboard、members、feishu/users、project-repositories、records、workspaces、documents/analyze、requirements/analyze-link、bug-attachments、bug-fix-jobs、ai-index、assistant、weekly-report。
- AUTH-001/AUTH-002：脚本验证 `/workbench?view=members&workspaceId=ws-default` 与 `/bugs/bug-missing?workspaceId=ws-default` 均返回 307，并跳转 `/login?client_id=ai-pm&redirect_uri=...`，回跳地址保留当前页面。
- AUTH-003 前置入口：脚本验证登录页返回 200，HTML 包含飞书、Google、GitHub 登录入口；当前脚本只检查入口存在，不代替真实 OAuth 授权。
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
