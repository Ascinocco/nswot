import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from './tool-registry';
import type { ActionToolDefinition } from '../actions/action-tools';

function makeTool(name: string): ActionToolDefinition {
  return {
    type: 'function',
    function: {
      name,
      description: `Test tool: ${name}`,
      parameters: { type: 'object', properties: {}, required: [] },
    },
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register / get', () => {
    it('registers and retrieves a tool', () => {
      const tool = makeTool('render_swot_analysis');
      registry.register(tool, 'render');

      const registered = registry.get('render_swot_analysis');
      expect(registered).toBeDefined();
      expect(registered!.definition.function.name).toBe('render_swot_analysis');
      expect(registered!.category).toBe('render');
    });

    it('returns undefined for unregistered tools', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing registration', () => {
      const tool = makeTool('fetch_jira_data');
      registry.register(tool, 'read');
      registry.register(tool, 'write'); // Re-register with different category

      expect(registry.getCategory('fetch_jira_data')).toBe('write');
    });
  });

  describe('registerAll', () => {
    it('registers multiple tools at once', () => {
      const tools = [
        makeTool('render_swot_analysis'),
        makeTool('render_summary_cards'),
        makeTool('render_quality_metrics'),
      ];
      registry.registerAll(tools, 'render');

      expect(registry.size).toBe(3);
      expect(registry.getCategory('render_swot_analysis')).toBe('render');
      expect(registry.getCategory('render_summary_cards')).toBe('render');
      expect(registry.getCategory('render_quality_metrics')).toBe('render');
    });
  });

  describe('getCategory', () => {
    it('returns the correct category', () => {
      registry.register(makeTool('render_mermaid'), 'render');
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('create_jira_issue'), 'write');

      expect(registry.getCategory('render_mermaid')).toBe('render');
      expect(registry.getCategory('fetch_jira_data')).toBe('read');
      expect(registry.getCategory('create_jira_issue')).toBe('write');
    });

    it('returns undefined for unknown tools', () => {
      expect(registry.getCategory('unknown')).toBeUndefined();
    });
  });

  describe('requiresApproval', () => {
    it('returns true for write tools', () => {
      registry.register(makeTool('create_jira_issue'), 'write');
      expect(registry.requiresApproval('create_jira_issue')).toBe(true);
    });

    it('returns false for render tools', () => {
      registry.register(makeTool('render_swot_analysis'), 'render');
      expect(registry.requiresApproval('render_swot_analysis')).toBe(false);
    });

    it('returns false for read tools', () => {
      registry.register(makeTool('fetch_jira_data'), 'read');
      expect(registry.requiresApproval('fetch_jira_data')).toBe(false);
    });

    it('returns false for unknown tools', () => {
      expect(registry.requiresApproval('unknown')).toBe(false);
    });
  });

  describe('getAllDefinitions', () => {
    it('returns all registered tool definitions', () => {
      registry.register(makeTool('render_swot_analysis'), 'render');
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('create_jira_issue'), 'write');

      const defs = registry.getAllDefinitions();
      expect(defs).toHaveLength(3);
      expect(defs.map((d) => d.function.name)).toContain('render_swot_analysis');
      expect(defs.map((d) => d.function.name)).toContain('fetch_jira_data');
      expect(defs.map((d) => d.function.name)).toContain('create_jira_issue');
    });

    it('returns empty array when no tools registered', () => {
      expect(registry.getAllDefinitions()).toEqual([]);
    });
  });

  describe('getDefinitionsByCategory', () => {
    beforeEach(() => {
      registry.register(makeTool('render_swot_analysis'), 'render');
      registry.register(makeTool('render_mermaid'), 'render');
      registry.register(makeTool('fetch_jira_data'), 'read');
      registry.register(makeTool('create_jira_issue'), 'write');
    });

    it('returns only render tools', () => {
      const defs = registry.getDefinitionsByCategory('render');
      expect(defs).toHaveLength(2);
      expect(defs.every((d) => registry.getCategory(d.function.name) === 'render')).toBe(true);
    });

    it('returns only read tools', () => {
      const defs = registry.getDefinitionsByCategory('read');
      expect(defs).toHaveLength(1);
      expect(defs[0]!.function.name).toBe('fetch_jira_data');
    });

    it('returns only write tools', () => {
      const defs = registry.getDefinitionsByCategory('write');
      expect(defs).toHaveLength(1);
      expect(defs[0]!.function.name).toBe('create_jira_issue');
    });
  });

  describe('getNamesByCategory', () => {
    it('returns tool names filtered by category', () => {
      registry.register(makeTool('render_swot_analysis'), 'render');
      registry.register(makeTool('render_mermaid'), 'render');
      registry.register(makeTool('fetch_jira_data'), 'read');

      const renderNames = registry.getNamesByCategory('render');
      expect(renderNames).toEqual(['render_swot_analysis', 'render_mermaid']);

      const readNames = registry.getNamesByCategory('read');
      expect(readNames).toEqual(['fetch_jira_data']);

      const writeNames = registry.getNamesByCategory('write');
      expect(writeNames).toEqual([]);
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      expect(registry.size).toBe(0);
    });

    it('returns correct count', () => {
      registry.register(makeTool('a'), 'render');
      registry.register(makeTool('b'), 'read');
      expect(registry.size).toBe(2);
    });
  });
});
