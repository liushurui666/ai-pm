-- 对齐 one2all PM 的项目、版本、需求、任务与风险字段。
-- 新列优先保持 nullable 或提供兼容默认值，再用现有项目名/版本关系回填稳定 ID，确保老数据升级后仍可读取。

-- AlterTable: projects
ALTER TABLE `projects`
  ADD COLUMN `code` VARCHAR(191) NULL,
  ADD COLUMN `startDate` VARCHAR(191) NOT NULL DEFAULT '',
  ADD COLUMN `riskLevel` VARCHAR(191) NOT NULL DEFAULT '低',
  ADD COLUMN `healthStatus` VARCHAR(191) NOT NULL DEFAULT '待评估',
  ADD COLUMN `healthReason` TEXT NULL;

CREATE INDEX `projects_workspaceId_code_idx` ON `projects`(`workspaceId`, `code`);

-- 老项目没有计划开始日时，优先采用关联任务或版本的最早开始日；仍无排期时用截止日前 30 天作为兼容起点。
UPDATE `projects` AS project
LEFT JOIN (
  SELECT `workspaceId`, `project`, MIN(NULLIF(`startDate`, '')) AS `firstStartDate`
  FROM `project_tasks`
  GROUP BY `workspaceId`, `project`
) AS task_date
  ON task_date.`workspaceId` = project.`workspaceId` AND task_date.`project` = project.`name`
LEFT JOIN (
  SELECT `workspaceId`, `project`, MIN(NULLIF(`startDate`, '')) AS `firstStartDate`
  FROM `project_versions`
  GROUP BY `workspaceId`, `project`
) AS version_date
  ON version_date.`workspaceId` = project.`workspaceId` AND version_date.`project` = project.`name`
SET project.`startDate` = COALESCE(
  task_date.`firstStartDate`,
  version_date.`firstStartDate`,
  DATE_FORMAT(DATE_SUB(STR_TO_DATE(NULLIF(project.`dueDate`, ''), '%Y-%m-%d'), INTERVAL 30 DAY), '%Y-%m-%d'),
  ''
)
WHERE project.`startDate` = '';

-- 风险等级按现有风险项最高等级回填；健康状态先沿用老 health/status 信号，运行时会再按任务进度和延期规则统一派生。
UPDATE `projects` AS project
LEFT JOIN (
  SELECT
    `workspaceId`,
    `project`,
    MAX(CASE `level` WHEN '高' THEN 3 WHEN '中' THEN 2 ELSE 1 END) AS `riskRank`
  FROM `risks`
  GROUP BY `workspaceId`, `project`
) AS risk_summary
  ON risk_summary.`workspaceId` = project.`workspaceId` AND risk_summary.`project` = project.`name`
SET project.`riskLevel` = CASE risk_summary.`riskRank`
  WHEN 3 THEN '高'
  WHEN 2 THEN '中'
  ELSE '低'
END;

UPDATE `projects`
SET
  `healthStatus` = CASE
    WHEN `status` = '有风险' AND `health` < 50 THEN '已偏离'
    WHEN `riskLevel` = '高' THEN '已偏离'
    WHEN `status` = '有风险' OR `health` < 75 OR `riskLevel` = '中' THEN '有风险'
    WHEN `status` = '暂停' THEN '待评估'
    ELSE '正常'
  END,
  `healthReason` = CASE
    WHEN `status` = '有风险' AND `health` < 50 THEN '由历史项目状态和健康分判定为已偏离，后续读取将按任务与排期重新评估。'
    WHEN `riskLevel` = '高' THEN '历史项目存在高风险项，后续读取将按任务与排期重新评估。'
    WHEN `status` = '有风险' OR `health` < 75 OR `riskLevel` = '中' THEN '由历史风险项、项目状态或健康分判定为有风险。'
    WHEN `status` = '暂停' THEN '项目处于暂停状态，等待恢复后重新评估。'
    ELSE '历史项目状态正常，后续读取将按任务与排期持续评估。'
  END;

-- AlterTable: project_versions
ALTER TABLE `project_versions`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT '版本',
  ADD COLUMN `actualStartDate` VARCHAR(191) NULL,
  ADD COLUMN `actualCompletedDate` VARCHAR(191) NULL,
  ADD COLUMN `progress` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `riskLevel` VARCHAR(191) NOT NULL DEFAULT '低',
  ADD COLUMN `healthStatus` VARCHAR(191) NOT NULL DEFAULT '待评估',
  ADD COLUMN `healthReason` TEXT NULL;

CREATE INDEX `project_versions_projectId_idx` ON `project_versions`(`projectId`);

UPDATE `project_versions` AS version
LEFT JOIN (
  SELECT
    `workspaceId`,
    `name`,
    MIN(`id`) AS `id`,
    CASE MAX(CASE `riskLevel` WHEN '高' THEN 3 WHEN '中' THEN 2 ELSE 1 END)
      WHEN 3 THEN '高'
      WHEN 2 THEN '中'
      ELSE '低'
    END AS `riskLevel`
  FROM `projects`
  GROUP BY `workspaceId`, `name`
  HAVING COUNT(*) = 1
) AS project
  ON project.`workspaceId` = version.`workspaceId` AND project.`name` = version.`project`
SET
  version.`projectId` = project.`id`,
  version.`riskLevel` = COALESCE(project.`riskLevel`, '低');

-- 版本进度严格按“已完成任务数 / 总任务数”回填；延期任务和发布日逾期优先判为已偏离，高风险次之。
UPDATE `project_versions` AS version
LEFT JOIN (
  SELECT
    `workspaceId`,
    `versionId`,
    COUNT(*) AS `taskCount`,
    SUM(CASE WHEN `stage` = '已完成' THEN 1 ELSE 0 END) AS `completedCount`,
    SUM(CASE WHEN `stage` <> '已完成' AND STR_TO_DATE(NULLIF(`dueDate`, ''), '%Y-%m-%d') < CURDATE() THEN 1 ELSE 0 END) AS `overdueCount`
  FROM `project_tasks`
  WHERE `versionId` IS NOT NULL
  GROUP BY `workspaceId`, `versionId`
) AS task_summary
  ON task_summary.`workspaceId` = version.`workspaceId` AND task_summary.`versionId` = version.`id`
SET
  version.`progress` = CASE
    WHEN COALESCE(task_summary.`taskCount`, 0) = 0 THEN 0
    ELSE ROUND(task_summary.`completedCount` * 100 / task_summary.`taskCount`)
  END,
  version.`healthStatus` = CASE
    WHEN COALESCE(task_summary.`taskCount`, 0) > 0
      AND COALESCE(task_summary.`completedCount`, 0) >= COALESCE(task_summary.`taskCount`, 0) THEN '正常'
    WHEN COALESCE(task_summary.`overdueCount`, 0) > 0
      OR (STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') < CURDATE()
        AND COALESCE(task_summary.`completedCount`, 0) < COALESCE(task_summary.`taskCount`, 0)) THEN '已偏离'
    WHEN version.`riskLevel` = '高' THEN '已偏离'
    WHEN version.`riskLevel` = '中' THEN '有风险'
    WHEN COALESCE(task_summary.`taskCount`, 0) = 0
      OR STR_TO_DATE(NULLIF(version.`startDate`, ''), '%Y-%m-%d') IS NULL
      OR STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') IS NULL
      OR STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') <= STR_TO_DATE(NULLIF(version.`startDate`, ''), '%Y-%m-%d') THEN '待评估'
    ELSE '正常'
  END,
  version.`healthReason` = CASE
    WHEN COALESCE(task_summary.`taskCount`, 0) > 0
      AND COALESCE(task_summary.`completedCount`, 0) >= COALESCE(task_summary.`taskCount`, 0) THEN '版本任务已全部完成。'
    WHEN COALESCE(task_summary.`overdueCount`, 0) > 0 THEN CONCAT('存在 ', task_summary.`overdueCount`, ' 项逾期未完成任务。')
    WHEN STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') < CURDATE()
      AND COALESCE(task_summary.`completedCount`, 0) < COALESCE(task_summary.`taskCount`, 0) THEN '计划发布日期已过且任务尚未全部完成。'
    WHEN version.`riskLevel` = '高' THEN '版本关联项目存在高风险信号，判定为已偏离。'
    WHEN version.`riskLevel` = '中' THEN '版本关联项目存在中风险信号。'
    WHEN COALESCE(task_summary.`taskCount`, 0) = 0 THEN '版本暂无任务，暂不具备交付健康度评估条件。'
    WHEN STR_TO_DATE(NULLIF(version.`startDate`, ''), '%Y-%m-%d') IS NULL
      OR STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') IS NULL
      OR STR_TO_DATE(NULLIF(version.`releaseDate`, ''), '%Y-%m-%d') <= STR_TO_DATE(NULLIF(version.`startDate`, ''), '%Y-%m-%d') THEN '版本计划日期无效，暂不具备交付健康度评估条件。'
    ELSE '版本任务与当前排期均处于正常范围。'
  END;

-- AlterTable: project_tasks
ALTER TABLE `project_tasks`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `requirementId` VARCHAR(191) NULL,
  ADD COLUMN `requirementTitle` VARCHAR(191) NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `taskType` VARCHAR(191) NULL,
  ADD COLUMN `storyPoints` INTEGER NULL,
  ADD COLUMN `estimatedMinutes` INTEGER NULL,
  ADD COLUMN `completedAt` VARCHAR(191) NULL;

CREATE INDEX `project_tasks_projectId_idx` ON `project_tasks`(`projectId`);
CREATE INDEX `project_tasks_requirementId_idx` ON `project_tasks`(`requirementId`);

UPDATE `project_tasks` AS task
LEFT JOIN (
  SELECT `workspaceId`, `name`, MIN(`id`) AS `id`
  FROM `projects`
  GROUP BY `workspaceId`, `name`
  HAVING COUNT(*) = 1
) AS project
  ON project.`workspaceId` = task.`workspaceId` AND project.`name` = task.`project`
SET
  task.`projectId` = project.`id`,
  task.`completedAt` = NULL;

-- AlterTable: risks
ALTER TABLE `risks`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `risks_projectId_idx` ON `risks`(`projectId`);

UPDATE `risks` AS risk
LEFT JOIN (
  SELECT `workspaceId`, `name`, MIN(`id`) AS `id`
  FROM `projects`
  GROUP BY `workspaceId`, `name`
  HAVING COUNT(*) = 1
) AS project
  ON project.`workspaceId` = risk.`workspaceId` AND project.`name` = risk.`project`
SET risk.`projectId` = project.`id`;

-- AlterTable: bug_reports
ALTER TABLE `bug_reports`
  ADD COLUMN `projectId` VARCHAR(191) NULL;

CREATE INDEX `bug_reports_projectId_idx` ON `bug_reports`(`projectId`);

-- 旧 Bug 优先通过当前工作区内的 versionId 承接版本 projectId；无有效版本时才按项目名回填。
-- 项目名只在当前工作区内唯一时才参与回填，避免历史同名项目被 MIN(id) 误绑。
UPDATE `bug_reports` AS bug
LEFT JOIN `project_versions` AS version
  ON version.`workspaceId` = bug.`workspaceId` AND version.`id` = bug.`versionId`
LEFT JOIN (
  SELECT `workspaceId`, `name`, MIN(`id`) AS `id`
  FROM `projects`
  GROUP BY `workspaceId`, `name`
  HAVING COUNT(*) = 1
) AS project
  ON project.`workspaceId` = bug.`workspaceId` AND project.`name` = bug.`project`
SET bug.`projectId` = COALESCE(version.`projectId`, project.`id`)
WHERE bug.`projectId` IS NULL;

-- AlterTable: requirements
-- developerMemberIds 先以 nullable 形式加入并回填，再改为 NOT NULL，避免老表有数据时直接加必填 JSON 失败。
ALTER TABLE `requirements`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `designOwner` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerMemberId` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerOpenId` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerUnionId` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerUserId` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerEmail` VARCHAR(191) NULL,
  ADD COLUMN `designOwnerAvatarUrl` VARCHAR(1024) NULL,
  ADD COLUMN `developerMemberIds` JSON NULL,
  ADD COLUMN `startDate` VARCHAR(191) NULL,
  ADD COLUMN `dueDate` VARCHAR(191) NULL;

CREATE INDEX `requirements_projectId_idx` ON `requirements`(`projectId`);

-- 老需求从所属版本回填设计负责人、开发负责人集合和排期；无版本或无负责人时保持空值/空数组。
UPDATE `requirements` AS requirement
LEFT JOIN `project_versions` AS version
  ON version.`workspaceId` = requirement.`workspaceId` AND version.`id` = requirement.`versionId`
LEFT JOIN (
  SELECT `workspaceId`, `name`, MIN(`id`) AS `id`
  FROM `projects`
  GROUP BY `workspaceId`, `name`
  HAVING COUNT(*) = 1
) AS project
  ON project.`workspaceId` = requirement.`workspaceId` AND project.`name` = requirement.`project`
SET
  requirement.`projectId` = COALESCE(version.`projectId`, project.`id`),
  requirement.`designOwner` = version.`uiOwner`,
  requirement.`designOwnerMemberId` = version.`uiOwnerMemberId`,
  requirement.`designOwnerOpenId` = version.`uiOwnerOpenId`,
  requirement.`designOwnerUnionId` = version.`uiOwnerUnionId`,
  requirement.`designOwnerUserId` = version.`uiOwnerUserId`,
  requirement.`designOwnerEmail` = version.`uiOwnerEmail`,
  requirement.`designOwnerAvatarUrl` = version.`uiOwnerAvatarUrl`,
  requirement.`developerMemberIds` = CASE
    WHEN version.`devOwnerMemberId` IS NOT NULL AND version.`devOwnerMemberId` <> '' THEN JSON_ARRAY(version.`devOwnerMemberId`)
    ELSE JSON_ARRAY()
  END,
  requirement.`startDate` = NULLIF(version.`startDate`, ''),
  requirement.`dueDate` = NULLIF(version.`releaseDate`, '');

ALTER TABLE `requirements`
  MODIFY COLUMN `developerMemberIds` JSON NOT NULL;

-- 项目级成员权限：同一项目内每个成员只有一份权限，职能角色保存在 JSON 中以支持需求级作用域。
CREATE TABLE `project_member_permissions` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `memberId` VARCHAR(191) NOT NULL,
  `accessLevel` VARCHAR(191) NOT NULL DEFAULT 'viewer',
  `functionalRoles` JSON NOT NULL,
  `createdByMemberId` VARCHAR(191) NULL,
  `updatedByMemberId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_member_permissions_projectId_memberId_key`(`projectId`, `memberId`),
  INDEX `project_member_permissions_workspaceId_memberId_idx`(`workspaceId`, `memberId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 项目活动表只保留展示所需快照和实体标识，不依赖目标实体外键，保证目标删除后审计时间线仍然完整。
CREATE TABLE `project_activities` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `actorMemberId` VARCHAR(191) NULL,
  `actorName` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191) NOT NULL,
  `target` VARCHAR(191) NOT NULL,
  `detail` TEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `project_activities_workspaceId_createdAt_idx`(`workspaceId`, `createdAt`),
  INDEX `project_activities_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `project_activities_entityType_entityId_idx`(`entityType`, `entityId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 治理记录与工作区、项目保持强关联；成员 ID 故意不建外键，以保留已离开工作区成员的审计归属。
ALTER TABLE `project_member_permissions`
  ADD CONSTRAINT `project_member_permissions_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_member_permissions_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `project_activities`
  ADD CONSTRAINT `project_activities_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `project_activities_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
