# Bitácora del Capitán

App Android de diario personal potenciada por IA que segmenta automáticamente entradas libres (texto o voz) en registros estructurados por categoría.

## Qué hace

El usuario escribe o dicta una entrada de diario, y la IA (Google Gemini) automáticamente:

- **Segmenta** la entrada en múltiples registros por categoría (medicación, ejercicio, emociones, relaciones, sueño, alimentación, etc.)
- **Detecta eventos de metas** (recaídas, progreso, logros) a partir del contenido
- **Resuelve fechas relativas** ("ayer a las 6am", "el lunes pasado") a timestamps reales
- **Sugiere nuevas categorías** cuando el contenido no encaja en las existentes
- **Ofrece un coach IA** con personalidad configurable, consejos basados en evidencia y fuentes web verificadas

## Funcionalidades principales

- **Segmentación inteligente**: Una entrada se convierte en N segmentos estructurados, cada uno con categoría, sentimiento, intensidad y metadata
- **Seguimiento de metas**: Definí metas (evitar/limitar/lograr), la IA detecta eventos automáticamente, cálculo de rachas (streaks)
- **Coach IA**: Chateá con un coach configurable que tiene contexto completo de tu bitácora. Soporta presets de personalidad (Ingeniero, Psicólogo, Espartano) o prompts personalizados
- **Offline-First**: Las entradas se guardan localmente (SQLite) antes de sincronizar. Nunca se pierde data aunque no haya red
- **Entrada por voz**: Grabá audio, la IA lo transcribe y segmenta
- **Privacidad**: Autenticación biométrica, API keys por usuario almacenadas en el enclave seguro del dispositivo, aislamiento total de datos via Row Level Security
- **Multi-usuario**: Aislamiento completo de datos entre usuarios con Supabase RLS en todas las tablas
- **API externa**: Generá tokens para que agentes IA externos consulten tus datos (solo lectura)
- **Dashboard**: Contador de días del proceso, rachas de metas, actividad semanal, segmentos recientes

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | React Native + Expo SDK 55 |
| Ruteo | Expo Router (basado en archivos) |
| Estilos | NativeWind v4 (Tailwind CSS) |
| Estado | Zustand |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| IA | Google Gemini 2.0 Flash (API REST, llamadas desde el cliente) |
| DB local | expo-sqlite (cola offline) |
| Seguridad | expo-secure-store, expo-local-authentication |
| Audio | expo-av |

## Arquitectura

```
Dispositivo (Android)
├── expo-sqlite (cola local, offline-first)
├── expo-secure-store (API keys, tokens)
├── React Native + Expo Router
│   ├── Pantallas: Auth, Onboarding, Dashboard, Entrada, Historial, Coach, Config
│   ├── Zustand Stores: auth, entries, goals, coach, categories
│   └── Servicio LLM (capa de abstracción)
│       └── Provider Gemini (API REST, llamadas desde el cliente)
└── Supabase
    ├── Auth (email/contraseña, Google OAuth)
    ├── PostgreSQL (11 tablas, RLS en todas)
    ├── Storage (archivos de audio)
    └── Edge Functions (API agent-query)
```

### Decisión clave de diseño

La API de Gemini se llama **desde el cliente**, no desde un backend. Cada usuario provee su propia API key, almacenada en el enclave seguro del dispositivo. Esto elimina la necesidad de un servidor proxy y mantiene la arquitectura simple.

## Esquema de base de datos

11 tablas con Row Level Security:

- `user_profiles` — Configuración del usuario, config del coach, seguimiento del proceso
- `categories` — Categorías del sistema (12 por defecto) + creadas por el usuario
- `raw_entries` — Entradas originales del diario (texto/audio)
- `segments` — Segmentos semánticos extraídos por la IA, por categoría
- `goals` — Metas definidas por el usuario (evitar/limitar/lograr)
- `goal_events` — Eventos de metas detectados por IA o manuales
- `coach_conversations` / `coach_messages` — Historial de chat con el coach IA
- `category_suggestions` — Categorías sugeridas por la IA (pendientes de aprobación)
- `weight_logs` — Historial de registro de peso
- `api_tokens` — Tokens hasheados con SHA-256 para acceso a la API externa

## Estructura del proyecto

```
src/
├── app/                    # Pantallas (Expo Router)
│   ├── (auth)/             # Login, Registro
│   ├── (tabs)/             # Dashboard, NuevaEntrada, Historial, Coach, Config
│   ├── onboarding.tsx      # Wizard de configuración inicial (5 pasos)
│   └── biometric.tsx       # Verificación biométrica
├── db/local.ts             # Cola offline SQLite
├── hooks/                  # useAuth, useBiometric, useProcessEntry, useSync
├── lib/
│   ├── llm/                # Abstracción LLM (provider Gemini, prompts, schemas)
│   ├── supabase.ts         # Cliente Supabase
│   ├── auth.ts             # Helpers de autenticación
│   ├── crypto.ts           # SHA-256, generación de tokens
│   ├── dates.ts            # Utilidades de fecha
│   └── notifications.ts    # Notificaciones locales
├── store/                  # Zustand stores (auth, entries, goals, coach, categories)
└── types/                  # Interfaces TypeScript
supabase/
├── migrations/             # Schema SQL
└── functions/agent-query/  # Edge function para agentes IA externos
```

## Configuración

### Prerequisitos

- Node.js >= 20.19
- Expo CLI (`npm install -g expo-cli`)
- Un proyecto en [Supabase](https://supabase.com)
- Una [API key de Google Gemini](https://aistudio.google.com) (tier gratuito)

### 1. Clonar e instalar

```bash
git clone https://github.com/nicofernando/bitacora-del-capitan.git
cd bitacora-del-capitan
npm install
```

### 2. Configurar variables de entorno

Crear `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Ejecutar migración de base de datos

Ejecutar el SQL de `supabase/migrations/001_initial_schema.sql` en el SQL Editor de Supabase.

### 4. Iniciar desarrollo

```bash
npx expo start
```

Para probar en un dispositivo Android, se necesita un [development build](https://docs.expo.dev/develop/development-builds/introduction/):

```bash
npx expo run:android
# o
eas build --platform android --profile development
```

> **Nota**: Expo Go no soporta SDK 55 todavía. Se requiere un development build.

## API externa

Generá un token desde Configuración para permitir que agentes IA externos consulten tus datos:

```bash
# Obtener segmentos por categoría
curl -H "Authorization: Bearer <token>" \
  "https://tu-proyecto.supabase.co/functions/v1/agent-query?action=segments&category=medication&from=2026-01-01"

# Obtener metas activas con rachas
curl -H "Authorization: Bearer <token>" \
  "https://tu-proyecto.supabase.co/functions/v1/agent-query?action=goals"

# Obtener resumen de 30 días
curl -H "Authorization: Bearer <token>" \
  "https://tu-proyecto.supabase.co/functions/v1/agent-query?action=summary&days=30"
```

## Categorías por defecto

| Categoría | Icono | Descripción |
|---|---|---|
| Medicación | 💊 | Medicamentos, suplementos, dosis, horarios, efectos secundarios |
| Ejercicio | 🏃 | Actividad física, deportes, caminatas, duchas frías |
| Alimentación | 🍎 | Comidas, dieta, hidratación, ayuno, peso |
| Sueño | 😴 | Calidad del sueño, hora de dormir, insomnio, siestas |
| Emociones | 🎭 | Estado emocional, ansiedad, motivación, claridad mental |
| Relaciones | 👥 | Interacciones con pareja, conflictos, comunicación |
| Salud | 🏥 | Síntomas físicos, consultas médicas, bienestar |
| Crecimiento | 🌱 | Aprendizaje, reflexiones, hábitos, disciplina |
| Trabajo | 💼 | Productividad, proyectos, reuniones, enfoque profesional |
| Familia | 🏠 | Hijos, dinámica familiar, crianza |
| Finanzas | 💰 | Gastos, ingresos, deudas, inversiones |
| General | 📝 | Todo lo que no encaja en otra categoría |

## Licencia

Proyecto privado. Todos los derechos reservados.
