import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraProvider } from './jira.provider';

const mockFetch = vi.fn();

describe('JiraProvider', () => {
  let provider: JiraProvider;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    provider = new JiraProvider();
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchAccessibleResources', () => {
    it('returns accessible resources', async () => {
      const resources = [{ id: 'cloud-123', url: 'https://test.atlassian.net', name: 'Test', scopes: [] }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => resources,
      });

      const result = await provider.fetchAccessibleResources('token-123');
      expect(result).toEqual(resources);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.atlassian.com/oauth/token/accessible-resources',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        }),
      );
    });
  });

  describe('fetchProjects', () => {
    it('returns projects for a cloud instance', async () => {
      const projects = [{ id: '1', key: 'PROJ', name: 'Project', projectTypeKey: 'software' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => projects,
      });

      const result = await provider.fetchProjects('cloud-123', 'token-123');
      expect(result).toEqual(projects);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/project',
        expect.anything(),
      );
    });
  });

  describe('fetchIssues', () => {
    it('returns issues', async () => {
      const response = {
        issues: [
          {
            id: '10001',
            key: 'PROJ-1',
            fields: {
              summary: 'Test issue',
              description: null,
              issuetype: { name: 'Story' },
              status: { name: 'Open' },
              priority: { name: 'Medium' },
              assignee: null,
              reporter: { displayName: 'User' },
              labels: [],
              created: '2024-01-01T00:00:00.000Z',
              updated: '2024-01-02T00:00:00.000Z',
            },
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => response,
      });

      const result = await provider.fetchIssues('cloud-123', 'token-123', 'project = PROJ');
      expect(result.issues).toHaveLength(1);
    });

    it('passes nextPageToken for pagination', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [] }),
      });

      await provider.fetchIssues('cloud-123', 'token-123', 'project = PROJ', 'abc123');
      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('nextPageToken=abc123');
      expect(calledUrl).toContain('search/jql');
    });
  });

  describe('fetchComments', () => {
    it('returns comments for an issue', async () => {
      const response = {
        startAt: 0,
        maxResults: 50,
        total: 1,
        comments: [
          { id: '1', body: 'A comment', author: { displayName: 'User' }, created: '2024-01-01T00:00:00.000Z', updated: '2024-01-01T00:00:00.000Z' },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => response,
      });

      const result = await provider.fetchComments('cloud-123', 'token-123', 'PROJ-1');
      expect(result.comments).toHaveLength(1);
    });
  });

  describe('fetchChangelog', () => {
    it('returns changelog entries for an issue', async () => {
      const response = {
        startAt: 0,
        maxResults: 50,
        total: 1,
        values: [
          {
            id: '1',
            author: { displayName: 'User' },
            created: '2024-01-01T00:00:00.000Z',
            items: [{ field: 'status', fromString: 'Open', toString: 'In Progress' }],
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => response,
      });

      const result = await provider.fetchChangelog('cloud-123', 'token-123', 'PROJ-1');
      expect(result.values).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('throws error with status for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
      });

      await expect(provider.fetchProjects('cloud-123', 'bad-token')).rejects.toMatchObject({
        status: 401,
      });
    });

    it('throws error with status for 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '30' }),
      });

      try {
        await provider.fetchProjects('cloud-123', 'token-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as { status: number }).status).toBe(429);
        expect((error as { retryAfter: string }).retryAfter).toBe('30');
      }
    });

    it('throws error with status for 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
      });

      await expect(provider.fetchProjects('cloud-123', 'token-123')).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});
