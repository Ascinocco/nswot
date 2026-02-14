import { watch, existsSync, type FSWatcher } from 'fs';
import { join, relative } from 'path';
import { EventEmitter } from 'events';

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
}

const IGNORE_PATTERNS = [
  /[\\/]\.git[\\/]/,
  /[\\/]node_modules[\\/]/,
  /[\\/]\.nswot[\\/]/,
  /[\\/]\.DS_Store$/,
];

const DEBOUNCE_MS = 200;

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private watchRoot: string | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  start(rootPath: string): void {
    this.stop();
    this.watchRoot = rootPath;

    try {
      this.watcher = watch(rootPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        if (this.shouldIgnore(filename)) return;
        if (eventType === 'rename') {
          const fullPath = join(rootPath, filename);
          this.debouncedEmit(filename, existsSync(fullPath) ? 'add' : 'unlink');
        } else {
          this.debouncedEmit(filename, 'change');
        }
      });

      this.watcher.on('error', (error) => {
        this.emit('error', error);
      });
    } catch (error) {
      this.emit('error', error);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.watchRoot = null;
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  private shouldIgnore(filePath: string): boolean {
    const fullPath = this.watchRoot ? relative(this.watchRoot, filePath) : filePath;
    const pathToCheck = `/${fullPath}`;
    return IGNORE_PATTERNS.some((pattern) => pattern.test(pathToCheck) || pattern.test(filePath));
  }

  private debouncedEmit(filePath: string, type: FileChangeEvent['type']): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      const event: FileChangeEvent = { type, path: filePath };
      this.emit('change', event);
    }, DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }
}
