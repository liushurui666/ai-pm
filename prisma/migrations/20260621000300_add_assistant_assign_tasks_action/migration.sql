-- AI 助手批量归属任务也走后台动作队列：worker 同步 ownerMemberId/邮箱/飞书身份，避免只改 owner 文本导致“我的任务”看不到。
ALTER TABLE `assistant_action_jobs`
  MODIFY `actionType` ENUM('complete_tasks', 'close_bugs', 'create_tasks', 'assign_tasks') NOT NULL;
