import type { IntentAction, IntentResult } from '../../../agents/src/types';

const SYSTEM_BASE = `You classify a driver's natural-language request during a road trip into exactly ONE action:
- "route":   change destination, reroute, navigate, avoid traffic, take a detour.
- "pause":   pause/stop/rest/take a break from the trip.
- "charger": find a charging station, charge the car, low battery, find a plug/EV charger.
Keep "reason" to one short sentence. The request may be in any language.`;

const SYSTEM_TOOL = `${SYSTEM_BASE}\nAlways call the classify_intent tool.`;

const SYSTEM_JSON = `${SYSTEM_BASE}
Respond ONLY with a JSON object of this exact shape:
{"action":"route|pause|charger","reason":"short reason","target":"optional place or charger"}`;

const TOOL = {
  name: 'classify_intent',
  description: 'Classify the driver request into a single trip action.',
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['route', 'pause', 'charger'] },
      reason: { type: 'string', description: 'Short justification (one sentence).' },
      target: {
        type: 'string',
        description: 'Optional resolved place, charger, or new destination.',
      },
    },
    required: ['action', 'reason'],
    additionalProperties: false,
  },
} as const;

const ACTIONS: IntentAction[] = ['route', 'pause', 'charger'];

let warnedNoProvider = false;

/**
 * Classify a free-text driver request into a trip action.
 *
 * Provider priority: Groq (free, OpenAI-compatible) → Anthropic (Claude) →
 * deterministic keyword fallback. The endpoint (and the test suite) runs with
 * zero external dependencies when no provider key is configured.
 */
export async function classifyIntent(text: string): Promise<IntentResult> {
  if (process.env.GROQ_API_KEY) {
    const result = await classifyOpenAICompat(text, {
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      label: 'groq',
    });
    if (result) return result;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const result = await classifyWithAnthropic(text, process.env.ANTHROPIC_API_KEY);
    if (result) return result;
  }

  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY && !warnedNoProvider) {
    console.warn('[intent] nessun provider LLM configurato (GROQ_API_KEY/ANTHROPIC_API_KEY) → uso il fallback');
    warnedNoProvider = true;
  }
  return keywordClassify(text);
}

/** Groq / any OpenAI-compatible chat-completions endpoint with JSON output. */
async function classifyOpenAICompat(
  text: string,
  opts: { baseURL: string; apiKey: string; model: string; label: string },
): Promise<IntentResult | null> {
  try {
    const res = await fetch(`${opts.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        max_tokens: 256,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_JSON },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[intent] ${opts.label} HTTP ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Partial<IntentResult>;
    if (parsed.action && ACTIONS.includes(parsed.action)) {
      return {
        action: parsed.action,
        reason: parsed.reason ?? '',
        target: parsed.target,
        source: 'llm',
      };
    }
    return null;
  } catch (err) {
    console.error(`[intent] ${opts.label} fallita → fallback:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Anthropic Claude via forced tool-use for guaranteed-shaped JSON output. */
async function classifyWithAnthropic(text: string, apiKey: string): Promise<IntentResult | null> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.INTENT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_TOOL,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'classify_intent' },
      messages: [{ role: 'user', content: text }],
    });
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (toolUse && toolUse.type === 'tool_use') {
      const input = toolUse.input as Partial<IntentResult>;
      if (input.action && ACTIONS.includes(input.action)) {
        return {
          action: input.action,
          reason: input.reason ?? '',
          target: input.target,
          source: 'llm',
        };
      }
    }
    return null;
  } catch (err) {
    console.error('[intent] anthropic fallita → fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Deterministic fallback. Order matters: charger > pause > route. */
export function keywordClassify(text: string): IntentResult {
  const t = text.toLowerCase();

  if (/(charg|battery|low power|plug|ev station|recharge|supercharger|ricaric|colonnin|batteria)/.test(t)) {
    return { action: 'charger', reason: 'Mentions charging or low battery.', source: 'fallback' };
  }
  if (/(pause|stop|rest|break|tired|sleep|halt|pausa|ferma|riposo|sosta)/.test(t)) {
    return { action: 'pause', reason: 'Asks to pause or take a break.', source: 'fallback' };
  }
  return {
    action: 'route',
    reason: 'Defaulting to a routing/navigation change.',
    source: 'fallback',
  };
}
