"use client";

import "./index.less";
import { Alert, Avatar, Flex, Progress, Space, Tag, Typography } from "antd";
import { AlertOutlined, CheckCircleOutlined, UserOutlined } from "@ant-design/icons";
import type { Risk } from "@/types/dashboard";
import type { ProjectPersonProgress } from "@/components/project-management-platform/views/project-calendar-utils";

const { Text } = Typography;

// 人员进度面板补足日历的全局视角，避免只看日期时漏掉谁最需要协助。
export function ProjectProgressPanel({
  people,
  risks
}: {
  people: ProjectPersonProgress[];
  risks: Risk[];
}) {
  return (
    <aside className="project-progress-panel">
      <Flex justify="space-between" align="center">
        <Space>
          <UserOutlined />
          <Text strong>人员进度</Text>
        </Space>
        <Tag>{people.length} 人</Tag>
      </Flex>
      <Space orientation="vertical" size={12} className="pm-wide">
        {people.slice(0, 8).map((person) => (
          <div className="project-person-progress" key={person.owner}>
            <Flex align="center" justify="space-between" gap={10}>
              <Space size={10}>
                <Avatar src={person.avatarUrl}>{person.owner.slice(0, 1)}</Avatar>
                <span>
                  <Text strong>{person.owner}</Text>
                  <Text type="secondary">{person.items.length} 项 · 完成 {person.doneCount}</Text>
                </span>
              </Space>
              {person.riskCount ? <Tag color="red">风险 {person.riskCount}</Tag> : <Tag color="green">稳定</Tag>}
            </Flex>
            <Progress percent={person.progress} size="small" />
            <Text type="secondary" className="project-person-projects">
              {person.projects.slice(0, 2).join(" / ")}
            </Text>
          </div>
        ))}
      </Space>
      <div className="project-progress-risks">
        <Flex align="center" gap={8}>
          <AlertOutlined />
          <Text strong>版本关联项目风险</Text>
        </Flex>
        <Space orientation="vertical" size={10} className="pm-wide">
          {risks.slice(0, 4).map((risk) => (
            <Alert
              key={risk.id}
              type={risk.level === "高" ? "error" : risk.level === "中" ? "warning" : "info"}
              showIcon
              title={`${risk.project} · ${risk.title}`}
              description={risk.mitigation}
            />
          ))}
          {!risks.length ? <Alert type="success" showIcon icon={<CheckCircleOutlined />} title="当前版本关联项目暂无登记风险" /> : null}
        </Space>
      </div>
    </aside>
  );
}
