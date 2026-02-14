import type { IPCResult, Workspace, Profile, ProfileInput, Analysis, ChatMessage, ChatAction, ActionResult, Integration, Theme, Conversation } from '../main/domain/types';
import type { ContentBlock } from '../main/domain/content-block.types';
import type { AgentState } from '../main/services/agent.service';
import type { LlmModel } from '../main/providers/llm/llm.types';
import type { FileEntry } from '../main/infrastructure/file-system';
import type { JiraProject } from '../main/providers/jira/jira.types';
import type { ConfluenceSpace } from '../main/providers/confluence/confluence.types';
import type { GitHubRepo } from '../main/providers/github/github.types';
import type { CodebaseAnalysis, CodebasePrerequisites, CodebaseAnalysisOptions } from '../main/providers/codebase/codebase.types';
import type { CodebaseProgress, RepoAnalysisInfo, CodebaseStorageInfo } from '../main/services/codebase.service';
import type { ComparisonResult, ComparisonAnalysisSummary } from '../main/domain/comparison.types';

export interface NswotAPI {
  system: {
    ping(): Promise<IPCResult<string>>;
  };
  settings: {
    getAll(): Promise<IPCResult<Record<string, string>>>;
    set(key: string, value: string): Promise<IPCResult<void>>;
    getApiKeyStatus(): Promise<IPCResult<{ isSet: boolean }>>;
    setApiKey(apiKey: string, providerType?: string): Promise<IPCResult<void>>;
  };
  llm: {
    listModels(): Promise<IPCResult<LlmModel[]>>;
    getProvider(): Promise<IPCResult<string>>;
    setProvider(type: string): Promise<IPCResult<void>>;
  };
  workspace: {
    open(): Promise<IPCResult<Workspace | null>>;
    getCurrent(): Promise<IPCResult<Workspace | null>>;
  };
  file: {
    readDir(relativePath: string): Promise<IPCResult<FileEntry[]>>;
    read(relativePath: string): Promise<IPCResult<string>>;
    write(relativePath: string, content: string): Promise<IPCResult<void>>;
    onChanged?(callback: (data: { type: string; path: string }) => void): () => void;
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
  confluence?: {
    get(): Promise<IPCResult<Integration | null>>;
    connect(): Promise<IPCResult<Integration>>;
    disconnect(): Promise<IPCResult<void>>;
    listSpaces(): Promise<IPCResult<ConfluenceSpace[]>>;
    sync(spaceKeys: string[]): Promise<IPCResult<{ syncedCount: number; warning?: string }>>;
  };
  github?: {
    get(): Promise<IPCResult<Integration | null>>;
    connect(pat: string): Promise<IPCResult<Integration>>;
    disconnect(): Promise<IPCResult<void>>;
    listRepos(): Promise<IPCResult<GitHubRepo[]>>;
    sync(repos: string[]): Promise<IPCResult<{ syncedCount: number; warning?: string }>>;
  };
  codebase?: {
    checkPrerequisites(): Promise<IPCResult<CodebasePrerequisites>>;
    analyze(
      repos: string[],
      options: Partial<CodebaseAnalysisOptions>,
      jiraProjectKeys: string[],
    ): Promise<
      IPCResult<{
        results: CodebaseAnalysis[];
        failures: Array<{ repo: string; error: string }>;
      }>
    >;
    getCached(repo: string): Promise<IPCResult<CodebaseAnalysis | null>>;
    clearRepos(): Promise<IPCResult<void>>;
    listCached(): Promise<IPCResult<RepoAnalysisInfo[]>>;
    storageSize(): Promise<IPCResult<CodebaseStorageInfo>>;
    onProgress(callback: (data: CodebaseProgress) => void): () => void;
  };
  analysis: {
    list(): Promise<IPCResult<Analysis[]>>;
    get(id: string): Promise<IPCResult<Analysis>>;
    delete(id: string): Promise<IPCResult<void>>;
    getPseudonymMap(id: string): Promise<IPCResult<Record<string, string>>>;
    run(input: {
      profileIds: string[];
      jiraProjectKeys: string[];
      confluenceSpaceKeys: string[];
      githubRepos: string[];
      codebaseRepos: string[];
      role: string;
      modelId: string;
      contextWindow: number;
      conversationId?: string;
      parentAnalysisId?: string;
    }): Promise<IPCResult<Analysis>>;
    findByConversation(conversationId: string): Promise<IPCResult<Analysis[]>>;
    previewPayload(
      profileIds: string[],
      jiraProjectKeys: string[],
      confluenceSpaceKeys: string[],
      githubRepos: string[],
      codebaseRepos: string[],
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
    setEditorContext(context: { filePath: string | null; contentPreview: string | null; selectedText: string | null } | null): Promise<IPCResult<void>>;
    actions: {
      approve(analysisId: string, actionId: string): Promise<IPCResult<ActionResult>>;
      reject(analysisId: string, actionId: string): Promise<IPCResult<void>>;
      edit(actionId: string, editedInput: Record<string, unknown>): Promise<IPCResult<void>>;
      list(analysisId: string): Promise<IPCResult<ChatAction[]>>;
      onPending(callback: (action: ChatAction) => void): () => void;
    };
  };
  comparison: {
    list(): Promise<IPCResult<ComparisonAnalysisSummary[]>>;
    run(analysisIdA: string, analysisIdB: string): Promise<IPCResult<ComparisonResult>>;
  };
  themes: {
    list(analysisId: string): Promise<IPCResult<Theme[]>>;
    get(id: string): Promise<IPCResult<Theme | null>>;
    update(id: string, fields: { label?: string; description?: string }): Promise<IPCResult<Theme | null>>;
    delete(id: string): Promise<IPCResult<void>>;
  };
  export: {
    markdown(analysisId: string): Promise<IPCResult<string>>;
    csv(analysisId: string): Promise<IPCResult<string>>;
    pdf(analysisId: string): Promise<IPCResult<string>>;
  };
  menu: {
    onNavigate: (callback: (path: string) => void) => () => void;
  };
  conversations: {
    list(): Promise<IPCResult<Conversation[]>>;
    get(id: string): Promise<IPCResult<Conversation>>;
    create(role: Analysis['role']): Promise<IPCResult<Conversation>>;
    updateTitle(id: string, title: string): Promise<IPCResult<void>>;
    delete(id: string): Promise<IPCResult<void>>;
  };
  agent: {
    send(input: {
      conversationId: string;
      analysisId: string;
      modelId: string;
      content: string;
    }): Promise<IPCResult<{ content: string; blocks: ContentBlock[] }>>;
    interrupt(): Promise<IPCResult<void>>;
    onState(callback: (data: { conversationId: string; state: AgentState }) => void): () => void;
    onBlock(callback: (data: { conversationId: string; block: ContentBlock }) => void): () => void;
    onThinking(callback: (data: { conversationId: string; thinking: string }) => void): () => void;
    onTokenCount(callback: (data: { conversationId: string; inputTokens: number; outputTokens: number }) => void): () => void;
    onToolActivity(callback: (data: { conversationId: string; toolName: string; status: 'started' | 'completed' | 'error'; message?: string }) => void): () => void;
  };
  approvalMemory: {
    list(conversationId: string): Promise<IPCResult<Array<{ toolName: string; allowed: boolean }>>>;
    set(conversationId: string, toolName: string, allowed: boolean): Promise<IPCResult<void>>;
  };
}
