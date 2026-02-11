import type { IPCResult } from '../main/domain/types';
import type { LlmModel } from '../main/providers/llm/llm.types';

export interface NswotAPI {
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
}
