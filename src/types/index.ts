export * from './database';

// LLM types
export interface LLMConfig {
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
  model?: string;
}

export interface SegmentationRequest {
  text: string;
  audioBase64?: string;
  audioMimeType?: string;
  deviceDatetime: string;
  timezone: string;
  categories: import('./database').Category[];
  goals: import('./database').Goal[];
}

export interface ExtractedSegment {
  category_slug: string;
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  intensity: number;
  metadata: Record<string, any>;
  entry_date: string;
  entry_time: string | null;
}

export interface ExtractedCategorySuggestion {
  slug: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  sample_content: string;
}

export interface ExtractedGoalEvent {
  goal_id: string;
  event_type: 'relapse' | 'progress' | 'achievement';
  value: number;
  notes: string;
}

export interface SegmentationResponse {
  transcript: string | null;
  segments: ExtractedSegment[];
  category_suggestions: ExtractedCategorySuggestion[];
  goal_events: ExtractedGoalEvent[];
}

export interface CoachPersonality {
  preset: 'engineer' | 'psychologist' | 'spartan' | 'custom';
  customPrompt: string | null;
}

export interface UserCoachContext {
  fullName: string;
  age: number | null;
  processDay: number;
  summaryByCategory: CategorySummary[];
  goalsWithStreaks: import('./database').GoalWithStreak[];
  recentSegments: import('./database').Segment[];
}

export interface CategorySummary {
  slug: string;
  label: string;
  count: number;
  predominantSentiment: string;
}

// Local SQLite types
export interface QueuedEntry {
  id: string;
  body_text: string | null;
  audio_local_uri: string | null;
  device_datetime: string;
  sync_status: 'queued' | 'uploading' | 'uploaded' | 'processing' | 'synced' | 'error';
  supabase_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
