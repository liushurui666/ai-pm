import type { DashboardSideEffectJobType } from "@prisma/client";

export type DashboardSideEffectPayload = Record<string, unknown>;

export type EnqueueDashboardSideEffectJobInput = {
  workspaceId: string;
  entityType: string;
  entityId: string;
  jobType: DashboardSideEffectJobType;
  dedupeKey?: string;
  payload?: DashboardSideEffectPayload;
  priority?: number;
  nextRunAt?: Date;
};

export type ClaimedDashboardSideEffectJob = {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  jobType: DashboardSideEffectJobType;
  payload: DashboardSideEffectPayload;
  retryCount: number;
  maxRetries: number;
};

export type EnqueuedDashboardSideEffectJob = {
  id: string;
  dedupeKey?: string;
};

export interface DashboardSideEffectQueuePort {
  enqueue(input: EnqueueDashboardSideEffectJobInput): Promise<EnqueuedDashboardSideEffectJob>;
  claimNext(workerId: string): Promise<ClaimedDashboardSideEffectJob | undefined>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string, options?: { retryAt?: Date; terminal?: boolean }): Promise<void>;
}
