import { Hono } from 'hono';
import type { ApiKey, Context } from '../types';
import { deleteApiKey, listApiKeys, saveApiKey, sanitizeApiKey } from '../types';

export const keysRouter = new Hono<{ Bindings: Context['env'] }>();

// GET /api/keys - List all API keys (masked)
keysRouter.get('/', async (c) => {
  try {
    const keys = await listApiKeys(c as unknown as Context);
    return c.json(keys);
  } catch (error) {
    console.error('Error listing keys:', error);
    return c.json({ error: 'Failed to list keys' }, 500);
  }
});

// POST /api/keys - Create new API key
keysRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<{ name: string; key: string }>();

    if (!body.name || !body.key) {
      return c.json({ error: 'name and key are required' }, 400);
    }

    const id = crypto.randomUUID();
    const apiKey: ApiKey = {
      id,
      name: body.name,
      key: body.key,
      created_at: new Date().toISOString(),
    };

    await saveApiKey(c as unknown as Context, apiKey);
    return c.json(sanitizeApiKey(apiKey), 201);
  } catch (error) {
    console.error('Error creating key:', error);
    return c.json({ error: 'Failed to create key' }, 500);
  }
});

// DELETE /api/keys/:id - Delete API key
keysRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteApiKey(c as unknown as Context, id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting key:', error);
    return c.json({ error: 'Failed to delete key' }, 500);
  }
});
