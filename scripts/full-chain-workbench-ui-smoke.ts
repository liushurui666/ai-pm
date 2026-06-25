import fs from "node:fs";
import path from "node:path";

type UiContractCheck = {
  detail: Record<string, unknown>;
  name: string;
  ok: boolean;
};

const repoRoot = process.cwd();
const platformDir = path.join(repoRoot, "src/components/project-management-platform");
const indexPath = path.join(platformDir, "index.tsx");
const constantsPath = path.join(platformDir, "constants.ts");
const typesPath = path.join(platformDir, "types.ts");
const sidebarPath = path.join(platformDir, "shared/workbench-sidebar/index.tsx");
const accountPopoverPath = path.join(platformDir, "shared/workbench-sidebar/account-popover/index.tsx");
const searchDrawerPath = path.join(platformDir, "drawers/search-drawer/index.tsx");
const scheduleDrawerPath = path.join(platformDir, "drawers/schedule-drawer/index.tsx");

const expectedViews = [
  "overview",
  "projects",
  "versionDashboard",
  "tasks",
  "bugs",
  "bugEdit",
  "requirements",
  "assistant",
  "members"
];
const expectedStudioLabels = [
  "工作台",
  "项目视图",
  "版本大屏",
  "任务看板",
  "Bug 管理",
  "需求管理",
  "成员管理"
];
const expectedMobileViews = [
  "overview",
  "projects",
  "versionDashboard",
  "tasks",
  "bugs",
  "requirements",
  "assistant"
];

function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runCheck(name: string, check: () => Record<string, unknown>): UiContractCheck {
  try {
    return {
      detail: check(),
      name,
      ok: true
    };
  } catch (error) {
    return {
      detail: {
        error: error instanceof Error ? error.message : "工作台 UI 契约冒烟失败"
      },
      name,
      ok: false
    };
  }
}

function getQuotedValues(text: string, anchor: string) {
  const anchorIndex = text.indexOf(anchor);
  const scopedText = anchorIndex >= 0 ? text.slice(anchorIndex, anchorIndex + 1_200) : text;

  return [...scopedText.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function verifyViewRegistry() {
  const constantsText = readText(constantsPath);
  const typesText = readText(typesPath);
  const validViewValues = [...new Set(getQuotedValues(constantsText, "validViews"))];
  const appViewValues = [...new Set(getQuotedValues(typesText, "export type AppView"))];
  const missingInValidViews = expectedViews.filter((view) => !validViewValues.includes(view));
  const missingInAppView = expectedViews.filter((view) => !appViewValues.includes(view));
  const extraValidViews = validViewValues.filter((view) => expectedViews.includes(view) && !appViewValues.includes(view));

  // URL、侧栏、移动导航和浏览器冒烟都依赖同一组 AppView；枚举漂移会让部分模块无法通过 query 直达。
  assertSmoke(!missingInValidViews.length, `validViews 缺少视图：${missingInValidViews.join(", ")}`);
  assertSmoke(!missingInAppView.length, `AppView 类型缺少视图：${missingInAppView.join(", ")}`);
  assertSmoke(!extraValidViews.length, `validViews 与 AppView 不一致：${extraValidViews.join(", ")}`);

  return {
    appViewCount: appViewValues.filter((view) => expectedViews.includes(view)).length,
    validViewCount: validViewValues.filter((view) => expectedViews.includes(view)).length
  };
}

function verifyNavigationContracts() {
  const indexText = readText(indexPath);
  const sidebarText = readText(sidebarPath);
  const missingStudioLabels = expectedStudioLabels.filter((label) => !indexText.includes(`label: "${label}"`));
  const missingMobileViews = expectedMobileViews.filter((view) => !indexText.includes(`value: "${view}"`));

  // 桌面侧栏承载完整 Studio 模块，移动端保留高频一级模块；Chat/Studio 切换必须仍然能进入助手和回到工作台。
  assertSmoke(!missingStudioLabels.length, `Studio 侧栏缺少菜单：${missingStudioLabels.join(", ")}`);
  assertSmoke(!missingMobileViews.length, `移动导航缺少视图：${missingMobileViews.join(", ")}`);
  assertSmoke(sidebarText.includes("value={navigationView === \"assistant\" ? \"chat\" : \"studio\"}"), "Chat/Studio Segmented 没有跟随 assistant 视图。");
  assertSmoke(sidebarText.includes("onSwitchView(\"assistant\")"), "Chat 模式未切到 assistant。");
  assertSmoke(sidebarText.includes("onSwitchView(\"overview\")"), "从 Chat 回 Studio 未回到 overview。");
  assertSmoke(indexText.includes("window.location.assign(`/workbench${getWorkspaceQueryString(view)}`)"), "视图跳转没有固定到 /workbench。");
  assertSmoke(indexText.includes("window.history.replaceState(null, \"\", url.toString())"), "工作台视图切换没有同步 URL。");

  return {
    mobileViews: expectedMobileViews.length,
    studioMenuItems: expectedStudioLabels.length
  };
}

function verifyAccountAndWorkspaceContracts() {
  const indexText = readText(indexPath);
  const accountText = readText(accountPopoverPath);

  // 顶栏工作区入口和左下角账号入口共用同一组件，但左下角必须禁用工作区 Select，避免退出登录路径被重复工作区控件淹没。
  assertSmoke(accountText.includes("showWorkspaceControls && workspaces?.length"), "账号弹层工作区控件缺少 showWorkspaceControls 闸门。");
  assertSmoke(accountText.includes("aria-label=\"切换工作区\""), "顶部工作区 Select 缺少可访问标签。");
  assertSmoke(accountText.includes("退出登录"), "账号弹层缺少退出登录按钮。");
  assertSmoke(indexText.includes("const accountPopoverContent = renderAccountPopoverContent(true);"), "顶部账号/工作区弹层没有启用工作区控件。");
  assertSmoke(indexText.includes("const sidebarAccountPopoverContent = renderAccountPopoverContent(false);"), "左下角账号弹层没有关闭工作区控件。");
  assertSmoke(indexText.includes("accountPopoverContent={sidebarAccountPopoverContent}"), "侧栏没有使用关闭工作区控件的弹层内容。");
  assertSmoke(indexText.includes("<AccountWorkspacePopover"), "桌面顶部缺少工作区快捷入口。");
  assertSmoke(indexText.includes("<AccountAvatarPopover"), "移动端缺少头像账号入口。");

  return {
    hasLogout: true,
    sidebarWorkspaceControls: false,
    topWorkspaceControls: true
  };
}

function verifySearchAndScheduleContracts() {
  const indexText = readText(indexPath);
  const searchText = readText(searchDrawerPath);
  const scheduleText = readText(scheduleDrawerPath);
  const searchEntities = ["project", "task", "bug", "requirementVersion", "requirement"];
  const missingSearchEntities = searchEntities.filter((entity) => !searchText.includes(`entity: "${entity}"`));

  // 全局搜索与日程抽屉是工作台最容易被样式重构误伤的横向入口；这里守住数据来源、打开动作和筛选控件。
  assertSmoke(indexText.includes("placeholder=\"搜索项目、任务、Bug、需求\""), "顶部搜索输入缺少标准 placeholder。");
  assertSmoke(indexText.includes("onPressEnter={() => {"), "顶部搜索缺少回车打开逻辑。");
  assertSmoke(indexText.includes("setSearchOpen(true)"), "顶部搜索未打开搜索抽屉。");
  assertSmoke(indexText.includes("<SearchDrawer"), "主壳未渲染 SearchDrawer。");
  assertSmoke(!missingSearchEntities.length, `全局搜索缺少实体：${missingSearchEntities.join(", ")}`);
  assertSmoke(searchText.includes("].slice(0, 30)"), "全局搜索缺少结果数量上限。");
  assertSmoke(searchText.includes("onOpenResult(result)"), "搜索结果缺少打开动作。");
  assertSmoke(indexText.includes("<ScheduleDrawer"), "主壳未渲染 ScheduleDrawer。");
  assertSmoke(indexText.includes("setScheduleOpen(true)"), "顶部日程按钮未打开日程抽屉。");
  assertSmoke(scheduleText.includes("const [onlyMine, setOnlyMine] = useState(true)"), "日程抽屉默认未开启只看我的。");
  assertSmoke(scheduleText.includes("disabled={!currentUser}"), "日程只看我的开关缺少未登录禁用保护。");
  assertSmoke(scheduleText.includes("options={[\"全部\", \"里程碑\", \"任务\", \"Bug\"]}"), "日程抽屉缺少类型筛选。");
  assertSmoke(scheduleText.includes("data.requirementVersions.flatMap"), "日程未纳入需求版本里程碑。");
  assertSmoke(scheduleText.includes("data.tasks.map"), "日程未纳入任务。");
  assertSmoke(scheduleText.includes("data.bugs.map"), "日程未纳入 Bug。");

  return {
    scheduleSources: 3,
    searchEntities: searchEntities.length,
    searchLimit: 30
  };
}

function verifyFeishuPeopleRefreshContracts() {
  const indexText = readText(indexPath);
  const membersText = readText(path.join(platformDir, "views/members-view/index.tsx"));

  // 成员管理的通讯录加载同时存在“进入页面懒加载”和“打开添加成员强制刷新”两条触发路径。
  // 如果强制刷新仍被 peopleLoading 短路，或者旧请求可覆盖新请求，用户会看到飞书真实有 83 人但下拉只剩历史少量成员。
  assertSmoke(indexText.includes("const feishuPeopleRequestSeqRef = useRef(0);"), "飞书通讯录加载缺少请求序号闸门。");
  assertSmoke(indexText.includes("const requestSeq = feishuPeopleRequestSeqRef.current + 1;"), "飞书通讯录刷新没有为每次请求生成序号。");
  assertSmoke(indexText.includes("feishuPeopleRequestSeqRef.current !== requestSeq"), "飞书通讯录旧请求仍可能覆盖最新强制刷新结果。");
  assertSmoke(indexText.includes("if ((!options.force && peopleLoading) || shouldUseCache)"), "飞书通讯录强制刷新仍会被进行中的懒加载短路。");
  assertSmoke(membersText.includes("await onReloadPeople();"), "添加成员入口没有等待强制刷新通讯录完成。");
  assertSmoke(membersText.includes("setDrawerOpen(true);"), "添加成员入口没有在通讯录刷新后打开表单。");
  assertSmoke(membersText.includes("getFeishuPeopleStatusText"), "添加成员表单缺少常驻通讯录同步状态提示。");
  assertSmoke(membersText.includes("已加载 ${people.length} 位联系人"), "飞书联系人下拉缺少已加载人数提示。");
  // 飞书接口可能已经返回 83 人，但 Select 搜索框只展示当前过滤命中的少数人；
  // 必须显式展示“总数 + 当前匹配数”，否则用户会误以为添加成员没有取全通讯录。
  assertSmoke(membersText.includes("当前搜索匹配 ${matchedCount} 位"), "飞书联系人搜索缺少当前匹配人数提示。");
  assertSmoke(membersText.includes("searchValue={feishuSearchValue}"), "飞书联系人搜索缺少受控 searchValue，旧搜索词可能残留。");

  return {
    forceBypassesLoading: true,
    staleRequestIgnored: true,
    visibleContactCount: true
  };
}

function verifyThemeAndShellControls() {
  const indexText = readText(indexPath);

  // 主题切换和侧栏折叠属于全局 shell 状态；它们不依赖业务数据，必须始终挂在 Header/Sider 上。
  assertSmoke(indexText.includes("useThemePreference()"), "工作台未接入主题偏好 hook。");
  assertSmoke(indexText.includes("<ThemeToggleButton"), "顶部缺少主题切换按钮。");
  assertSmoke(indexText.includes("onClick={cycleMode}"), "主题按钮未绑定 cycleMode。");
  assertSmoke(indexText.includes("collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />"), "侧栏折叠按钮图标状态缺失。");
  assertSmoke(indexText.includes("setCollapsed((current) => !current)"), "侧栏折叠按钮未切换 collapsed 状态。");
  assertSmoke(indexText.includes("className={navigationView === \"assistant\" ? \"pm-sider pm-sider--chat\" : \"pm-sider\"}"), "助手模式侧栏缺少 chat 样式状态。");
  assertSmoke(indexText.includes("<div className=\"pm-mobile-nav\">"), "移动端导航容器缺失。");

  return {
    hasMobileNav: true,
    hasSidebarToggle: true,
    hasThemeToggle: true
  };
}

const results = [
  runCheck("view registry", verifyViewRegistry),
  runCheck("navigation contracts", verifyNavigationContracts),
  runCheck("account and workspace contracts", verifyAccountAndWorkspaceContracts),
  runCheck("search and schedule contracts", verifySearchAndScheduleContracts),
  runCheck("feishu people refresh contracts", verifyFeishuPeopleRefreshContracts),
  runCheck("theme and shell controls", verifyThemeAndShellControls)
];
const failed = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  checked: results.length,
  failed: failed.length,
  results
}, null, 2));

if (failed.length) {
  process.exitCode = 1;
}
