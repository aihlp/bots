import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { keysRouter } from './api/keys';
import { webhookRouter } from './api/webhook';
import { settingsRouter } from './api/settings';
import { botsRouter } from './api/bots';
import type { BotConfig, Context } from './types';

const app = new Hono<{
  Bindings: {
    BOT_REGISTRY: KVNamespace;
    SESSION_KV: KVNamespace;
    KEYS_KV: KVNamespace;
    SETTINGS_KV: KVNamespace;
    ENVIRONMENT: string;
  };
}>();

// CORS middleware for admin UI
app.use('/*', cors());

// Static assets for admin UI (served from __STATIC_CONTENT binding)
declare const __STATIC_CONTENT: KVNamespace;

app.get('/', async (c) => {
  const value = await __STATIC_CONTENT.get('index.html');
  if (value) {
    return c.html(value);
  }
  return c.text('Admin UI not found', 404);
});

app.get('/assets/*', async (c) => {
  const path = c.req.path.replace('/assets/', '');
  const value = await __STATIC_CONTENT.get(`assets/${path}`);
  if (value) {
    const contentType = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
    return c.body(value, 200, { 'Content-Type': contentType });
  }
  return c.text('Asset not found', 404);
});

// API routes
app.route('/api/keys', keysRouter);
app.route('/api/webhook', webhookRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/bots', botsRouter);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;