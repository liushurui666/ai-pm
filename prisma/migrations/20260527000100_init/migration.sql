-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GitProvider" AS ENUM ('github', 'gitlab');

-- CreateEnum
CREATE TYPE "RepositoryStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "BugFixJobStatus" AS ENUM ('queued', 'preparing', 'analyzing', 'coding', 'testing', 'pushing', 'mr_created', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "JobLogLevel" AS ENUM ('info', 'warn', 'error');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('passed', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "identities" JSONB NOT NULL,
    "notification" JSONB NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerOpenId" TEXT,
    "ownerUnionId" TEXT,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerAvatarUrl" TEXT,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "health" INTEGER NOT NULL,
    "dueDate" TEXT NOT NULL,
    "team" INTEGER NOT NULL,
    "riskCount" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "milestones" JSONB NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerOpenId" TEXT,
    "ownerUnionId" TEXT,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerAvatarUrl" TEXT,
    "project" TEXT NOT NULL,
    "versionId" TEXT,
    "versionName" TEXT,
    "priority" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "aiHint" TEXT NOT NULL,

    CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerOpenId" TEXT,
    "ownerUnionId" TEXT,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerAvatarUrl" TEXT,
    "project" TEXT NOT NULL,
    "mitigation" TEXT NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "versionId" TEXT,
    "versionName" TEXT,
    "reporter" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerOpenId" TEXT,
    "ownerUnionId" TEXT,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerAvatarUrl" TEXT,
    "environment" TEXT NOT NULL,
    "reproduction" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "aiFixLatestJobId" TEXT,
    "aiFixStatus" "BugFixJobStatus",
    "aiFixBranch" TEXT,
    "aiFixMrUrl" TEXT,
    "aiFixSummary" TEXT,
    "aiFixError" TEXT,
    "aiFixUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_attachments" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" TEXT NOT NULL,

    CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_flow_records" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "note" TEXT,

    CONSTRAINT "bug_flow_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "parentVersionName" TEXT,
    "name" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "releaseDate" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "productOwner" TEXT,
    "productOwnerMemberId" TEXT,
    "productOwnerOpenId" TEXT,
    "productOwnerUnionId" TEXT,
    "productOwnerUserId" TEXT,
    "productOwnerEmail" TEXT,
    "productOwnerAvatarUrl" TEXT,
    "uiOwner" TEXT,
    "uiOwnerMemberId" TEXT,
    "uiOwnerOpenId" TEXT,
    "uiOwnerUnionId" TEXT,
    "uiOwnerUserId" TEXT,
    "uiOwnerEmail" TEXT,
    "uiOwnerAvatarUrl" TEXT,
    "devOwner" TEXT,
    "devOwnerMemberId" TEXT,
    "devOwnerOpenId" TEXT,
    "devOwnerUnionId" TEXT,
    "devOwnerUserId" TEXT,
    "devOwnerEmail" TEXT,
    "devOwnerAvatarUrl" TEXT,
    "milestones" JSONB NOT NULL,

    CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "versionId" TEXT,
    "versionName" TEXT,
    "owner" TEXT NOT NULL,
    "ownerMemberId" TEXT,
    "ownerOpenId" TEXT,
    "ownerUnionId" TEXT,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerAvatarUrl" TEXT,
    "uiLink" TEXT,
    "documentLink" TEXT,
    "acceptance" TEXT NOT NULL,
    "aiSummary" TEXT,
    "aiRisks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiMissingItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiFrontendNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiBackendNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiTestingNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiCompletenessScore" INTEGER,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "aiSummary" TEXT NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_insights" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "weekly_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_repositories" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "provider" "GitProvider" NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "cloneUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "packageManager" TEXT NOT NULL DEFAULT 'pnpm',
    "installCommand" TEXT NOT NULL,
    "lintCommand" TEXT,
    "testCommand" TEXT,
    "buildCommand" TEXT,
    "allowedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedPaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultReviewers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RepositoryStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_fix_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "status" "BugFixJobStatus" NOT NULL DEFAULT 'queued',
    "baseBranch" TEXT NOT NULL,
    "fixBranch" TEXT,
    "commitSha" TEXT,
    "mrUrl" TEXT,
    "mrNumber" TEXT,
    "mrState" TEXT,
    "summary" TEXT,
    "changedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "bug_fix_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_fix_job_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "JobLogLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_fix_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_fix_job_checks" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "durationMs" INTEGER,
    "outputTail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_fix_job_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

-- CreateIndex
CREATE INDEX "projects_workspaceId_idx" ON "projects"("workspaceId");

-- CreateIndex
CREATE INDEX "projects_name_idx" ON "projects"("name");

-- CreateIndex
CREATE INDEX "project_tasks_workspaceId_idx" ON "project_tasks"("workspaceId");

-- CreateIndex
CREATE INDEX "project_tasks_versionId_idx" ON "project_tasks"("versionId");

-- CreateIndex
CREATE INDEX "project_tasks_ownerMemberId_idx" ON "project_tasks"("ownerMemberId");

-- CreateIndex
CREATE INDEX "risks_workspaceId_idx" ON "risks"("workspaceId");

-- CreateIndex
CREATE INDEX "bug_reports_workspaceId_idx" ON "bug_reports"("workspaceId");

-- CreateIndex
CREATE INDEX "bug_reports_versionId_idx" ON "bug_reports"("versionId");

-- CreateIndex
CREATE INDEX "bug_reports_ownerMemberId_idx" ON "bug_reports"("ownerMemberId");

-- CreateIndex
CREATE INDEX "bug_attachments_bugId_idx" ON "bug_attachments"("bugId");

-- CreateIndex
CREATE INDEX "bug_flow_records_bugId_at_idx" ON "bug_flow_records"("bugId", "at");

-- CreateIndex
CREATE INDEX "project_versions_workspaceId_idx" ON "project_versions"("workspaceId");

-- CreateIndex
CREATE INDEX "project_versions_parentVersionId_idx" ON "project_versions"("parentVersionId");

-- CreateIndex
CREATE INDEX "requirements_workspaceId_idx" ON "requirements"("workspaceId");

-- CreateIndex
CREATE INDEX "requirements_versionId_idx" ON "requirements"("versionId");

-- CreateIndex
CREATE INDEX "documents_workspaceId_idx" ON "documents"("workspaceId");

-- CreateIndex
CREATE INDEX "weekly_insights_workspaceId_idx" ON "weekly_insights"("workspaceId");

-- CreateIndex
CREATE INDEX "project_repositories_workspaceId_idx" ON "project_repositories"("workspaceId");

-- CreateIndex
CREATE INDEX "project_repositories_projectId_idx" ON "project_repositories"("projectId");

-- CreateIndex
CREATE INDEX "bug_fix_jobs_workspaceId_status_idx" ON "bug_fix_jobs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "bug_fix_jobs_bugId_createdAt_idx" ON "bug_fix_jobs"("bugId", "createdAt");

-- CreateIndex
CREATE INDEX "bug_fix_jobs_repositoryId_idx" ON "bug_fix_jobs"("repositoryId");

-- CreateIndex
CREATE INDEX "bug_fix_job_logs_jobId_createdAt_idx" ON "bug_fix_job_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "bug_fix_job_checks_jobId_idx" ON "bug_fix_job_checks"("jobId");

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_flow_records" ADD CONSTRAINT "bug_flow_records_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_insights" ADD CONSTRAINT "weekly_insights_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_fix_jobs" ADD CONSTRAINT "bug_fix_jobs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_fix_jobs" ADD CONSTRAINT "bug_fix_jobs_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_fix_jobs" ADD CONSTRAINT "bug_fix_jobs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "project_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_fix_job_logs" ADD CONSTRAINT "bug_fix_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "bug_fix_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_fix_job_checks" ADD CONSTRAINT "bug_fix_job_checks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "bug_fix_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

