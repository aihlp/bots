import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { serveStatic } from 'hono/cloudflare-workers';

import { webhookHandler } from './api/webhook';
import { botsRouter } from './api/bots';
import { keysRouter } from './api/keys';
import { settingsRouter } from './api/settings';

export type Bindings = {
  BOT_REGISTRY: KVNamespace;
  SESSION_KV: KVNamespace;
  KEYS_KV: KVNamespace;
  SETTINGS_KV: KVNamespace;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('/api/*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Serve static assets for admin panel
app.use('/admin/*', serveStatic({ root: './dist/admin' }));
app.get('/admin', (c) => c.redirect('/admin/'));

// API Routes
app.route('/api/bots', botsRouter);
app.route('/api/keys', keysRouter);
app.route('/api/settings', settingsRouter);

// Webhook handler - must always return 200
app.post('/webhook/:bot_username', async (c) => {
  try {
    await webhookHandler(c);
    return c.text('', 200);
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to Telegram even on error
    return c.text('', 200);
  }
});

// Catch-all for undefined routes
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
