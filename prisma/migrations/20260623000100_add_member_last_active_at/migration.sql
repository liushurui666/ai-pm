-- 成员最近活跃时间落在 AI PM 自己的工作区成员表，而不是 Unified Auth 黑盒 session 表；
-- 这样成员管理页能直接按业务成员展示活跃信息，也避免和认证服务内部 schema 强耦合。
ALTER TABLE `workspace_members`
  ADD COLUMN `lastActiveAt` VARCHAR(191) NULL;
