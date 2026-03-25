export interface UserProfile {
  id: string;
  full_name: string;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  timezone: string;
  process_start_date: string;
  llm_provider: 'gemini' | 'openai' | 'claude';
  llm_api_key_encrypted: string | null;
  coach_preset: 'engineer' | 'psychologist' | 'spartan' | 'custom';
  coach_custom_prompt: string | null;
  notification_hour: number;
  biometric_enabled: boolean;
  onboarding_completed: boolean;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  slug: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface RawEntry {
  id: string;
  user_id: string;
  body_text: string | null;
  audio_url: string | null;
  audio_duration_sec: number | null;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_message: string | null;
  retry_count: number;
  transcript: string | null;
  llm_raw_response: any;
  device_datetime: string;
  is_bulk_import: boolean;
  created_at: string;
  updated_at: string;
}

export interface Segment {
  id: string;
  user_id: string;
  raw_entry_id: string;
  category_slug: string;
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed' | null;
  intensity: number | null;
  metadata: Record<string, any>;
  entry_date: string;
  entry_time: string | null;
  created_at: string;
}

export interface CategorySuggestion {
  id: string;
  user_id: string;
  raw_entry_id: string;
  suggested_slug: string;
  suggested_label: string;
  suggested_icon: string;
  suggested_color: string;
  suggested_description: string;
  sample_content: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  type: 'avoid' | 'limit' | 'achieve';
  category_slug: string;
  target_value: number | null;
  unit: 'days' | 'minutes' | 'hours' | 'count' | 'times_per_week' | null;
  ai_detection_hint: string;
  is_active: boolean;
  start_date: string;
  created_at: string;
}

export interface GoalEvent {
  id: string;
  user_id: string;
  goal_id: string;
  raw_entry_id: string | null;
  event_type: 'relapse' | 'progress' | 'achievement' | 'milestone';
  value: number;
  entry_date: string;
  notes: string | null;
  source: 'ai' | 'manual';
  created_at: string;
}

export interface CoachConversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  grounding_sources: GroundingSource[] | null;
  created_at: string;
}

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface ApiToken {
  id: string;
  user_id: string;
  token_hash: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  weight_kg: number;
  entry_date: string;
  source: 'manual' | 'ai_extracted';
  notes: string | null;
  created_at: string;
}

// Goal with computed streak
export interface GoalWithStreak extends Goal {
  streak: number;
}
