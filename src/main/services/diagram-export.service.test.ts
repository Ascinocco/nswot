import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagramExportService } from './diagram-export.service';
import { ERROR_CODES } from '../domain/errors';
import type { WorkspaceService } from './workspace.service';

vi.mock('../infrastructure/file-system', () => ({
  writeBinaryFileContent: vi.fn().mockResolvedValue(undefined),
  validateWorkspacePath: vi.fn((root: string, path: string) => `${root}/${path}`),
}));

function makeMockWorkspaceService(path: string | null = '/workspace'): WorkspaceService {
  return {
    getCurrentPath: vi.fn().mockReturnValue(path),
    getCurrentId: vi.fn().mockReturnValue(path ? 'ws-1' : null),
  } as unknown as WorkspaceService;
}

describe('DiagramExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves base64 PNG data to workspace', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService());

    const result = await service.savePng(
      Buffer.from('fake-png-data').toString('base64'),
      'diagrams/architecture.png',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('diagrams/architecture.png');
    }
  });

  it('appends .png extension if missing', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService());

    const result = await service.savePng(
      Buffer.from('data').toString('base64'),
      'diagrams/chart',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('diagrams/chart.png');
    }
  });

  it('returns error for empty base64 data', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService());

    const result = await service.savePng('', 'output.png');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    }
  });

  it('returns error for empty path', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService());

    const result = await service.savePng('data', '');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    }
  });

  it('rejects path traversal', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService());

    const result = await service.savePng('data', '../../../etc/passwd.png');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.WORKSPACE_PATH_INVALID);
    }
  });

  it('returns error when no workspace is open', async () => {
    const service = new DiagramExportService(makeMockWorkspaceService(null));

    const result = await service.savePng(
      Buffer.from('data').toString('base64'),
      'output.png',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.WORKSPACE_NOT_FOUND);
    }
  });
});
