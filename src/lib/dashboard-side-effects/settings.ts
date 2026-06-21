const DEFAULT_QUEUE_NAME = "ai-pm-dashboard-side-effects";

function readPositiveNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Dashboard 副作用队列的配置集中在这里，避免 Web、worker、BullMQ adapter 各自读取不同环境变量。
export function getDashboardSideEffectSettings() {
  return {
    redisUrl: process.env.REDIS_URL?.trim() || "",
    queueName: process.env.DASHBOARD_SIDE_EFFECT_QUEUE_NAME?.trim() || DEFAULT_QUEUE_NAME,
    jobLockMs: readPositiveNumberEnv("DASHBOARD_SIDE_EFFECT_JOB_LOCK_MS", 5 * 60 * 1000),
    workerPollMs: readPositiveNumberEnv("DASHBOARD_SIDE_EFFECT_WORKER_POLL_MS", 1000),
    workerConcurrency: readPositiveNumberEnv("DASHBOARD_SIDE_EFFECT_WORKER_CONCURRENCY", 2)
  };
}
