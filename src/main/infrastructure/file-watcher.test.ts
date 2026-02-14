import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FileChangeEvent } from './file-watcher';

const mockClose = vi.fn();
const mockOn = vi.fn();
const mockWatch = vi.fn(() => ({
  on: mockOn,
  close: mockClose,
}));
const mockExistsSync = vi.fn(() => true);

vi.mock('fs', () => ({
  watch: mockWatch,
  existsSync: mockExistsSync,
}));

// Import after mock setup
const { FileWatcher } = await import('./file-watcher');

describe('FileWatcher', () => {
  let watcher: InstanceType<typeof FileWatcher>;

  beforeEach(() => {
    vi.useFakeTimers();
    watcher = new FileWatcher();
    mockWatch.mockClear();
    mockOn.mockClear();
    mockClose.mockClear();
    mockExistsSync.mockClear();
    mockExistsSync.mockReturnValue(true);
    // Re-configure default return for watch
    mockWatch.mockReturnValue({ on: mockOn, close: mockClose });
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  it('starts watching with recursive option', () => {
    watcher.start('/my/project');
    expect(mockWatch).toHaveBeenCalledWith(
      '/my/project',
      { recursive: true },
      expect.any(Function),
    );
  });

  it('isWatching returns true after start', () => {
    expect(watcher.isWatching()).toBe(false);
    watcher.start('/my/project');
    expect(watcher.isWatching()).toBe(true);
  });

  it('isWatching returns false after stop', () => {
    watcher.start('/my/project');
    watcher.stop();
    expect(watcher.isWatching()).toBe(false);
  });

  it('closes previous watcher on restart', () => {
    watcher.start('/first');
    expect(mockClose).not.toHaveBeenCalled();

    watcher.start('/second');
    expect(mockClose).toHaveBeenCalled();
  });

  it('emits change events after debounce period', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', 'src/app.ts');
    expect(events).toHaveLength(0);

    vi.advanceTimersByTime(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'change', path: 'src/app.ts' });
  });

  it('maps rename events to add type when file exists', () => {
    mockExistsSync.mockReturnValue(true);
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('rename', 'src/new-file.ts');
    vi.advanceTimersByTime(200);

    expect(events[0]!.type).toBe('add');
  });

  it('maps rename events to unlink type when file is gone', () => {
    mockExistsSync.mockReturnValue(false);
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('rename', 'src/deleted-file.ts');
    vi.advanceTimersByTime(200);

    expect(events[0]!.type).toBe('unlink');
  });

  it('debounces rapid events for the same file', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', 'src/app.ts');
    vi.advanceTimersByTime(100);
    fsCallback('change', 'src/app.ts');
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(1);
  });

  it('emits separate events for different files', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', 'src/app.ts');
    fsCallback('change', 'src/other.ts');
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(2);
  });

  it('ignores .git directory', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', '.git/objects/abc123');
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(0);
  });

  it('ignores node_modules directory', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', 'node_modules/lodash/index.js');
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(0);
  });

  it('ignores .nswot directory', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', '.nswot/nswot.db');
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(0);
  });

  it('ignores null filenames', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', null);
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(0);
  });

  it('clears debounce timers on stop', () => {
    watcher.start('/my/project');
    const fsCallback = (mockWatch.mock.calls[0] as unknown[])[2] as (eventType: string, filename: string | null) => void;

    const events: FileChangeEvent[] = [];
    watcher.on('change', (event: FileChangeEvent) => events.push(event));

    fsCallback('change', 'src/app.ts');
    watcher.stop();
    vi.advanceTimersByTime(200);

    expect(events).toHaveLength(0);
  });

  it('emits error event on watcher error', () => {
    watcher.start('/my/project');
    const errorCallback = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === 'error',
    )?.[1] as ((err: unknown) => void) | undefined;

    const errors: unknown[] = [];
    watcher.on('error', (err: unknown) => errors.push(err));

    if (errorCallback) {
      errorCallback(new Error('watcher failed'));
      expect(errors).toHaveLength(1);
    }
  });
});
