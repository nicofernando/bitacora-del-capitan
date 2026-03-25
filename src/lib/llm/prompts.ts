import { Category, Goal, GoalWithStreak } from '../../types/database';
import { CoachPersonality, UserCoachContext, CategorySummary } from '../../types';
import { COACH_PRESETS } from '../constants';

export function buildSegmentationSystemPrompt(): string {
  return `Eres un analizador de bitácoras personales. Tu trabajo es procesar una entrada de diario y producir una respuesta JSON estructurada con exactamente estos componentes:

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

5. EVENTOS DE METAS: Si la entrada contiene evidencia CLARA de un evento relacionado a una meta activa del usuario, regístralo. Solo registra con evidencia explícita, nunca por inferencia vaga.`;
}

export function buildSegmentationUserPrompt(
  text: string,
  deviceDatetime: string,
  timezone: string,
  categories: Category[],
  goals: Goal[],
): string {
  const catList = categories
    .filter((c) => c.is_active)
    .map((c) => `- ${c.slug}: ${c.description}`)
    .join('\n');

  const goalList =
    goals.length > 0
      ? goals.map((g) => `- [${g.id}] "${g.name}" (tipo: ${g.type}): ${g.ai_detection_hint}`).join('\n')
      : '(Sin metas activas)';

  return `Fecha/hora del dispositivo: ${deviceDatetime}
Timezone: ${timezone}

Categorías disponibles:
${catList}

Metas activas del usuario:
${goalList}

--- ENTRADA DEL USUARIO ---
${text}`;
}

export function buildCoachSystemPrompt(
  personality: CoachPersonality,
  context: UserCoachContext,
): string {
  const presetPrompt =
    personality.preset === 'custom'
      ? personality.customPrompt || ''
      : COACH_PRESETS[personality.preset]?.prompt || '';

  const summaryText =
    context.summaryByCategory.length > 0
      ? context.summaryByCategory
          .map((s: CategorySummary) => `- ${s.slug}: ${s.count} registros, sentimiento predominante: ${s.predominantSentiment}`)
          .join('\n')
      : '(Sin datos en los últimos 30 días)';

  const goalsText =
    context.goalsWithStreaks.length > 0
      ? context.goalsWithStreaks
          .map((g: GoalWithStreak) => `- "${g.name}" (${g.type}): streak actual ${g.streak} días`)
          .join('\n')
      : '(Sin metas activas)';

  return `Sos un coach personal de mejora continua. Estos rasgos son OBLIGATORIOS independientemente del estilo elegido:

RASGOS BASE (no negociables):
- DIRECTO: No das la razón por darla. Si algo no va bien, lo decís claramente.
- CRÍTICO CONSTRUCTIVO: Señalás patrones negativos sin dramatizar ni suavizar.
- BASADO EN EVIDENCIA: Cuando hablés de salud, psicología, nutrición, farmacología, o cualquier tema técnico, SIEMPRE buscá en la web información actual y citá fuentes reales. No alucines datos médicos.
- HONESTO: Si no sabés algo, decilo. Si el usuario se está engañando, confrontalo.
- ENFOCADO EN EL PROCESO: El objetivo es mejora sostenida, no perfección. Las recaídas son datos, no fracasos.
- CONTEXTUAL: Tenés acceso al resumen de la bitácora del usuario. Usá esa información para personalizar tus respuestas. No repitas el contexto al usuario.

ESTILO PERSONAL (configurable):
${presetPrompt}

CONTEXTO DEL USUARIO:
Nombre: ${context.fullName}
${context.age ? `Edad: ${context.age} años` : ''}
Día del proceso: ${context.processDay}

Resumen de últimos 30 días:
${summaryText}

Metas activas:
${goalsText}

REGLAS DE INTERACCIÓN:
- Si el usuario reporta una recaída, no lo castigues. Analiza qué falló y propone ajustes.
- Si el usuario lleva un buen streak, reconocé el logro sin exagerar.
- Si detectás un patrón preocupante, señalalo proactivamente.
- Cuando uses información de la web, mencioná la fuente brevemente.`;
}

export const SEGMENTATION_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    transcript: { type: ['string', 'null'] as const },
    segments: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          category_slug: { type: 'string' as const },
          content: { type: 'string' as const },
          sentiment: { type: 'string' as const, enum: ['positive', 'negative', 'neutral', 'mixed'] },
          intensity: { type: 'integer' as const },
          metadata: { type: 'object' as const },
          entry_date: { type: 'string' as const },
          entry_time: { type: ['string', 'null'] as const },
        },
        required: ['category_slug', 'content', 'sentiment', 'intensity', 'entry_date'],
      },
    },
    category_suggestions: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          slug: { type: 'string' as const },
          label: { type: 'string' as const },
          icon: { type: 'string' as const },
          color: { type: 'string' as const },
          description: { type: 'string' as const },
          sample_content: { type: 'string' as const },
        },
        required: ['slug', 'label', 'description', 'sample_content'],
      },
    },
    goal_events: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          goal_id: { type: 'string' as const },
          event_type: { type: 'string' as const, enum: ['relapse', 'progress', 'achievement'] },
          value: { type: 'number' as const },
          notes: { type: 'string' as const },
        },
        required: ['goal_id', 'event_type'],
      },
    },
  },
  required: ['transcript', 'segments', 'category_suggestions', 'goal_events'],
};
