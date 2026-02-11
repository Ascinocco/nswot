export interface JiraOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface JiraAccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes: string[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    issuetype: { name: string };
    status: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    labels: string[];
    created: string;
    updated: string;
    parent?: { key: string };
  };
}

export interface JiraComment {
  id: string;
  body: string;
  author: { displayName: string };
  created: string;
  updated: string;
}

export interface JiraChangelogEntry {
  id: string;
  author: { displayName: string };
  created: string;
  items: Array<{
    field: string;
    fromString: string | null;
    toString: string | null;
  }>;
}

export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraCommentsResponse {
  startAt: number;
  maxResults: number;
  total: number;
  comments: JiraComment[];
}

export interface JiraChangelogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraChangelogEntry[];
}

export const JIRA_RESOURCE_TYPES = {
  PROJECT: 'jira_project',
  EPIC: 'jira_epic',
  STORY: 'jira_story',
  COMMENT: 'jira_comment',
  CHANGELOG: 'jira_changelog',
} as const;

export type JiraResourceType = (typeof JIRA_RESOURCE_TYPES)[keyof typeof JIRA_RESOURCE_TYPES];
