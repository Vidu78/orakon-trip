import type { IntentAction, IntentResult } from '../../../agents/src/types';

const SYSTEM = `You classify a driver's natural-language request during a road trip into exactly ONE action:
- "route":   change destination, reroute, navigate, avoid traffic, take a detour.
- "pause":   pause/stop/rest/take a break from the trip.
- "charger": find a charging station, charge the car, low battery, find a plug/EV charger.
Always call the classify_intent tool. Keep "reason" to one short sentence.`;

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

/**
 * Classify a free-text driver request into a trip action.
 *
 * Uses Claude (Haiku — fast + cheap, ideal for classification) via forced
 * tool-use for guaranteed-shaped JSON output. Falls back to a deterministic
 * keyword classifier when no ANTHROPIC_API_KEY is configured, so the endpoint
 * (and the test suite) runs with zero external dependencies.
 */
export async function classifyIntent(text: string): Promise<IntentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return keywordClassify(text);

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.INTENT_MODEL ?? 'claude-haiku-4-5',
      max_tokens: 256,
      system: SYSTEM,
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
    return keywordClassify(text);
  } catch {
    // Network error, bad key, refusal, etc. — degrade gracefully.
    return keywordClassify(text);
  }
}

/** Deterministic fallback. Order matters: charger > pause > route. */
export function keywordClassify(text: string): IntentResult {
  const t = text.toLowerCase();

  if (/(charg|battery|low power|plug|ev station|recharge|supercharger)/.test(t)) {
    return { action: 'charger', reason: 'Mentions charging or low battery.', source: 'fallback' };
  }
  if (/(pause|stop|rest|break|tired|sleep|halt)/.test(t)) {
    return { action: 'pause', reason: 'Asks to pause or take a break.', source: 'fallback' };
  }
  return {
    action: 'route',
    reason: 'Defaulting to a routing/navigation change.',
    source: 'fallback',
  };
}
