export interface GitHubRepo {
  id: number;
  full_name: string; // "owner/repo"
  name: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  open_issues_count: number;
  updated_at: string;
  private: boolean;
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  user: { login: string } | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  labels: Array<{ name: string }>;
  requested_reviewers: Array<{ login: string }>;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  pull_request?: unknown; // present if this is a PR
}

export interface GitHubPRComment {
  id: number;
  body: string;
  user: { login: string } | null;
  created_at: string;
  pull_request_review_id: number | null;
  path: string | null;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
}

export const GITHUB_RESOURCE_TYPES = {
  PR: 'github_pr',
  ISSUE: 'github_issue',
  PR_COMMENT: 'github_pr_comment',
} as const;

export type GitHubResourceType =
  (typeof GITHUB_RESOURCE_TYPES)[keyof typeof GITHUB_RESOURCE_TYPES];
