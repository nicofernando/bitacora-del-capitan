import { LLMProvider } from './types';
import {
  SegmentationRequest,
  SegmentationResponse,
  CoachPersonality,
  UserCoachContext,
} from '../../types';
import { GEMINI_MODEL, GEMINI_API_BASE } from '../constants';
import {
  buildSegmentationSystemPrompt,
  buildSegmentationUserPrompt,
  buildCoachSystemPrompt,
  SEGMENTATION_JSON_SCHEMA,
} from './prompts';

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || GEMINI_MODEL;
  }

  private get baseUrl(): string {
    return `${GEMINI_API_BASE}/${this.model}`;
  }

  async segmentEntry(request: SegmentationRequest): Promise<SegmentationResponse> {
    const systemPrompt = buildSegmentationSystemPrompt();
    const userPrompt = buildSegmentationUserPrompt(
      request.text,
      request.deviceDatetime,
      request.timezone,
      request.categories,
      request.goals,
    );

    const parts: any[] = [];

    // Add audio if present
    if (request.audioBase64 && request.audioMimeType) {
      parts.push({
        inlineData: {
          mimeType: request.audioMimeType,
          data: request.audioBase64,
        },
      });
    }

    // Add text prompt
    parts.push({ text: userPrompt });

    const body = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SEGMENTATION_JSON_SCHEMA,
        temperature: 0.2,
      },
    };

    const response = await fetch(
      `${this.baseUrl}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned empty response');
    }

    const parsed = JSON.parse(text) as SegmentationResponse;

    return {
      transcript: parsed.transcript ?? null,
      segments: parsed.segments ?? [],
      category_suggestions: parsed.category_suggestions ?? [],
      goal_events: parsed.goal_events ?? [],
    };
  }

  async chatWithCoach(
    message: string,
    conversationHistory: { role: string; content: string }[],
    userContext: UserCoachContext,
    personality: CoachPersonality,
  ): Promise<{ content: string; groundingSources: any[] | null }> {
    const systemPrompt = buildCoachSystemPrompt(personality, userContext);

    // Build conversation contents for Gemini
    const contents = [
      ...conversationHistory.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const body: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      tools: [{ googleSearch: {} }],
    };

    const response = await fetch(
      `${this.baseUrl}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    // Extract grounding sources if available
    const groundingMetadata = candidate?.groundingMetadata;
    let groundingSources: any[] | null = null;

    if (groundingMetadata?.groundingChunks) {
      groundingSources = groundingMetadata.groundingChunks
        .filter((chunk: any) => chunk.web)
        .map((chunk: any) => ({
          title: chunk.web.title || '',
          url: chunk.web.uri || '',
          snippet: '',
        }));
    }

    return { content, groundingSources };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const body = {
        contents: [{ parts: [{ text: 'Respond with just "ok"' }] }],
        generationConfig: { maxOutputTokens: 5 },
      };

      const response = await fetch(
        `${this.baseUrl}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }
}
