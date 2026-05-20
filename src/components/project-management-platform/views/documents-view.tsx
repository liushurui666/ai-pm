
"use client";

import { Button, Space, Table, Tag, Typography } from "antd";
import { FileTextOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { DocumentItem } from "@/types/dashboard";
import { TableView } from "@/components/project-management-platform/shared/page-shell";

const { Text } = Typography;

const documentColumns: ColumnsType<DocumentItem> = [
  {
    title: "文档",
    dataIndex: "title",
    key: "title",
    render: (_, document) => (
      <Space orientation="vertical" size={2}>
        <Text strong>{document.title}</Text>
        <Text type="secondary">{document.aiSummary}</Text>
      </Space>
    )
  },
  {
    title: "类型",
    dataIndex: "type",
    key: "type",
    width: 110,
    render: (type: DocumentItem["type"]) => <Tag>{type}</Tag>
  },
  {
    title: "更新时间",
    dataIndex: "updatedAt",
    key: "updatedAt",
    width: 170
  }
];

// 文档知识库视图只负责列表和入口按钮，文档拆解流程放到专用抽屉中。
export function DocumentsView({
  documents,
  onCreate,
  onUpload
}: {
  documents: DocumentItem[];
  onCreate: () => void;
  onUpload: () => void;
}) {
  return (
    <TableView
      title="文档知识库"
      subtitle="上传 PRD、会议纪要或技术方案，自动沉淀摘要并拆解任务。"
      icon={<FileTextOutlined />}
      extra={
        <Space wrap>
          <Button icon={<UploadOutlined />} onClick={onUpload}>
            上传文档拆任务
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建文档
          </Button>
        </Space>
      }
    >
      <Table rowKey="id" columns={documentColumns} dataSource={documents} pagination={false} scroll={{ x: 720 }} />
    </TableView>
  );
}
