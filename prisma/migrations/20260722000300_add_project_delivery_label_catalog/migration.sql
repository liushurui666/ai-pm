-- 项目集级交付节点标签目录：版本节点通过稳定 labelId 关联，type 继续保存当时名称快照。
-- 先允许 NULL 并回填默认目录，避免已有项目在 ALTER TABLE 时失败。
ALTER TABLE `projects`
  ADD COLUMN `deliveryLabelCatalog` JSON NULL;

UPDATE `projects`
SET `deliveryLabelCatalog` = JSON_ARRAY(
  JSON_OBJECT('id', 'delivery-product-review', 'name', '产品评审', 'active', TRUE),
  JSON_OBJECT('id', 'delivery-design-freeze', 'name', '设计定稿', 'active', TRUE),
  JSON_OBJECT('id', 'delivery-development-complete', 'name', '开发完成', 'active', TRUE),
  JSON_OBJECT('id', 'delivery-test-complete', 'name', '测试完成', 'active', TRUE),
  JSON_OBJECT('id', 'delivery-business-acceptance', 'name', '业务验收', 'active', TRUE),
  JSON_OBJECT('id', 'delivery-release', 'name', '发布上线', 'active', TRUE)
)
WHERE `deliveryLabelCatalog` IS NULL;

ALTER TABLE `projects`
  MODIFY COLUMN `deliveryLabelCatalog` JSON NOT NULL;
