import type { IPCResult } from '../main/domain/types';

export interface NswotAPI {
  system: {
    ping(): Promise<IPCResult<string>>;
  };
}
