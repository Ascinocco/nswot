import type { IPCResult, Workspace, Profile, ProfileInput } from '../main/domain/types';
import type { LlmModel } from '../main/providers/llm/llm.types';
import type { FileEntry } from '../main/infrastructure/file-system';

export interface NswotAPI {
  system: {
    ping(): Promise<IPCResult<string>>;
  };
  settings: {
    getAll(): Promise<IPCResult<Record<string, string>>>;
    set(key: string, value: string): Promise<IPCResult<void>>;
    getApiKeyStatus(): Promise<IPCResult<{ isSet: boolean }>>;
    setApiKey(apiKey: string): Promise<IPCResult<void>>;
  };
  llm: {
    listModels(): Promise<IPCResult<LlmModel[]>>;
  };
  workspace: {
    open(): Promise<IPCResult<Workspace | null>>;
    getCurrent(): Promise<IPCResult<Workspace | null>>;
  };
  file: {
    readDir(relativePath: string): Promise<IPCResult<FileEntry[]>>;
    read(relativePath: string): Promise<IPCResult<string>>;
    write(relativePath: string, content: string): Promise<IPCResult<void>>;
  };
  profiles: {
    list(): Promise<IPCResult<Profile[]>>;
    get(id: string): Promise<IPCResult<Profile>>;
    create(input: ProfileInput): Promise<IPCResult<Profile>>;
    update(id: string, input: ProfileInput): Promise<IPCResult<Profile>>;
    delete(id: string): Promise<IPCResult<void>>;
    importMarkdown(filePath: string): Promise<IPCResult<Profile[]>>;
  };
}
