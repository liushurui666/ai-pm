"use client";

import "./index.less";
import { Button, DatePicker, Empty, Form, Modal, Progress, Select, Statistic, Tag, Typography, message } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FlagOutlined,
  SafetyCertificateOutlined,
  UserOutlined
} from "@ant-design/icons";
import type { BugReport, Risk } from "@/types/dashboard";
import type { DashboardMember } from "@/types/dashboard";
import dayjs from "dayjs";
import { useState } from "react";
import type {
  ProjectDeliveryNode,
  ProjectManagementProject,
  ProjectManagementRequirement,
  ProjectManagementTask,
  ProjectManagementVersion
} from "@/components/project-management-platform/views/projects-view/types";
import {
  createProjectRiskBlockers,
  getDeliveryNodes,
  getDisplayDate,
  getNodePlannedDate,
  getNodeScheduleState,
  getVersionProgress,
  isHighPriorityRequirement,
  isRequirementDone,
  isTaskDone
} from "@/components/project-management-platform/views/projects-view/utils";
import { getVersionDeliveryLabelCatalog } from "@/data/project-delivery-labels";

const { Text, Title } = Typography;

const nodeStateMeta = {
  done: { label: "按期完成", color: "success" },
  late_done: { label: "延迟完成", color: "warning" },
  overdue: { label: "已逾期", color: "error" },
  upcoming: { label: "待交付", color: "processing" },
  current: { label: "当前节点", color: "processing" },
  unscheduled: { label: "未排期", color: "default" }
} as const;

export function ProjectOverview({
  bugs,
  members,
  project,
  requirements,
  risks,
  tasks,
  version,
  onUpdateDeliveryNodes
}: {
  bugs: BugReport[];
  members: DashboardMember[];
  project: ProjectManagementProject;
  requirements: ProjectManagementRequirement[];
  risks: Risk[];
  tasks: ProjectManagementTask[];
  version: ProjectManagementVersion;
  onUpdateDeliveryNodes?: (
    version: ProjectManagementVersion,
    deliveryNodes: ProjectDeliveryNode[]
  ) => Promise<boolean | void>;
}) {
  const [nodeForm] = Form.useForm<{ plannedDate?: dayjs.Dayjs; ownerMemberId?: string }>();
  const [editingNodeIndex, setEditingNodeIndex] = useState<number>();
  const [nodeSaving, setNodeSaving] = useState(false);
  const deliveryLabelCatalog = getVersionDeliveryLabelCatalog(version, project.deliveryLabelCatalog);
  const nodes = getDeliveryNodes(version, deliveryLabelCatalog);
  const isNodeCompleted = (node: ProjectDeliveryNode) => Boolean(node.actualCompletedDate || node.status === "已完成");
  const completedNodes = nodes.filter(isNodeCompleted);
  const delayedNodes = nodes.filter((node) => ["overdue", "late_done"].includes(getNodeScheduleState(node)));
  const currentNode = nodes.find((node) => !isNodeCompleted(node));
  const currentNodeIndex = nodes.findIndex((node) => !isNodeCompleted(node));
  const completedTasks = tasks.filter(isTaskDone).length;
  const activeTasks = tasks.filter((task) => !isTaskDone(task) && task.stage !== "待处理").length;
  const todoTasks = tasks.length - completedTasks - activeTasks;
  const unassignedTasks = tasks.filter((task) => !isTaskDone(task) && !task.ownerMemberId && !task.owner?.trim()).length;
  const completedRequirements = requirements.filter(isRequirementDone).length;
  const highPriorityRequirements = requirements.filter(isHighPriorityRequirement).length;
  const blockers = createProjectRiskBlockers({
    labelCatalog: deliveryLabelCatalog,
    requirements,
    tasks,
    version
  });
  const progress = getVersionProgress(version, tasks);

  function openNodeQuickEdit(node: ProjectDeliveryNode, index: number) {
    setEditingNodeIndex(index);
    nodeForm.setFieldsValue({
      plannedDate: getNodePlannedDate(node) ? dayjs(getNodePlannedDate(node)) : undefined,
      ownerMemberId: node.ownerMemberId
    });
  }

  async function saveNodeQuickEdit() {
    if (editingNodeIndex === undefined || !onUpdateDeliveryNodes) {
      return;
    }

    const values = await nodeForm.validateFields();
    const selectedMember = members.find((member) => member.id === values.ownerMemberId);
    const nextNodes = nodes.map((node, index) => index === editingNodeIndex ? {
      ...node,
      plannedDate: values.plannedDate?.format("YYYY-MM-DD"),
      dueDate: undefined,
      ownerMemberId: selectedMember?.id,
      owner: selectedMember?.name || ""
    } : node);
    setNodeSaving(true);

    try {
      const saved = await onUpdateDeliveryNodes(version, nextNodes);

      if (saved !== false) {
        message.success("交付节点已更新");
        setEditingNodeIndex(undefined);
      }
    } finally {
      setNodeSaving(false);
    }
  }

  return (
    <div className="project-overview">
      <section className="project-overview-section">
        <div className="project-overview-section-heading">
          <span>
            <Title level={5}>交付路线图</Title>
            <Text type="secondary">计划、实际完成和节点责任人放在同一条时间线上。</Text>
          </span>
          <Tag color={delayedNodes.length ? "error" : "success"}>
            {delayedNodes.length ? `${delayedNodes.length} 个节点需处理` : "节点正常"}
          </Tag>
        </div>
        {nodes.length ? (
          <div className="project-roadmap-scroll">
            <div className="project-roadmap">
              {nodes.map((node, index) => {
                // 首个未完成节点是当前阶段，其余未完成节点才是 upcoming。
                const state = index === currentNodeIndex ? "current" : getNodeScheduleState(node);
                const meta = nodeStateMeta[state];

                return (
                  <article className={`project-roadmap-node is-${state}`} key={node.id || `${node.label}-${index}`}>
                    <span className="project-roadmap-dot">{isNodeCompleted(node) ? <CheckCircleOutlined /> : index + 1}</span>
                    <div>
                      <strong>{node.label}</strong>
                      <Tag color={meta.color}>{meta.label}</Tag>
                      <Text type="secondary">计划 {getDisplayDate(getNodePlannedDate(node))}</Text>
                      <Text type="secondary">实际 {getDisplayDate(node.actualCompletedDate)}</Text>
                      <Text>{node.owner || "未分配负责人"}</Text>
                      {onUpdateDeliveryNodes ? (
                        <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openNodeQuickEdit(node, index)}>
                          快捷编辑
                        </Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未配置交付节点" />}
      </section>

      <section className="project-overview-metrics">
        <Statistic title="交付进度" value={progress} suffix="%" prefix={<FlagOutlined />} />
        <Statistic title="需求完成" value={completedRequirements} suffix={`/ ${requirements.length}`} prefix={<SafetyCertificateOutlined />} />
        <Statistic title="任务完成" value={completedTasks} suffix={`/ ${tasks.length}`} prefix={<CheckCircleOutlined />} />
        <Statistic title="未关闭 Bug" value={bugs.filter((bug) => bug.status !== "已关闭").length} prefix={<ExclamationCircleOutlined />} />
      </section>

      <div className="project-overview-grid">
        <section className="project-overview-section">
          <div className="project-overview-section-heading">
            <Title level={5}>交付摘要</Title>
            <Progress type="circle" percent={progress} size={52} />
          </div>
          <dl className="project-overview-summary-list">
            <div><dt>当前节点</dt><dd>{currentNode?.label || "已完成全部节点"}</dd></div>
            <div><dt>下个截止日</dt><dd>{getDisplayDate(currentNode ? getNodePlannedDate(currentNode) : version.releaseDate)}</dd></div>
            <div><dt>节点完成</dt><dd>{completedNodes.length} / {nodes.length}</dd></div>
            <div><dt>延迟节点</dt><dd className={delayedNodes.length ? "is-risk" : ""}>{delayedNodes.length}</dd></div>
            <div><dt>总体结论</dt><dd>{blockers.length ? "需要项目经理介入" : "交付节奏稳定"}</dd></div>
          </dl>
        </section>

        <section className="project-overview-section">
          <div className="project-overview-section-heading">
            <span>
              <Title level={5}>工作拆解</Title>
              <Text type="secondary">{project.name} · {version.name}</Text>
            </span>
          </div>
          <div className="project-work-breakdown">
            <article><strong>{requirements.length}</strong><span>需求总数</span></article>
            <article><strong>{completedRequirements}</strong><span>已完成需求</span></article>
            <article><strong>{requirements.length - completedRequirements}</strong><span>活跃需求</span></article>
            <article><strong>{highPriorityRequirements}</strong><span>高优需求</span></article>
            <article><strong>{tasks.length}</strong><span>任务总数</span></article>
            <article><strong>{activeTasks}</strong><span>活跃任务</span></article>
            <article><strong>{todoTasks}</strong><span>待处理任务</span></article>
            <article><strong>{unassignedTasks}</strong><span>未指派任务</span></article>
          </div>
        </section>
      </div>

      <section className="project-overview-section">
        <div className="project-overview-section-heading">
          <span>
            <Title level={5}>风险与阻塞</Title>
            <Text type="secondary">由延期节点、高优需求、无责任人任务、逾期任务和未拆解需求动态推导。</Text>
          </span>
          <Tag>{risks.length} 条项目级登记风险</Tag>
        </div>
        {blockers.length ? (
          <div className="project-blocker-list">
            {blockers.map((blocker) => (
              <article className={`is-${blocker.tone}`} key={blocker.id}>
                <span>{blocker.tone === "danger" ? <ExclamationCircleOutlined /> : blocker.tone === "warning" ? <ClockCircleOutlined /> : <UserOutlined />}</span>
                <div><strong>{blocker.title}</strong><Text type="secondary">{blocker.detail}</Text></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="project-overview-stable"><CheckCircleOutlined /><span><strong>暂无动态阻塞</strong><Text type="secondary">当前关键需求、任务和交付节点处于可控状态。</Text></span></div>
        )}
      </section>

      <Modal
        open={editingNodeIndex !== undefined}
        title={`编辑交付节点 · ${editingNodeIndex === undefined ? "" : nodes[editingNodeIndex]?.label ?? ""}`}
        okText="保存"
        cancelText="取消"
        confirmLoading={nodeSaving}
        onOk={() => void saveNodeQuickEdit()}
        onCancel={() => setEditingNodeIndex(undefined)}
      >
        <Form form={nodeForm} layout="vertical" className="project-node-quick-form">
          <Form.Item label="计划完成日期" name="plannedDate">
            <DatePicker className="pm-form-control" />
          </Form.Item>
          <Form.Item label="节点负责人" name="ownerMemberId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="从已启用平台成员中选择"
              options={members.filter((member) => member.status === "active").map((member) => ({
                value: member.id,
                label: `${member.name}${member.email ? ` · ${member.email}` : ""}`
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
