import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { keysRouter } from './api/keys';
import { webhookHandler } from './api/webhook';
import { settingsRouter } from './api/settings';
import { botsRouter } from './api/bots';
import type { BotConfig, Context } from './types';

const app = new Hono<{
  Bindings: {
    BOT_REGISTRY: KVNamespace;
    SESSION_KV: KVNamespace;
    KEYS_KV: KVNamespace;
    SETTINGS_KV: KVNamespace;
    Assets: KVNamespace;
    ENVIRONMENT: string;
    ADMIN_PASSWORD?: string;
  };
}>();

// CORS middleware for admin UI
app.use('/*', cors());

// Simple password protection middleware
const requireAuth = async (c: any, next: any) => {
  const adminPassword = c.env.ADMIN_PASSWORD;
  
  // If no password is set, allow access
  if (!adminPassword) {
    return await next();
  }
  
  // Check for session cookie
  const sessionCookie = c.req.header('Cookie');
  if (sessionCookie && sessionCookie.includes('admin_auth=true')) {
    return await next();
  }
  
  // Check Authorization header for basic auth
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = atob(authHeader.slice(6));
      const [, password] = credentials.split(':');
      if (password === adminPassword) {
        return await next();
      }
    } catch (e) {
      // Invalid auth header
    }
  }
  
  // Return 401 with WWW-Authenticate header to trigger browser login
  c.header('WWW-Authenticate', 'Basic realm="Admin Area"');
  return c.text('Unauthorized', 401);
};

// Helper function placeholder (can be removed if unused)
const getAssetContent = (_path: string): { content: string; contentType: string } | null => {
  return null;
};

// Admin UI routes with password protection



app.get('/admin', requireAuth, async (c) => {
  const indexFile = await c.env.Assets?.get('index.html');
  if (indexFile) {
    return c.html(indexFile as string);
  }
  return c.text('Admin UI not found', 404);
});

app.get('/admin/*', requireAuth, async (c) => {
  const indexFile = await c.env.Assets?.get('index.html');
  if (indexFile) {
    return c.html(indexFile as string);
  }
  return c.text('Admin UI not found', 404);
});


// Serve built admin assets from /assets/* path using KV binding
// IMPORTANT: After deploying, upload the built assets to the Assets KV namespace:
// 1. Build the admin UI: npm run build:admin
// 2. Upload assets to KV: wrangler kv key put --binding=Assets "assets/index-D6ow2Um0.js" --path="./dist/admin/assets/index-D6ow2Um0.js"
//    wrangler kv key put --binding=Assets "assets/index-BndC19cd.css" --path="./dist/admin/assets/index-BndC19cd.css"
app.get('/assets/*', async (c) => {
  const path = c.req.path.replace('/assets/', '');
  // Read from the Assets KV binding
  try {
    // Try both with and without 'assets/' prefix since upload method may vary
    let fileContent = await c.env.Assets?.get(`assets/${path}`);
    if (!fileContent) {
      fileContent = await c.env.Assets?.get(path);
    }
    if (fileContent) {
      const contentType = path.endsWith('.css') ? 'text/css' : 
                         path.endsWith('.js') ? 'application/javascript' : 
                         'application/octet-stream';
      return c.body(fileContent, 200, { 'Content-Type': contentType });
    }
  } catch (e) {
    console.error('Error serving asset:', e);
  }
  return c.text('Asset not found', 404);
});

// Root route redirects to admin
app.get('/', (c) => {
  return c.redirect('/admin');
});

// API routes with password protection
app.route('/api/keys', keysRouter);
app.post('/api/webhook/:bot_username', webhookHandler);
app.route('/api/settings', settingsRouter);
app.route('/api/bots', botsRouter);

// Health check with binding diagnostics
app.get('/health', (c) => {
  const required = ['BOT_REGISTRY', 'SESSION_KV', 'KEYS_KV', 'SETTINGS_KV', 'Assets'];
  const missing: string[] = [];
  for (const key of required) {
    if (!(key in c.env) || (c.env as any)[key] === undefined) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    return c.json({ status: 'misconfigured', missing }, 500);
  }
  return c.json({ status: 'ok' });
});
  // 
export default app;
