// Groq settings for the agent. The key comes from .env or the host's environment (see keys.js).

import { getKey } from './keys.js';

export const groqKey = () => getKey('groq');
export const hasGroqKey = () => Boolean(groqKey());
export const agentModel = () => process.env.GROQ_AGENT_MODEL || 'openai/gpt-oss-120b';
