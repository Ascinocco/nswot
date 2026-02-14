import type {
  ConfluenceSpace,
  ConfluenceSpacesResponse,
  ConfluencePage,
  ConfluencePagesResponse,
  ConfluenceComment,
  ConfluenceCommentsResponse,
} from './confluence.types';

const ATLASSIAN_API_URL = 'https://api.atlassian.com';

export class ConfluenceProvider {
  async fetchSpaces(
    cloudId: string,
    accessToken: string,
    cursor?: string,
  ): Promise<{ spaces: ConfluenceSpace[]; nextCursor: string | null }> {
    const url = new URL(
      `${ATLASSIAN_API_URL}/ex/confluence/${cloudId}/wiki/api/v2/spaces`,
    );
    url.searchParams.set('limit', '25');
    url.searchParams.set('status', 'current');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await this.request(url.toString(), accessToken);
    const body = (await response.json()) as ConfluenceSpacesResponse;

    const nextCursor = body._links?.next
      ? new URL(body._links.next, ATLASSIAN_API_URL).searchParams.get('cursor')
      : null;

    return { spaces: body.results, nextCursor };
  }

  async fetchPages(
    cloudId: string,
    accessToken: string,
    spaceId: string,
    cursor?: string,
  ): Promise<{ pages: ConfluencePage[]; nextCursor: string | null }> {
    const url = new URL(
      `${ATLASSIAN_API_URL}/ex/confluence/${cloudId}/wiki/api/v2/spaces/${spaceId}/pages`,
    );
    url.searchParams.set('limit', '25');
    url.searchParams.set('status', 'current');
    url.searchParams.set('body-format', 'storage');
    url.searchParams.set('sort', '-modified-date');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await this.request(url.toString(), accessToken);
    const body = (await response.json()) as ConfluencePagesResponse;

    const nextCursor = body._links?.next
      ? new URL(body._links.next, ATLASSIAN_API_URL).searchParams.get('cursor')
      : null;

    return { pages: body.results, nextCursor };
  }

  async fetchPageComments(
    cloudId: string,
    accessToken: string,
    pageId: string,
    cursor?: string,
  ): Promise<{ comments: ConfluenceComment[]; nextCursor: string | null }> {
    const url = new URL(
      `${ATLASSIAN_API_URL}/ex/confluence/${cloudId}/wiki/api/v2/pages/${pageId}/footer-comments`,
    );
    url.searchParams.set('limit', '25');
    url.searchParams.set('body-format', 'storage');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await this.request(url.toString(), accessToken);
    const body = (await response.json()) as ConfluenceCommentsResponse;

    const nextCursor = body._links?.next
      ? new URL(body._links.next, ATLASSIAN_API_URL).searchParams.get('cursor')
      : null;

    return { comments: body.results, nextCursor };
  }

  private async request(url: string, accessToken: string): Promise<Response> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const error = new Error(`Confluence API error: ${response.status}`);
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
