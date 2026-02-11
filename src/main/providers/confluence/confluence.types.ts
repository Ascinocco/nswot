export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  spaceId: string;
  status: string;
  body: { storage: { value: string } } | null;
  version: { number: number; createdAt: string } | null;
  authorId: string | null;
  createdAt: string;
  lastUpdated: string;
}

export interface ConfluenceComment {
  id: string;
  pageId: string;
  body: { storage: { value: string } } | null;
  version: { number: number; createdAt: string } | null;
  authorId: string | null;
  createdAt: string;
}

export interface ConfluenceSpacesResponse {
  results: ConfluenceSpace[];
  _links?: { next?: string };
}

export interface ConfluencePagesResponse {
  results: ConfluencePage[];
  _links?: { next?: string };
}

export interface ConfluenceCommentsResponse {
  results: ConfluenceComment[];
  _links?: { next?: string };
}

export const CONFLUENCE_RESOURCE_TYPES = {
  PAGE: 'confluence_page',
  COMMENT: 'confluence_comment',
} as const;

export type ConfluenceResourceType =
  (typeof CONFLUENCE_RESOURCE_TYPES)[keyof typeof CONFLUENCE_RESOURCE_TYPES];
