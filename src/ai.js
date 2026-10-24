// BYOK AI client — bring your own key, bring your own endpoint.
// Zero dependencies: raw fetch against OpenAI-compatible chat APIs (works with
// OpenAI, Groq, OpenRouter, llama.cpp, Ollama at localhost) or Anthropic.
// Nothing is sent anywhere unless the user sets the env vars themselves.

const DEFAULTS = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
};

export function getAiConfig(env = process.env) {
  const key = env.SLOP_AI_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY || '';
  const provider = (env.SLOP_AI_PROVIDER || (env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
  const defaults = DEFAULTS[provider] || DEFAULTS.openai;
  const baseUrl = (env.SLOP_AI_BASE_URL || defaults.baseUrl).replace(/\/+$/, '');
  const model = env.SLOP_AI_MODEL || defaults.model;
  if (!key && baseUrl.includes('://127.0.0.1') || !key && baseUrl.includes('://localhost')) {
    // local endpoints (Ollama, llama.cpp) usually need no key
    return { key: 'local', provider, baseUrl, model, local: true };
  }
  if (!key) return null;
  return { key, provider, baseUrl, model, local: false };
}

export async function aiChat(config, system, user, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let body;
    let headers = { 'content-type': 'application/json' };
    let url;
    if (config.provider === 'anthropic') {
      url = `${config.baseUrl}/messages`;
      headers['x-api-key'] = config.key;
      headers['anthropic-version'] = '2023-06-01';
      body = {
        model: config.model,
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: user }],
      };
    } else {
      url = `${config.baseUrl}/chat/completions`;
      headers['authorization'] = `Bearer ${config.key}`;
      body = {
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
      };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI provider HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = config.provider === 'anthropic'
      ? (data.content?.[0]?.text ?? '')
      : (data.choices?.[0]?.message?.content ?? '');
    if (!text) throw new Error('AI provider returned an empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}
