import { stat } from 'fs/promises';
import { basename, isAbsolute } from 'path';
import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Workspace } from '../domain/types';
import type { WorkspaceRepository } from '../repositories/workspace.repository';
import type { PreferencesRepository } from '../repositories/preferences.repository';

const LAST_WORKSPACE_KEY = 'lastWorkspaceId';

export class WorkspaceService {
  private currentWorkspace: Workspace | null = null;

  constructor(
    private readonly workspaceRepo: WorkspaceRepository,
    private readonly preferencesRepo: PreferencesRepository,
  ) {}

  async open(path: string): Promise<Result<Workspace, DomainError>> {
    if (!isAbsolute(path)) {
      return err(
        new DomainError(ERROR_CODES.WORKSPACE_PATH_INVALID, 'Workspace path must be absolute'),
      );
    }

    try {
      const stats = await stat(path);
      if (!stats.isDirectory()) {
        return err(
          new DomainError(ERROR_CODES.WORKSPACE_PATH_INVALID, 'Workspace path is not a directory'),
        );
      }
    } catch {
      return err(
        new DomainError(ERROR_CODES.WORKSPACE_PATH_INVALID, 'Workspace path does not exist'),
      );
    }

    try {
      const existing = await this.workspaceRepo.findByPath(path);
      let workspace: Workspace;

      if (existing) {
        await this.workspaceRepo.updateLastOpened(existing.id);
        workspace = { ...existing, lastOpenedAt: new Date().toISOString() };
      } else {
        const name = basename(path);
        workspace = await this.workspaceRepo.insert(path, name);
      }

      await this.preferencesRepo.set(LAST_WORKSPACE_KEY, workspace.id);
      this.currentWorkspace = workspace;
      return ok(workspace);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to open workspace', cause));
    }
  }

  async getCurrent(): Promise<Result<Workspace | null, DomainError>> {
    if (this.currentWorkspace) {
      return ok(this.currentWorkspace);
    }

    try {
      const pref = await this.preferencesRepo.get(LAST_WORKSPACE_KEY);
      if (!pref) return ok(null);

      const workspace = await this.workspaceRepo.findById(pref.value);
      if (!workspace) return ok(null);

      this.currentWorkspace = workspace;
      return ok(workspace);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to load workspace', cause));
    }
  }

  getCurrentId(): string | null {
    return this.currentWorkspace?.id ?? null;
  }

  getCurrentPath(): string | null {
    return this.currentWorkspace?.path ?? null;
  }
}
