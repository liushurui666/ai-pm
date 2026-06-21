-- AI 助手批量创建任务也走后台动作队列：ChatBox 只提交 create_tasks job，worker 批量写 project_tasks，避免长流式请求里连续 POST /api/records。
ALTER TABLE `assistant_action_jobs`
  MODIFY `actionType` ENUM('complete_tasks', 'close_bugs', 'create_tasks') NOT NULL;
