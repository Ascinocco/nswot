import { describe, it, expect } from 'vitest';
import { DomainError, ERROR_CODES } from './errors';

describe('DomainError', () => {
  it('constructs with code and message', () => {
    const error = new DomainError(ERROR_CODES.PROFILE_LIMIT, 'Too many profiles');
    expect(error.code).toBe('PROFILE_LIMIT');
    expect(error.message).toBe('Too many profiles');
    expect(error.name).toBe('DomainError');
    expect(error.cause).toBeUndefined();
  });

  it('constructs with cause', () => {
    const cause = new Error('db write failed');
    const error = new DomainError(ERROR_CODES.DB_ERROR, 'Database error', cause);
    expect(error.code).toBe('DB_ERROR');
    expect(error.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const error = new DomainError(ERROR_CODES.INTERNAL_ERROR, 'unexpected');
    expect(error).toBeInstanceOf(Error);
  });

  it('propagates code through error codes', () => {
    const error = new DomainError(ERROR_CODES.JIRA_AUTH_FAILED, 'Auth expired');
    expect(error.code).toBe('JIRA_AUTH_FAILED');
  });
});

describe('ERROR_CODES', () => {
  it('has all expected user error codes', () => {
    expect(ERROR_CODES.PROFILE_LIMIT).toBe('PROFILE_LIMIT');
    expect(ERROR_CODES.PROFILE_NOT_FOUND).toBe('PROFILE_NOT_FOUND');
    expect(ERROR_CODES.PROFILE_VALIDATION).toBe('PROFILE_VALIDATION');
    expect(ERROR_CODES.WORKSPACE_NOT_FOUND).toBe('WORKSPACE_NOT_FOUND');
    expect(ERROR_CODES.WORKSPACE_PATH_INVALID).toBe('WORKSPACE_PATH_INVALID');
    expect(ERROR_CODES.SETTINGS_KEY_MISSING).toBe('SETTINGS_KEY_MISSING');
    expect(ERROR_CODES.SETTINGS_MODEL_MISSING).toBe('SETTINGS_MODEL_MISSING');
    expect(ERROR_CODES.ANALYSIS_NO_PROFILES).toBe('ANALYSIS_NO_PROFILES');
    expect(ERROR_CODES.ANALYSIS_NO_JIRA).toBe('ANALYSIS_NO_JIRA');
    expect(ERROR_CODES.IMPORT_PARSE_ERROR).toBe('IMPORT_PARSE_ERROR');
  });

  it('has all expected integration error codes', () => {
    expect(ERROR_CODES.JIRA_AUTH_FAILED).toBe('JIRA_AUTH_FAILED');
    expect(ERROR_CODES.JIRA_RATE_LIMITED).toBe('JIRA_RATE_LIMITED');
    expect(ERROR_CODES.JIRA_FETCH_FAILED).toBe('JIRA_FETCH_FAILED');
    expect(ERROR_CODES.JIRA_PROJECT_NOT_FOUND).toBe('JIRA_PROJECT_NOT_FOUND');
    expect(ERROR_CODES.LLM_AUTH_FAILED).toBe('LLM_AUTH_FAILED');
    expect(ERROR_CODES.LLM_RATE_LIMITED).toBe('LLM_RATE_LIMITED');
    expect(ERROR_CODES.LLM_MODEL_UNAVAILABLE).toBe('LLM_MODEL_UNAVAILABLE');
    expect(ERROR_CODES.LLM_CONTEXT_EXCEEDED).toBe('LLM_CONTEXT_EXCEEDED');
    expect(ERROR_CODES.LLM_REQUEST_FAILED).toBe('LLM_REQUEST_FAILED');
    expect(ERROR_CODES.CIRCUIT_OPEN).toBe('CIRCUIT_OPEN');
  });

  it('has all expected LLM output error codes', () => {
    expect(ERROR_CODES.LLM_PARSE_ERROR).toBe('LLM_PARSE_ERROR');
    expect(ERROR_CODES.LLM_PARSE_FAILED).toBe('LLM_PARSE_FAILED');
    expect(ERROR_CODES.LLM_EVIDENCE_INVALID).toBe('LLM_EVIDENCE_INVALID');
    expect(ERROR_CODES.LLM_EMPTY_RESPONSE).toBe('LLM_EMPTY_RESPONSE');
  });

  it('has all expected system error codes', () => {
    expect(ERROR_CODES.DB_ERROR).toBe('DB_ERROR');
    expect(ERROR_CODES.FS_PERMISSION_DENIED).toBe('FS_PERMISSION_DENIED');
    expect(ERROR_CODES.FS_NOT_FOUND).toBe('FS_NOT_FOUND');
    expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});
