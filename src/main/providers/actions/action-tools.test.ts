import { describe, it, expect } from 'vitest';
import { CHAT_ACTION_TOOLS, TOOL_NAMES, getToolsByIntegration, FILE_WRITE_TOOLS, FILE_WRITE_TOOL_NAMES, isFileWriteTool } from './action-tools';
import type { ActionToolName } from '../../domain/types';

describe('action-tools', () => {
  describe('CHAT_ACTION_TOOLS', () => {
    it('defines exactly 6 tools', () => {
      expect(CHAT_ACTION_TOOLS).toHaveLength(6);
    });

    it('all tools have type "function"', () => {
      for (const tool of CHAT_ACTION_TOOLS) {
        expect(tool.type).toBe('function');
      }
    });

    it('all tools have name, description, and parameters', () => {
      for (const tool of CHAT_ACTION_TOOLS) {
        expect(tool.function.name).toBeTruthy();
        expect(tool.function.description).toBeTruthy();
        expect(tool.function.parameters.type).toBe('object');
        expect(tool.function.parameters.required.length).toBeGreaterThan(0);
      }
    });

    it('contains expected tool names', () => {
      const names = CHAT_ACTION_TOOLS.map((t) => t.function.name);
      expect(names).toEqual([
        'create_jira_issue',
        'create_jira_issues',
        'add_jira_comment',
        'create_confluence_page',
        'create_github_issue',
        'create_github_pr',
      ]);
    });

    it('create_jira_issue requires project, issueType, summary, description', () => {
      const tool = CHAT_ACTION_TOOLS.find((t) => t.function.name === 'create_jira_issue')!;
      expect(tool.function.parameters.required).toEqual([
        'project',
        'issueType',
        'summary',
        'description',
      ]);
    });

    it('create_jira_issues requires issues array', () => {
      const tool = CHAT_ACTION_TOOLS.find((t) => t.function.name === 'create_jira_issues')!;
      expect(tool.function.parameters.required).toEqual(['issues']);
    });

    it('create_github_pr requires repo, title, body, head, base', () => {
      const tool = CHAT_ACTION_TOOLS.find((t) => t.function.name === 'create_github_pr')!;
      expect(tool.function.parameters.required).toEqual(['repo', 'title', 'body', 'head', 'base']);
    });
  });

  describe('TOOL_NAMES', () => {
    it('contains all 6 tool names', () => {
      expect(TOOL_NAMES).toHaveLength(6);
      expect(TOOL_NAMES).toContain('create_jira_issue');
      expect(TOOL_NAMES).toContain('create_github_pr');
    });
  });

  describe('getToolsByIntegration', () => {
    it('returns jira tools when jira is connected', () => {
      const tools = getToolsByIntegration(['jira']);
      expect(tools).toHaveLength(3);
      const names = tools.map((t) => t.function.name);
      expect(names).toContain('create_jira_issue');
      expect(names).toContain('create_jira_issues');
      expect(names).toContain('add_jira_comment');
    });

    it('returns confluence tool when confluence is connected', () => {
      const tools = getToolsByIntegration(['confluence']);
      expect(tools).toHaveLength(1);
      expect(tools[0]!.function.name).toBe('create_confluence_page');
    });

    it('returns github tools when github is connected', () => {
      const tools = getToolsByIntegration(['github']);
      expect(tools).toHaveLength(2);
      const names = tools.map((t) => t.function.name);
      expect(names).toContain('create_github_issue');
      expect(names).toContain('create_github_pr');
    });

    it('returns all tools when all integrations are connected', () => {
      const tools = getToolsByIntegration(['jira', 'confluence', 'github']);
      expect(tools).toHaveLength(6);
    });

    it('returns empty array when no integrations are connected', () => {
      const tools = getToolsByIntegration([]);
      expect(tools).toHaveLength(0);
    });

    it('tool names are valid ActionToolName values', () => {
      const validNames: ActionToolName[] = [
        'create_jira_issue',
        'create_jira_issues',
        'add_jira_comment',
        'create_confluence_page',
        'create_github_issue',
        'create_github_pr',
      ];
      for (const name of TOOL_NAMES) {
        expect(validNames).toContain(name);
      }
    });
  });

  describe('FILE_WRITE_TOOLS', () => {
    it('defines exactly 3 file-write tools', () => {
      expect(FILE_WRITE_TOOLS).toHaveLength(3);
    });

    it('all file-write tools have type "function"', () => {
      for (const tool of FILE_WRITE_TOOLS) {
        expect(tool.type).toBe('function');
      }
    });

    it('contains write_markdown_file, write_csv_file, write_mermaid_file', () => {
      const names = FILE_WRITE_TOOLS.map((t) => t.function.name);
      expect(names).toEqual(['write_markdown_file', 'write_csv_file', 'write_mermaid_file']);
    });

    it('all file-write tools require path and content', () => {
      for (const tool of FILE_WRITE_TOOLS) {
        expect(tool.function.parameters.required).toEqual(['path', 'content']);
      }
    });
  });

  describe('FILE_WRITE_TOOL_NAMES', () => {
    it('contains 3 file-write tool names', () => {
      expect(FILE_WRITE_TOOL_NAMES).toHaveLength(3);
      expect(FILE_WRITE_TOOL_NAMES).toContain('write_markdown_file');
      expect(FILE_WRITE_TOOL_NAMES).toContain('write_csv_file');
      expect(FILE_WRITE_TOOL_NAMES).toContain('write_mermaid_file');
    });
  });

  describe('isFileWriteTool', () => {
    it('returns true for file-write tool names', () => {
      expect(isFileWriteTool('write_markdown_file')).toBe(true);
      expect(isFileWriteTool('write_csv_file')).toBe(true);
      expect(isFileWriteTool('write_mermaid_file')).toBe(true);
    });

    it('returns false for non-file-write tool names', () => {
      expect(isFileWriteTool('create_jira_issue')).toBe(false);
      expect(isFileWriteTool('create_github_pr')).toBe(false);
      expect(isFileWriteTool('unknown_tool')).toBe(false);
    });
  });
});
