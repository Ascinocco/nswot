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

export interface Integration {
  id: string;
  workspaceId: string;
  provider: 'jira';
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

export type IntegrationConfig = JiraConfig;

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
  role: 'staff_engineer' | 'senior_em';
  modelId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  config: AnalysisConfig;
  inputSnapshot: AnonymizedPayload | null;
  swotOutput: SwotOutput | null;
  summariesOutput: SummariesOutput | null;
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

export interface EvidenceEntry {
  sourceType: 'profile' | 'jira';
  sourceId: string;
  sourceLabel: string;
  quote: string;
}

export interface SummariesOutput {
  profiles: string;
  jira: string;
}

export interface AnonymizedPayload {
  profiles: AnonymizedProfile[];
  jiraData: unknown;
  pseudonymMap: Record<string, string>;
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

export interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
