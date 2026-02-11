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

  interface SwotItem {
    claim: string;
    evidence: EvidenceEntry[];
    impact: string;
    recommendation: string;
    confidence: 'high' | 'medium' | 'low';
  }

  interface EvidenceEntry {
    sourceType: 'profile' | 'jira';
    sourceId: string;
    sourceLabel: string;
    quote: string;
  }

  interface SwotOutput {
    strengths: SwotItem[];
    weaknesses: SwotItem[];
    opportunities: SwotItem[];
    threats: SwotItem[];
  }

  interface SummariesOutput {
    profiles: string;
    jira: string;
  }

  interface Analysis {
    id: string;
    workspaceId: string;
    role: 'staff_engineer' | 'senior_em';
    modelId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    config: { profileIds: string[]; jiraProjectKeys: string[] };
    inputSnapshot: unknown;
    swotOutput: SwotOutput | null;
    summariesOutput: SummariesOutput | null;
    rawLlmResponse: string | null;
    warning: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }

  interface Integration {
    id: string;
    workspaceId: string;
    provider: 'jira';
    config: JiraConfig;
    status: 'disconnected' | 'connected' | 'error';
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }

  interface JiraConfig {
    cloudId: string;
    siteUrl: string;
    selectedProjectKeys: string[];
  }

  interface JiraProject {
    id: string;
    key: string;
    name: string;
    projectTypeKey: string;
  }

  interface ChatMessage {
    id: string;
    analysisId: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
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

  interface Window {
    nswot: NswotAPI;
  }
}

export {};
