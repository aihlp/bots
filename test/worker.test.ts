import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import app from '../src/index';
import { escapeMarkdownV2 } from '../src/api/webhook';

function createKV(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      data.set(key, String(value));
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...data.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((name) => ({ name })),
      };
    },
  };
}

function htmlAsset() {
  return '<!doctype html><html><head><title>Admin</title></head><body><div id="root"></div></body></html>';
}

function staticAssets() {
  return {
    fetch: vi.fn(async (request) => {
      const url = new URL(request.url);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        return new Response(htmlAsset(), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')) {
        return new Response('console.log("admin");', {
          status: 200,
          headers: { 'content-type': 'application/javascript' },
        });
      }
      if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.css')) {
        return new Response('body{}', {
          status: 200,
          headers: { 'content-type': 'text/css' },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  };
}

function envWith(overrides = {}) {
  const Assets = createKV({
    'index.html': htmlAsset(),
    'assets/index.js': 'console.log("kv");',
    'assets/index.css': 'body{}',
  });
  return {
    BOT_REGISTRY: createKV(),
    SESSION_KV: createKV(),
    KEYS_KV: createKV(),
    SETTINGS_KV: createKV(),
    Assets,
    ASSETS: staticAssets(),
    ENVIRONMENT: 'production',
    ADMIN_PASSWORD: 'correct-password',
    ...overrides,
  };
}

function basicAuth(password = 'correct-password') {
  return `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
}

function botRecord(overrides = {}) {
  return {
    username: 'demo_bot',
    telegram_token: '123456:secret-token-value',
    openrouter_key_id: 'key-1',
    is_active: true,
    model: 'openai/gpt-3.5-turbo',
    system_prompt: 'You are helpful.',
    default_language: 'en',
    welcome_messages: [],
    max_history: 20,
    session_ttl: 3600,
    group_mode: 'all',
    mention_trigger: '',
    reply_to_mentions: true,
    commands: [],
    model_params: {
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    },
    streaming: true,
    ...overrides,
  };
}

function jsonBody(response) {
  return response.json();
}

describe('worker deployment defects', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('serves the admin SPA and generated assets from static assets', async () => {
    const env = envWith();
    const headers = { Authorization: basicAuth() };
    const admin = await app.fetch(new Request('http://localhost/admin', { headers }), env);
    const route = await app.fetch(new Request('http://localhost/admin/settings', { headers }), env);
    const js = await app.fetch(new Request('http://localhost/assets/index-abc123.js'), env);
    const css = await app.fetch(new Request('http://localhost/assets/index-def456.css'), env);

    expect(admin.status).toBe(200);
    expect(admin.headers.get('content-type')).toContain('text/html');
    expect(await admin.text()).toContain('<div id="root"></div>');
    expect(route.status).toBe(200);
    expect(route.headers.get('content-type')).toContain('text/html');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('application/javascript');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
  });

  it('returns a controlled error when the admin static asset binding has no index.html', async () => {
    const env = envWith({ ASSETS: { fetch: vi.fn(async () => new Response('', { status: 404 })) } });
    const response = await app.fetch(new Request('http://localhost/admin', { headers: { Authorization: basicAuth() } }), env);

    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('Admin');
  });

  it('reports every missing required binding in /health', async () => {
    const env = envWith();
    const all = await app.fetch(new Request('http://localhost/health'), env);
    expect(all.status).toBe(200);
    expect(await all.json()).toEqual({ status: 'ok' });

    const missingBot = envWith({ BOT_REGISTRY: undefined });
    const botResponse = await app.fetch(new Request('http://localhost/health'), missingBot);
    expect(botResponse.status).toBe(500);
    expect(await botResponse.json()).toEqual({ status: 'misconfigured', missing: ['BOT_REGISTRY'] });

    const missingAssets = envWith({ ASSETS: undefined });
    const assetsResponse = await app.fetch(new Request('http://localhost/health'), missingAssets);
    expect(assetsResponse.status).toBe(500);
    expect(await assetsResponse.json()).toEqual({ status: 'misconfigured', missing: ['ASSETS'] });

    const legacyAssetsOnlyMissing = envWith({ Assets: undefined });
    const legacyAssetsOnlyMissingResponse = await app.fetch(new Request('http://localhost/health'), legacyAssetsOnlyMissing);
    expect(legacyAssetsOnlyMissingResponse.status).toBe(200);
    expect(await legacyAssetsOnlyMissingResponse.json()).toEqual({ status: 'ok' });

    const missingMultiple = envWith({ BOT_REGISTRY: undefined, SESSION_KV: undefined, ASSETS: undefined });
    const multipleResponse = await app.fetch(new Request('http://localhost/health'), missingMultiple);
    expect(multipleResponse.status).toBe(500);
    expect(await multipleResponse.json()).toEqual({
      status: 'misconfigured',
      missing: ['BOT_REGISTRY', 'SESSION_KV', 'ASSETS'],
    });
  });

  it('redirects the root path to /admin', async () => {
    const response = await app.fetch(new Request('http://localhost/'), envWith());

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/admin');
  });

  it('protects sensitive admin and API routes without admin authentication', async () => {
    const env = envWith({ ADMIN_PASSWORD: undefined });
    const routes = [
      ['GET', 'http://localhost/admin'],
      ['GET', 'http://localhost/admin/settings'],
      ['GET', 'http://localhost/api/bots'],
      ['POST', 'http://localhost/api/bots'],
      ['GET', 'http://localhost/api/keys'],
      ['GET', 'http://localhost/api/settings'],
    ];

    for (const [method, url] of routes) {
      const response = await app.fetch(new Request(url, { method }), env);
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('allows authenticated admin API calls and masks bot tokens', async () => {
    const bots = createKV({ 'bot:demo_bot': JSON.stringify(botRecord()) });
    const env = envWith({ BOT_REGISTRY: bots, ADMIN_PASSWORD: 'correct-password' });
    const list = await app.fetch(
      new Request('http://localhost/api/bots', { headers: { Authorization: basicAuth() } }),
      env,
    );
    const listJson = await jsonBody(list);

    expect(list.status).toBe(200);
    expect(JSON.stringify(listJson)).not.toContain('secret-token-value');
    expect(listJson[0].telegram_token_set).toBe(true);

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ id: 'new-bot' }), { status: 201 }));
    const created = await app.fetch(
      new Request('http://localhost/api/bots', {
        method: 'POST',
        headers: {
          Authorization: basicAuth(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ username: 'new_bot', telegram_token: '987654:new-secret-token' }),
      }),
      env,
    );
    const createdJson = await jsonBody(created);

    expect(created.status).toBe(201);
    expect(JSON.stringify(createdJson)).not.toContain('new-secret-token');
    expect(createdJson.telegram_token_set).toBe(true);
  });

  it('masks API keys and settings secrets', async () => {
    const keys = createKV({ 'key:key-1': JSON.stringify({ id: 'key-1', name: 'primary', key: 'sk-or-secret' }) });
    const settings = createKV({ global: JSON.stringify({ default_max_history: 30, default_session_ttl: 7200, fallback_openrouter_key: 'sk-or-secret' }) });
    const env = envWith({ KEYS_KV: keys, SETTINGS_KV: settings });

    const keysResponse = await app.fetch(
      new Request('http://localhost/api/keys', { headers: { Authorization: basicAuth() } }),
      env,
    );
    const keysJson = await jsonBody(keysResponse);
    expect(keysResponse.status).toBe(200);
    expect(JSON.stringify(keysJson)).not.toContain('sk-or-secret');

    const settingsResponse = await app.fetch(
      new Request('http://localhost/api/settings', { headers: { Authorization: basicAuth() } }),
      env,
    );
    const settingsJson = await jsonBody(settingsResponse);
    expect(settingsResponse.status).toBe(200);
    expect(JSON.stringify(settingsJson)).not.toContain('sk-or-secret');
    expect(settingsJson.fallback_openrouter_key_set).toBe(true);
  });

  it('always returns controlled webhook responses for invalid input and skipped branches', async () => {
    const env = envWith();

    const missingUsername = await app.fetch(new Request('http://localhost/api/webhook', { method: 'POST' }), env);
    expect(missingUsername.status).toBe(400);

    const notFound = await app.fetch(
      new Request('http://localhost/api/webhook/missing_bot', {
        method: 'POST',
        body: JSON.stringify({ update_id: 1 }),
      }),
      env,
    );
    expect(notFound.status).toBe(200);
    expect((await jsonBody(notFound)).ok).toBe(true);

    const inactive = envWith({ BOT_REGISTRY: createKV({ 'bot:inactive_bot': JSON.stringify(botRecord({ username: 'inactive_bot', is_active: false })) }) });
    const inactiveResponse = await app.fetch(
      new Request('http://localhost/api/webhook/inactive_bot', {
        method: 'POST',
        body: JSON.stringify({ update_id: 1 }),
      }),
      inactive,
    );
    expect(inactiveResponse.status).toBe(200);
    expect((await jsonBody(inactiveResponse)).ok).toBe(true);

    const secretBot = envWith({ BOT_REGISTRY: createKV({ 'bot:secret_bot': JSON.stringify(botRecord({ username: 'secret_bot', webhook_secret: 'telegram-secret' })) }) });
    const invalidSecret = await app.fetch(
      new Request('http://localhost/api/webhook/secret_bot', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 'wrong-secret' },
        body: JSON.stringify({ update_id: 1 }),
      }),
      secretBot,
    );
    expect(invalidSecret.status).toBeGreaterThanOrEqual(400);

    const noMessage = envWith({ BOT_REGISTRY: createKV({ 'bot:no_message_bot': JSON.stringify(botRecord({ username: 'no_message_bot' })) }) });
    const noMessageResponse = await app.fetch(
      new Request('http://localhost/api/webhook/no_message_bot', {
        method: 'POST',
        body: JSON.stringify({ update_id: 1 }),
      }),
      noMessage,
    );
    expect(noMessageResponse.status).toBe(200);
    expect((await jsonBody(noMessageResponse)).ok).toBe(true);
  });

  it('processes successful Telegram webhook updates and preserves streaming assistant history', async () => {
    const bots = createKV({ 'bot:stream_bot': JSON.stringify(botRecord({ username: 'stream_bot' })) });
    const sessions = createKV();
    const keys = createKV({ 'key:key-1': JSON.stringify({ id: 'key-1', name: 'primary', key: 'sk-or-secret' }) });
    const env = envWith({ BOT_REGISTRY: bots, SESSION_KV: sessions, KEYS_KV: keys });

    globalThis.fetch = vi.fn(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      if (new URL(url).hostname === 'openrouter.ai') {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"lo"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ result: { message_id: 10 } }), { status: 200 });
    });

    const response = await app.fetch(
      new Request('http://localhost/api/webhook/stream_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: { message_id: 1, from: { id: 7, first_name: 'User' }, chat: { id: 123, type: 'private' }, text: 'hello' },
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await jsonBody(response)).toEqual({ ok: true });
    const session = JSON.parse(sessions.data.get('session:stream_bot:123'));
    expect(session).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  it('returns controlled errors for missing and failed OpenRouter keys', async () => {
    const missingKeyBot = createKV({ 'bot:missing_key_bot': JSON.stringify(botRecord({ username: 'missing_key_bot' })) });
    const missingKeyEnv = envWith({ BOT_REGISTRY: missingKeyBot });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'missing key' }), { status: 401 }));

    const missingKeyResponse = await app.fetch(
      new Request('http://localhost/api/webhook/missing_key_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: { message_id: 1, from: { id: 7, first_name: 'User' }, chat: { id: 123, type: 'private' }, text: 'hello' },
        }),
      }),
      missingKeyEnv,
    );

    expect(missingKeyResponse.status).toBe(502);
    expect(await jsonBody(missingKeyResponse)).toEqual({ ok: false, error: 'missing_openrouter_key' });

    const failureBot = createKV({
      'bot:openrouter_failure_bot': JSON.stringify(
        botRecord({ username: 'openrouter_failure_bot', openrouter_key_id: 'key-1' }),
      ),
    });
    const keys = createKV({ 'key:key-1': JSON.stringify({ id: 'key-1', name: 'primary', key: 'sk-or-secret' }) });
    const failureEnv = envWith({ BOT_REGISTRY: failureBot, KEYS_KV: keys });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'upstream failure' }), { status: 500 }));

    const failureResponse = await app.fetch(
      new Request('http://localhost/api/webhook/openrouter_failure_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: { message_id: 1, from: { id: 7, first_name: 'User' }, chat: { id: 123, type: 'private' }, text: 'hello' },
        }),
      }),
      failureEnv,
    );

    expect(failureResponse.status).toBe(502);
    expect(await jsonBody(failureResponse)).toEqual({ ok: false, error: 'openrouter_error' });
  });

  it('honors group admin_only mode without disabling private chats', async () => {
    const processedCalls = vi.fn(async (request) => {
      const url = typeof request === 'string' ? request : request.url;
      if (new URL(url).hostname === 'openrouter.ai') {
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: { message_id: 1 } }), { status: 200 });
    });

    const adminBot = createKV({
      'bot:group_bot': JSON.stringify(
        botRecord({ username: 'group_bot', group_mode: 'admin_only', admin_user_ids: [42], streaming: false }),
      ),
    });
    const env = envWith({ BOT_REGISTRY: adminBot, KEYS_KV: createKV({ 'key:key-1': JSON.stringify({ id: 'key-1', name: 'primary', key: 'sk-or-secret' }) }) });
    globalThis.fetch = processedCalls;

    const adminResponse = await app.fetch(
      new Request('http://localhost/api/webhook/group_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 1,
          message: { message_id: 1, from: { id: 42, first_name: 'Admin' }, chat: { id: 99, type: 'supergroup' }, text: 'hello' },
        }),
      }),
      env,
    );
    expect(adminResponse.status).toBe(200);
    expect(await jsonBody(adminResponse)).toEqual({ ok: true });
    expect(processedCalls).toHaveBeenCalled();

    processedCalls.mockClear();
    const skippedResponse = await app.fetch(
      new Request('http://localhost/api/webhook/group_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 2,
          message: { message_id: 2, from: { id: 7, first_name: 'Member' }, chat: { id: 99, type: 'supergroup' }, text: 'hello' },
        }),
      }),
      env,
    );
    expect(skippedResponse.status).toBe(200);
    expect(await jsonBody(skippedResponse)).toEqual({ ok: true, skipped: expect.any(String) });
    expect(processedCalls).not.toHaveBeenCalled();

    globalThis.fetch = processedCalls;
    const privateResponse = await app.fetch(
      new Request('http://localhost/api/webhook/group_bot', {
        method: 'POST',
        body: JSON.stringify({
          update_id: 3,
          message: { message_id: 3, from: { id: 7, first_name: 'Member' }, chat: { id: 77, type: 'private' }, text: 'hello' },
        }),
      }),
      env,
    );
    expect(privateResponse.status).toBe(200);
    expect(await jsonBody(privateResponse)).toEqual({ ok: true });
  });

  it('escapes Telegram MarkdownV2 without double-escaping helper output', () => {
    const special = '_ * [ ] ( ) ~ ` > # + - = | { } . !';
    expect(escapeMarkdownV2(special)).toBe('\\_ \\* \\[ \\] \\( \\) \\~ \\` \\> \\# \\+ \\- \\= \\| \\{ \\} \\. \\!');
    expect(escapeMarkdownV2('already \\*bold\\*')).toBe('already \\*bold\\*');
  });

  it('keeps deploy.sh on static-assets deployment without hardcoded asset hashes', () => {
    const deployScript = readFileSync('./deploy.sh', 'utf8');

    expect(deployScript).not.toContain('wrangler kv key put');
    expect(deployScript).not.toMatch(/index-[A-Za-z0-9_-]+\.(js|css)/);
    expect(deployScript).toContain('npm ci');
    expect(deployScript).toContain('npm run build:admin');
    expect(deployScript).toContain('npm run typecheck');
    expect(deployScript).toContain('npm test');
    expect(deployScript).toContain('npx wrangler deploy');
    expect(deployScript).toContain('/storage/kv/namespaces');
    expect(deployScript).toContain('--config wrangler.generated.toml');
  });

  it('keeps KV namespace IDs out of committed Wrangler config', () => {
    const wranglerConfig = readFileSync('./wrangler.toml', 'utf8');
    const deployScript = readFileSync('./deploy.sh', 'utf8');
    const workflow = readFileSync('./.github/workflows/deploy.yml', 'utf8');

    expect(wranglerConfig).not.toContain('kv_namespaces');
    expect(workflow).toContain('run: ./deploy.sh');
    expect(workflow).not.toMatch(/(?:BOT_REGISTRY_ID|SESSION_KV_ID|KEYS_KV_ID|SETTINGS_KV_ID):/);

    for (const binding of ['BOT_REGISTRY', 'SESSION_KV', 'KEYS_KV', 'SETTINGS_KV']) {
      expect(deployScript).toContain(`['${binding}', process.env.${binding}_ID]`);
    }

    expect(wranglerConfig).not.toMatch(/id = "[a-f0-9]{32}"/i);
    expect(deployScript).not.toMatch(/id = "[a-f0-9]{32}"/i);
    expect(workflow).not.toMatch(/CLOUDFLARE_ACCOUNT_ID:\s*[a-f0-9]{32}/i);
  });
});
