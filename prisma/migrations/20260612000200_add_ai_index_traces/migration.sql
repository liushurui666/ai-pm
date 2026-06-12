CREATE TABLE `ai_index_traces` (
  `id` VARCHAR(191) NOT NULL,
  `workspaceId` VARCHAR(191) NOT NULL,
  `traceId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `input` JSON NOT NULL,
  `output` JSON NOT NULL,
  `scores` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `ai_index_traces_workspaceId_createdAt_idx` (`workspaceId`, `createdAt`),
  INDEX `ai_index_traces_workspaceId_name_idx` (`workspaceId`, `name`),
  INDEX `ai_index_traces_traceId_idx` (`traceId`),
  CONSTRAINT `ai_index_traces_workspaceId_fkey`
    FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
