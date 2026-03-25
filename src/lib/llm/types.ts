import { SegmentationRequest, SegmentationResponse, CoachPersonality, UserCoachContext } from '../../types';

export interface LLMProvider {
  segmentEntry(request: SegmentationRequest): Promise<SegmentationResponse>;
  chatWithCoach(
    message: string,
    conversationHistory: { role: string; content: string }[],
    userContext: UserCoachContext,
    personality: CoachPersonality,
  ): Promise<{ content: string; groundingSources: any[] | null }>;
  validateApiKey(): Promise<boolean>;
}
