declare global {
  interface IPCResult<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
  }

  interface LlmModel {
    id: string;
    name: string;
    contextLength: number;
    pricing: {
      prompt: number;
      completion: number;
    };
  }

  interface Workspace {
    id: string;
    path: string;
    name: string;
    createdAt: string;
    lastOpenedAt: string;
  }

  interface Profile {
    id: string;
    workspaceId: string;
    name: string;
    role: string | null;
    team: string | null;
    concerns: string | null;
    priorities: string | null;
    interviewQuotes: string[];
    notes: string | null;
    sourceFile: string | null;
    createdAt: string;
    updatedAt: string;
  }

  interface ProfileInput {
    name: string;
    role?: string;
    team?: string;
    concerns?: string;
    priorities?: string;
    interviewQuotes?: string[];
    notes?: string;
    sourceFile?: string;
  }

  interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
  }

  interface NswotAPI {
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

  interface Window {
    nswot: NswotAPI;
  }
}

export {};
