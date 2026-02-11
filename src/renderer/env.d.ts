interface IPCResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface NswotAPI {
  system: {
    ping(): Promise<IPCResult<string>>;
  };
}

declare global {
  interface Window {
    nswot: NswotAPI;
  }
}

export {};
