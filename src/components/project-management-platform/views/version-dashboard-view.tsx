"use client";

import { Button, Empty, Select, Space, Tag, Typography } from "antd";
import {
  BugOutlined,
  CheckCircleOutlined,
  CompressOutlined,
  FullscreenOutlined,
  NodeIndexOutlined,
  RocketOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BugReport, Requirement, RequirementVersion, Task } from "@/types/dashboard";
import { PageTitle } from "@/components/project-management-platform/shared/page-shell";
import {
  MetricTile,
  OwnerLoadBoard,
  TaskStageFunnel,
  VersionDistribution,
  VersionMatrix,
  VersionScoreboard,
  versionStatuses
} from "@/components/project-management-platform/views/version-dashboard-panels";
import { MilestoneSignals } from "@/components/project-management-platform/views/version-dashboard-milestones";
import { VersionDashboardMark } from "@/components/project-management-platform/views/version-dashboard-visuals";
import {
  allVersionDashboardFilterValue,
  createVersionDashboardSnapshots,
  createVersionMilestoneSignals,
  createVersionOwnerLoads
} from "@/components/project-management-platform/views/version-dashboard-utils";

const { Text, Title } = Typography;

function getAverage(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// 版本大屏主视图负责筛选和编排，所有业务统计都来自 utils，避免 JSX 里夹杂复杂口径。
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
  const [projectFilter, setProjectFilter] = useState(allVersionDashboardFilterValue);
  const [statusFilter, setStatusFilter] = useState(allVersionDashboardFilterValue);
  const [versionFilter, setVersionFilter] = useState(allVersionDashboardFilterValue);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const snapshots = useMemo(
    () => createVersionDashboardSnapshots({ bugs, requirements, tasks, versions }),
    [bugs, requirements, tasks, versions]
  );
  const visibleSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) =>
          (projectFilter === allVersionDashboardFilterValue || snapshot.project === projectFilter) &&
          (statusFilter === allVersionDashboardFilterValue || snapshot.status === statusFilter) &&
          (versionFilter === allVersionDashboardFilterValue || snapshot.id === versionFilter)
      ),
    [projectFilter, snapshots, statusFilter, versionFilter]
  );
  const projects = useMemo(
    () => Array.from(new Set(versions.map((version) => version.project))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    [versions]
  );
  const visibleVersionIds = useMemo(
    () => new Set(visibleSnapshots.flatMap((snapshot) => snapshot.scopeVersionIds)),
    [visibleSnapshots]
  );
  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.versionId && visibleVersionIds.has(task.versionId)),
    [tasks, visibleVersionIds]
  );
  const visibleBugs = useMemo(
    () => bugs.filter((bug) => bug.versionId && visibleVersionIds.has(bug.versionId)),
    [bugs, visibleVersionIds]
  );
  const metrics = useMemo(() => {
    const activeVersions = visibleSnapshots.filter((snapshot) => snapshot.status === "进行中").length;
    const riskVersions = visibleSnapshots.filter(
      (snapshot) => snapshot.daysToRelease < 0 || snapshot.openBugCount || snapshot.overdueTaskCount
    ).length;

    return {
      activeVersions,
      averageReadiness: getAverage(visibleSnapshots.map((snapshot) => snapshot.readiness)),
      openBugs: visibleBugs.filter((bug) => bug.status !== "已关闭").length,
      riskVersions,
      totalTasks: visibleTasks.length,
      totalVersions: visibleSnapshots.length
    };
  }, [visibleBugs, visibleSnapshots, visibleTasks]);
  const ownerLoads = useMemo(
    () => createVersionOwnerLoads(visibleSnapshots, tasks, bugs).slice(0, 6),
    [bugs, tasks, visibleSnapshots]
  );
  const milestoneSignals = useMemo(
    () => createVersionMilestoneSignals(visibleSnapshots).slice(0, 8),
    [visibleSnapshots]
  );

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

  return (
    <div className="version-dashboard-page" ref={dashboardRef}>
      <PageTitle
        icon={<NodeIndexOutlined />}
        title="版本大屏"
        subtitle="以需求版本为主轴，横向查看范围、进度、缺陷、里程碑和负责人负载。"
        extra={
          <Space wrap className="version-dashboard-toolbar">
            <Select
              className="version-dashboard-filter"
              value={projectFilter}
              onChange={setProjectFilter}
              aria-label="版本大屏项目筛选"
              options={[
                { value: allVersionDashboardFilterValue, label: "全部项目" },
                ...projects.map((project) => ({ value: project, label: project }))
              ]}
            />
            <Select
              className="version-dashboard-filter"
              value={statusFilter}
              onChange={setStatusFilter}
              aria-label="版本大屏状态筛选"
              options={[
                { value: allVersionDashboardFilterValue, label: "全部状态" },
                ...versionStatuses.map((status) => ({ value: status, label: status }))
              ]}
            />
            <Select
              className="version-dashboard-version-filter"
              showSearch
              optionFilterProp="label"
              value={versionFilter}
              onChange={setVersionFilter}
              aria-label="版本大屏版本筛选"
              options={[
                { value: allVersionDashboardFilterValue, label: "全部版本" },
                ...snapshots.map((snapshot) => ({
                  value: snapshot.id,
                  label: `${snapshot.name} · ${snapshot.project}`
                }))
              ]}
            />
            <Button icon={isFullscreen ? <CompressOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen}>
              {isFullscreen ? "退出演示" : "演示模式"}
            </Button>
          </Space>
        }
      />

      <div className="version-dashboard-hero">
        <div className="version-dashboard-hero-copy">
          <VersionDashboardMark />
          <div className="version-dashboard-hero-text">
            <Space wrap size={[8, 8]}>
              <Tag icon={<RocketOutlined />}>{metrics.totalVersions} 个版本</Tag>
              <Tag icon={<CheckCircleOutlined />}>{metrics.totalTasks} 个任务</Tag>
              <Tag icon={<BugOutlined />}>{metrics.openBugs} 个未关闭 Bug</Tag>
            </Space>
            <Title level={3}>版本交付态势</Title>
            <Text type="secondary">
              汇总父子版本范围，把需求就绪、任务完成、里程碑完成和缺陷健康合成一个可对比的交付分。
            </Text>
          </div>
        </div>
        <div className="version-dashboard-metrics">
          <MetricTile icon={<NodeIndexOutlined />} label="版本总数" tone="brand" value={metrics.totalVersions} />
          <MetricTile icon={<RocketOutlined />} label="进行中" tone="teal" value={metrics.activeVersions} />
          <MetricTile icon={<CheckCircleOutlined />} label="平均就绪" suffix="%" tone="violet" value={metrics.averageReadiness} />
          <MetricTile icon={<WarningOutlined />} label="风险版本" tone="amber" value={metrics.riskVersions} />
        </div>
      </div>

      {visibleSnapshots.length ? (
        <>
          <div className="version-dashboard-grid">
            <VersionScoreboard snapshots={visibleSnapshots.slice(0, 8)} onOpenVersion={onOpenVersion} />
            <VersionDistribution snapshots={visibleSnapshots} />
            <TaskStageFunnel tasks={visibleTasks} />
            <OwnerLoadBoard loads={ownerLoads} />
          </div>
          <VersionMatrix snapshots={visibleSnapshots.slice(0, 6)} onOpenVersion={onOpenVersion} />
          <MilestoneSignals signals={milestoneSignals} />
        </>
      ) : (
        <div className="version-dashboard-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选下暂无版本数据" />
        </div>
      )}
    </div>
  );
}
