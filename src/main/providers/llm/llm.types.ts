export interface LlmModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmResponse {
  content: string;
  finishReason: string | null;
  toolCalls?: LlmToolCall[];
}

export interface LlmCompletionRequest {
  apiKey: string;
  modelId: string;
  messages: Array<{ role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string }>;
  tools?: unknown[];
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  onToken?: (tokenCount: number) => void;
}

export interface OpenRouterModelResponse {
  data: OpenRouterModelEntry[];
}

export interface OpenRouterModelEntry {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
}
