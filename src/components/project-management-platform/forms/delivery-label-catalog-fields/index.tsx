"use client";

import "./index.less";
import { Button, Flex, Form, Input, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, TagsOutlined } from "@ant-design/icons";
import type { ProjectDeliveryLabel } from "@/types/dashboard";

const { Text } = Typography;

function createDeliveryLabelId() {
  // 表单新增时就分配 ID，后续改名只改 name，不会让已关联版本节点失去引用。
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `delivery-label-${randomId}`;
}

export function DeliveryLabelCatalogFields({
  disabled = false,
  form,
  usageCounts = {}
}: {
  disabled?: boolean;
  form: ReturnType<typeof Form.useForm<Record<string, unknown>>>[0];
  usageCounts?: Record<string, number>;
}) {
  const labels = (Form.useWatch("deliveryLabelCatalog", form) as ProjectDeliveryLabel[] | undefined) ?? [];
  const activeCount = labels.filter((label) => label?.active !== false && !label?.deleted).length;

  return (
    <section className="delivery-label-catalog">
      <Flex align="center" justify="space-between" gap={12} wrap>
        <span className="delivery-label-catalog-title">
          <TagsOutlined />
          <span>
            <Text strong>交付节点标签</Text>
            <Text type="secondary">里程碑只能选择当前项目/版本自身已启用的标签。</Text>
          </span>
        </span>
        <Tag color={activeCount ? "blue" : "default"}>{activeCount} 个已启用</Tag>
      </Flex>

      <Form.List name="deliveryLabelCatalog">
        {(fields, { add }) => (
          <Space orientation="vertical" size={8} className="pm-wide delivery-label-catalog-list">
            {fields.map(({ key, name, ...restField }, index) => {
              const label = labels[name];
              const usageCount = label?.id ? usageCounts[label.id] ?? 0 : 0;
              const deleted = Boolean(label?.deleted);

              return (
              <div className={`delivery-label-catalog-row${deleted ? " is-deleted" : ""}`} key={key}>
                <Form.Item {...restField} name={[name, "id"]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item {...restField} name={[name, "deleted"]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  {...restField}
                  label={`标签 ${index + 1}`}
                  name={[name, "name"]}
                  rules={[
                    { required: true, whitespace: true, message: "请输入标签名称" },
                    { max: 40, message: "标签名称最多 40 个字符" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("zh-CN") : "";
                        const duplicates = ((getFieldValue("deliveryLabelCatalog") as ProjectDeliveryLabel[]) ?? [])
                          .filter((label) => label?.name?.trim().toLocaleLowerCase("zh-CN") === normalized);

                        return normalized && duplicates.length > 1
                          ? Promise.reject(new Error("标签名称不能重复"))
                          : Promise.resolve();
                      }
                    })
                  ]}
                >
                  <Input disabled={disabled || deleted} placeholder="例如：安全审核" />
                </Form.Item>
                <Form.Item
                  {...restField}
                  className="delivery-label-catalog-switch"
                  label="状态"
                  name={[name, "active"]}
                  valuePropName="checked"
                >
                  <Switch disabled={disabled || deleted} checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
                {deleted ? <Tag color="default">已删除</Tag> : (
                  <Popconfirm
                    title={`删除标签“${label?.name || `标签 ${index + 1}`}”？`}
                    description={usageCount
                      ? `已有 ${usageCount} 个历史交付节点引用它。删除后节点保留名称快照并标记已删除。`
                      : "该标签将标记为已删除，不再出现在新节点选择中。"}
                    okText="确认删除"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => {
                      // one2all 使用软删除：稳定 ID 和最后名称继续服务历史节点。
                      form.setFieldValue(["deliveryLabelCatalog", name, "active"], false);
                      form.setFieldValue(["deliveryLabelCatalog", name, "deleted"], true);
                    }}
                  >
                    <Tooltip title={usageCount ? `删除并保留 ${usageCount} 个节点快照` : "软删除标签"}>
                      <Button disabled={disabled} danger type="text" icon={<DeleteOutlined />} aria-label={`删除标签 ${label?.name || index + 1}`} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </div>
              );
            })}
            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              disabled={disabled || fields.length >= 30}
              onClick={() => add({ id: createDeliveryLabelId(), name: "", active: true })}
            >
              新增标签
            </Button>
            <Text type="secondary" className="delivery-label-catalog-help">
              {disabled
                ? "当前仅可编辑交付节点；标签目录由项目负责人或项目管理员维护。"
                : "改名会通过稳定 ID 同步到展示；停用只限制新建选择；删除会保留稳定 ID 和历史节点快照。"}
            </Text>
          </Space>
        )}
      </Form.List>
    </section>
  );
}
