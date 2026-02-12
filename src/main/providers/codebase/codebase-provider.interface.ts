import type {
  CodebaseAnalysis,
  CodebasePrerequisites,
  CodebaseAnalysisOptions,
} from './codebase.types';

export interface CodebaseProviderInterface {
  readonly name: string;

  checkPrerequisites(): Promise<CodebasePrerequisites>;

  isAvailable(): Promise<boolean>;

  cloneOrPull(
    repoFullName: string,
    targetDir: string,
    pat: string,
    shallow: boolean,
  ): Promise<void>;

  analyze(
    repoPath: string,
    prompt: string,
    options: CodebaseAnalysisOptions,
    jiraMcpAvailable?: boolean,
    onProgress?: (message: string) => void,
  ): Promise<CodebaseAnalysis>;
}
