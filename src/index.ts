import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

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
  __STATIC_CONTENT: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', logger());
app.use('/api/*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API Routes
app.route('/api/bots', botsRouter);
app.route('/api/keys', keysRouter);
app.route('/api/settings', settingsRouter);

// Admin panel - serve index.html for /admin and /admin/
app.get('/admin', (c) => {
  return c.redirect('/admin/');
});

app.get('/admin/*', async (c) => {
  const path = c.req.path;
  
  // Map /admin/ to /admin/index.html for the assets directory
  const assetPath = path === '/admin/' ? '/index.html' : path.replace('/admin', '');
  
  try {
    const file = await c.env.__STATIC_CONTENT.get(assetPath, { type: 'arrayBuffer' });
    if (file) {
      const mimeType = getMimeType(assetPath);
      return c.body(file, 200, {
        'Content-Type': mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
    }
  } catch (e) {
    console.error('Error serving static file:', e);
  }
  
  return c.notFound();
});

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

// MIME type helper function
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export default app;
