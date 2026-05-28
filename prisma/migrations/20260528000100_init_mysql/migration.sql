-- CreateTable
CREATE TABLE `workspaces` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` VARCHAR(191) NOT NULL,
    `updatedAt` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workspace_members` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `avatarUrl` VARCHAR(1024) NULL,
    `role` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `identities` JSON NOT NULL,
    `notification` JSON NOT NULL,
    `createdAt` VARCHAR(191) NOT NULL,
    `updatedAt` VARCHAR(191) NOT NULL,

    INDEX `workspace_members_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `ownerMemberId` VARCHAR(191) NULL,
    `ownerOpenId` VARCHAR(191) NULL,
    `ownerUnionId` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerAvatarUrl` VARCHAR(1024) NULL,
    `status` VARCHAR(191) NOT NULL,
    `progress` INTEGER NOT NULL,
    `health` INTEGER NOT NULL,
    `dueDate` VARCHAR(191) NOT NULL,
    `team` INTEGER NOT NULL,
    `riskCount` INTEGER NOT NULL,
    `summary` TEXT NOT NULL,
    `milestones` JSON NOT NULL,

    INDEX `projects_workspaceId_idx`(`workspaceId`),
    INDEX `projects_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `stage` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `ownerMemberId` VARCHAR(191) NULL,
    `ownerOpenId` VARCHAR(191) NULL,
    `ownerUnionId` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerAvatarUrl` VARCHAR(1024) NULL,
    `project` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NULL,
    `versionName` VARCHAR(191) NULL,
    `priority` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191) NOT NULL,
    `dueDate` VARCHAR(191) NOT NULL,
    `aiHint` TEXT NOT NULL,

    INDEX `project_tasks_workspaceId_idx`(`workspaceId`),
    INDEX `project_tasks_versionId_idx`(`versionId`),
    INDEX `project_tasks_ownerMemberId_idx`(`ownerMemberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `risks` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `ownerMemberId` VARCHAR(191) NULL,
    `ownerOpenId` VARCHAR(191) NULL,
    `ownerUnionId` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerAvatarUrl` VARCHAR(1024) NULL,
    `project` VARCHAR(191) NOT NULL,
    `mitigation` TEXT NOT NULL,

    INDEX `risks_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_reports` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL,
    `project` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NULL,
    `versionName` VARCHAR(191) NULL,
    `reporter` VARCHAR(191) NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `ownerMemberId` VARCHAR(191) NULL,
    `ownerOpenId` VARCHAR(191) NULL,
    `ownerUnionId` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerAvatarUrl` VARCHAR(1024) NULL,
    `environment` TEXT NOT NULL,
    `reproduction` TEXT NOT NULL,
    `expected` TEXT NOT NULL,
    `actual` TEXT NOT NULL,
    `createdAt` VARCHAR(191) NOT NULL,
    `aiFixLatestJobId` VARCHAR(191) NULL,
    `aiFixStatus` ENUM('queued', 'preparing', 'analyzing', 'coding', 'testing', 'pushing', 'mr_created', 'failed', 'canceled') NULL,
    `aiFixBranch` VARCHAR(191) NULL,
    `aiFixMrUrl` TEXT NULL,
    `aiFixSummary` TEXT NULL,
    `aiFixError` TEXT NULL,
    `aiFixUpdatedAt` DATETIME(3) NULL,

    INDEX `bug_reports_workspaceId_idx`(`workspaceId`),
    INDEX `bug_reports_versionId_idx`(`versionId`),
    INDEX `bug_reports_ownerMemberId_idx`(`ownerMemberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `bugId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedAt` VARCHAR(191) NOT NULL,

    INDEX `bug_attachments_bugId_idx`(`bugId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_flow_records` (
    `id` VARCHAR(191) NOT NULL,
    `bugId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `at` VARCHAR(191) NOT NULL,
    `operator` VARCHAR(191) NOT NULL,
    `from` VARCHAR(191) NULL,
    `to` VARCHAR(191) NULL,
    `note` TEXT NULL,

    INDEX `bug_flow_records_bugId_at_idx`(`bugId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_versions` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `parentVersionId` VARCHAR(191) NULL,
    `parentVersionName` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `project` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `startDate` VARCHAR(191) NOT NULL,
    `releaseDate` VARCHAR(191) NOT NULL,
    `goal` TEXT NOT NULL,
    `productOwner` VARCHAR(191) NULL,
    `productOwnerMemberId` VARCHAR(191) NULL,
    `productOwnerOpenId` VARCHAR(191) NULL,
    `productOwnerUnionId` VARCHAR(191) NULL,
    `productOwnerUserId` VARCHAR(191) NULL,
    `productOwnerEmail` VARCHAR(191) NULL,
    `productOwnerAvatarUrl` VARCHAR(1024) NULL,
    `uiOwner` VARCHAR(191) NULL,
    `uiOwnerMemberId` VARCHAR(191) NULL,
    `uiOwnerOpenId` VARCHAR(191) NULL,
    `uiOwnerUnionId` VARCHAR(191) NULL,
    `uiOwnerUserId` VARCHAR(191) NULL,
    `uiOwnerEmail` VARCHAR(191) NULL,
    `uiOwnerAvatarUrl` VARCHAR(1024) NULL,
    `devOwner` VARCHAR(191) NULL,
    `devOwnerMemberId` VARCHAR(191) NULL,
    `devOwnerOpenId` VARCHAR(191) NULL,
    `devOwnerUnionId` VARCHAR(191) NULL,
    `devOwnerUserId` VARCHAR(191) NULL,
    `devOwnerEmail` VARCHAR(191) NULL,
    `devOwnerAvatarUrl` VARCHAR(1024) NULL,
    `milestones` JSON NOT NULL,

    INDEX `project_versions_workspaceId_idx`(`workspaceId`),
    INDEX `project_versions_parentVersionId_idx`(`parentVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requirements` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `priority` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `project` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NULL,
    `versionName` VARCHAR(191) NULL,
    `owner` VARCHAR(191) NOT NULL,
    `ownerMemberId` VARCHAR(191) NULL,
    `ownerOpenId` VARCHAR(191) NULL,
    `ownerUnionId` VARCHAR(191) NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerEmail` VARCHAR(191) NULL,
    `ownerAvatarUrl` VARCHAR(1024) NULL,
    `uiLink` TEXT NULL,
    `documentLink` TEXT NULL,
    `acceptance` TEXT NOT NULL,
    `aiSummary` TEXT NULL,
    `aiRisks` JSON NOT NULL,
    `aiMissingItems` JSON NOT NULL,
    `aiFrontendNotes` JSON NOT NULL,
    `aiBackendNotes` JSON NOT NULL,
    `aiTestingNotes` JSON NOT NULL,
    `aiCompletenessScore` INTEGER NULL,

    INDEX `requirements_workspaceId_idx`(`workspaceId`),
    INDEX `requirements_versionId_idx`(`versionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `updatedAt` VARCHAR(191) NOT NULL,
    `aiSummary` TEXT NOT NULL,

    INDEX `documents_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_insights` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL,

    INDEX `weekly_insights_workspaceId_idx`(`workspaceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_repositories` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `provider` ENUM('github', 'gitlab') NOT NULL,
    `repoFullName` VARCHAR(191) NOT NULL,
    `cloneUrl` VARCHAR(1024) NOT NULL,
    `defaultBranch` VARCHAR(191) NOT NULL DEFAULT 'main',
    `packageManager` VARCHAR(191) NOT NULL DEFAULT 'pnpm',
    `installCommand` VARCHAR(191) NOT NULL,
    `lintCommand` VARCHAR(191) NULL,
    `testCommand` VARCHAR(191) NULL,
    `buildCommand` VARCHAR(191) NULL,
    `allowedPaths` JSON NOT NULL,
    `blockedPaths` JSON NOT NULL,
    `defaultReviewers` JSON NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `project_repositories_workspaceId_idx`(`workspaceId`),
    INDEX `project_repositories_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_fix_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `bugId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `status` ENUM('queued', 'preparing', 'analyzing', 'coding', 'testing', 'pushing', 'mr_created', 'failed', 'canceled') NOT NULL DEFAULT 'queued',
    `baseBranch` VARCHAR(191) NOT NULL,
    `fixBranch` VARCHAR(191) NULL,
    `commitSha` VARCHAR(191) NULL,
    `mrUrl` TEXT NULL,
    `mrNumber` VARCHAR(191) NULL,
    `mrState` VARCHAR(191) NULL,
    `summary` TEXT NULL,
    `changedFiles` JSON NOT NULL,
    `error` TEXT NULL,
    `requestedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `bug_fix_jobs_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `bug_fix_jobs_bugId_createdAt_idx`(`bugId`, `createdAt`),
    INDEX `bug_fix_jobs_repositoryId_idx`(`repositoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_fix_job_logs` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `level` ENUM('info', 'warn', 'error') NOT NULL DEFAULT 'info',
    `message` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bug_fix_job_logs_jobId_createdAt_idx`(`jobId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bug_fix_job_checks` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `command` TEXT NOT NULL,
    `status` ENUM('passed', 'failed', 'skipped') NOT NULL,
    `durationMs` INTEGER NULL,
    `outputTail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bug_fix_job_checks_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `workspace_members` ADD CONSTRAINT `workspace_members_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_tasks` ADD CONSTRAINT `project_tasks_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `risks` ADD CONSTRAINT `risks_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_reports` ADD CONSTRAINT `bug_reports_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_attachments` ADD CONSTRAINT `bug_attachments_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `bug_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_flow_records` ADD CONSTRAINT `bug_flow_records_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `bug_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_versions` ADD CONSTRAINT `project_versions_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requirements` ADD CONSTRAINT `requirements_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `weekly_insights` ADD CONSTRAINT `weekly_insights_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_repositories` ADD CONSTRAINT `project_repositories_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_repositories` ADD CONSTRAINT `project_repositories_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_fix_jobs` ADD CONSTRAINT `bug_fix_jobs_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_fix_jobs` ADD CONSTRAINT `bug_fix_jobs_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `bug_reports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_fix_jobs` ADD CONSTRAINT `bug_fix_jobs_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `project_repositories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_fix_job_logs` ADD CONSTRAINT `bug_fix_job_logs_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `bug_fix_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bug_fix_job_checks` ADD CONSTRAINT `bug_fix_job_checks_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `bug_fix_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
