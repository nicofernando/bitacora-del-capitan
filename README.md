# Bitacora del Capitan

A personal journal Android app powered by AI that automatically segments free-form entries (text or voice) into structured, categorized records.

## What it does

Users write or dictate a single journal entry, and AI (Google Gemini) automatically:

- **Segments** the entry into multiple records by category (medication, exercise, emotions, relationships, sleep, nutrition, etc.)
- **Detects goal events** (relapses, progress, achievements) from the entry content
- **Resolves relative dates** ("yesterday at 6am", "last Monday") to actual timestamps
- **Suggests new categories** when content doesn't fit existing ones
- **Provides an AI coach** with configurable personality, evidence-based advice, and web-grounded sources

## Key Features

- **Smart Segmentation**: One entry becomes N structured segments, each with category, sentiment, intensity, and metadata
- **Goal Tracking**: Define goals (avoid/limit/achieve), AI detects events automatically, streak counting
- **AI Coach**: Chat with a configurable coach that has full context of your journal history. Supports personality presets (Engineer, Psychologist, Spartan) or custom prompts
- **Offline-First**: Entries are saved locally (SQLite) before syncing. Never lose data even without network
- **Voice Input**: Record audio entries, AI transcribes and segments them
- **Privacy**: Biometric authentication, per-user API keys stored in device secure enclave, full data isolation via Row Level Security
- **Multi-User**: Complete data isolation between users with Supabase RLS on all tables
- **External API**: Generate tokens for external AI agents to query your data (read-only)
- **Dashboard**: Process day counter, goal streaks, weekly activity dots, recent segments

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo SDK 55 |
| Routing | Expo Router (file-based) |
| Styling | NativeWind v4 (Tailwind CSS) |
| State | Zustand |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| AI | Google Gemini 2.0 Flash (REST API, client-side) |
| Local DB | expo-sqlite (offline queue) |
| Security | expo-secure-store, expo-local-authentication |
| Audio | expo-av |

## Architecture

```
Device (Android)
├── expo-sqlite (local queue, offline-first)
├── expo-secure-store (API keys, tokens)
├── React Native + Expo Router
│   ├── Screens: Auth, Onboarding, Dashboard, Entry, History, Coach, Settings
│   ├── Zustand Stores: auth, entries, goals, coach, categories
│   └── LLM Service (abstraction layer)
│       └── Gemini Provider (REST API, client-side calls)
└── Supabase
    ├── Auth (email/password, Google OAuth)
    ├── PostgreSQL (11 tables, RLS on all)
    ├── Storage (audio files)
    └── Edge Functions (agent-query API)
```

### Key Design Decision

Gemini API is called **from the client**, not from a backend. Each user provides their own API key, stored in the device's secure enclave. This eliminates the need for a proxy server and keeps the architecture simple.

## Database Schema

11 tables with Row Level Security:

- `user_profiles` — User settings, coach config, process tracking
- `categories` — System (12 default) + user-created categories
- `raw_entries` — Original journal entries (text/audio)
- `segments` — AI-extracted semantic segments per category
- `goals` — User-defined goals (avoid/limit/achieve)
- `goal_events` — AI-detected or manual goal events
- `coach_conversations` / `coach_messages` — Chat history with AI coach
- `category_suggestions` — AI-suggested new categories (pending approval)
- `weight_logs` — Weight tracking history
- `api_tokens` — SHA-256 hashed tokens for external API access

## Project Structure

```
src/
├── app/                    # Expo Router screens
│   ├── (auth)/             # Login, Register
│   ├── (tabs)/             # Dashboard, NewEntry, History, Coach, Settings
│   ├── onboarding.tsx      # 5-step setup wizard
│   └── biometric.tsx       # Biometric auth gate
├── db/local.ts             # SQLite offline queue
├── hooks/                  # useAuth, useBiometric, useProcessEntry, useSync
├── lib/
│   ├── llm/                # LLM abstraction (Gemini provider, prompts, schemas)
│   ├── supabase.ts         # Supabase client
│   ├── auth.ts             # Auth helpers
│   ├── crypto.ts           # SHA-256, token generation
│   ├── dates.ts            # Date utilities
│   └── notifications.ts    # Local notifications
├── store/                  # Zustand stores (auth, entries, goals, coach, categories)
└── types/                  # TypeScript interfaces
supabase/
├── migrations/             # SQL schema
└── functions/agent-query/  # Edge function for external AI agents
```

## Setup

### Prerequisites

- Node.js >= 20.19
- Expo CLI (`npm install -g expo-cli`)
- A [Supabase](https://supabase.com) project
- A [Google Gemini API key](https://aistudio.google.com) (free tier)

### 1. Clone and install

```bash
git clone https://github.com/nicofernando/bitacora-del-capitan.git
cd bitacora-del-capitan
npm install
```

### 2. Configure environment

Create `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run database migration

Execute the SQL in `supabase/migrations/001_initial_schema.sql` in your Supabase SQL Editor.

### 4. Start development

```bash
npx expo start
```

For Android device testing, use a [development build](https://docs.expo.dev/develop/development-builds/introduction/):

```bash
npx expo run:android
# or
eas build --platform android --profile development
```

> **Note**: Expo Go does not support SDK 55 yet. A development build is required.

## External API

Generate an API token from Settings to allow external AI agents to query your data:

```bash
# Get segments by category
curl -H "Authorization: Bearer <token>" \
  "https://your-project.supabase.co/functions/v1/agent-query?action=segments&category=medication&from=2026-01-01"

# Get active goals with streaks
curl -H "Authorization: Bearer <token>" \
  "https://your-project.supabase.co/functions/v1/agent-query?action=goals"

# Get 30-day summary
curl -H "Authorization: Bearer <token>" \
  "https://your-project.supabase.co/functions/v1/agent-query?action=summary&days=30"
```

## Default Categories

| Category | Icon | Description |
|---|---|---|
| Medication | 💊 | Medications, supplements, doses, schedules, side effects |
| Exercise | 🏃 | Physical activity, sports, walks, cold showers |
| Nutrition | 🍎 | Meals, diet, hydration, fasting, weight |
| Sleep | 😴 | Sleep quality, bedtime, insomnia, naps |
| Emotions | 🎭 | Emotional state, anxiety, motivation, mental clarity |
| Relationships | 👥 | Partner interactions, conflicts, communication |
| Health | 🏥 | Physical symptoms, medical appointments, wellness |
| Personal Growth | 🌱 | Learning, reflections, habits, discipline |
| Work | 💼 | Productivity, projects, meetings, professional focus |
| Family | 🏠 | Children, family dynamics, parenting |
| Finances | 💰 | Expenses, income, debts, investments |
| General | 📝 | Everything that doesn't fit elsewhere |

## License

Private project. All rights reserved.
