-- AI 助手任务 job 只持久化工作区成员 ID，不保存 Cookie、Token 或其他会话凭证。
-- 显示姓名 requestedBy 仍用于旧日志兼容，但后台 worker 鉴权只信任 requestedByMemberId 并实时重查权限。
ALTER TABLE `assistant_action_jobs`
  ADD COLUMN `requestedByMemberId` VARCHAR(191) NULL AFTER `requestedBy`,
  ADD INDEX `assistant_action_jobs_workspaceId_requestedByMemberId_idx` (`workspaceId`, `requestedByMemberId`);
