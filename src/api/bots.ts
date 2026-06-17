import { Hono } from 'hono';
import type { Context, BotConfig } from '../types';
import { listBots, getBotConfig, saveBotConfig, deleteBot } from '../types';

export const botsRouter = new Hono<{ Bindings: Context['env'] }>();

// GET /api/bots - List all bots
botsRouter.get('/', async (c) => {
  try {
    const bots = await listBots(c as unknown as Context);
    return c.json(bots);
  } catch (error) {
    console.error('Error listing bots:', error);
    return c.json({ error: 'Failed to list bots' }, 500);
  }
});

// POST /api/bots - Create new bot
botsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<Partial<BotConfig>>();
    
    if (!body.username || !body.telegram_token) {
      return c.json({ error: 'username and telegram_token are required' }, 400);
    }

    // Check if bot already exists
    const existing = await getBotConfig(c as unknown as Context, body.username);
    if (existing) {
      return c.json({ error: 'Bot already exists' }, 409);
    }

    const config: BotConfig = {
      username: body.username,
      telegram_token: body.telegram_token,
      openrouter_key_id: body.openrouter_key_id || '',
      is_active: body.is_active ?? true,
      model: body.model || 'openai/gpt-3.5-turbo',
      system_prompt: body.system_prompt || 'You are a helpful assistant.',
      default_language: body.default_language || 'en',
      welcome_messages: body.welcome_messages || [],
      max_history: body.max_history || 20,
      session_ttl: body.session_ttl || 3600,
      group_mode: body.group_mode || 'all',
      mention_trigger: body.mention_trigger || '',
      reply_to_mentions: body.reply_to_mentions ?? true,
      commands: body.commands || [],
      inline_keyboard_template: body.inline_keyboard_template,
      web_app_url: body.web_app_url,
      payments: body.payments,
      model_params: body.model_params || {
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      },
      streaming: body.streaming ?? true,
    };

    await saveBotConfig(c as unknown as Context, config);
    return c.json(config, 201);
  } catch (error) {
    console.error('Error creating bot:', error);
    return c.json({ error: 'Failed to create bot' }, 500);
  }
});

// GET /api/bots/:username - Get bot by username
botsRouter.get('/:username', async (c) => {
  try {
    const username = c.req.param('username');
    const bot = await getBotConfig(c as unknown as Context, username);
    
    if (!bot) {
      return c.json({ error: 'Bot not found' }, 404);
    }
    
    return c.json(bot);
  } catch (error) {
    console.error('Error getting bot:', error);
    return c.json({ error: 'Failed to get bot' }, 500);
  }
});

// PUT /api/bots/:username - Update bot (autosave)
botsRouter.put('/:username', async (c) => {
  try {
    const username = c.req.param('username');
    const body = await c.req.json<Partial<BotConfig>>();
    
    const existing = await getBotConfig(c as unknown as Context, username);
    if (!existing) {
      return c.json({ error: 'Bot not found' }, 404);
    }

    const updated: BotConfig = {
      ...existing,
      ...body,
      username, // ensure username doesn't change
    };

    await saveBotConfig(c as unknown as Context, updated);
    return c.json(updated);
  } catch (error) {
    console.error('Error updating bot:', error);
    return c.json({ error: 'Failed to update bot' }, 500);
  }
});

// DELETE /api/bots/:username - Delete bot
botsRouter.delete('/:username', async (c) => {
  try {
    const username = c.req.param('username');
    await deleteBot(c as unknown as Context, username);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return c.json({ error: 'Failed to delete bot' }, 500);
  }
});
