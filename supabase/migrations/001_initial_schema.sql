-- ============================================================
-- Bitácora del Capitán — Schema Inicial
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: user_profiles
-- ============================================================
CREATE TABLE public.user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  birthdate             DATE,
  height_cm             SMALLINT,
  weight_kg             NUMERIC(5,2),
  timezone              TEXT NOT NULL DEFAULT 'America/Santiago',
  process_start_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  llm_provider          TEXT NOT NULL DEFAULT 'gemini' CHECK (llm_provider IN ('gemini', 'openai', 'claude')),
  llm_api_key_encrypted TEXT,
  coach_preset          TEXT NOT NULL DEFAULT 'engineer' CHECK (coach_preset IN ('engineer', 'psychologist', 'spartan', 'custom')),
  coach_custom_prompt   TEXT,
  notification_hour     SMALLINT NOT NULL DEFAULT 20,
  biometric_enabled     BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  is_approved           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================
-- TABLA: weight_logs
-- ============================================================
CREATE TABLE public.weight_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg   NUMERIC(5,2) NOT NULL,
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  source      TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_extracted')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_weight_logs" ON public.weight_logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: categories
-- ============================================================
CREATE TABLE public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📝',
  color       TEXT NOT NULL DEFAULT '#6B7280',
  description TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_categories_read" ON public.categories
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "users_insert_own_categories" ON public.categories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own_categories" ON public.categories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own_categories" ON public.categories
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- SEED: Categorías del sistema
-- ============================================================
INSERT INTO public.categories (user_id, slug, label, icon, color, description, sort_order) VALUES
  (NULL, 'medication',      'Medicación',    '💊', '#EF4444', 'Medicamentos, suplementos, dosis, horarios de toma, efectos secundarios, interacciones entre fármacos', 1),
  (NULL, 'exercise',        'Ejercicio',     '🏃', '#10B981', 'Actividad física, deportes, caminatas, duchas frías, movimiento corporal, duración e intensidad', 2),
  (NULL, 'nutrition',       'Alimentación',  '🍎', '#F59E0B', 'Comidas, dieta, hidratación, ayuno, antojos, cambios alimenticios, peso', 3),
  (NULL, 'sleep',           'Sueño',         '😴', '#8B5CF6', 'Calidad del sueño, hora de acostarse/levantarse, insomnio, sueños, siestas', 4),
  (NULL, 'emotions',        'Emociones',     '🎭', '#EC4899', 'Estado emocional, ansiedad, frustración, motivación, claridad mental, humor del día', 5),
  (NULL, 'relationships',   'Relaciones',    '👥', '#3B82F6', 'Interacciones con pareja, conflictos, comunicación, acuerdos, negociaciones', 6),
  (NULL, 'health',          'Salud',         '🏥', '#F97316', 'Síntomas físicos, consultas médicas, exámenes, bienestar general, salud de familiares', 7),
  (NULL, 'personal_growth', 'Crecimiento',   '🌱', '#22C55E', 'Aprendizaje, reflexiones, metas personales, hábitos, desintoxicación, disciplina', 8),
  (NULL, 'work',            'Trabajo',       '💼', '#6366F1', 'Productividad, proyectos, negocios, código, reuniones, enfoque profesional', 9),
  (NULL, 'family',          'Familia',       '🏠', '#14B8A6', 'Hijos, dinámica familiar, eventos, crianza, momentos importantes', 10),
  (NULL, 'finances',        'Finanzas',      '💰', '#84CC16', 'Gastos, ingresos, deudas, inversiones, decisiones económicas', 11),
  (NULL, 'misc',            'General',       '📝', '#6B7280', 'Todo lo que no encaja en otra categoría', 99);

-- ============================================================
-- TABLA: raw_entries
-- ============================================================
CREATE TABLE public.raw_entries (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body_text           TEXT,
  audio_url           TEXT,
  audio_duration_sec  INTEGER,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message       TEXT,
  retry_count         SMALLINT NOT NULL DEFAULT 0,
  transcript          TEXT,
  llm_raw_response    JSONB,
  device_datetime     TIMESTAMPTZ NOT NULL,
  is_bulk_import      BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.raw_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_entries" ON public.raw_entries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_raw_entries_user_status ON public.raw_entries (user_id, status);
CREATE INDEX idx_raw_entries_user_created ON public.raw_entries (user_id, created_at DESC);

-- ============================================================
-- TABLA: segments
-- ============================================================
CREATE TABLE public.segments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_entry_id    UUID NOT NULL REFERENCES public.raw_entries(id) ON DELETE CASCADE,
  category_slug   TEXT NOT NULL,
  content         TEXT NOT NULL,
  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  intensity       SMALLINT CHECK (intensity BETWEEN 1 AND 5),
  metadata        JSONB NOT NULL DEFAULT '{}',
  entry_date      DATE NOT NULL,
  entry_time      TIME,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_segments" ON public.segments
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_segments_user_category ON public.segments (user_id, category_slug);
CREATE INDEX idx_segments_user_date ON public.segments (user_id, entry_date DESC);
CREATE INDEX idx_segments_raw_entry ON public.segments (raw_entry_id);

-- ============================================================
-- TABLA: category_suggestions
-- ============================================================
CREATE TABLE public.category_suggestions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_entry_id          UUID NOT NULL REFERENCES public.raw_entries(id) ON DELETE CASCADE,
  suggested_slug        TEXT NOT NULL,
  suggested_label       TEXT NOT NULL,
  suggested_icon        TEXT NOT NULL DEFAULT '📌',
  suggested_color       TEXT NOT NULL DEFAULT '#6B7280',
  suggested_description TEXT NOT NULL,
  sample_content        TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_suggestions" ON public.category_suggestions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_suggestions_user_status ON public.category_suggestions (user_id, status);

-- ============================================================
-- TABLA: goals
-- ============================================================
CREATE TABLE public.goals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  type              TEXT NOT NULL CHECK (type IN ('avoid', 'limit', 'achieve')),
  category_slug     TEXT NOT NULL,
  target_value      NUMERIC,
  unit              TEXT CHECK (unit IN ('days', 'minutes', 'hours', 'count', 'times_per_week')),
  ai_detection_hint TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  start_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_goals" ON public.goals
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: goal_events
-- ============================================================
CREATE TABLE public.goal_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id       UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  raw_entry_id  UUID REFERENCES public.raw_entries(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL CHECK (event_type IN ('relapse', 'progress', 'achievement', 'milestone')),
  value         NUMERIC DEFAULT 0,
  entry_date    DATE NOT NULL,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_goal_events" ON public.goal_events
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_goal_events_goal_date ON public.goal_events (user_id, goal_id, entry_date DESC);

-- ============================================================
-- TABLA: coach_conversations
-- ============================================================
CREATE TABLE public.coach_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_conversations" ON public.coach_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: coach_messages
-- ============================================================
CREATE TABLE public.coach_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,
  grounding_sources JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_messages" ON public.coach_messages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_coach_messages_conversation ON public.coach_messages (conversation_id, created_at);

-- ============================================================
-- TABLA: api_tokens
-- ============================================================
CREATE TABLE public.api_tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL DEFAULT 'default',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tokens" ON public.api_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FUNCTION: get_goal_streak
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_goal_streak(p_goal_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_last_relapse DATE;
  v_start_date DATE;
BEGIN
  SELECT start_date INTO v_start_date FROM public.goals WHERE id = p_goal_id;
  SELECT MAX(entry_date) INTO v_last_relapse
  FROM public.goal_events
  WHERE goal_id = p_goal_id AND event_type = 'relapse';
  IF v_last_relapse IS NULL THEN
    RETURN CURRENT_DATE - v_start_date;
  ELSE
    RETURN CURRENT_DATE - v_last_relapse;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_raw_entries_updated_at
  BEFORE UPDATE ON public.raw_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER tr_coach_conversations_updated_at
  BEFORE UPDATE ON public.coach_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- STORAGE: Bucket para audio
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-entries', 'audio-entries', false);

CREATE POLICY "users_upload_own_audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audio-entries' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_read_own_audio" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audio-entries' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "users_delete_own_audio" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'audio-entries' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
