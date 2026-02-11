export interface ActionExecutorOptions {
  model: string;
  maxTurns: number;
  timeoutMs: number;
}

export const DEFAULT_ACTION_OPTIONS: ActionExecutorOptions = {
  model: 'sonnet',
  maxTurns: 5,
  timeoutMs: 60_000,
};
