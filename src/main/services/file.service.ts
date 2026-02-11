import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { FileEntry } from '../infrastructure/file-system';
import { readDirectory, readFileContent, writeFileContent } from '../infrastructure/file-system';
import type { WorkspaceService } from './workspace.service';

export class FileService {
  constructor(private readonly workspaceService: WorkspaceService) {}

  async listDirectory(relativePath: string): Promise<Result<FileEntry[], DomainError>> {
    const root = this.workspaceService.getCurrentPath();
    if (!root) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const entries = await readDirectory(root, relativePath);
      return ok(entries);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(new DomainError(ERROR_CODES.FS_NOT_FOUND, 'Failed to read directory', cause));
    }
  }

  async readFile(relativePath: string): Promise<Result<string, DomainError>> {
    const root = this.workspaceService.getCurrentPath();
    if (!root) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const content = await readFileContent(root, relativePath);
      return ok(content);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(new DomainError(ERROR_CODES.FS_NOT_FOUND, 'Failed to read file', cause));
    }
  }

  async writeFile(relativePath: string, content: string): Promise<Result<void, DomainError>> {
    const root = this.workspaceService.getCurrentPath();
    if (!root) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      await writeFileContent(root, relativePath, content);
      return ok(undefined);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(new DomainError(ERROR_CODES.FS_PERMISSION_DENIED, 'Failed to write file', cause));
    }
  }
}
