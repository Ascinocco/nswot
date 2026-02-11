import type {
  GitHubRepo,
  GitHubPR,
  GitHubIssue,
  GitHubPRComment,
  GitHubUser,
} from './github.types';

const GITHUB_API_URL = 'https://api.github.com';

export class GitHubProvider {
  async fetchAuthenticatedUser(pat: string): Promise<GitHubUser> {
    const response = await this.request(`${GITHUB_API_URL}/user`, pat);
    return (await response.json()) as GitHubUser;
  }

  async fetchRepos(
    pat: string,
    page = 1,
  ): Promise<{ repos: GitHubRepo[]; hasNext: boolean }> {
    const url = new URL(`${GITHUB_API_URL}/user/repos`);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('per_page', '50');
    url.searchParams.set('page', String(page));

    const response = await this.request(url.toString(), pat);
    const repos = (await response.json()) as GitHubRepo[];

    const linkHeader = response.headers.get('link');
    const hasNext = linkHeader ? linkHeader.includes('rel="next"') : false;

    return { repos, hasNext };
  }

  async fetchPullRequests(
    pat: string,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    page = 1,
  ): Promise<{ prs: GitHubPR[]; hasNext: boolean }> {
    const url = new URL(`${GITHUB_API_URL}/repos/${owner}/${repo}/pulls`);
    url.searchParams.set('state', state);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '30');
    url.searchParams.set('page', String(page));

    const response = await this.request(url.toString(), pat);
    const prs = (await response.json()) as GitHubPR[];

    const linkHeader = response.headers.get('link');
    const hasNext = linkHeader ? linkHeader.includes('rel="next"') : false;

    return { prs, hasNext };
  }

  async fetchIssues(
    pat: string,
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    page = 1,
  ): Promise<{ issues: GitHubIssue[]; hasNext: boolean }> {
    const url = new URL(`${GITHUB_API_URL}/repos/${owner}/${repo}/issues`);
    url.searchParams.set('state', state);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', '30');
    url.searchParams.set('page', String(page));

    const response = await this.request(url.toString(), pat);
    const allIssues = (await response.json()) as GitHubIssue[];

    // Filter out pull requests (GitHub returns PRs as issues too)
    const issues = allIssues.filter((i) => !i.pull_request);

    const linkHeader = response.headers.get('link');
    const hasNext = linkHeader ? linkHeader.includes('rel="next"') : false;

    return { issues, hasNext };
  }

  async fetchPRComments(
    pat: string,
    owner: string,
    repo: string,
    prNumber: number,
    page = 1,
  ): Promise<{ comments: GitHubPRComment[]; hasNext: boolean }> {
    const url = new URL(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    );
    url.searchParams.set('per_page', '30');
    url.searchParams.set('page', String(page));

    const response = await this.request(url.toString(), pat);
    const comments = (await response.json()) as GitHubPRComment[];

    const linkHeader = response.headers.get('link');
    const hasNext = linkHeader ? linkHeader.includes('rel="next"') : false;

    return { comments, hasNext };
  }

  private async request(url: string, pat: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const error = new Error(`GitHub API error: ${response.status}`);
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
