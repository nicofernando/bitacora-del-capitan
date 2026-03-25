import { LLMConfig } from '../../types';
import { LLMProvider } from './types';
import { GeminiProvider } from './gemini';

export function getLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'gemini':
      return new GeminiProvider(config.apiKey, config.model);
    case 'openai':
    case 'claude':
      throw new Error(`Provider "${config.provider}" not yet implemented`);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

export { GeminiProvider } from './gemini';
export type { LLMProvider } from './types';
