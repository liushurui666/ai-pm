"use client";

import "./index.less";
import { Col, DatePicker, Form, Input, Row, Select } from "antd";

// 文档字段只保留知识库元数据，文档拆任务的上传流程放在独立抽屉中。
export function DocumentFields() {
  return (
    <>
      <Form.Item label="文档标题" name="title" rules={[{ required: true, message: "请输入文档标题" }]}>
        <Input placeholder="例如：AI 项目助手 PRD v1.0" />
      </Form.Item>
      <Row gutter={12}>
        <Col span={12}>
          <Form.Item label="类型" name="type">
            <Select options={["PRD", "会议纪要", "技术方案", "复盘"].map((value) => ({ value, label: value }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="更新时间" name="updatedAt">
            <DatePicker className="pm-form-control" showTime />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item label="AI 摘要" name="aiSummary">
        <Input.TextArea rows={4} placeholder="文档重点、决策项或待办摘要" />
      </Form.Item>
    </>
  );
}
