import type { Context, BotConfig } from '../types';

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

export async function webhookHandler(c: Context): Promise<void> {
  const botUsername = c.req.param('bot_username');
  if (!botUsername) {
    console.log('Missing bot_username parameter');
    return;
  }
  const botConfig = await getBotConfig(c, botUsername);
  
  if (!botConfig || !botConfig.is_active) {
    console.log(`Bot ${botUsername} not found or inactive`);
    return;
  }

  const update: TelegramUpdate = await c.req.json();
  const message = update.message;
  
  if (!message) {
    console.log('No message in update');
    return;
  }

  // Check group mode
  if (message.chat.type === 'group' || message.chat.type === 'supergroup') {
    if (!shouldProcessInGroup(message, botConfig)) {
      console.log('Skipping message due to group mode');
      return;
    }
  }

  // Handle /start command with welcome message
  if (message.text === '/start') {
    await sendWelcomeMessage(c, botConfig, message);
    return;
  }

  // Process message
  await processMessage(c, botConfig, message);
}

async function getBotConfig(c: Context, username: string): Promise<BotConfig | null> {
  const data = await c.env.BOT_REGISTRY.get(`bot:${username}`);
  return data ? JSON.parse(data) : null;
}

function shouldProcessInGroup(message: TelegramMessage, config: BotConfig): boolean {
  if (config.group_mode === 'all') return true;
  
  if (config.group_mode === 'admin_only') {
    // Would need to call getChatMember - simplified for now
    return false;
  }
  
  if (config.group_mode === 'mention_only') {
    if (!message.text) return false;
    return message.text.includes(`@${config.username}`);
  }
  
  return false;
}

async function sendWelcomeMessage(c: Context, config: BotConfig, message: TelegramMessage): Promise<void> {
  const lang = message.from?.language_code || config.default_language;
  const welcomeMsg = config.welcome_messages.find(w => w.lang === lang)?.text || 
                     `Welcome! I'm ${config.username}. How can I help you?`;
  
  const keyboard = config.inline_keyboard_template ? {
    inline_keyboard: config.inline_keyboard_template.inline_keyboard || []
  } : undefined;
  
  await telegramRequest(c, config.telegram_token, 'sendMessage', {
    chat_id: message.chat.id,
    text: welcomeMsg,
    reply_markup: keyboard,
    parse_mode: 'MarkdownV2'
  });
}

async function processMessage(c: Context, config: BotConfig, message: TelegramMessage): Promise<void> {
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
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
    ];
  }
  
  // Add to session
  messages.push({ role: 'user', content: userContent });
  
  // Trim history
  while (messages.length > config.max_history + 1) { // +1 for system prompt
    messages.shift();
  }
  
  // Replace placeholders in system prompt
  const systemPrompt = replacePlaceholders(config.system_prompt, message, config);
  
  // Build OpenRouter request
  const openrouterMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];
  
  // Get API key
  const apiKeyRecord = await c.env.KEYS_KV.get(`key:${config.openrouter_key_id}`);
  const apiKey = apiKeyRecord ? JSON.parse(apiKeyRecord).key : '';
  
  // Call OpenRouter with streaming
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://workers.dev',
      'X-Title': 'Telegram Bot Platform'
    },
    body: JSON.stringify({
      model: config.model,
      messages: openrouterMessages,
      stream: config.streaming,
      ...config.model_params
    })
  });
  
  if (!response.ok) {
    console.error('OpenRouter error:', await response.text());
    return;
  }
  
  if (config.streaming) {
    await streamResponse(c, config, message, response);
  } else {
    const data: { choices?: { message?: { content?: string } }[] } = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content || '';
    await sendMessage(c, config.telegram_token, message.chat.id, assistantMessage);
    messages.push({ role: 'assistant', content: assistantMessage });
  }
  
  // Save session
  await c.env.SESSION_KV.put(sessionId, JSON.stringify(messages), { expirationTtl: config.session_ttl });
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
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function streamResponse(c: Context, config: BotConfig, message: TelegramMessage, response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  
  const decoder = new TextDecoder();
  let fullText = '';
  let sentMessageId: number | null = null;
  let lastEditTime = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || '';
        fullText += delta;
        
        // Throttle edits to 2/sec
        const now = Date.now();
        if (now - lastEditTime >= 500 || !sentMessageId) {
          if (!sentMessageId) {
            const msg = await sendMessage(c, config.telegram_token, message.chat.id, fullText);
            sentMessageId = msg.message_id;
          } else {
            await editMessage(c, config.telegram_token, message.chat.id, sentMessageId, fullText);
          }
          lastEditTime = now;
        }
      } catch (e) {
        console.error('Error parsing SSE:', e);
      }
    }
  }
  
  // Final update if needed
  if (fullText && Date.now() - lastEditTime >= 500) {
    await editMessage(c, config.telegram_token, message.chat.id, sentMessageId!, fullText);
  }
}

async function sendMessage(c: Context, token: string, chatId: number, text: string): Promise<{ message_id: number }> {
  return telegramRequest(c, token, 'sendMessage', {
    chat_id: chatId,
    text: escapeMarkdown(text),
    parse_mode: 'MarkdownV2'
  });
}

async function editMessage(c: Context, token: string, chatId: number, messageId: number, text: string): Promise<void> {
  await telegramRequest(c, token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: escapeMarkdown(text),
    parse_mode: 'MarkdownV2'
  });
}

async function telegramRequest(c: Context, token: string, method: string, params: Record<string, unknown>): Promise<any> {
  const url = `${TELEGRAM_API}${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  if (!response.ok) {
    throw new Error(`Telegram API error: ${await response.text()}`);
  }
  
  const data: { result?: any } = await response.json();
  return data.result;
}

function escapeMarkdown(text: string): string {
  const chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  let escaped = text;
  for (const char of chars) {
    escaped = escaped.replaceAll(char, `\\${char}`);
  }
  return escaped;
}
