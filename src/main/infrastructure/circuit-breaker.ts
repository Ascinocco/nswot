export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  monitorWindowMs: number;
}

const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

type CircuitState = (typeof CIRCUIT_STATE)[keyof typeof CIRCUIT_STATE];

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,
  monitorWindowMs: 120_000,
};

export class CircuitBreaker {
  private state: CircuitState = CIRCUIT_STATE.CLOSED;
  private failures: number[] = [];
  private lastFailureTime = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === CIRCUIT_STATE.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.cooldownMs) {
        this.state = CIRCUIT_STATE.HALF_OPEN;
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CIRCUIT_STATE.OPEN) {
      throw new CircuitOpenError(
        `Circuit is open. Try again in ${Math.ceil((this.config.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000)}s.`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.shouldTrip(error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.state = CIRCUIT_STATE.CLOSED;
      this.failures = [];
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    // Prune failures outside the monitoring window
    const windowStart = now - this.config.monitorWindowMs;
    this.failures = this.failures.filter((t) => t > windowStart);
    this.failures.push(now);

    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.state = CIRCUIT_STATE.OPEN;
      return;
    }

    if (this.failures.length >= this.config.failureThreshold) {
      this.state = CIRCUIT_STATE.OPEN;
    }
  }

  private shouldTrip(error: unknown): boolean {
    // Only 5xx, timeouts, and connection errors trip the circuit
    // 4xx errors do NOT trip
    if (error instanceof CircuitOpenError) return false;

    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('timeout') ||
        msg.includes('econnrefused') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound') ||
        msg.includes('network')
      ) {
        return true;
      }
    }

    if (isHttpError(error)) {
      return error.status >= 500;
    }

    // Default: assume it's a transient error
    return true;
  }

  /** Exposed for testing */
  reset(): void {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failures = [];
    this.lastFailureTime = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

interface HttpError {
  status: number;
}

function isHttpError(error: unknown): error is HttpError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as HttpError).status === 'number'
  );
}
