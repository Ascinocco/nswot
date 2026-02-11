export interface LlmModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
  };
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
