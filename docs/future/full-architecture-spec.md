# nswot — Full Architecture Specification (Post-MVP Vision)

> This document preserves the complete architecture vision for nswot beyond MVP.
> It is **not the active spec** for current development. See `docs/02-architecture-spec.md` for the canonical MVP architecture.
> Capabilities described here are planned for Phase 2 and Phase 3 as defined in `docs/04-phases-roadmap.md`.

---

## 1. High-Level Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Electron Shell                          │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Renderer Process                      │  │
│  │                                                       │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌────────────┐  │  │
│  │  │ Sidebar  │ │  Editor  │ │ Chat  │ │  Analysis  │  │  │
│  │  │  File    │ │ (Monaco) │ │ Pane  │ │  Views     │  │  │
│  │  │ Browser  │ │          │ │       │ │            │  │  │
│  │  └────┬─────┘ └────┬─────┘ └───┬───┘ └─────┬──────┘  │  │
│  │       │             │           │           │         │  │
│  │  ┌────┴─────────────┴───────────┴───────────┴──────┐  │  │
│  │  │              React Query Layer                   │  │  │
│  │  │         (IPC call wrappers + caching)            │  │  │
│  │  └──────────────────────┬───────────────────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────┘  │
│                            │ IPC (contextBridge)             │
│  ┌─────────────────────────┼─────────────────────────────┐  │
│  │                  Main Process                         │  │
│  │                                                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │  │
│  │  │   File   │ │ Database │ │Integration│ │   LLM   │  │  │
│  │  │ Service  │ │ Service  │ │ Service   │ │ Service │  │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬──────┘ └────┬────┘  │  │
│  │       │             │            │             │       │  │
│  │    Node fs      SQLite        REST APIs    OpenRouter  │  │
│  │  (workspace)  (app data)   (Jira/Conf/GH)   (LLM)    │  │
│  │                                                       │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │              Safe Storage                        │  │  │
│  │  │        (OS Keychain via safeStorage)              │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Full Code Layout (All Phases)

```text
src/
  main/
    index.ts                  # Electron app entry, window management
    ipc/
      registry.ts             # Central IPC handler registration
      channels.ts             # Channel name constants (typed)
      handlers/
        file.ipc.ts           # File browser + editor operations
        database.ipc.ts       # Profile/analysis/settings CRUD
        integration.ipc.ts    # Jira/Confluence/GitHub fetch + auth
        llm.ipc.ts            # OpenRouter calls, streaming
        analysis.ipc.ts       # Run analysis orchestration
        export.ipc.ts         # Markdown/PDF/CSV write
        settings.ipc.ts       # API keys, preferences
    services/
      file.service.ts         # Workspace fs operations
      database.service.ts     # SQLite access layer
      integration/
        atlassian.service.ts  # Jira + Confluence API client
        github.service.ts     # GitHub API client
        cache.service.ts      # Integration response cache
      llm/
        openrouter.service.ts # OpenRouter API client
        prompt.service.ts     # Prompt templates + construction
        anonymizer.service.ts # PII stripping before LLM send
        parser.service.ts     # Parse LLM response into structured output
      analysis/
        orchestrator.ts       # Pipeline: collect -> preprocess -> prompt -> parse -> store
        preprocessor.ts       # Chunk, rank, summarize, extract themes
        theme.service.ts      # Theme extraction + management
      export/
        markdown.service.ts   # Markdown generation
        pdf.service.ts        # PDF generation
        csv.service.ts        # CSV generation
      storage/
        safe-storage.ts       # Electron safeStorage wrapper
    db/
      schema.ts               # SQLite schema definitions + migrations
      migrations/             # Versioned migration files
  preload/
    index.ts                  # contextBridge.exposeInMainWorld
    api.ts                    # Typed API surface definition
  renderer/
    index.tsx                     # React entry
    App.tsx                       # Root layout + router
    routes/
      workspace.tsx               # Main workspace layout
      analysis.tsx                # Analysis run view + SWOT display
      analysis-history.tsx        # Browse past analyses
      profiles.tsx                # Profile list + CRUD
      integrations.tsx            # Integration setup
      settings.tsx                # API keys, model selection, preferences
    components/
      sidebar/
        FileBrowser.tsx
        FileTreeNode.tsx
      editor/
        EditorPane.tsx            # Monaco wrapper
        EditorTabs.tsx
      chat/
        ChatPane.tsx
        ChatMessage.tsx
        ChatInput.tsx
      analysis/
        AnalysisRunner.tsx
        SwotQuadrant.tsx
        SwotItem.tsx
        Rundown.tsx
        Summaries.tsx
        ThemeList.tsx
        ThemeEditor.tsx
      profiles/
        ProfileForm.tsx
        ProfileCard.tsx
        ProfileImport.tsx
      integrations/
        AtlassianSetup.tsx
        GitHubSetup.tsx
        ConnectionStatus.tsx
      visualization/
        MermaidRenderer.tsx
        ChartPanel.tsx
        ThemeDistribution.tsx
        CoverageMap.tsx
      common/
        RoleSwitcher.tsx
        ModelSelector.tsx
        ExportMenu.tsx
    hooks/
      useProfiles.ts
      useAnalysis.ts
      useChat.ts
      useFileBrowser.ts
      useEditor.ts
      useIntegrations.ts
      useSettings.ts
      useLLMModels.ts
    lib/
      ipc.ts                     # Typed access to window.nswot
      validation/
        profile.schema.ts
        settings.schema.ts
        integration.schema.ts
```

---

## 3. Full Preload API Surface

```ts
export interface NswotAPI {
  file: {
    readDir(path: string): Promise<FileTreeNode[]>;
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    watchWorkspace(callback: (event: FSEvent) => void): () => void;
  };

  profiles: {
    list(): Promise<Profile[]>;
    get(id: string): Promise<Profile>;
    create(data: ProfileInput): Promise<Profile>;
    update(id: string, data: ProfileInput): Promise<Profile>;
    delete(id: string): Promise<void>;
    importFromMarkdown(filePath: string): Promise<Profile>;
  };

  integrations: {
    atlassian: {
      authenticate(): Promise<void>;
      testConnection(): Promise<ConnectionStatus>;
      fetchProjects(): Promise<JiraProject[]>;
      fetchData(config: AtlassianFetchConfig): Promise<AtlassianData>;
    };
    github: {
      authenticate(token: string): Promise<void>;
      testConnection(): Promise<ConnectionStatus>;
      fetchRepos(): Promise<GitHubRepo[]>;
      fetchData(config: GitHubFetchConfig): Promise<GitHubData>;
    };
  };

  analysis: {
    run(config: AnalysisConfig, onProgress: (event: AnalysisProgress) => void): Promise<Analysis>;
    list(): Promise<AnalysisSummary[]>;
    get(id: string): Promise<Analysis>;
    delete(id: string): Promise<void>;
  };

  chat: {
    send(analysisId: string, message: string, editorContext: EditorContext | null, onChunk: (chunk: string) => void): Promise<ChatMessage>;
    getHistory(analysisId: string): Promise<ChatMessage[]>;
  };

  llm: {
    listModels(): Promise<LLMModel[]>;
    setModel(modelId: string): Promise<void>;
  };

  settings: {
    getApiKey(provider: string): Promise<string | null>;
    setApiKey(provider: string, key: string): Promise<void>;
    getPreferences(): Promise<Preferences>;
    setPreferences(prefs: Partial<Preferences>): Promise<void>;
  };

  export: {
    toMarkdown(analysisId: string, outputPath: string): Promise<void>;
    toPDF(analysisId: string, outputPath: string): Promise<void>;
    toCSV(analysisId: string, outputPath: string): Promise<void>;
    writeMermaid(content: string, outputPath: string): Promise<void>;
  };
}
```

---

## 4. Full IPC Channels

```ts
export const IPC_CHANNELS = {
  FILE_READ_DIR: "file:readDir",
  FILE_READ: "file:read",
  FILE_WRITE: "file:write",
  FILE_WATCH: "file:watch",
  PROFILE_LIST: "profile:list",
  PROFILE_GET: "profile:get",
  PROFILE_CREATE: "profile:create",
  PROFILE_UPDATE: "profile:update",
  PROFILE_DELETE: "profile:delete",
  PROFILE_IMPORT_MD: "profile:importMarkdown",
  ANALYSIS_RUN: "analysis:run",
  ANALYSIS_PROGRESS: "analysis:progress",
  ANALYSIS_LIST: "analysis:list",
  ANALYSIS_GET: "analysis:get",
  ANALYSIS_DELETE: "analysis:delete",
  CHAT_SEND: "chat:send",
  CHAT_CHUNK: "chat:chunk",
  CHAT_HISTORY: "chat:history",
  LLM_LIST_MODELS: "llm:listModels",
  LLM_SET_MODEL: "llm:setModel",
  INTEGRATION_ATLASSIAN_AUTH: "integration:atlassian:auth",
  INTEGRATION_ATLASSIAN_TEST: "integration:atlassian:test",
  INTEGRATION_ATLASSIAN_PROJECTS: "integration:atlassian:projects",
  INTEGRATION_ATLASSIAN_FETCH: "integration:atlassian:fetch",
  INTEGRATION_GITHUB_AUTH: "integration:github:auth",
  INTEGRATION_GITHUB_TEST: "integration:github:test",
  INTEGRATION_GITHUB_REPOS: "integration:github:repos",
  INTEGRATION_GITHUB_FETCH: "integration:github:fetch",
  SETTINGS_GET_KEY: "settings:getKey",
  SETTINGS_SET_KEY: "settings:setKey",
  SETTINGS_GET_PREFS: "settings:getPrefs",
  SETTINGS_SET_PREFS: "settings:setPrefs",
  EXPORT_MARKDOWN: "export:markdown",
  EXPORT_PDF: "export:pdf",
  EXPORT_CSV: "export:csv",
  EXPORT_MERMAID: "export:mermaid",
} as const;
```

---

## 5. Full Database Schema

```sql
CREATE TABLE workspace (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  team TEXT,
  concerns TEXT,
  priorities TEXT,
  interview_quotes TEXT,   -- JSON array of strings
  tags TEXT,               -- JSON array of theme strings
  notes TEXT,
  source_file TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('atlassian', 'github')),
  config TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, provider)
);

CREATE TABLE integration_cache (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(integration_id, resource_type, resource_id)
);

CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);

CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  config TEXT NOT NULL,
  input_snapshot TEXT,
  themes_output TEXT,
  rundown_output TEXT,
  summaries_output TEXT,
  swot_output TEXT,
  raw_llm_response TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE analysis_profiles (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  anonymized_label TEXT NOT NULL,
  PRIMARY KEY (analysis_id, profile_id)
);

CREATE TABLE analysis_themes (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (analysis_id, theme_id)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  editor_context TEXT,
  attachments TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 6. Multi-Step Analysis Pipeline (Phase 2+)

The full pipeline uses a multi-step LLM chain instead of the MVP single-pass approach:

**Step 1 — Theme Refinement**
```text
Input: Candidate themes + anonymized profiles + Jira epic summaries
Output: Refined theme list with definitions
```

**Step 2 — Evidence Mapping**
```text
Input: Refined themes + all data chunks
Output: Each piece of evidence tagged to themes with relevance scores
```

**Step 3 — SWOT Generation**
```text
Input: Theme-evidence map + role context
Output: Structured SWOT with citations, rundown, summaries
```

---

## 7. Full Analysis Output Types

```ts
interface AnalysisOutput {
  themes: {
    id: string;
    name: string;
    description: string;
    evidenceCount: number;
    sources: EvidenceSource[];
  }[];
  rundown: {
    steps: {
      description: string;
      profileRef: string;
      integrationRefs: {
        source: "jira" | "confluence" | "github";
        id: string;
        title: string;
        url?: string;
      }[];
      finding: string;
      themes: string[];
    }[];
  };
  summaries: {
    profiles: string;
    jira: string;
    confluence: string;
    github: string;
  };
  swot: {
    strengths: SwotItem[];
    weaknesses: SwotItem[];
    opportunities: SwotItem[];
    threats: SwotItem[];
  };
}

interface SwotItem {
  claim: string;
  evidence: {
    sourceType: "profile" | "jira" | "confluence" | "github";
    sourceId: string;
    sourceLabel: string;
    quote: string;
    url?: string;
  }[];
  impact: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  themes: string[];
}
```

---

## 8. Chat Tool Use (Phase 3)

```ts
interface ChatAction {
  type: "write_file" | "write_mermaid" | "write_csv";
  path: string;
  content: string;
}
```

---

## 9. Integration Details

### Atlassian Cloud
```text
Auth: OAuth 2.0 (3-legged) via Atlassian's authorization URL
API Base: https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/
          https://api.atlassian.com/ex/confluence/{cloudId}/wiki/api/v2/
```

### GitHub
```text
Auth: Personal Access Token (entered by user)
API: Octokit.js (REST)
```

---

## 10. Visualization Components (Phase 3)

- `MermaidRenderer.tsx` — Mermaid diagram rendering
- `ChartPanel.tsx` — D3/Chart.js interactive viz
- `ThemeDistribution.tsx` — Theme frequency chart
- `CoverageMap.tsx` — Data source coverage viz

---

## 11. Key Dependencies (All Phases)

| Category      | Package                                | Purpose                                   |
| ------------- | -------------------------------------- | ----------------------------------------- |
| Framework     | `electron`                             | Desktop shell                             |
| Frontend      | `react`, `react-dom`, `react-router`   | UI framework + routing                    |
| Data fetching | `@tanstack/react-query`                | IPC wrapper + cache                       |
| Editor        | `@monaco-editor/react`                 | Code/text editor                          |
| Database      | `better-sqlite3`                       | SQLite access (synchronous, main process) |
| Atlassian     | raw `fetch`                            | Jira/Confluence REST API                  |
| GitHub        | `octokit`                              | GitHub REST API                           |
| LLM           | `openai` (OpenAI-compatible SDK)       | OpenRouter API client                     |
| Validation    | `zod`                                  | Form/input validation                     |
| Diagrams      | `mermaid`                              | Diagram rendering                         |
| Charts        | `chart.js` + `react-chartjs-2`         | Interactive visualizations                |
| PDF           | `pdfkit`                               | PDF export                                |
| Markdown      | `react-markdown`                       | Markdown rendering                        |
| Build         | `electron-builder`                     | Packaging + distribution                  |
| Build tooling | `vite`                                 | Frontend bundling                         |
| UUID          | `crypto.randomUUID`                    | Primary key generation                    |
