"use client";

import dayjs from "dayjs";
import { Button, Empty, Select, Space, Typography } from "antd";
import {
  CalendarOutlined,
  CompressOutlined,
  FilterOutlined,
  FullscreenOutlined,
  NodeIndexOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { VersionDashboardBoard } from "@/components/project-management-platform/views/version-dashboard-board";
import {
  allVersionDashboardFilterValue,
  createVersionDashboardSnapshots,
  createVersionOwnerLoads,
  type VersionDashboardSnapshot
} from "@/components/project-management-platform/views/version-dashboard-utils";

const { Text } = Typography;

const versionStatuses: RequirementVersion["status"][] = ["规划中", "进行中", "已发布", "已归档"];
const versionStatusFilterOptions: Array<RequirementVersion["status"] | typeof allVersionDashboardFilterValue> = [
  allVersionDashboardFilterValue,
  ...versionStatuses
];

type ReleaseFilterValue = typeof allVersionDashboardFilterValue | "delayed" | "next30" | "thisMonth";

const releaseFilterOptions: Array<{ value: ReleaseFilterValue; label: string }> = [
  { value: allVersionDashboardFilterValue, label: "全部时间" },
  { value: "delayed", label: "已延期" },
  { value: "next30", label: "30天内" },
  { value: "thisMonth", label: "本月发布" }
];

function getVersionOwners(snapshot: VersionDashboardSnapshot) {
  return [snapshot.productOwner, snapshot.uiOwner, snapshot.devOwner].filter(Boolean) as string[];
}

// 时间筛选单独收口，避免页面 JSX 里混入相对日期判断。
function matchesReleaseFilter(snapshot: VersionDashboardSnapshot, filter: ReleaseFilterValue) {
  if (filter === allVersionDashboardFilterValue) {
    return true;
  }

  if (filter === "delayed") {
    return snapshot.daysToRelease < 0 || snapshot.overdueTaskCount > 0;
  }

  if (filter === "next30") {
    return snapshot.daysToRelease >= 0 && snapshot.daysToRelease <= 30;
  }

  return dayjs(snapshot.releaseDate).isSame(dayjs(), "month");
}

// 版本统计看板主容器只负责真实可用的版本切换、筛选和全屏，其余图表交给子组件。
export function VersionDashboardView({
  bugs,
  requirements,
  tasks,
  versions,
  onOpenVersion
}: {
  bugs: BugReport[];
  requirements: Requirement[];
  tasks: Task[];
  versions: RequirementVersion[];
  onOpenVersion: (versionId: string) => void;
}) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [statusFilter, setStatusFilter] = useState<RequirementVersion["status"] | typeof allVersionDashboardFilterValue>(
    allVersionDashboardFilterValue
  );
  const [versionFilter, setVersionFilter] = useState(allVersionDashboardFilterValue);
  const [ownerFilter, setOwnerFilter] = useState(allVersionDashboardFilterValue);
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilterValue>(allVersionDashboardFilterValue);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const snapshots = useMemo(
    () => createVersionDashboardSnapshots({ bugs, requirements, tasks, versions }),
    [bugs, requirements, tasks, versions]
  );
  const ownerOptions = useMemo(
    () =>
      Array.from(new Set(snapshots.flatMap((snapshot) => getVersionOwners(snapshot))))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "zh-CN")),
    [snapshots]
  );
  const selectedVersion = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === versionFilter),
    [snapshots, versionFilter]
  );
  const visibleSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) =>
          (versionFilter === allVersionDashboardFilterValue || snapshot.id === versionFilter) &&
          (statusFilter === allVersionDashboardFilterValue || snapshot.status === statusFilter) &&
          (ownerFilter === allVersionDashboardFilterValue || getVersionOwners(snapshot).includes(ownerFilter)) &&
          matchesReleaseFilter(snapshot, releaseFilter)
      ),
    [ownerFilter, releaseFilter, snapshots, statusFilter, versionFilter]
  );
  const ownerLoads = useMemo(
    () => createVersionOwnerLoads(visibleSnapshots, tasks, bugs).slice(0, 10),
    [bugs, tasks, visibleSnapshots]
  );
  const hasActiveFilters =
    statusFilter !== allVersionDashboardFilterValue ||
    versionFilter !== allVersionDashboardFilterValue ||
    ownerFilter !== allVersionDashboardFilterValue ||
    releaseFilter !== allVersionDashboardFilterValue;

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === dashboardRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();

      return;
    }

    await dashboardRef.current?.requestFullscreen();
  }

  // 重置只处理真实筛选条件，避免顶部出现“看似能操作但无反馈”的按钮。
  function resetFilters() {
    setStatusFilter(allVersionDashboardFilterValue);
    setVersionFilter(allVersionDashboardFilterValue);
    setOwnerFilter(allVersionDashboardFilterValue);
    setReleaseFilter(allVersionDashboardFilterValue);
  }

  return (
    <div className="version-dashboard-page" ref={dashboardRef}>
      <div className="version-board-toolbar" aria-label="版本统计看板工具栏">
        <Space align="center" size={10} className="version-board-toolbar-title">
          <NodeIndexOutlined />
          <Text strong>版本统计看板</Text>
        </Space>
        <Space wrap size={8} className="version-board-toolbar-actions">
          <Button disabled={!hasActiveFilters} icon={<FilterOutlined />} onClick={resetFilters}>
            重置筛选
          </Button>
          <Button icon={isFullscreen ? <CompressOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen}>
            {isFullscreen ? "退出演示" : "全屏演示"}
          </Button>
        </Space>
      </div>

      <section className="version-board-version-switch" aria-label="版本切换">
        <div className="version-board-version-tabs-shell">
          <Space align="center" size={10} className="version-board-version-switch-heading">
            <NodeIndexOutlined />
            <Text strong>版本切换</Text>
          </Space>
          <div className="version-board-version-tabs" role="group" aria-label="版本切换">
            <button
              className={
                versionFilter === allVersionDashboardFilterValue
                  ? "version-board-version-tab version-board-version-tab-active"
                  : "version-board-version-tab"
              }
              type="button"
              onClick={() => setVersionFilter(allVersionDashboardFilterValue)}
            >
              全部版本
            </button>
            {snapshots.map((snapshot) => (
              <button
                className={versionFilter === snapshot.id ? "version-board-version-tab version-board-version-tab-active" : "version-board-version-tab"}
                key={snapshot.id}
                type="button"
                onClick={() => setVersionFilter(snapshot.id)}
              >
                <span>{snapshot.name}</span>
                <em>{snapshot.status}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="version-board-version-summary">
          <Text strong>{selectedVersion?.name ?? "全部版本"}</Text>
          <Text type="secondary">
            {selectedVersion
              ? `${selectedVersion.project} · ${selectedVersion.releaseDate} 发布 · ${selectedVersion.taskCount} 个任务`
              : `汇总 ${snapshots.length} 个版本`}
          </Text>
        </div>
      </section>

      <div className="version-board-filter-row">
        <div className="version-board-filter-card">
          <Text strong>版本状态</Text>
          <div className="version-board-filter-pills" role="group" aria-label="版本状态筛选">
            {versionStatusFilterOptions.map((status) => (
              <button
                className={statusFilter === status ? "version-board-filter-pill version-board-filter-pill-active" : "version-board-filter-pill"}
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="version-board-filter-card version-board-owner-filter-card">
          <Text strong>版本负责人</Text>
          <div className="version-board-owner-pills" role="group" aria-label="版本负责人筛选">
            <button
              className={
                ownerFilter === allVersionDashboardFilterValue
                  ? "version-board-owner-pill version-board-owner-pill-active"
                  : "version-board-owner-pill"
              }
              type="button"
              onClick={() => setOwnerFilter(allVersionDashboardFilterValue)}
            >
              <span className="version-board-owner-pill-avatar">All</span>
              全部
            </button>
            {ownerOptions.map((owner, index) => (
              <button
                className={ownerFilter === owner ? "version-board-owner-pill version-board-owner-pill-active" : "version-board-owner-pill"}
                key={owner}
                type="button"
                onClick={() => setOwnerFilter(owner)}
              >
                <span className={`version-board-owner-pill-avatar version-board-owner-pill-avatar-${(index % 5) + 1}`}>
                  {owner.slice(0, 1)}
                </span>
                {owner}
              </button>
            ))}
          </div>
        </div>

        <div className="version-board-filter-card version-board-time-filter-card">
          <Space align="center" size={8}>
            <CalendarOutlined />
            <Text strong>发布时间</Text>
          </Space>
          <Select
            aria-label="版本发布时间筛选"
            className="version-board-time-select"
            value={releaseFilter}
            onChange={setReleaseFilter}
            options={releaseFilterOptions}
          />
        </div>
      </div>

      {visibleSnapshots.length ? (
        <VersionDashboardBoard
          ownerLoads={ownerLoads}
          snapshots={visibleSnapshots}
          onOpenVersion={onOpenVersion}
        />
      ) : (
        <div className="version-dashboard-empty version-board-empty-state">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下暂无版本数据" />
        </div>
      )}
    </div>
  );
}
