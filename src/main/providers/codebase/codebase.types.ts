export interface CodebaseAnalysis {
  repo: string;
  analyzedAt: string;
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

export interface CodebaseAnalysisOptions {
  shallow: boolean;
  model: string;
  maxTurns: number;
  timeoutMs: number;
}

export const CODEBASE_RESOURCE_TYPES = {
  ANALYSIS: 'codebase_analysis',
} as const;

export const DEFAULT_ANALYSIS_OPTIONS: CodebaseAnalysisOptions = {
  shallow: true,
  model: 'sonnet',
  maxTurns: 30,
  timeoutMs: 300_000,
};
