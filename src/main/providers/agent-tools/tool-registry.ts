import type { ActionToolDefinition } from '../actions/action-tools';

/**
 * Tool categories determine approval behavior in the agent harness.
 * - render: No approval needed. Produces UI content blocks.
 * - read: No approval needed. Fetches data from providers.
 * - write: Requires user approval (or auto-approved via approval memory).
 */
export type ToolCategory = 'render' | 'read' | 'write';

export interface RegisteredTool {
  definition: ActionToolDefinition;
  category: ToolCategory;
}

/**
 * Categorized registry of all agent tools.
 * The agent harness queries tools by category to determine:
 * - Which tools to include in LLM requests
 * - Whether a tool call requires approval before execution
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ActionToolDefinition, category: ToolCategory): void {
    this.tools.set(definition.function.name, { definition, category });
  }

  registerAll(definitions: ActionToolDefinition[], category: ToolCategory): void {
    for (const def of definitions) {
      this.register(def, category);
    }
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getCategory(name: string): ToolCategory | undefined {
    return this.tools.get(name)?.category;
  }

  requiresApproval(name: string): boolean {
    const category = this.getCategory(name);
    return category === 'write';
  }

  /** All tool definitions for inclusion in LLM requests. */
  getAllDefinitions(): ActionToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Tool definitions filtered by category. */
  getDefinitionsByCategory(category: ToolCategory): ActionToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.category === category)
      .map((t) => t.definition);
  }

  /** All tool names in the registry. */
  getAllNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Tool names filtered by category. */
  getNamesByCategory(category: ToolCategory): string[] {
    return Array.from(this.tools.values())
      .filter((t) => t.category === category)
      .map((t) => t.definition.function.name);
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }
}
