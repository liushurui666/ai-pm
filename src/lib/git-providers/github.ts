import type { CreateMergeRequestInput, CreateMergeRequestResult, GitProviderClient } from "./types";

function getGitHubToken() {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("缺少 GITHUB_TOKEN，无法创建 GitHub Pull Request。");
  }

  return token;
}

async function githubRequest<T>(path: string, init: RequestInit) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getGitHubToken()}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => null)) as T & { message?: string };

  if (!response.ok) {
    throw new Error(payload?.message || `GitHub API 调用失败：${response.status}`);
  }

  return payload;
}

export class GitHubProviderClient implements GitProviderClient {
  async createMergeRequest(input: CreateMergeRequestInput): Promise<CreateMergeRequestResult> {
    const pullRequest = await githubRequest<{
      html_url: string;
      number: number;
      state: string;
    }>(`/repos/${input.repoFullName}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        head: input.sourceBranch,
        base: input.targetBranch,
        body: input.body,
        draft: input.draft ?? false,
        maintainer_can_modify: true
      })
    });

    if (input.reviewers?.length) {
      await githubRequest(`/repos/${input.repoFullName}/pulls/${pullRequest.number}/requested_reviewers`, {
        method: "POST",
        body: JSON.stringify({
          reviewers: input.reviewers
        })
      });
    }

    return {
      url: pullRequest.html_url,
      number: String(pullRequest.number),
      state: pullRequest.state
    };
  }
}
