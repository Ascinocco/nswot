import type { LlmModel, OpenRouterModelResponse } from './llm.types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

export class OpenRouterProvider {
  async listModels(apiKey: string): Promise<LlmModel[]> {
    const response = await fetch(OPENROUTER_API_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = new Error(`OpenRouter API error: ${response.status}`);
      (error as unknown as { status: number }).status = response.status;
      throw error;
    }

    const body = (await response.json()) as OpenRouterModelResponse;

    return body.data.map((entry) => ({
      id: entry.id,
      name: entry.name,
      contextLength: entry.context_length,
      pricing: {
        prompt: parseFloat(entry.pricing.prompt),
        completion: parseFloat(entry.pricing.completion),
      },
    }));
  }
}
