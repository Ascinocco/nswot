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
  }

  interface Window {
    nswot: NswotAPI;
  }
}

export {};
