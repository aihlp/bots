import { Hono } from 'hono';
import type { Context, GlobalSettings } from '../types';
import { getGlobalSettings, sanitizeSettings, saveGlobalSettings } from '../types';

export const settingsRouter = new Hono<{ Bindings: Context['env'] }>();

// GET /api/settings - Get global settings
settingsRouter.get('/', async (c) => {
  try {
    const settings = await getGlobalSettings(c as unknown as Context);

    if (!settings) {
      // Return defaults if not set
      return c.json({
        default_max_history: 20,
        default_session_ttl: 3600,
        fallback_openrouter_key_set: false,
      });
    }

    return c.json(sanitizeSettings(settings));
  } catch (error) {
    console.error('Error getting settings:', error);
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

// PUT /api/settings - Update global settings
settingsRouter.put('/', async (c) => {
  try {
    const body = await c.req.json<Partial<GlobalSettings>>();

    const existing = await getGlobalSettings(c as unknown as Context);
    const updated: GlobalSettings = {
      default_max_history: body.default_max_history ?? existing?.default_max_history ?? 20,
      default_session_ttl: body.default_session_ttl ?? existing?.default_session_ttl ?? 3600,
      fallback_openrouter_key: body.fallback_openrouter_key || existing?.fallback_openrouter_key,
    };

    await saveGlobalSettings(c as unknown as Context, updated);
    return c.json(sanitizeSettings(updated));
  } catch (error) {
    console.error('Error updating settings:', error);
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});
