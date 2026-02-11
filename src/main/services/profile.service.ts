import { ok, err } from '../domain/result';
import type { Result } from '../domain/result';
import { DomainError, ERROR_CODES } from '../domain/errors';
import type { Profile, ProfileInput } from '../domain/types';
import type { ProfileRepository } from '../repositories/profile.repository';
import type { WorkspaceService } from './workspace.service';
import { readFileContent } from '../infrastructure/file-system';
import { parseProfileMarkdown } from './profile-parser';

const MAX_PROFILES = 25;

export class ProfileService {
  constructor(
    private readonly profileRepo: ProfileRepository,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async list(): Promise<Result<Profile[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const profiles = await this.profileRepo.findByWorkspace(workspaceId);
      return ok(profiles);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to list profiles', cause));
    }
  }

  async get(id: string): Promise<Result<Profile, DomainError>> {
    try {
      const profile = await this.profileRepo.findById(id);
      if (!profile) {
        return err(new DomainError(ERROR_CODES.PROFILE_NOT_FOUND, `Profile "${id}" not found`));
      }
      return ok(profile);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to get profile', cause));
    }
  }

  async create(input: ProfileInput): Promise<Result<Profile, DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    if (!workspaceId) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    if (!input.name.trim()) {
      return err(
        new DomainError(ERROR_CODES.PROFILE_VALIDATION, 'Profile name cannot be empty'),
      );
    }

    try {
      const count = await this.profileRepo.countByWorkspace(workspaceId);
      if (count >= MAX_PROFILES) {
        return err(
          new DomainError(
            ERROR_CODES.PROFILE_LIMIT,
            `Cannot exceed ${MAX_PROFILES} profiles per workspace`,
          ),
        );
      }

      const profile = await this.profileRepo.insert(workspaceId, input);
      return ok(profile);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to create profile', cause));
    }
  }

  async update(id: string, input: ProfileInput): Promise<Result<Profile, DomainError>> {
    if (!input.name.trim()) {
      return err(
        new DomainError(ERROR_CODES.PROFILE_VALIDATION, 'Profile name cannot be empty'),
      );
    }

    try {
      const existing = await this.profileRepo.findById(id);
      if (!existing) {
        return err(new DomainError(ERROR_CODES.PROFILE_NOT_FOUND, `Profile "${id}" not found`));
      }

      const updated = await this.profileRepo.update(id, input);
      if (!updated) {
        return err(new DomainError(ERROR_CODES.PROFILE_NOT_FOUND, `Profile "${id}" not found`));
      }
      return ok(updated);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to update profile', cause));
    }
  }

  async delete(id: string): Promise<Result<void, DomainError>> {
    try {
      const existing = await this.profileRepo.findById(id);
      if (!existing) {
        return err(new DomainError(ERROR_CODES.PROFILE_NOT_FOUND, `Profile "${id}" not found`));
      }

      await this.profileRepo.delete(id);
      return ok(undefined);
    } catch (cause) {
      return err(new DomainError(ERROR_CODES.DB_ERROR, 'Failed to delete profile', cause));
    }
  }

  async importFromMarkdown(relativePath: string): Promise<Result<Profile[], DomainError>> {
    const workspaceId = this.workspaceService.getCurrentId();
    const workspacePath = this.workspaceService.getCurrentPath();
    if (!workspaceId || !workspacePath) {
      return err(new DomainError(ERROR_CODES.WORKSPACE_NOT_FOUND, 'No workspace is open'));
    }

    try {
      const content = await readFileContent(workspacePath, relativePath);
      const input = parseProfileMarkdown(content, relativePath);

      const count = await this.profileRepo.countByWorkspace(workspaceId);
      if (count >= MAX_PROFILES) {
        return err(
          new DomainError(
            ERROR_CODES.PROFILE_LIMIT,
            `Cannot exceed ${MAX_PROFILES} profiles per workspace`,
          ),
        );
      }

      const profile = await this.profileRepo.insert(workspaceId, input);
      return ok([profile]);
    } catch (cause) {
      if (cause instanceof DomainError) return err(cause);
      return err(
        new DomainError(ERROR_CODES.IMPORT_PARSE_ERROR, 'Failed to import profile', cause),
      );
    }
  }
}
