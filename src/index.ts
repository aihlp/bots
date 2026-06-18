import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { Fetcher, KVNamespace } from '@cloudflare/workers-types';
import { botsRouter } from './api/bots';
import { keysRouter } from './api/keys';
import { settingsRouter } from './api/settings';
import { webhookRouter } from './api/webhook';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());
app.use('/admin', requireAuth);
app.use('/admin/*', requireAuth);
app.use('/api/bots', requireAuth);
app.use('/api/bots/*', requireAuth);
app.use('/api/keys', requireAuth);
app.use('/api/keys/*', requireAuth);
app.use('/api/settings', requireAuth);
app.use('/api/settings/*', requireAuth);

app.route('/api/bots', botsRouter);
app.route('/api/keys', keysRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/webhook', webhookRouter);

app.get('/health', healthHandler);

app.get('/', (c) => {
  return c.redirect('/admin', 302);
});

app.get('/admin', serveAdmin);
app.get('/admin/*', serveAdmin);
app.get('/assets/*', serveAsset);

app.notFound((c) => {
  return jsonResponse(c, { error: 'not_found' }, 404);
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return jsonResponse(c, { error: error.message }, error.status);
  }
  console.error('Unhandled worker error', error);
  return jsonResponse(c, { error: 'internal_error' }, 500);
});

export default app;

function requireAuth(c: any, next: () => Promise<void> | void) {
  const adminPassword = c.env.ADMIN_PASSWORD;
  const authorization = c.req.header('Authorization');

  if (!adminPassword || !authorization || !authorization.startsWith('Basic ')) {
    c.header('WWW-Authenticate', 'Basic realm="bots admin"');
    return c.json({ error: 'unauthorized' }, 401);
  }

  const encoded = authorization.slice('Basic '.length);
  const decoded = atob(encoded);
  const [, password] = decoded.split(':');

  if (password !== adminPassword) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  return next();
}

async function serveAdmin(c: any) {
  const assets = c.env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return jsonResponse(c, { error: 'Admin static assets are not configured' }, 500);
  }

  const response = await assets.fetch(c.req.raw);
  if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  return jsonResponse(c, { error: 'Admin UI asset is not available' }, 500);
}

async function serveAsset(c: any) {
  const assets = c.env.ASSETS;
  if (!assets || typeof assets.fetch !== 'function') {
    return jsonResponse(c, { error: 'Static assets are not configured' }, 500);
  }

  const response = await assets.fetch(c.req.raw);
  if (response.ok) {
    return response;
  }

  return jsonResponse(c, { error: 'asset_not_found' }, 404);
}

async function healthHandler(c: any) {
  const requiredBindings = ['BOT_REGISTRY', 'SESSION_KV', 'KEYS_KV', 'SETTINGS_KV', 'ASSETS'];
  const missing = requiredBindings.filter((name) => !c.env[name]);

  if (missing.length > 0) {
    return jsonResponse(c, { status: 'misconfigured', missing }, 500);
  }

  return jsonResponse(c, { status: 'ok' }, 200);
}

function jsonResponse<T>(c: any, body: T, status: number): Response {
  return c.json(body, status, corsHeaders());
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Telegram-Bot-Api-Secret-Token',
  };
}
