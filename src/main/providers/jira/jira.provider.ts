import type {
  JiraAccessibleResource,
  JiraProject,
  JiraSearchResponse,
  JiraCommentsResponse,
  JiraChangelogResponse,
} from './jira.types';

const ATLASSIAN_API_URL = 'https://api.atlassian.com';

export class JiraProvider {
  async fetchAccessibleResources(accessToken: string): Promise<JiraAccessibleResource[]> {
    const response = await this.request(
      `${ATLASSIAN_API_URL}/oauth/token/accessible-resources`,
      accessToken,
    );
    return (await response.json()) as JiraAccessibleResource[];
  }

  async fetchProjects(cloudId: string, accessToken: string): Promise<JiraProject[]> {
    const response = await this.request(
      `${ATLASSIAN_API_URL}/ex/jira/${cloudId}/rest/api/3/project`,
      accessToken,
    );
    return (await response.json()) as JiraProject[];
  }

  async fetchIssues(
    cloudId: string,
    accessToken: string,
    jql: string,
    startAt = 0,
  ): Promise<JiraSearchResponse> {
    const url = new URL(`${ATLASSIAN_API_URL}/ex/jira/${cloudId}/rest/api/3/search`);
    url.searchParams.set('jql', jql);
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('fields', 'summary,description,issuetype,status,priority,assignee,reporter,labels,created,updated,parent');

    const response = await this.request(url.toString(), accessToken);
    return (await response.json()) as JiraSearchResponse;
  }

  async fetchComments(
    cloudId: string,
    accessToken: string,
    issueKey: string,
    startAt = 0,
  ): Promise<JiraCommentsResponse> {
    const url = new URL(
      `${ATLASSIAN_API_URL}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/comment`,
    );
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', '50');

    const response = await this.request(url.toString(), accessToken);
    return (await response.json()) as JiraCommentsResponse;
  }

  async fetchChangelog(
    cloudId: string,
    accessToken: string,
    issueKey: string,
    startAt = 0,
  ): Promise<JiraChangelogResponse> {
    const url = new URL(
      `${ATLASSIAN_API_URL}/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/changelog`,
    );
    url.searchParams.set('startAt', String(startAt));
    url.searchParams.set('maxResults', '50');

    const response = await this.request(url.toString(), accessToken);
    return (await response.json()) as JiraChangelogResponse;
  }

  private async request(url: string, accessToken: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = new Error(`Jira API error: ${response.status}`);
      (error as unknown as { status: number }).status = response.status;

      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        (error as unknown as { retryAfter: string }).retryAfter = retryAfter;
      }

      throw error;
    }

    return response;
  }
}
