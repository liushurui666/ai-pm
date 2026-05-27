export type CreateMergeRequestInput = {
  body: string;
  draft?: boolean;
  repoFullName: string;
  reviewers?: string[];
  sourceBranch: string;
  targetBranch: string;
  title: string;
};

export type CreateMergeRequestResult = {
  number: string;
  state: string;
  url: string;
};

export type GitProviderClient = {
  createMergeRequest(input: CreateMergeRequestInput): Promise<CreateMergeRequestResult>;
};
