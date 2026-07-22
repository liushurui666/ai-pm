"use client";

import "./index.less";
import { Avatar, Empty, Select, Tag, Timeline, Typography } from "antd";
import { HistoryOutlined, UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import type { DashboardMember } from "@/types/dashboard";
import type { ProjectActivity } from "@/components/project-management-platform/views/projects-view/types";

const { Text, Title } = Typography;

const entityLabels: Record<string, string> = {
  project: "项目",
  requirementVersion: "项目/版本",
  requirement: "需求",
  task: "任务",
  risk: "风险",
  bug: "Bug"
};

const actionLabels: Record<string, string> = {
  created: "已创建",
  updated: "已更新",
  deleted: "已删除",
  status_changed: "变更了状态",
  owner_changed: "变更了负责人",
  members_added: "添加了项目成员",
  member_updated: "更新了成员权限",
  member_permission_updated: "更新了成员权限",
  assignment_permission_synced: "同步了责任指派权限",
  member_removed: "移除了项目成员",
  owner_transferred: "完成了负责人交接",
  delivery_node_updated: "更新了交付节点"
};

export function ProjectActivities({
  activities,
  members,
  scopeLabel
}: {
  activities: ProjectActivity[];
  members: DashboardMember[];
  scopeLabel?: string;
}) {
  const [entityType, setEntityType] = useState<string>();
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const visibleActivities = useMemo(
    () => activities
      .filter((activity) => !entityType || activity.entityType === entityType)
      .sort((left, right) => dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf()),
    [activities, entityType]
  );
  const entityOptions = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.entityType))).map((value) => ({
      value,
      label: entityLabels[value] || value
    })),
    [activities]
  );

  return (
    <div className="project-activities">
      <div className="project-activities-header">
        <span>
          <Title level={5}>{scopeLabel ? "计划单元动态" : "项目动态"}</Title>
          <Text type="secondary">
            {scopeLabel ? `仅展示 ${scopeLabel} 范围内版本、需求、任务与 Bug 的关键变更。` : "按时间倒序展示项目、版本、需求和任务的关键变更。"}
          </Text>
        </span>
        <Select allowClear value={entityType} placeholder="全部对象" options={entityOptions} onChange={setEntityType} />
      </div>
      {visibleActivities.length ? (
        <Timeline
          items={visibleActivities.map((activity) => {
            const actor = activity.actorMemberId ? memberById.get(activity.actorMemberId) : undefined;

            return {
              dot: <Avatar size={24} src={actor?.avatarUrl} icon={<UserOutlined />} />,
              children: (
                <article className="project-activity-item">
                  <div>
                    <span>
                      <strong>{activity.actorName || actor?.name || "系统"}</strong>
                      <Tag>{entityLabels[activity.entityType] || activity.entityType}</Tag>
                    </span>
                    <Text type="secondary">{dayjs(activity.createdAt).isValid() ? dayjs(activity.createdAt).format("YYYY-MM-DD HH:mm") : activity.createdAt}</Text>
                  </div>
                  <Text>{actionLabels[activity.action] || activity.action} · {activity.target}</Text>
                  {activity.detail ? <Text type="secondary">{activity.detail}</Text> : null}
                </article>
              )
            };
          })}
        />
      ) : (
        <Empty image={<HistoryOutlined />} description={entityType ? "没有匹配类型的动态" : "暂无项目动态"} />
      )}
    </div>
  );
}
