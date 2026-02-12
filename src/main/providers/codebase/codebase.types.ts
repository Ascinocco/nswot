export interface CodebaseAnalysis {
  repo: string;
  analyzedAt: string;
  partial?: boolean;
  architecture: {
    summary: string;
    modules: string[];
    concerns: string[];
  };
  quality: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
  };
  technicalDebt: {
    summary: string;
    items: TechDebtItem[];
  };
  risks: {
    summary: string;
    items: string[];
  };
  jiraCrossReference: {
    summary: string;
    correlations: string[];
  } | null;
}

export interface TechDebtItem {
  description: string;
  location: string;
  severity: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface CodebasePrerequisites {
  cli: boolean;
  cliAuthenticated: boolean;
  git: boolean;
  jiraMcp: boolean;
}

export type AnalysisDepth = 'standard' | 'deep';

export interface CodebaseAnalysisOptions {
  shallow: boolean;
  depth: AnalysisDepth;
  model: string;
  maxTurns: number;
  timeoutMs: number;
}

export const CODEBASE_RESOURCE_TYPES = {
  ANALYSIS: 'codebase_analysis',
} as const;

export const ANALYSIS_DEPTH_CONFIGS: Record<AnalysisDepth, Pick<CodebaseAnalysisOptions, 'maxTurns' | 'timeoutMs'>> = {
  standard: { maxTurns: 30, timeoutMs: 2_400_000 },   // 30 turns, 40 min timeout
  deep:     { maxTurns: 60, timeoutMs: 5_400_000 },   // 60 turns, 90 min timeout
};

export const DEFAULT_ANALYSIS_OPTIONS: CodebaseAnalysisOptions = {
  shallow: true,
  depth: 'standard',
  model: 'sonnet',
  maxTurns: 30,
  timeoutMs: 2_400_000,
};
