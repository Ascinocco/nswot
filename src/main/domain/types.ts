export interface Workspace {
  id: string;
  path: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
}

export interface Profile {
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

export interface ProfileInput {
  name: string;
  role?: string;
  team?: string;
  concerns?: string;
  priorities?: string;
  interviewQuotes?: string[];
  notes?: string;
  sourceFile?: string;
}

export type IntegrationProvider = 'jira' | 'confluence' | 'github' | 'codebase';

export interface Integration {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  config: IntegrationConfig;
  status: 'disconnected' | 'connected' | 'error';
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JiraConfig {
  cloudId: string;
  siteUrl: string;
  selectedProjectKeys: string[];
}

export interface ConfluenceConfig {
  cloudId: string;
  siteUrl: string;
  selectedSpaceKeys: string[];
}

export interface GitHubConfig {
  selectedRepos: string[]; // "owner/repo" format
}

export interface CodebaseConfig {
  selectedRepos: string[]; // "owner/repo" format
}

export type IntegrationConfig = JiraConfig | ConfluenceConfig | GitHubConfig | CodebaseConfig;

export interface IntegrationCacheEntry {
  id: string;
  integrationId: string;
  resourceType: string;
  resourceId: string;
  data: unknown;
  fetchedAt: string;
}

export interface Analysis {
  id: string;
  workspaceId: string;
  role: 'staff_engineer' | 'senior_em' | 'vp_engineering';
  modelId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: AnalysisConfig;
  inputSnapshot: AnonymizedPayload | null;
  swotOutput: SwotOutput | null;
  summariesOutput: SummariesOutput | null;
  qualityMetrics: EvidenceQualityMetrics | null;
  rawLlmResponse: string | null;
  warning: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AnalysisConfig {
  profileIds: string[];
  jiraProjectKeys: string[];
  confluenceSpaceKeys: string[];
  githubRepos: string[];
  codebaseRepos: string[];
}

export interface SwotOutput {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export interface SwotItem {
  claim: string;
  evidence: EvidenceEntry[];
  impact: string;
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

export type EvidenceSourceType = 'profile' | 'jira' | 'confluence' | 'github' | 'codebase';

export interface EvidenceEntry {
  sourceType: EvidenceSourceType;
  sourceId: string;
  sourceLabel: string;
  quote: string;
}

export interface SummariesOutput {
  profiles: string;
  jira: string;
  confluence: string | null;
  github: string | null;
  codebase: string | null;
}

export interface AnonymizedPayload {
  profiles: AnonymizedProfile[];
  jiraData: unknown;
  confluenceData: unknown;
  githubData: unknown;
  codebaseData: unknown;
  pseudonymMap: Record<string, string>;
}

export interface EvidenceQualityMetrics {
  totalItems: number;
  multiSourceItems: number;
  sourceTypeCoverage: Record<string, number>;
  confidenceDistribution: { high: number; medium: number; low: number };
  averageEvidencePerItem: number;
  qualityScore: number;
}

export interface AnonymizedProfile {
  label: string;
  role: string | null;
  team: string | null;
  concerns: string | null;
  priorities: string | null;
  quotes: string[];
  notes: string | null;
}

export interface AnalysisProfile {
  analysisId: string;
  profileId: string;
  anonymizedLabel: string;
}

export interface ChatMessage {
  id: string;
  analysisId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Preference {
  key: string;
  value: string;
}

export type ActionStatus = 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rejected';

export type ActionToolName =
  | 'create_jira_issue'
  | 'create_jira_issues'
  | 'add_jira_comment'
  | 'create_confluence_page'
  | 'create_github_issue'
  | 'create_github_pr';

export interface ActionResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}

export interface ChatAction {
  id: string;
  analysisId: string;
  chatMessageId: string | null;
  toolName: ActionToolName;
  toolInput: Record<string, unknown>;
  status: ActionStatus;
  result: ActionResult | null;
  createdAt: string;
  executedAt: string | null;
}

export interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
