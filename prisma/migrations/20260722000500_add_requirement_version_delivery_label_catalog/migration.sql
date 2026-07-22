-- one2all 的交付标签属于单个 plan unit/version，不再把项目行当作可编辑的共享目录。
-- 先允许 NULL 并回填，避免已有版本在 ALTER TABLE 时失败。
ALTER TABLE `project_versions`
  ADD COLUMN `deliveryLabelCatalog` JSON NULL;

-- 已归属项目的历史版本复制当时项目目录。JSON 值会写入每个版本行，
-- 之后改名/停用只改该版本。历史 labelId 故意保留，使旧节点不会在迁移瞬间断链。
UPDATE `project_versions` AS `version`
INNER JOIN `projects` AS `project`
  ON `project`.`id` = `version`.`projectId`
  AND `project`.`workspaceId` = `version`.`workspaceId`
SET `version`.`deliveryLabelCatalog` = `project`.`deliveryLabelCatalog`
WHERE `version`.`deliveryLabelCatalog` IS NULL;

-- 跨项目/无项目的历史版本没有可复制目录，为它们生成四个版本唯一的默认标签。
UPDATE `project_versions` AS `version`
SET `version`.`deliveryLabelCatalog` = JSON_ARRAY(
  JSON_OBJECT(
    'id', CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-1'),
    'name', '产品评审',
    'active', TRUE
  ),
  JSON_OBJECT(
    'id', CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-2'),
    'name', '设计稿定稿',
    'active', TRUE
  ),
  JSON_OBJECT(
    'id', CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-3'),
    'name', '研发完成',
    'active', TRUE
  ),
  JSON_OBJECT(
    'id', CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-4'),
    'name', '验收',
    'active', TRUE
  )
)
WHERE `version`.`deliveryLabelCatalog` IS NULL;

-- 无项目版本中的默认节点同步到新的版本级 ID，type 也与新目录名称一致。
UPDATE `project_versions` AS `version`
SET `version`.`milestones` = JSON_SET(
  `version`.`milestones`,
  JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-product-review', NULL, '$[*].labelId')),
  CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-1'),
  REPLACE(
    JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-product-review', NULL, '$[*].labelId')),
    '.labelId',
    '.type'
  ),
  '产品评审'
)
WHERE JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-product-review', NULL, '$[*].labelId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `projects` AS `project`
    WHERE `project`.`id` = `version`.`projectId`
      AND `project`.`workspaceId` = `version`.`workspaceId`
  );

UPDATE `project_versions` AS `version`
SET `version`.`milestones` = JSON_SET(
  `version`.`milestones`,
  JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-design-freeze', NULL, '$[*].labelId')),
  CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-2'),
  REPLACE(
    JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-design-freeze', NULL, '$[*].labelId')),
    '.labelId',
    '.type'
  ),
  '设计稿定稿'
)
WHERE JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-design-freeze', NULL, '$[*].labelId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `projects` AS `project`
    WHERE `project`.`id` = `version`.`projectId`
      AND `project`.`workspaceId` = `version`.`workspaceId`
  );

UPDATE `project_versions` AS `version`
SET `version`.`milestones` = JSON_SET(
  `version`.`milestones`,
  JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-development-complete', NULL, '$[*].labelId')),
  CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-3'),
  REPLACE(
    JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-development-complete', NULL, '$[*].labelId')),
    '.labelId',
    '.type'
  ),
  '研发完成'
)
WHERE JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-development-complete', NULL, '$[*].labelId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `projects` AS `project`
    WHERE `project`.`id` = `version`.`projectId`
      AND `project`.`workspaceId` = `version`.`workspaceId`
  );

UPDATE `project_versions` AS `version`
SET `version`.`milestones` = JSON_SET(
  `version`.`milestones`,
  JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-business-acceptance', NULL, '$[*].labelId')),
  CONCAT('delivery-version-', LEFT(SHA2(`version`.`id`, 256), 12), '-4'),
  REPLACE(
    JSON_UNQUOTE(JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-business-acceptance', NULL, '$[*].labelId')),
    '.labelId',
    '.type'
  ),
  '验收'
)
WHERE JSON_SEARCH(`version`.`milestones`, 'one', 'delivery-business-acceptance', NULL, '$[*].labelId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `projects` AS `project`
    WHERE `project`.`id` = `version`.`projectId`
      AND `project`.`workspaceId` = `version`.`workspaceId`
  );

ALTER TABLE `project_versions`
  MODIFY COLUMN `deliveryLabelCatalog` JSON NOT NULL;
