// Groq settings for the agent. The key comes from .env or the app's API keys box (see keys.js).

import { getKey } from './keys.js';

export const groqKey = () => getKey('groq');
export const hasGroqKey = () => Boolean(groqKey());
export const agentModel = () => process.env.GROQ_AGENT_MODEL || 'openai/gpt-oss-120b';

// Checks a pasted key by listing the models: free, uses no tokens.
export async function checkGroqKey(apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Groq rejected this key.');
  if (!res.ok) throw new Error(`Groq could not check the key (HTTP ${res.status}).`);
}
