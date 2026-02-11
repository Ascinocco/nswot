import type { IPCResult, Workspace, Profile, ProfileInput, Analysis, ChatMessage, Integration } from '../main/domain/types';
import type { LlmModel } from '../main/providers/llm/llm.types';
import type { FileEntry } from '../main/infrastructure/file-system';
import type { JiraProject } from '../main/providers/jira/jira.types';

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
    importDirectory(dirPath: string): Promise<IPCResult<Profile[]>>;
  };
  integrations: {
    get(): Promise<IPCResult<Integration | null>>;
    connectJira(clientId: string, clientSecret: string): Promise<IPCResult<Integration>>;
    disconnect(): Promise<IPCResult<void>>;
    sync(projectKeys: string[]): Promise<IPCResult<{ syncedCount: number; warning?: string }>>;
    listProjects(): Promise<IPCResult<JiraProject[]>>;
  };
  analysis: {
    list(): Promise<IPCResult<Analysis[]>>;
    get(id: string): Promise<IPCResult<Analysis>>;
    delete(id: string): Promise<IPCResult<void>>;
    run(input: {
      profileIds: string[];
      jiraProjectKeys: string[];
      role: string;
      modelId: string;
      contextWindow: number;
    }): Promise<IPCResult<Analysis>>;
    previewPayload(
      profileIds: string[],
      jiraProjectKeys: string[],
      role: string,
      contextWindow: number,
    ): Promise<IPCResult<{ systemPrompt: string; userPrompt: string; tokenEstimate: number }>>;
    onProgress(callback: (data: { analysisId: string; stage: string; message: string }) => void): () => void;
  };
  chat: {
    getMessages(analysisId: string): Promise<IPCResult<ChatMessage[]>>;
    send(analysisId: string, content: string): Promise<IPCResult<ChatMessage>>;
    delete(analysisId: string): Promise<IPCResult<void>>;
    onChunk(callback: (data: { analysisId: string; chunk: string }) => void): () => void;
  };
  export: {
    markdown(analysisId: string): Promise<IPCResult<string>>;
  };
}
