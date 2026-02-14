import { appendFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const LOG_LEVEL = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVEL;

export interface LoggerConfig {
  level: LogLevel;
  logDir: string;
  maxAgeDays: number;
  consoleEnabled: boolean;
}

export class Logger {
  private static instance: Logger | null = null;

  private readonly config: LoggerConfig;
  private readonly levelValue: number;

  private constructor(config: LoggerConfig) {
    this.config = config;
    this.levelValue = LOG_LEVEL[config.level];
    mkdirSync(config.logDir, { recursive: true });
    this.cleanOldLogs();
  }

  static initialize(config: LoggerConfig): void {
    if (Logger.instance) {
      throw new Error('Logger already initialized');
    }
    Logger.instance = new Logger(config);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      throw new Error('Logger not initialized. Call Logger.initialize() first.');
    }
    return Logger.instance;
  }

  /** Returns the Logger instance if initialized, or null otherwise. Safe for optional logging. */
  static tryGetInstance(): Logger | null {
    return Logger.instance;
  }

  /** Exposed for testing only */
  static resetForTesting(): void {
    Logger.instance = null;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, undefined, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, undefined, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, undefined, context);
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.log('error', message, error, context);
  }

  private log(
    level: LogLevel,
    message: string,
    error: unknown | undefined,
    context: Record<string, unknown> | undefined,
  ): void {
    if (LOG_LEVEL[level] < this.levelValue) return;

    const timestamp = new Date().toISOString();
    const levelTag = level.toUpperCase();
    let line = `[${timestamp}] [${levelTag}] ${message}`;

    if (context && Object.keys(context).length > 0) {
      line += ` ${JSON.stringify(context)}`;
    }

    if (error != null) {
      const stack = error instanceof Error ? error.stack : String(error);
      if (stack) {
        line += ` ${stack}`;
      }
    }

    line += '\n';

    // Write to file
    const dateStr = timestamp.slice(0, 10); // YYYY-MM-DD
    const logFile = join(this.config.logDir, `nswot-${dateStr}.log`);
    try {
      appendFileSync(logFile, line);
    } catch {
      // If we can't write to the log file, fall back to console only
    }

    // Write to console
    if (this.config.consoleEnabled) {
      const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      consoleFn(line.trimEnd());
    }
  }

  private cleanOldLogs(): void {
    const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
      const files = readdirSync(this.config.logDir);
      for (const file of files) {
        if (!file.startsWith('nswot-') || !file.endsWith('.log')) continue;
        const filePath = join(this.config.logDir, file);
        try {
          const stat = statSync(filePath);
          if (now - stat.mtimeMs > maxAgeMs) {
            unlinkSync(filePath);
          }
        } catch {
          // Skip files we can't stat/delete
        }
      }
    } catch {
      // If we can't read the log dir, skip cleanup
    }
  }
}
