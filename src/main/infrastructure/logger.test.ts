import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, utimesSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from './logger';

function readFirstLog(dir: string): string {
  const files = readdirSync(dir).filter((f) => f.endsWith('.log'));
  expect(files.length).toBeGreaterThan(0);
  return readFileSync(join(dir, files[0]!), 'utf-8');
}

describe('Logger', () => {
  let logDir: string;

  beforeEach(() => {
    Logger.resetForTesting();
    logDir = mkdtempSync(join(tmpdir(), 'nswot-logger-test-'));
  });

  afterEach(() => {
    Logger.resetForTesting();
  });

  it('initialize() creates instance retrievable via getInstance()', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();
    expect(logger).toBeInstanceOf(Logger);
  });

  it('getInstance() before initialize() throws', () => {
    expect(() => Logger.getInstance()).toThrow('Logger not initialized');
  });

  it('multiple initialize() calls throw', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    expect(() =>
      Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false }),
    ).toThrow('Logger already initialized');
  });

  it('messages at configured level are written to file', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.info('hello world');

    const content = readFirstLog(logDir);
    expect(content).toContain('[INFO] hello world');
  });

  it('messages above configured level are written to file', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.error('something broke');

    const content = readFirstLog(logDir);
    expect(content).toContain('[ERROR] something broke');
  });

  it('messages below configured level are not written', () => {
    Logger.initialize({ level: 'warn', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.debug('should not appear');
    logger.info('also should not appear');

    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    // Either no file or empty file
    if (files.length > 0) {
      const content = readFileSync(join(logDir, files[0]!), 'utf-8');
      expect(content).toBe('');
    } else {
      expect(files).toHaveLength(0);
    }
  });

  it('log file name uses current date (nswot-YYYY-MM-DD.log)', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.info('test');

    const today = new Date().toISOString().slice(0, 10);
    const expectedFile = `nswot-${today}.log`;
    const files = readdirSync(logDir);
    expect(files).toContain(expectedFile);
  });

  it('error-level includes stack trace from Error objects', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    const err = new Error('test error');
    logger.error('failure occurred', err);

    const content = readFirstLog(logDir);
    expect(content).toContain('[ERROR] failure occurred');
    expect(content).toContain('Error: test error');
    expect(content).toContain('at '); // stack trace line
  });

  it('context is JSON-serialized in output', () => {
    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.info('with context', { userId: '123', action: 'login' });

    const content = readFirstLog(logDir);
    expect(content).toContain('{"userId":"123","action":"login"}');
  });

  it('old log files beyond maxAgeDays are cleaned up on init', () => {
    // Create a fake old log file with an old mtime
    const oldFile = join(logDir, 'nswot-2020-01-01.log');
    writeFileSync(oldFile, 'old log\n');
    // Set mtime to 30 days ago
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    utimesSync(oldFile, oldDate, oldDate);

    // Create a recent log file
    const recentFile = join(logDir, 'nswot-2025-12-01.log');
    writeFileSync(recentFile, 'recent log\n');

    Logger.initialize({ level: 'info', logDir, maxAgeDays: 7, consoleEnabled: false });

    const files = readdirSync(logDir).filter((f) => f.endsWith('.log'));
    expect(files).not.toContain('nswot-2020-01-01.log');
    expect(files).toContain('nswot-2025-12-01.log');
  });

  it('log output format matches [timestamp] [LEVEL] message {context}', () => {
    Logger.initialize({ level: 'debug', logDir, maxAgeDays: 7, consoleEnabled: false });
    const logger = Logger.getInstance();

    logger.debug('test message', { key: 'value' });

    const content = readFirstLog(logDir).trim();

    // Match format: [ISO timestamp] [LEVEL] message {context}
    const pattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] \[DEBUG\] test message \{"key":"value"\}$/;
    expect(content).toMatch(pattern);
  });
});
