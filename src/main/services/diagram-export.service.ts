import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { WorkspaceService } from './workspace.service';
import { writeBinaryFileContent } from '../infrastructure/file-system';

/**
 * Saves diagram PNG data (base64-encoded) to the workspace filesystem.
 *
 * Complements the client-side "Save as PNG" browser download in
 * MermaidBlock and ChartBlock by providing workspace-based file saving.
 */
export class DiagramExportService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  /**
   * Save base64-encoded PNG data to a workspace-relative path.
   *
   * @param base64Data - PNG image data encoded as base64 string
   * @param relativePath - Workspace-relative file path (e.g., "diagrams/architecture.png")
   * @returns The resolved path on success, or a DomainError on failure
   */
  async savePng(
    base64Data: string,
    relativePath: string,
  ): Promise<Result<string, DomainError>> {
    if (!base64Data || typeof base64Data !== 'string') {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'base64Data is required'),
      );
    }

    if (!relativePath || typeof relativePath !== 'string') {
      return err(
        new DomainError(ERROR_CODES.INTERNAL_ERROR, 'relativePath is required'),
      );
    }

    if (relativePath.includes('..')) {
      return err(
        new DomainError(ERROR_CODES.WORKSPACE_PATH_INVALID, 'Path traversal not allowed'),
      );
    }

    const root = this.workspaceService.getCurrentPath();
    if (!root) {
      return err(
        new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'),
      );
    }

    // Ensure .png extension
    const path = relativePath.endsWith('.png')
      ? relativePath
      : `${relativePath}.png`;

    try {
      // Decode base64 to binary buffer and write directly
      const buffer = Buffer.from(base64Data, 'base64');
      await writeBinaryFileContent(root, path, buffer);
      return ok(path);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(
        new DomainError(
          ERROR_CODES.INTERNAL_ERROR,
          cause instanceof Error ? cause.message : 'Failed to write PNG file',
        ),
      );
    }
  }
}
