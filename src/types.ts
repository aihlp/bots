export interface BotConfig {
  username: string;
  telegram_token: string;
  openrouter_key_id: string;
  is_active: boolean;
  model: string;
  system_prompt: string;
  default_language: string;
  welcome_messages: { lang: string; text: string }[];
  max_history: number;
  session_ttl: number;
  group_mode: 'all' | 'mention_only' | 'admin_only';
  mention_trigger: string;
  reply_to_mentions: boolean;
  commands: { command: string; description: string }[];
  inline_keyboard_template?: Record<string, unknown>;
  web_app_url?: string;
  payments?: {
    enabled: boolean;
    prices: { label: string; amount: number }[];
  };
  model_params: {
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  streaming: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string; // stored encrypted or plain in KV
  created_at: string;
}

export interface GlobalSettings {
  default_max_history: number;
  default_session_ttl: number;
  fallback_openrouter_key?: string;
}

export type Context = import('hono').Context<{
  Bindings: {
    BOT_REGISTRY: KVNamespace;
    SESSION_KV: KVNamespace;
    KEYS_KV: KVNamespace;
    SETTINGS_KV: KVNamespace;
    ENVIRONMENT: string;
  };
}>;

const BOT_PREFIX = 'bot:';
const KEY_PREFIX = 'key:';

export async function getBotConfig(c: Context, username: string): Promise<BotConfig | null> {
  const data = await c.env.BOT_REGISTRY.get(`${BOT_PREFIX}${username}`);
  return data ? JSON.parse(data) : null;
}

export async function saveBotConfig(c: Context, config: BotConfig): Promise<void> {
  await c.env.BOT_REGISTRY.put(`${BOT_PREFIX}${config.username}`, JSON.stringify(config));
}

export async function listBots(c: Context): Promise<BotConfig[]> {
  const keys = await c.env.BOT_REGISTRY.list({ prefix: BOT_PREFIX });
  const bots: BotConfig[] = [];
  for (const key of keys.keys) {
    const data = await c.env.BOT_REGISTRY.get(key.name);
    if (data) bots.push(JSON.parse(data));
  }
  return bots;
}

export async function deleteBot(c: Context, username: string): Promise<void> {
  await c.env.BOT_REGISTRY.delete(`${BOT_PREFIX}${username}`);
}

export async function getApiKey(c: Context, keyId: string): Promise<ApiKey | null> {
  const data = await c.env.KEYS_KV.get(`${KEY_PREFIX}${keyId}`);
  return data ? JSON.parse(data) : null;
}

export async function saveApiKey(c: Context, key: ApiKey): Promise<void> {
  await c.env.KEYS_KV.put(`${KEY_PREFIX}${key.id}`, JSON.stringify(key));
}

export async function listApiKeys(c: Context): Promise<Omit<ApiKey, 'key'>[]> {
  const keys = await c.env.KEYS_KV.list({ prefix: KEY_PREFIX });
  const apiKeys: Omit<ApiKey, 'key'>[] = [];
  for (const key of keys.keys) {
    const data = await c.env.KEYS_KV.get(key.name);
    if (data) {
      const parsed: ApiKey = JSON.parse(data);
      apiKeys.push({ ...parsed, key: '***' }); // mask key
    }
  }
  return apiKeys;
}

export async function deleteApiKey(c: Context, id: string): Promise<void> {
  await c.env.KEYS_KV.delete(`${KEY_PREFIX}${id}`);
}

export async function getGlobalSettings(c: Context): Promise<GlobalSettings | null> {
  const data = await c.env.SETTINGS_KV.get('global');
  return data ? JSON.parse(data) : null;
}

export async function saveGlobalSettings(c: Context, settings: GlobalSettings): Promise<void> {
  await c.env.SETTINGS_KV.put('global', JSON.stringify(settings));
}
