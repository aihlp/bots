import { Hono } from 'hono';
import type { BotConfig, Context } from '../types';

interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name: string; language_code?: string };
  chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel'; title?: string };
  text?: string;
  photo?: { file_id: string; file_unique_id: string }[];
  entities?: { type: string; offset: number; length: number }[];
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

const TELEGRAM_API = 'https://api.telegram.org/bot';
const MARKDOWN_V2_SPECIAL = new Set(['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']);

export const webhookRouter = new Hono<{ Bindings: Context['env'] }>();

webhookRouter.post('/', webhookHandler);
webhookRouter.post('/:bot_username', webhookHandler);

export async function webhookHandler(c: Context): Promise<Response> {
  const botUsername = c.req.param('bot_username');
  if (!botUsername) {
    return c.json({ error: 'bot_username is required' }, 400);
  }

  const ctx = c as unknown as Context;
  const botConfig = await getBotConfig(ctx, botUsername);

  if (!botConfig) {
    return c.json({ ok: true, skipped: 'bot_not_found' }, 200);
  }

  if (!botConfig.is_active) {
    return c.json({ ok: true, skipped: 'bot_inactive' }, 200);
  }

  if (botConfig.webhook_secret) {
    const receivedSecret = c.req.header('x-telegram-bot-api-secret-token') || '';
    if (!constantTimeEqual(receivedSecret, botConfig.webhook_secret)) {
      return c.json({ error: 'invalid_webhook_secret' }, 401);
    }
  }

  let update: TelegramUpdate;
  try {
    update = await c.req.json();
  } catch (error) {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const message = update.message;
  if (!message) {
    return c.json({ ok: true, skipped: 'unsupported_update' }, 200);
  }

  const processing = shouldProcessMessage(message, botConfig);
  if (!processing.allowed) {
    return c.json({ ok: true, skipped: processing.reason }, 200);
  }

  if (message.text === '/start') {
    await sendWelcomeMessage(ctx, botConfig, message);
    return c.json({ ok: true }, 200);
  }

  try {
    const result = await processMessage(ctx, botConfig, message);
    return c.json(result, result.ok ? 200 : 502);
  } catch (error) {
    console.error('Error processing Telegram update:', error);
    return c.json({ error: 'message_processing_failed' }, 500);
  }
}

async function getBotConfig(c: Context, username: string): Promise<BotConfig | null> {
  const data = await c.env.BOT_REGISTRY.get(`bot:${username}`);
  return data ? JSON.parse(data) : null;
}

function shouldProcessMessage(
  message: TelegramMessage,
  config: BotConfig,
): { allowed: true } | { allowed: false; reason: string } {
  if (message.chat.type === 'private') {
    return { allowed: true };
  }

  if (config.group_mode === 'all') {
    return { allowed: true };
  }

  if (config.group_mode === 'admin_only') {
    if (!config.admin_user_ids?.length) {
      return { allowed: false, reason: 'group_admin_only_no_admin_ids' };
    }

    if (config.admin_user_ids.includes(message.from?.id || -1)) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'group_admin_only_non_admin' };
  }

  if (config.group_mode === 'mention_only') {
    if (!message.text) {
      return { allowed: false, reason: 'mention_only_missing_text' };
    }

    const mentionTrigger = config.mention_trigger || `@${config.username}`;
    if (message.text.includes(mentionTrigger)) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'mention_only_not_mentioned' };
  }

  return { allowed: false, reason: 'unsupported_group_mode' };
}

async function sendWelcomeMessage(c: Context, config: BotConfig, message: TelegramMessage): Promise<void> {
  const lang = message.from?.language_code || config.default_language;
  const welcomeMsg =
    config.welcome_messages.find((w) => w.lang === lang)?.text || `Welcome! I'm ${config.username}. How can I help you?`;

  const keyboard = config.inline_keyboard_template
    ? {
        inline_keyboard: config.inline_keyboard_template.inline_keyboard || [],
      }
    : undefined;

  await telegramRequest(c, config.telegram_token, 'sendMessage', {
    chat_id: message.chat.id,
    text: welcomeMsg,
    reply_markup: keyboard,
    parse_mode: 'MarkdownV2',
  });
}

async function processMessage(
  c: Context,
  config: BotConfig,
  message: TelegramMessage,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sessionId = `session:${config.username}:${message.chat.id}`;

  // Load session
  let session = await c.env.SESSION_KV.get(sessionId);
  let messages: { role: string; content: string | object[] }[] = session ? JSON.parse(session) : [];

  // Build user message
  let userContent: string | object[] = message.text || '';

  // Handle photo
  if (message.photo && message.photo.length > 0) {
    const fileId = message.photo[message.photo.length - 1].file_id;
    const fileUrl = await getFileUrl(c, config.telegram_token, fileId);
    const base64 = await downloadAndBase64(fileUrl);
    userContent = [
      { type: 'text', text: message.text || '' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
    ];
  }

  // Add to session
  messages.push({ role: 'user', content: userContent });

  // Trim history
  while (messages.length > config.max_history + 1) {
    // +1 for system prompt
    messages.shift();
  }

  // Replace placeholders in system prompt
  const systemPrompt = replacePlaceholders(config.system_prompt, message, config);

  // Build OpenRouter request
  const openrouterMessages = [{ role: 'system', content: systemPrompt }, ...messages];

  // Get API key
  const apiKeyRecord = await c.env.KEYS_KV.get(`key:${config.openrouter_key_id}`);
  const apiKey = apiKeyRecord ? JSON.parse(apiKeyRecord).key : '';

  // Call OpenRouter with streaming
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://workers.dev',
      'X-Title': 'Telegram Bot Platform',
    },
    body: JSON.stringify({
      model: config.model,
      messages: openrouterMessages,
      stream: config.streaming,
      ...config.model_params,
    }),
  });

  if (!response.ok) {
    console.error('OpenRouter error:', response.status);
    return { ok: false, error: 'openrouter_error' };
  }

  let assistantMessage = '';
  if (config.streaming) {
    assistantMessage = await streamResponse(c, config, message, response);
  } else {
    const data: { choices?: { message?: { content?: string } }[] } = await response.json();
    assistantMessage = data.choices?.[0]?.message?.content || '';
    if (assistantMessage) {
      await sendMessage(c, config.telegram_token, message.chat.id, assistantMessage);
    }
  }

  if (assistantMessage) {
    messages.push({ role: 'assistant', content: assistantMessage });
  }

  // Save session
  await c.env.SESSION_KV.put(sessionId, JSON.stringify(messages), { expirationTtl: config.session_ttl });

  return assistantMessage ? { ok: true } : { ok: false, error: 'empty_assistant_message' };
}

function replacePlaceholders(prompt: string, message: TelegramMessage, config: BotConfig): string {
  const now = new Date();
  return prompt
    .replace(/{{user_name}}/g, message.from?.first_name || 'User')
    .replace(/{{user_id}}/g, String(message.from?.id || ''))
    .replace(/{{language}}/g, message.from?.language_code || config.default_language)
    .replace(/{{chat_type}}/g, message.chat.type)
    .replace(/{{chat_title}}/g, message.chat.title || '')
    .replace(/{{bot_username}}/g, config.username)
    .replace(/{{date}}/g, now.toISOString().split('T')[0])
    .replace(/{{time}}/g, now.toTimeString().split(' ')[0]);
}

async function getFileUrl(c: Context, token: string, fileId: string): Promise<string> {
  const data = await telegramRequest(c, token, 'getFile', { file_id: fileId });
  return `https://api.telegram.org/file/bot${token}/${data.file_path}`;
}

async function downloadAndBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function streamResponse(
  c: Context,
  config: BotConfig,
  message: TelegramMessage,
  response: Response,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let fullText = '';
  let sentMessageId: number | null = null;
  let lastSentText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        fullText += delta;

        if (fullText && fullText !== lastSentText) {
          if (!sentMessageId) {
            const msg = await sendMessage(c, config.telegram_token, message.chat.id, fullText);
            sentMessageId = msg.message_id;
          } else {
            await editMessage(c, config.telegram_token, message.chat.id, sentMessageId, fullText);
          }
          lastSentText = fullText;
        }
      } catch (error) {
        console.error('Error parsing SSE:', error);
      }
    }
  }

  if (fullText && sentMessageId && lastSentText !== fullText) {
    await editMessage(c, config.telegram_token, message.chat.id, sentMessageId, fullText);
  }

  return fullText;
}

async function sendMessage(c: Context, token: string, chatId: number, text: string): Promise<{ message_id: number }> {
  return telegramRequest(c, token, 'sendMessage', {
    chat_id: chatId,
    text: escapeMarkdownV2(text),
    parse_mode: 'MarkdownV2',
  });
}

async function editMessage(
  c: Context,
  token: string,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  await telegramRequest(c, token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: escapeMarkdownV2(text),
    parse_mode: 'MarkdownV2',
  });
}

async function telegramRequest(
  c: Context,
  token: string,
  method: string,
  params: Record<string, unknown>,
): Promise<any> {
  const url = `${TELEGRAM_API}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status}`);
  }

  const data: { result?: any } = await response.json();
  return data.result;
}

export function escapeMarkdownV2(text: string): string {
  let escaped = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if (MARKDOWN_V2_SPECIAL.has(char) && previous !== '\\') {
      escaped += `\\${char}`;
    } else {
      escaped += char;
    }
  }
  return escaped;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}
