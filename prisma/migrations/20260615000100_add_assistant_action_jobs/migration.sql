-- AI 助手批量业务动作队列：ChatBox 只提交 job，后台 worker 批量更新任务/Bug，避免流式回复被几十次单条 PATCH 拖慢。
CREATE TABLE `assistant_action_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `actionType` ENUM('complete_tasks', 'close_bugs') NOT NULL,
    `targetType` ENUM('task', 'bug') NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `recordIds` JSON NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'partially_failed', 'failed') NOT NULL DEFAULT 'queued',
    `requestedCount` INTEGER NOT NULL DEFAULT 0,
    `successCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `result` JSON NOT NULL,
    `error` TEXT NULL,
    `requestedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,

    INDEX `assistant_action_jobs_workspaceId_status_createdAt_idx`(`workspaceId`, `status`, `createdAt`),
    INDEX `assistant_action_jobs_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `assistant_action_jobs` ADD CONSTRAINT `assistant_action_jobs_workspaceId_fkey`
  FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
