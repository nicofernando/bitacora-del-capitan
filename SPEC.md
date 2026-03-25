# Bitácora del Capitán — Especificación Técnica Completa

## 1. CONTEXTO Y PROPÓSITO

### El problema
Nico lleva un proceso de mejora personal activo (~Día 60+) gestionado exclusivamente mediante un chat con Gemini. Ese chat tiene limitaciones críticas:
- La ventana de contexto se satura (1.3M+ caracteres acumulados)
- No hay métricas ni streaks calculados automáticamente
- No hay filtrado por eje temático (medicación, ejercicio, relaciones, etc.)
- No hay persistencia estructurada — todo es texto narrativo
- No es accesible desde un agente IA externo para análisis de evolución
- Los datos están en un solo hilo sin backup real

### La solución
Una app Android nativa que:
1. Recibe entradas libres (texto/audio) como un diario
2. Una IA (Gemini) segmenta cada entrada en N registros por eje temático
3. Detecta eventos de metas (reincidencias, logros) automáticamente
4. Sugiere nuevas categorías cuando el contenido no encaja en las existentes
5. Un coach IA integrado con personalidad configurable, basado en evidencia, con grounding web
6. Dashboard con streaks, días del proceso, conteos por eje
7. API para agentes IA externos
8. Multi-usuario con aislamiento total de datos (RLS)
9. Biometría para proteger contenido extremadamente sensible

---

## 2. ARQUITECTURA GENERAL

```
┌──────────────────────────────────────────────────────────────────┐
│                      DISPOSITIVO ANDROID                         │
│                                                                  │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────────────────┐  │
│  │ expo-sqlite   │  │ expo-av    │  │ expo-secure-store       │  │
│  │ (queue local) │  │ (audio)   │  │ (API keys, tokens)      │  │
│  └──────┬───────┘  └─────┬──────┘  └────────────┬────────────┘  │
│         │                │                       │               │
│  ┌──────┴────────────────┴───────────────────────┴───────────┐  │
│  │                    React Native + Expo                     │  │
│  │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────┐ ┌───────┐ │  │
│  │  │Dashboard│ │NewEntry  │ │History  │ │Coach │ │Config │ │  │
│  │  └────┬────┘ └────┬─────┘ └────┬────┘ └──┬───┘ └───┬───┘ │  │
│  │       └───────────┴────────────┴─────────┴─────────┘     │  │
│  │                         │                                 │  │
│  │              ┌──────────┴──────────┐                      │  │
│  │              │   Zustand Stores    │                      │  │
│  │              │ auth/entries/goals  │                      │  │
│  │              │ coach/categories    │                      │  │
│  │              └──────────┬──────────┘                      │  │
│  │                         │                                 │  │
│  │              ┌──────────┴──────────┐                      │  │
│  │              │   LLM Service       │                      │  │
│  │              │ (Gemini REST API)   │◄── API key from      │  │
│  │              │ Abstraction layer   │    expo-secure-store  │  │
│  │              └──────────┬──────────┘                      │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                │
│                                                                 │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────┐ │
│  │   Auth   │  │ PostgreSQL │  │ Storage  │  │Edge Functions│ │
│  │Google+   │  │  (RLS on   │  │ (audio   │  │(agent-query) │ │
│  │Email/Pass│  │  ALL tables│  │  files)  │  │              │ │
│  └──────────┘  └────────────┘  └──────────┘  └──────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Decisión clave: Gemini se llama desde el CLIENTE, no desde Edge Functions

**Por qué**: Cada usuario trae su propia API key de Gemini. La key se almacena en `expo-secure-store` (enclave seguro del dispositivo). El cliente construye el prompt con contexto del usuario, llama a Gemini directamente, y guarda los resultados en Supabase. Esto elimina la necesidad de Edge Functions proxy para Gemini y simplifica enormemente la arquitectura.

**Edge Functions se usan SOLO para**: el endpoint `agent-query` (API externa para agentes IA que consultan datos del usuario con un token).

---

## 3. MODELO DE SEGURIDAD (DETALLADO)

### 3.1 Autenticación
- **Supabase Auth** con dos providers:
  - Email + contraseña (bcrypt hash server-side, email confirmation optional en dev)
  - Google OAuth (requiere Google Cloud Console project)
- **Biometría local** (expo-local-authentication):
  - Se activa al abrir la app si hay sesión de Supabase activa
  - Fingerprint o Face Unlock según hardware del dispositivo
  - Fallback: contraseña de la cuenta
  - NO se activa en cada foreground switch, solo al abrir desde cero o tras 5 min en background

### 3.2 Aislamiento de datos (RLS)
CADA tabla tiene Row Level Security activado. Políticas:

```sql
-- Patrón universal: usuario solo ve/modifica lo suyo
CREATE POLICY "users_own_data" ON <tabla>
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Excepción: categorías del sistema (user_id IS NULL) son visibles para todos
CREATE POLICY "system_categories_visible" ON categories
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Categorías custom: solo el dueño puede INSERT/UPDATE/DELETE
CREATE POLICY "users_manage_own_categories" ON categories
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

### 3.3 API keys del usuario
- **Gemini API key**: almacenada en `expo-secure-store` (encriptada por el OS)
- **Backup opcional**: se puede guardar encriptada en `user_profiles.llm_api_key_encrypted` para recuperarla en otro dispositivo. Encriptada con AES-256 usando un key derivado del user ID + un salt fijo de la app.
- **NUNCA** se transmite en plain text fuera de HTTPS
- **NUNCA** se loguea ni se muestra completa en la UI (solo últimos 4 chars)

### 3.4 Storage (audio)
- Bucket: `audio-entries` (private)
- Path: `{user_id}/{entry_id}.m4a`
- RLS en Storage:
```sql
-- Solo el usuario puede subir a su carpeta
CREATE POLICY "users_upload_own_audio" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'audio-entries' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
-- Solo el usuario puede leer su carpeta
CREATE POLICY "users_read_own_audio" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'audio-entries' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 3.5 API tokens (agente externo)
- El usuario genera tokens desde Settings
- Se muestra UNA VEZ al generar (como GitHub PATs)
- Se almacena solo el SHA-256 hash en `api_tokens.token_hash`
- El Edge Function `agent-query` recibe el token en `Authorization: Bearer <token>`, hashea con SHA-256, busca en la tabla, y si existe retorna datos del `user_id` asociado

### 3.6 Vectores de ataque mitigados
| Vector | Mitigación |
|---|---|
| APK decompilado | No hay API keys en el código. Keys en secure-store. Supabase anon key es público por diseño (RLS protege). |
| SQL injection | Supabase client usa prepared statements. No hay raw SQL en el cliente. |
| Otro usuario lee mis datos | RLS en TODAS las tablas. Incluso si se bypasea el cliente, Supabase rechaza queries sin auth.uid() match. |
| Man-in-the-middle | Todo HTTPS. Supabase usa TLS 1.3. Gemini API usa TLS. |
| Device robado | Biometría al abrir. expo-secure-store encriptado por OS. Supabase session expira. |
| Token de agente filtrado | Es solo read-only. El dueño puede revocar desde Settings. No permite escritura. |

---

## 4. BASE DE DATOS — SQL COMPLETO

```sql
-- ============================================================
-- EXTENSIONES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: user_profiles
-- Extiende auth.users con datos del perfil personal
-- ============================================================
CREATE TABLE public.user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  birthdate       DATE,                          -- para calcular edad
  height_cm       SMALLINT,                      -- opcional
  weight_kg       NUMERIC(5,2),                  -- peso inicial, se actualiza
  timezone        TEXT NOT NULL DEFAULT 'America/Santiago',
  process_start_date DATE NOT NULL DEFAULT CURRENT_DATE,  -- "Día 1 del proceso"

  -- LLM config
  llm_provider    TEXT NOT NULL DEFAULT 'gemini' CHECK (llm_provider IN ('gemini', 'openai', 'claude')),
  llm_api_key_encrypted TEXT,                    -- backup encriptado de la API key (opcional)

  -- Coach personality
  coach_preset    TEXT NOT NULL DEFAULT 'engineer' CHECK (coach_preset IN ('engineer', 'psychologist', 'spartan', 'custom')),
  coach_custom_prompt TEXT,                      -- texto libre del usuario para personalizar al coach

  -- App config
  notification_hour SMALLINT NOT NULL DEFAULT 20, -- hora local para "¿cómo fue tu día?"
  biometric_enabled BOOLEAN NOT NULL DEFAULT true,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============================================================
-- TABLA: weight_logs
-- Historial de peso (cada vez que se registra en una entrada o manualmente)
-- ============================================================
CREATE TABLE public.weight_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg       NUMERIC(5,2) NOT NULL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_extracted')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_weight_logs" ON public.weight_logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: categories
-- Categorías del sistema (user_id NULL) + custom del usuario
-- ============================================================
CREATE TABLE public.categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = sistema
  slug            TEXT NOT NULL,
  label           TEXT NOT NULL,
  icon            TEXT NOT NULL DEFAULT '📝',
  color           TEXT NOT NULL DEFAULT '#6B7280',
  description     TEXT NOT NULL,      -- usado en el prompt de Gemini
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, slug)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_categories_read" ON public.categories
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "users_manage_own_categories" ON public.categories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_update_own_categories" ON public.categories
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_delete_own_categories" ON public.categories
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- SEED: Categorías del sistema
-- ============================================================
INSERT INTO public.categories (user_id, slug, label, icon, color, description, sort_order) VALUES
  (NULL, 'medication',       'Medicación',         '💊', '#EF4444', 'Medicamentos, suplementos, dosis, horarios de toma, efectos secundarios, interacciones entre fármacos', 1),
  (NULL, 'exercise',         'Ejercicio',          '🏃', '#10B981', 'Actividad física, deportes, caminatas, duchas frías, movimiento corporal, duración e intensidad', 2),
  (NULL, 'nutrition',        'Alimentación',       '🍎', '#F59E0B', 'Comidas, dieta, hidratación, ayuno, antojos, cambios alimenticios, peso', 3),
  (NULL, 'sleep',            'Sueño',              '😴', '#8B5CF6', 'Calidad del sueño, hora de acostarse/levantarse, insomnio, sueños, siestas', 4),
  (NULL, 'emotions',         'Emociones',          '🎭', '#EC4899', 'Estado emocional, ansiedad, frustración, motivación, claridad mental, humor del día', 5),
  (NULL, 'relationships',    'Relaciones',         '👥', '#3B82F6', 'Interacciones con pareja, conflictos, comunicación, acuerdos, negociaciones', 6),
  (NULL, 'health',           'Salud',              '🏥', '#F97316', 'Síntomas físicos, consultas médicas, exámenes, bienestar general, salud de familiares', 7),
  (NULL, 'personal_growth',  'Crecimiento',        '🌱', '#22C55E', 'Aprendizaje, reflexiones, metas personales, hábitos, desintoxicación, disciplina', 8),
  (NULL, 'work',             'Trabajo',            '💼', '#6366F1', 'Productividad, proyectos, negocios, código, reuniones, enfoque profesional', 9),
  (NULL, 'family',           'Familia',            '🏠', '#14B8A6', 'Hijos, dinámica familiar, eventos, crianza, momentos importantes', 10),
  (NULL, 'finances',         'Finanzas',           '💰', '#84CC16', 'Gastos, ingresos, deudas, inversiones, decisiones económicas', 11),
  (NULL, 'misc',             'General',            '📝', '#6B7280', 'Todo lo que no encaja en otra categoría', 99);

-- ============================================================
-- TABLA: raw_entries
-- Entrada cruda del usuario (texto y/o audio)
-- ============================================================
CREATE TABLE public.raw_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenido
  body_text       TEXT,                          -- texto ingresado, o NULL si solo audio
  audio_url       TEXT,                          -- URL en Supabase Storage, o NULL si solo texto
  audio_duration_sec INTEGER,

  -- Estado de procesamiento
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error_message   TEXT,
  retry_count     SMALLINT NOT NULL DEFAULT 0,

  -- Resultados de IA
  transcript      TEXT,                          -- transcripción de audio por Gemini
  llm_raw_response JSONB,                       -- respuesta cruda de Gemini (debug)

  -- Temporal
  device_datetime TIMESTAMPTZ NOT NULL,          -- timestamp del dispositivo al crear
  is_bulk_import  BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.raw_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_entries" ON public.raw_entries
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_raw_entries_user_status ON public.raw_entries (user_id, status);
CREATE INDEX idx_raw_entries_user_created ON public.raw_entries (user_id, created_at DESC);

-- ============================================================
-- TABLA: segments
-- Segmentos semánticos extraídos por la IA (N por cada raw_entry)
-- ============================================================
CREATE TABLE public.segments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_entry_id    UUID NOT NULL REFERENCES public.raw_entries(id) ON DELETE CASCADE,

  -- Contenido semántico
  category_slug   TEXT NOT NULL,
  content         TEXT NOT NULL,                 -- restatement limpio del fragmento
  sentiment       TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
  intensity       SMALLINT CHECK (intensity BETWEEN 1 AND 5),  -- 1=leve, 5=extremo
  metadata        JSONB NOT NULL DEFAULT '{}',   -- datos estructurados por categoría

  -- Fecha/hora resuelta por la IA (puede diferir de created_at)
  entry_date      DATE NOT NULL,
  entry_time      TIME,                          -- NULL si no se mencionó hora

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
-- Nuevas categorías sugeridas por la IA, pendientes de aprobación
-- ============================================================
CREATE TABLE public.category_suggestions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_entry_id    UUID NOT NULL REFERENCES public.raw_entries(id) ON DELETE CASCADE,

  suggested_slug  TEXT NOT NULL,
  suggested_label TEXT NOT NULL,
  suggested_icon  TEXT NOT NULL DEFAULT '📌',
  suggested_color TEXT NOT NULL DEFAULT '#6B7280',
  suggested_description TEXT NOT NULL,
  sample_content  TEXT NOT NULL,                  -- fragmento que motivó la sugerencia

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.category_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_suggestions" ON public.category_suggestions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_suggestions_user_status ON public.category_suggestions (user_id, status);

-- ============================================================
-- TABLA: goals
-- Metas de seguimiento
-- ============================================================
CREATE TABLE public.goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,                  -- "Sin pornografía", "Sin peleas"
  description     TEXT,
  type            TEXT NOT NULL CHECK (type IN ('avoid', 'limit', 'achieve')),
  category_slug   TEXT NOT NULL,                  -- eje temático que trackea

  -- Para 'limit': max diario. Para 'achieve': objetivo (ej: 3 veces/semana)
  target_value    NUMERIC,
  unit            TEXT CHECK (unit IN ('days', 'minutes', 'hours', 'count', 'times_per_week')),

  -- Contexto para que la IA sepa qué detectar
  ai_detection_hint TEXT NOT NULL,               -- "Detectar si el usuario vio pornografía o tuvo impulsos"

  is_active       BOOLEAN NOT NULL DEFAULT true,
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_goals" ON public.goals
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: goal_events
-- Eventos de metas detectados por la IA o registrados manualmente
-- ============================================================
CREATE TABLE public.goal_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id         UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  raw_entry_id    UUID REFERENCES public.raw_entries(id) ON DELETE SET NULL,

  event_type      TEXT NOT NULL CHECK (event_type IN ('relapse', 'progress', 'achievement', 'milestone')),
  value           NUMERIC DEFAULT 0,             -- 0 para relapse, N para progress/limit
  entry_date      DATE NOT NULL,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual')),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_goal_events" ON public.goal_events
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_goal_events_goal_date ON public.goal_events (user_id, goal_id, entry_date DESC);

-- ============================================================
-- TABLA: coach_conversations
-- Sesiones de chat con el coach IA
-- ============================================================
CREATE TABLE public.coach_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT,                          -- auto-generado del primer mensaje
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_conversations" ON public.coach_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- TABLA: coach_messages
-- Mensajes individuales en conversaciones con el coach
-- ============================================================
CREATE TABLE public.coach_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,

  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  grounding_sources JSONB,                       -- [{title, url, snippet}] de Google Search

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_messages" ON public.coach_messages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_coach_messages_conversation ON public.coach_messages (conversation_id, created_at);

-- ============================================================
-- TABLA: api_tokens
-- Tokens para que agentes IA externos consulten datos del usuario
-- ============================================================
CREATE TABLE public.api_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,          -- SHA-256 del token real
  label           TEXT NOT NULL DEFAULT 'default',
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_tokens" ON public.api_tokens
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FUNCTION: Calcular streak de una meta tipo 'avoid'
-- Retorna días desde el último relapse (o desde start_date si nunca hubo)
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
-- FUNCTION: Trigger para updated_at automático
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
```

---

## 5. CAPA LLM — ABSTRACCIÓN MULTI-PROVIDER

### 5.1 Interfaz común (`src/lib/llm/types.ts`)

```typescript
// Tipos compartidos entre providers
interface LLMConfig {
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
  model?: string;           // override del modelo por defecto
}

interface SegmentationRequest {
  text: string;              // texto de la entrada (o transcript si audio)
  audioBase64?: string;      // audio en base64 si es entrada de voz
  audioMimeType?: string;    // 'audio/m4a', 'audio/wav', etc.
  deviceDatetime: string;    // ISO 8601 con timezone
  timezone: string;
  categories: Category[];    // categorías activas del usuario
  goals: Goal[];             // metas activas del usuario
}

interface SegmentationResponse {
  transcript: string | null;
  segments: ExtractedSegment[];
  categorySuggestions: CategorySuggestion[];
  goalEvents: ExtractedGoalEvent[];
}

interface CoachRequest {
  message: string;
  conversationHistory: CoachMessage[];  // últimos N mensajes
  userContext: UserCoachContext;         // resumen de bitácora + metas + perfil
  coachPersonality: CoachPersonality;   // preset + custom prompt
  enableGrounding: boolean;             // Google Search grounding
}

interface CoachResponse {
  content: string;
  groundingSources: GroundingSource[] | null;
}

interface CoachPersonality {
  preset: 'engineer' | 'psychologist' | 'spartan' | 'custom';
  customPrompt: string | null;
}
```

### 5.2 Provider Gemini (`src/lib/llm/gemini.ts`)

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- Modelo: `gemini-2.0-flash` (free tier, más rápido y capaz que 1.5 Flash)
- Límites free tier: 15 RPM, 1M tokens/mes, 1500 RPD
- Audio: soporta inline_data con base64 (formatos: m4a, mp3, wav, ogg)
- Grounding: `tools: [{google_search: {}}]` en el request body
- JSON mode: `generationConfig: { responseMimeType: "application/json", responseSchema: {...} }`

### 5.3 Flujo de llamada Gemini

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}

{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [{
    "parts": [
      { "text": "..." },                          // para texto
      { "inlineData": { "mimeType": "audio/m4a",  // para audio
                         "data": "<base64>" }}
    ]
  }],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": { ... },                     // JSON schema estricto
    "temperature": 0.2                             // baja para consistencia
  },
  "tools": [{ "googleSearch": {} }]                // solo para coach, no para segmentación
}
```

---

## 6. SISTEMA DE SEGMENTACIÓN — PROMPT COMPLETO

### 6.1 System Instruction (segmentación)

```
Eres un analizador de bitácoras personales. Tu trabajo es procesar una entrada de diario y producir una respuesta JSON estructurada con exactamente estos componentes:

1. TRANSCRIPCIÓN: Si recibiste audio, transcríbelo fielmente. Si recibiste texto, pon null.

2. SEGMENTOS: Extrae fragmentos semánticos clasificados por categoría. Reglas:
   - Solo extrae segmentos para categorías CLARAMENTE presentes en la entrada
   - Cada segmento tiene un "content" que es una reformulación limpia en español, en tercera persona
   - "sentiment": positive, negative, neutral, o mixed
   - "intensity": 1 (mención leve) a 5 (evento mayor/crisis)
   - "metadata": datos estructurados detectables. Ejemplos por categoría:
     * medication: {"substance": "metilfenidato", "dose_mg": 20, "time": "08:30"}
     * exercise: {"activity": "correr", "duration_minutes": 30}
     * nutrition: {"weight_kg": 85.5} (si menciona peso)
     * relationships: {"person": "persona_1", "topic": "dinero"}
   - Si un fragmento pertenece a múltiples categorías, crea un segmento para CADA una
   - NUNCA inventes información que no esté en la entrada original

3. FECHAS RESUELTAS: Usa device_datetime y timezone para resolver referencias temporales:
   - "ayer a las 6am" → entry_date del día anterior, entry_time "06:00"
   - "hace 30 minutos" → entry_date de hoy, entry_time calculado
   - "el lunes" → el lunes más reciente pasado
   - Si no hay referencia temporal → usa la fecha de device_datetime

4. SUGERENCIAS DE CATEGORÍA: Si algún contenido claramente NO encaja en ninguna categoría existente, sugiere una nueva. Solo sugiere si es realmente necesario — no infles categorías.

5. EVENTOS DE METAS: Si la entrada contiene evidencia CLARA de un evento relacionado a una meta activa del usuario, regístralo. Solo registra con evidencia explícita, nunca por inferencia vaga.
```

### 6.2 User Prompt Template (segmentación)

```
Fecha/hora del dispositivo: {device_datetime}
Timezone: {timezone}

Categorías disponibles:
{categories.map(c => `- ${c.slug}: ${c.description}`).join('\n')}

Metas activas del usuario:
{goals.map(g => `- [${g.id}] "${g.name}" (tipo: ${g.type}): ${g.ai_detection_hint}`).join('\n')}

--- ENTRADA DEL USUARIO ---
{body_text || "[Audio adjunto - transcribir primero]"}
```

### 6.3 JSON Schema para respuesta de segmentación

```json
{
  "type": "object",
  "properties": {
    "transcript": { "type": ["string", "null"] },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "category_slug": { "type": "string" },
          "content": { "type": "string" },
          "sentiment": { "type": "string", "enum": ["positive", "negative", "neutral", "mixed"] },
          "intensity": { "type": "integer", "minimum": 1, "maximum": 5 },
          "metadata": { "type": "object" },
          "entry_date": { "type": "string", "format": "date" },
          "entry_time": { "type": ["string", "null"] }
        },
        "required": ["category_slug", "content", "sentiment", "intensity", "entry_date"]
      }
    },
    "category_suggestions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "slug": { "type": "string" },
          "label": { "type": "string" },
          "icon": { "type": "string" },
          "color": { "type": "string" },
          "description": { "type": "string" },
          "sample_content": { "type": "string" }
        },
        "required": ["slug", "label", "description", "sample_content"]
      }
    },
    "goal_events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "goal_id": { "type": "string" },
          "event_type": { "type": "string", "enum": ["relapse", "progress", "achievement"] },
          "value": { "type": "number" },
          "notes": { "type": "string" }
        },
        "required": ["goal_id", "event_type"]
      }
    }
  },
  "required": ["transcript", "segments", "category_suggestions", "goal_events"]
}
```

---

## 7. COACH IA — SISTEMA COMPLETO

### 7.1 Presets de personalidad

```typescript
const COACH_PRESETS = {
  engineer: {
    label: 'Ingeniero de Sistemas',
    description: 'Metáforas de servidor, hardware, código. Tu cuerpo es una máquina, tu mente un sistema operativo.',
    prompt: `Usás metáforas de ingeniería de sistemas, servidores, hardware y código para explicar procesos biológicos y psicológicos. Hablás de "auditorías", "parches", "uptime", "RAM ejecutiva", "compilar", "bugs del sistema". El cuerpo es un servidor, la mente es un OS, los hábitos son daemons que corren en background. Sos técnico pero accesible.`
  },
  psychologist: {
    label: 'Psicólogo Directo',
    description: 'Lenguaje clínico accesible. Empatía sin condescendencia. Evidencia científica.',
    prompt: `Usás lenguaje de psicología clínica pero accesible. Nombrás técnicas por su nombre (reestructuración cognitiva, exposición gradual, mindfulness). Citás investigadores cuando es relevante (Barkley para TDAH, Huberman para neurociencia). Sos empático pero nunca condescendiente.`
  },
  spartan: {
    label: 'Espartano',
    description: 'Mínimas palabras. Sin adornos. Órdenes claras. Resultados.',
    prompt: `Respondés con la menor cantidad de palabras posible. Sin metáforas, sin adornos. Cada oración es una instrucción o un dato. Si algo va mal lo decís en una línea. Si algo va bien, una palabra: "Bien." o "Seguí." No explicás a menos que te pregunten.`
  },
  custom: {
    label: 'Personalizado',
    description: 'Vos definís el estilo del coach con texto libre.',
    prompt: null // el usuario escribe su propio prompt
  }
};
```

### 7.2 System Instruction del coach (base no configurable)

```
Sos un coach personal de mejora continua. Estos rasgos son OBLIGATORIOS independientemente del estilo elegido:

RASGOS BASE (no negociables):
- DIRECTO: No das la razón por darla. Si algo no va bien, lo decís claramente.
- CRÍTICO CONSTRUCTIVO: Señalás patrones negativos sin dramatizar ni suavizar.
- BASADO EN EVIDENCIA: Cuando hablés de salud, psicología, nutrición, farmacología, o cualquier tema técnico, SIEMPRE buscá en la web información actual y citá fuentes reales. No alucines datos médicos.
- HONESTO: Si no sabés algo, decilo. Si el usuario se está engañando, confrontalo.
- ENFOCADO EN EL PROCESO: El objetivo es mejora sostenida, no perfección. Las recaídas son datos, no fracasos.
- CONTEXTUAL: Tenés acceso al resumen de la bitácora del usuario. Usá esa información para personalizar tus respuestas. No repitas el contexto al usuario.

ESTILO PERSONAL (configurable):
{preset_prompt || custom_prompt}

CONTEXTO DEL USUARIO:
Nombre: {full_name}
Edad: {age} años
Día del proceso: {process_day}

Resumen de últimos 30 días:
{summary_by_category}

Metas activas:
{goals_with_streaks}

REGLAS DE INTERACCIÓN:
- Si el usuario reporta una recaída, no lo castigues. Analiza qué falló y propone ajustes.
- Si el usuario lleva un buen streak, reconocé el logro sin exagerar.
- Si detectás un patrón preocupante (ej: recaídas cada vez más frecuentes, empeoramiento de ánimo), señalalo proactivamente.
- Cuando uses información de la web, mencioná la fuente brevemente.
```

### 7.3 Construcción del contexto del coach

Para cada llamada al coach, el cliente construye un resumen compacto:

```typescript
async function buildCoachContext(userId: string): Promise<UserCoachContext> {
  // 1. Perfil del usuario
  const profile = await supabase.from('user_profiles').select('*').eq('id', userId).single();

  // 2. Resumen de últimos 30 días por categoría
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
  const segments = await supabase
    .from('segments')
    .select('category_slug, sentiment, intensity, entry_date')
    .eq('user_id', userId)
    .gte('entry_date', thirtyDaysAgo);

  // Agrupar por categoría: conteo, sentimiento predominante
  const summary = groupByCategory(segments.data);

  // 3. Metas activas + streak actual
  const goals = await supabase.from('goals').select('*').eq('user_id', userId).eq('is_active', true);
  const goalsWithStreaks = await Promise.all(
    goals.data.map(async (g) => ({
      ...g,
      streak: await supabase.rpc('get_goal_streak', { p_goal_id: g.id })
    }))
  );

  // 4. Últimos 5 segmentos relevantes (para contexto inmediato)
  const recentSegments = await supabase
    .from('segments')
    .select('category_slug, content, entry_date')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false })
    .limit(5);

  return { profile, summary, goalsWithStreaks, recentSegments };
}
```

### 7.4 Token budget del coach
- System instruction: ~800 tokens
- Contexto (resumen 30 días + metas): ~500 tokens
- Últimos 10 mensajes de conversación: ~2000 tokens
- Mensaje del usuario: ~200 tokens
- Respuesta esperada: ~500-1000 tokens
- **Total por llamada: ~4000-4500 tokens**
- Con 1M tokens/mes free → ~222 mensajes de coach/mes → ~7 por día. Suficiente.

---

## 8. NOTIFICACIONES LOCALES

### Lógica (en `src/lib/notifications.ts`)

```
Al abrir la app cada día:
1. Cancelar notificaciones programadas del día anterior
2. Si no hay raw_entries de hoy → programar:
   - {notification_hour}:00 → "¿Cómo fue tu día? Aún no registraste nada."
3. Chequear goal_events de ayer:
   - Si hubo relapse → programar para dentro de 1 hora:
     "Ayer hubo una recaída en {goal_name}. ¿Qué aprendiste?"
4. Chequear streaks:
   - Si algún goal alcanzó 7, 14, 30, 60, 90 días → programar inmediata:
     "{goal_name}: ¡{streak} días! Seguí así."
```

Todas las notificaciones son `expo-notifications` con trigger de tipo `date` (scheduling local, sin servidor).

---

## 9. PERSISTENCIA LOCAL (expo-sqlite)

### Schema SQLite local

```sql
CREATE TABLE queued_entries (
  id              TEXT PRIMARY KEY,    -- UUID generado localmente
  body_text       TEXT,
  audio_local_uri TEXT,                -- file:// path local del audio
  device_datetime TEXT NOT NULL,       -- ISO 8601
  sync_status     TEXT NOT NULL DEFAULT 'queued',
                  -- queued → uploading → uploaded → processing → synced | error
  supabase_id     TEXT,                -- UUID de raw_entries una vez subido
  error_message   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
```

### Flujo de sync

```
[1] Usuario crea entrada → INSERT queued_entries (sync_status: 'queued')
    → UI muestra "✓ Guardado localmente"

[2] Background: buscar entries con sync_status = 'queued'
    → Subir audio a Supabase Storage si aplica
    → INSERT raw_entry en Supabase (status: 'pending')
    → UPDATE queued_entries (sync_status: 'uploaded', supabase_id: ...)

[3] Background: para entries con sync_status = 'uploaded'
    → Llamar Gemini con el texto/audio
    → INSERT segments + goal_events + category_suggestions en Supabase
    → UPDATE raw_entry (status: 'done')
    → UPDATE queued_entries (sync_status: 'synced')

[4] Si cualquier paso falla:
    → UPDATE queued_entries (sync_status: 'error', error_message: ...)
    → La entrada NUNCA se pierde — queda en SQLite
    → Al abrir la app: reintentar todas las entries con error/queued/uploaded
```

---

## 10. PANTALLAS — SPEC POR PANTALLA

### 10.1 Auth: Login (`src/app/(auth)/login.tsx`)
- Campo email + campo contraseña
- Botón "Iniciar sesión"
- Botón "Continuar con Google" (ícono Google)
- Link "¿No tenés cuenta? Registrate"
- Manejo de errores inline (credenciales incorrectas, etc.)

### 10.2 Auth: Register (`src/app/(auth)/register.tsx`)
- Campo email + campo contraseña + confirmar contraseña
- Botón "Crear cuenta"
- Botón "Continuar con Google"
- Link "¿Ya tenés cuenta? Iniciá sesión"
- Al registrar exitosamente → redirigir a Onboarding

### 10.3 Onboarding (`src/app/onboarding.tsx`)
Wizard de 4 pasos con progress indicator:

**Paso 1: Perfil básico**
- Nombre completo (requerido)
- Fecha de nacimiento (date picker, muestra edad calculada)
- Timezone (auto-detectado del dispositivo, editable)

**Paso 2: Datos físicos (opcional)**
- Altura (cm) — slider o input numérico
- Peso (kg) — "Poné un aproximado, no te preocupes"
- Botón "Saltar" visible

**Paso 3: Tu primera meta**
- Nombre de la meta (text input)
- Tipo: selector (Evitar algo / Limitar algo / Lograr algo)
- Categoría asociada (selector de categorías)
- Descripción para la IA (text input): "¿Qué debe detectar la IA para esta meta?"
- Botón "Agregar otra meta" + "Continuar"

**Paso 4: Configuración del Coach**
- Selector de preset (4 cards con preview de estilo)
- Campo de texto libre: "Personalizá cómo te habla el coach"
- Preview en vivo: ejemplo de cómo respondería el coach con ese estilo

**Paso 5: API Key**
- Instrucciones: "Necesitás una API key gratuita de Google Gemini"
- Link a aistudio.google.com
- Campo para pegar la API key
- Botón "Verificar" → hace una llamada de prueba a Gemini
- Indicador: ✓ Key válida / ✗ Key inválida
- "La key se guarda encriptada en tu dispositivo. Nunca la compartimos."

Al completar → marcar `onboarding_completed = true` → ir a Dashboard

### 10.4 Biometría (`src/app/biometric.tsx`)
- Se muestra ANTES de cualquier pantalla si hay sesión activa
- Ícono de huella/cara grande centrado
- "Usá tu huella digital para acceder"
- Botón fallback: "Usar contraseña"
- Si el dispositivo no tiene biometría → skip automático

### 10.5 Dashboard (`src/app/(tabs)/index.tsx`)
```
┌─────────────────────────────────────────────┐
│  Buenos días, Nico                          │
│  Día 64 del proceso                    ⚙️  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  METAS ACTIVAS                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌──────┐ │   │
│  │  │🚫 Porno │  │🤝 Peleas│  │🏃 Ej.│ │   │
│  │  │  64 días │  │  12 días│  │3/7sem│ │   │
│  │  │ ✅ racha │  │ ✅ racha│  │📈 ok │ │   │
│  │  └─────────┘  └─────────┘  └──────┘ │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  ÚLTIMOS 7 DÍAS                      │   │
│  │  L  M  X  J  V  S  D                │   │
│  │  ●  ●  ●  ●  ○  ●  ○  (entradas)   │   │
│  │  💊💊💊💊  💊    (medicación)       │   │
│  │  🏃   🏃   🏃      (ejercicio)      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  ⚠️ Gemini sugiere nueva categoría   │   │
│  │  "Recuperación Sexual" → [Ver] [X]   │   │
│  └──────────────────────────────────────┘   │
│                                              │
│        [  + Nueva Entrada  ]                 │
└─────────────────────────────────────────────┘
```

**Datos que carga**:
- `user_profiles` → nombre, process_start_date → calcular "Día X"
- `goals` (is_active) + `get_goal_streak()` para cada meta
- `segments` de últimos 7 días agrupados por fecha y categoría
- `category_suggestions` con status = 'pending' → mostrar badge

### 10.6 Nueva Entrada (`src/app/(tabs)/new-entry.tsx`)
```
┌─────────────────────────────────────────────┐
│  Nueva Entrada                          📅  │
│  Martes 25 de marzo, 14:30                  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │  [Textarea multilínea expandible]    │   │
│  │  "Hoy tomé 20mg de Ritalin a las    │   │
│  │   8:30, peleé con mi esposa por..."  │   │
│  │                                      │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  🎤 [Grabar audio]    📎 0:00               │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  [Enviar Entrada]                    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ── Resultado del procesamiento ──           │
│                                              │
│  ✓ Guardado localmente                      │
│  ⟳ Procesando con IA...                     │
│                                              │
│  💊 Medicación                               │
│  "Tomó 20mg de metilfenidato a las 8:30"   │
│  Sentimiento: neutral | Intensidad: 2       │
│                                              │
│  👥 Relaciones                               │
│  "Pelea con pareja por tema de dinero"      │
│  Sentimiento: negative | Intensidad: 4      │
│                                              │
│  ⚠️ Evento detectado: Meta "Sin peleas"     │
│     → Recaída registrada                     │
└─────────────────────────────────────────────┘
```

**Flujo**:
1. Textarea para texto + botón de grabar audio (toggle)
2. Al grabar: expo-av, formato m4a, muestra duración y waveform simple
3. "Enviar" → guardar en SQLite → mostrar "✓ Guardado localmente" inmediato
4. Background: upload + Gemini → mostrar segmentos como cards debajo
5. Si hay category_suggestions → modal de aprobación
6. Si hay goal_events → highlight con ícono de alerta

### 10.7 Historia (`src/app/(tabs)/history.tsx`)
```
┌─────────────────────────────────────────────┐
│  Historial                             🔍   │
│                                              │
│  [💊][🏃][👥][🎭][🍎][...] ← pills scroll │
│  [Hoy ▼] [Hasta ▼]  ← date range picker    │
│                                              │
│  ── 25 de marzo ──                           │
│  💊 "Tomó 20mg metilfenidato 8:30am"       │
│  🏃 "Corrió 30 minutos"                     │
│  👥 "Pelea con pareja por dinero" 🔴        │
│                                              │
│  ── 24 de marzo ──                           │
│  💊 "Tomó 20mg metilfenidato 8:30am"       │
│  🎭 "Se sintió claro y motivado" 🟢        │
│  🌱 "Reflexión sobre patrón de evitación"  │
│                                              │
│  [Cargar más...]                             │
└─────────────────────────────────────────────┘
```

**Filtros**:
- Category pills: scroll horizontal, multi-select, filtra segmentos
- Date range: hoy / esta semana / este mes / custom
- Búsqueda: full-text en `segments.content`
- Tap en un segmento → modal con raw_entry completa + todos sus segmentos

### 10.8 Coach (`src/app/(tabs)/coach.tsx`)
```
┌─────────────────────────────────────────────┐
│  Coach                     [+ Nueva conv.]  │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 🤖 "Nico, llevas 64 días de uptime  │   │
│  │    continuo. Tu servidor está en su  │   │
│  │    punto más estable desde el boot.  │   │
│  │    Pero veo una recaída en peleas    │   │
│  │    hace 2 días. ¿Qué disparó eso?"  │   │
│  │                                      │   │
│  │    📎 Fuente: APA.org - Conflict    │   │
│  │    Resolution Strategies (2024)      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 👤 "fue por plata, ella insiste en   │   │
│  │    gastar en cosas que no son        │   │
│  │    prioritarias y yo exploté"        │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ 🤖 "Patrón detectado: las peleas    │   │
│  │    por finanzas representan 4 de tus │   │
│  │    últimas 5 recaídas en este eje.   │   │
│  │    No es un problema de dinero, es   │   │
│  │    un trigger de control..."         │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  ┌────────────────────────────┐  [Enviar]   │
│  │ Escribí tu mensaje...      │             │
│  └────────────────────────────┘             │
└─────────────────────────────────────────────┘
```

**Funcionalidad**:
- Chat UI estilo WhatsApp/Telegram
- Mensajes del usuario a la derecha, coach a la izquierda
- Grounding sources como links al final del mensaje del coach
- Lista de conversaciones pasadas (sidebar o screen)
- El coach tiene contexto de toda la bitácora reciente (sin que el usuario lo tenga que repetir)

### 10.9 Settings (`src/app/(tabs)/settings.tsx`)
Secciones:

**Perfil**: nombre, fecha nacimiento, altura, peso actual (botón "Actualizar peso")
**Coach**: selector de preset, campo de texto libre para personalizar
**LLM**: provider selector (Gemini por ahora), campo API key (muestra ****xxxx), botón verificar
**Categorías**: lista de categorías activas, toggle on/off, ordenar drag-and-drop
**Metas**: lista de metas, crear nueva, editar, desactivar
**Notificaciones**: hora del recordatorio diario, toggle on/off
**Datos**: exportar JSON/CSV, importar entrada masiva (textarea)
**API Externa**: generar token, listar tokens, revocar
**Seguridad**: toggle biometría, cambiar contraseña
**Cuenta**: cerrar sesión, eliminar cuenta

---

## 11. ÁRBOL DE ARCHIVOS COMPLETO

```
bitacora-del-capitan/
├── .github/
│   └── workflows/
│       └── supabase-keepalive.yml
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── functions/
│   │   └── agent-query/
│   │       └── index.ts
│   └── config.toml
├── src/
│   ├── app/
│   │   ├── _layout.tsx                    -- root layout: fonts, providers, biometric guard
│   │   ├── (auth)/
│   │   │   ├── _layout.tsx                -- auth group layout
│   │   │   ├── login.tsx
│   │   │   └── register.tsx
│   │   ├── onboarding.tsx
│   │   ├── biometric.tsx
│   │   └── (tabs)/
│   │       ├── _layout.tsx                -- tab bar layout
│   │       ├── index.tsx                  -- dashboard
│   │       ├── new-entry.tsx
│   │       ├── history.tsx
│   │       ├── coach.tsx
│   │       └── settings.tsx
│   ├── components/
│   │   ├── ui/                            -- componentes reutilizables genéricos
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Loading.tsx
│   │   ├── SegmentCard.tsx                -- card de un segmento individual
│   │   ├── GoalCard.tsx                   -- card de meta con streak
│   │   ├── GoalForm.tsx                   -- formulario crear/editar meta
│   │   ├── AudioRecorder.tsx              -- botón grabar + waveform + duración
│   │   ├── CategoryPills.tsx              -- pills horizontales de categorías
│   │   ├── CategoryApprovalModal.tsx      -- modal para aprobar categoría sugerida
│   │   ├── CoachMessage.tsx               -- burbuja de mensaje del coach
│   │   ├── WeekDots.tsx                   -- dots de actividad de 7 días
│   │   ├── DateRangePicker.tsx
│   │   └── OnboardingStep.tsx             -- wrapper de paso de onboarding
│   ├── lib/
│   │   ├── supabase.ts                    -- cliente Supabase singleton
│   │   ├── llm/
│   │   │   ├── types.ts                   -- interfaces compartidas
│   │   │   ├── gemini.ts                  -- implementación Gemini REST
│   │   │   ├── prompts.ts                 -- templates de prompts (segmentación + coach)
│   │   │   └── index.ts                   -- factory: getLLMProvider(config)
│   │   ├── notifications.ts               -- scheduling de notificaciones locales
│   │   ├── auth.ts                        -- helpers de auth (Google OAuth config, etc.)
│   │   ├── crypto.ts                      -- SHA-256 hash, AES encrypt/decrypt
│   │   ├── dates.ts                       -- helpers de fecha (calcular edad, día del proceso)
│   │   └── constants.ts                   -- colores, presets del coach, etc.
│   ├── db/
│   │   └── local.ts                       -- expo-sqlite: init, queue CRUD, sync logic
│   ├── store/
│   │   ├── auth.ts                        -- Zustand: sesión, perfil, onboarding state
│   │   ├── entries.ts                     -- Zustand: raw_entries, segments, procesamiento
│   │   ├── goals.ts                       -- Zustand: goals, goal_events, streaks
│   │   ├── coach.ts                       -- Zustand: conversations, messages
│   │   └── categories.ts                 -- Zustand: categories, suggestions
│   ├── hooks/
│   │   ├── useAuth.ts                     -- hook de autenticación
│   │   ├── useBiometric.ts                -- hook de verificación biométrica
│   │   ├── useSync.ts                     -- hook de sincronización local→remote
│   │   └── useProcessEntry.ts             -- hook de procesamiento: text/audio → Gemini → save
│   └── types/
│       ├── database.ts                    -- tipos generados de Supabase schema
│       └── index.ts                       -- tipos compartidos de la app
├── assets/
│   ├── icon.png
│   ├── splash.png
│   └── adaptive-icon.png
├── app.json                               -- config de Expo
├── babel.config.js
├── tailwind.config.js                     -- config NativeWind
├── tsconfig.json
├── package.json
└── .env.local                             -- EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
```

---

## 12. EDGE FUNCTION: agent-query

```typescript
// supabase/functions/agent-query/index.ts
// Endpoint read-only para agentes IA externos

// Request: GET /agent-query?category=medication&from=2026-01-01&to=2026-03-25&limit=50
// Header: Authorization: Bearer <token>

// Endpoints:
// ?action=segments&category=X&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
// ?action=goals (lista metas activas + streaks)
// ?action=summary&days=30 (resumen por categoría de últimos N días)
// ?action=export (todo el historial)

// Auth: SHA-256(token) → buscar en api_tokens → obtener user_id
// Si no match → 401
// Si match → queries con user_id como filtro
// Actualizar last_used_at

// Response format: JSON con meta + data
```

---

## 13. GITHUB ACTION: KEEP-ALIVE

```yaml
# .github/workflows/supabase-keepalive.yml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 8 */5 * *'  # cada 5 días a las 8:00 UTC
  workflow_dispatch:         # manual trigger

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -s -o /dev/null -w "%{http_code}" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/categories?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

## 14. DEPENDENCIAS (package.json)

```json
{
  "dependencies": {
    "expo": "~52.x",
    "expo-router": "~4.x",
    "expo-av": "~14.x",
    "expo-local-authentication": "~14.x",
    "expo-notifications": "~0.28.x",
    "expo-sqlite": "~14.x",
    "expo-secure-store": "~13.x",
    "expo-crypto": "~13.x",
    "expo-image-picker": "~15.x",
    "react-native": "0.76.x",
    "react-native-reanimated": "~3.16.x",
    "react-native-gesture-handler": "~2.20.x",
    "react-native-safe-area-context": "4.12.x",
    "@react-native-async-storage/async-storage": "2.1.x",
    "@supabase/supabase-js": "^2.x",
    "nativewind": "^4.x",
    "tailwindcss": "^3.4.x",
    "zustand": "^5.x",
    "date-fns": "^4.x",
    "react-hook-form": "^7.x",
    "@react-native-google-signin/google-signin": "^13.x",
    "react-native-url-polyfill": "^2.x"
  }
}
```

---

## 15. PREREQUISITOS — LO QUE NECESITO DEL USUARIO

Antes de empezar a codear, el usuario debe:

### A. Crear proyecto Supabase
1. Ir a supabase.com → New Project
2. Nombre: "bitacora-del-capitan"
3. Región: South America (São Paulo)
4. Generar password de DB
5. **Proveerme**: Project URL + anon key + service role key

### B. Configurar Google OAuth en Supabase
1. Ir a Google Cloud Console → nuevo proyecto
2. Activar "Google Identity" API
3. Crear OAuth 2.0 credentials (tipo: Web Application)
4. Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
5. En Supabase Dashboard → Auth → Providers → Google → pegar Client ID y Client Secret
6. **Proveerme**: confirmación de que está configurado

### C. Obtener Gemini API Key
1. Ir a aistudio.google.com
2. Get API Key → Create API Key
3. **NO me la envíe** — la ingresará en la app durante el onboarding

### D. Crear repositorio GitHub
1. Crear repo (puede ser privado)
2. **Proveerme**: URL del repo
3. Configurar secrets en el repo: `SUPABASE_URL` y `SUPABASE_ANON_KEY`

### E. Instalar herramientas locales
```bash
npm install -g expo-cli eas-cli
npx create-expo-app@latest bitacora-del-capitan --template blank-typescript
```

---

## 16. VERIFICACIÓN END-TO-END

1. **Auth**: Abrir app → Register con email → Onboarding completo → Login → Biometría → Dashboard
2. **Google OAuth**: Logout → Login con Google → perfil cargado
3. **Entrada texto**: "ayer a las 8pm peleé con mi esposa, esta mañana corrí 30 min y tomé 20mg Ritalin" → "✓ Guardado" inmediato → 3 segmentos con fechas correctas (ayer y hoy)
4. **Entrada audio**: Grabar 30 seg → transcript aparece → segmentos generados
5. **Categoría sugerida**: Entrada con contenido inédito → modal de aprobación → aprobar → categoría aparece en pills
6. **Meta detectada**: Si existe meta "sin peleas" → relapse detectado → dashboard actualiza streak a 0
7. **Dashboard**: Día X correcto, streaks correctos, dots de 7 días correctos
8. **Historia**: Filtrar por "exercise" → solo segmentos de ejercicio. Filtrar por fecha → rango correcto.
9. **Coach**: Enviar "¿cómo voy?" → respuesta con contexto de la bitácora + fuente web citada
10. **Offline**: Modo avión → crear entrada → "✓ Guardado localmente" → reconectar → sync automático
11. **Multi-usuario**: Crear segunda cuenta → NO ve datos de la primera → categories sistema sí visibles
12. **API externa**: Settings → generar token → `curl /agent-query?action=segments&category=medication` → JSON con datos
13. **Build**: `eas build -p android --profile preview` → APK instalable en Android

---

## 17. RIESGOS Y MITIGACIONES

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Supabase free pausa tras 7 días | ALTO | GitHub Action ping c/5 días. DÍA 1 del proyecto. |
| Perder entrada si falla red | ALTO | SQLite local SIEMPRE primero. Nunca depender de red para guardar. |
| Gemini JSON malformado | MEDIO | responseSchema de JSON mode. Fallback: try/catch + status=error + retry. |
| Goals mal detectados | MEDIO | Solo con evidencia explícita. Campo `source` (ai/manual) permite corregir. |
| Coach alucina datos médicos | MEDIO | Grounding con Google Search obligatorio en llamadas del coach. |
| API key de usuario expuesta | BAJO | expo-secure-store (enclave OS). Nunca en código ni en logs. |
| Cruce de datos entre usuarios | BAJO | RLS en TODAS las tablas. Testeado con 2 cuentas distintas. |
| Google OAuth redirect en Expo Go | MEDIO | Requiere dev client build, no funciona en Expo Go. Testear con email/pass primero. |

---

## 18. LO QUE NO SE CONSTRUYE EN V1

- iOS (requiere Apple Developer $99/año + macOS)
- Push notifications por servidor (Firebase Cloud Messaging)
- Social / compartir contenido
- Real-time sync / WebSockets
- Charts avanzados / gráficos de evolución (más allá de dots y conteos)
- OCR de fotos
- Edición/eliminación de categorías con re-segmentación en cascada
- Providers de LLM adicionales (solo Gemini en v1, pero la abstracción queda lista)
- Web app (solo Android nativo)
