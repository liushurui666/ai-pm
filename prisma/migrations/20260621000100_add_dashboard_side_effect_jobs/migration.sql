-- Dashboard 交互写入后的后台副作用队列：Web 只保存主记录并入队，
-- 独立 worker 负责飞书通知、跨表补偿和统计刷新，避免用户保存被慢任务卡住。
CREATE TABLE `dashboard_side_effect_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `jobType` ENUM('notify_owner', 'notify_bug_tester', 'refresh_project_metrics', 'cascade_version_updated', 'cascade_version_deleted') NOT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'queued',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetries` INTEGER NOT NULL DEFAULT 5,
    `nextRunAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dashboard_side_effect_jobs_dedupeKey_key`(`dedupeKey`),
    INDEX `dashboard_side_effect_jobs_workspaceId_status_nextRunAt_idx`(`workspaceId`, `status`, `nextRunAt`),
    INDEX `dashboard_side_effect_jobs_status_priority_createdAt_idx`(`status`, `priority`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dashboard_side_effect_jobs` ADD CONSTRAINT `dashboard_side_effect_jobs_workspaceId_fkey`
  FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
