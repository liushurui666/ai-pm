-- AI 自动索引 RAG V1 基础表：只承载后台索引状态、chunk 元数据和异步任务，不对普通业务页面暴露同步状态。
CREATE TABLE `ai_index_sources` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `versionId` VARCHAR(191) NULL,
    `entityType` ENUM('version', 'requirement', 'bug', 'task', 'feishu_doc', 'feishu_wiki') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `sourceProvider` ENUM('internal', 'feishu') NOT NULL,
    `sourceType` ENUM('record', 'feishu_doc', 'feishu_wiki') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sourceUrl` TEXT NULL,
    `sourceToken` VARCHAR(512) NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `status` ENUM('pending', 'indexing', 'ready', 'failed', 'disabled') NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `lastIndexedAt` DATETIME(3) NULL,
    `createdByMemberId` VARCHAR(191) NULL,
    `metadata` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_index_sources_workspaceId_entityType_entityId_sourceType_key`(`workspaceId`, `entityType`, `entityId`, `sourceType`),
    INDEX `ai_index_sources_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `ai_index_sources_workspaceId_sourceProvider_sourceType_idx`(`workspaceId`, `sourceProvider`, `sourceType`),
    INDEX `ai_index_sources_workspaceId_versionId_idx`(`workspaceId`, `versionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_index_chunks` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `chunkIndex` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `heading` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `sparseText` TEXT NOT NULL,
    `contentHash` VARCHAR(64) NOT NULL,
    `embeddingModel` VARCHAR(191) NULL,
    `embeddingDimensions` INTEGER NULL,
    `embeddingVectorRef` VARCHAR(191) NULL,
    `sourceLocator` JSON NULL,
    `metadata` JSON NOT NULL,
    `status` ENUM('pending', 'ready', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_index_chunks_sourceId_chunkIndex_key`(`sourceId`, `chunkIndex`),
    INDEX `ai_index_chunks_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `ai_index_chunks_workspaceId_embeddingVectorRef_idx`(`workspaceId`, `embeddingVectorRef`),
    INDEX `ai_index_chunks_sourceId_contentHash_idx`(`sourceId`, `contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ai_index_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `entityType` ENUM('version', 'requirement', 'bug', 'task', 'feishu_doc', 'feishu_wiki') NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `jobType` ENUM('index_entity', 'sync_feishu', 'embed_chunks', 'rebuild_source', 'cleanup_source') NOT NULL,
    `dedupeKey` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'running', 'success', 'failed') NOT NULL DEFAULT 'pending',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetries` INTEGER NOT NULL DEFAULT 5,
    `nextRunAt` DATETIME(3) NULL,
    `lockedAt` DATETIME(3) NULL,
    `lockedBy` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_index_jobs_dedupeKey_key`(`dedupeKey`),
    INDEX `ai_index_jobs_workspaceId_status_nextRunAt_idx`(`workspaceId`, `status`, `nextRunAt`),
    INDEX `ai_index_jobs_status_priority_createdAt_idx`(`status`, `priority`, `createdAt`),
    INDEX `ai_index_jobs_sourceId_idx`(`sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ai_index_sources` ADD CONSTRAINT `ai_index_sources_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_index_chunks` ADD CONSTRAINT `ai_index_chunks_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_index_chunks` ADD CONSTRAINT `ai_index_chunks_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ai_index_sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_index_jobs` ADD CONSTRAINT `ai_index_jobs_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ai_index_jobs` ADD CONSTRAINT `ai_index_jobs_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ai_index_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
