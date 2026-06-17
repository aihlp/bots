# Telegram Bot Platform

A multi-tenant Telegram bot platform built on Cloudflare Workers that enables users to create custom AI-powered Telegram bots using OpenRouter's API.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
wrangler login

# 3. Create KV namespaces (copy the namespace IDs)
wrangler kv namespace create "BOT_REGISTRY"
wrangler kv namespace create "SESSION_KV"
wrangler kv namespace create "KEYS_KV"
wrangler kv namespace create "SETTINGS_KV"

# 4. Build admin dashboard
npm run build

# 5. Deploy
npm run deploy
```

**⚠️ Important:** After deployment, configure KV bindings in the [Cloudflare Dashboard](https://dash.cloudflare.com/) — **do NOT add `kv_namespaces` to `wrangler.toml`** (see [Configuration](#configuration) section).

---

## Features

- **Multi-bot Support**: Create and manage multiple Telegram bots from a single deployment
- **AI-Powered Responses**: Connect bots to various AI models via [OpenRouter](https://openrouter.ai/)
- **Session Management**: Maintain conversation context with configurable history limits
- **Group Chat Support**: Configurable group modes (all messages, mentions only, admin only)
- **Streaming Responses**: Real-time streaming of AI responses to Telegram
- **Vision Support**: Process images sent to the bot
- **Multi-language**: Support for multiple languages with customizable welcome messages
- **Custom System Prompts**: Template-based system prompts with placeholder support
- **Admin Dashboard**: Web-based admin interface for bot management

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Telegram  │────▶│ Cloudflare Worker│────▶│  OpenRouter  │
│    Users    │◀────│   (Hono Router)  │◀────│     API      │
└─────────────┘     └──────────────────┘     └──────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Cloudflare KV   │
                  │  - BOT_REGISTRY  │
                  │  - SESSION_KV    │
                  │  - KEYS_KV       │
                  │  - SETTINGS_KV   │
                  └──────────────────┘
```

---

## Prerequisites

- Node.js 18+ and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Wrangler CLI installed (`npm install -g wrangler`)
- A [Telegram Bot Token](https://core.telegram.org/bots/features#botfather) (from @BotFather)
- An [OpenRouter API Key](https://openrouter.ai/keys)

---

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

### 3. Create KV Namespaces

Create four KV namespaces and **save the namespace IDs**:

```bash
wrangler kv namespace create "BOT_REGISTRY"
wrangler kv namespace create "SESSION_KV"
wrangler kv namespace create "KEYS_KV"
wrangler kv namespace create "SETTINGS_KV"
```

### 4. Configure KV Bindings in Cloudflare Dashboard

> **⚠️ CRITICAL: Do NOT add `kv_namespaces` to `wrangler.toml`!**
> 
> Adding bindings to `wrangler.toml` will **OVERWRITE and DELETE** all bindings configured in the Cloudflare Dashboard.

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → Select your worker (`bot`)
3. Click **Settings** → **Variables and Secrets**
4. Under **KV Namespace Bindings**, click **Add Binding**
5. Add each namespace:

| Variable Name | KV Namespace |
|---------------|--------------|
| `BOT_REGISTRY` | Select your BOT_REGISTRY namespace |
| `SESSION_KV` | Select your SESSION_KV namespace |
| `KEYS_KV` | Select your KEYS_KV namespace |
| `SETTINGS_KV` | Select your SETTINGS_KV namespace |

6. Click **Save and Deploy**

### 5. Build and Deploy

```bash
# Build admin dashboard and worker
npm run build

# Deploy to Cloudflare
npm run deploy
```

After deployment, note your worker URL (e.g., `https://bot.your-subdomain.workers.dev`).

---

## Creating Your First Bot

### Step 1: Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the prompts to set a name and username
4. **Save the bot token** provided by BotFather

### Step 2: Get an OpenRouter API Key

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up or log in
3. Go to [Keys](https://openrouter.ai/keys)
4. Create a new API key
5. **Save the API key**

### Step 3: Store Your OpenRouter API Key

Use the admin dashboard or API to store your key:

```bash
curl -X POST "https://YOUR_WORKER_SUBDOMAIN.workers.dev/api/keys" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My OpenRouter Key",
    "key": "sk-or-..."
  }'
```

Note the returned key ID (e.g., `key-uuid`).

### Step 4: Create Your Bot Configuration

```bash
curl -X POST "https://YOUR_WORKER_SUBDOMAIN.workers.dev/api/bots" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "mybot",
    "telegram_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
    "openrouter_key_id": "key-uuid",
    "model": "openai/gpt-3.5-turbo",
    "system_prompt": "You are {{bot_username}}, a helpful assistant.",
    "default_language": "en",
    "welcome_messages": [{"lang": "en", "text": "Hello! I am {{bot_username}}. How can I help you?"}],
    "max_history": 10,
    "session_ttl": 3600,
    "group_mode": "mention_only",
    "streaming": true
  }'
```

### Step 5: Set Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/webhook/<BOT_USERNAME>"
```

Replace:
- `<YOUR_BOT_TOKEN>` with your Telegram bot token
- `<YOUR_WORKER_SUBDOMAIN>` with your Cloudflare Worker subdomain
- `<BOT_USERNAME>` with your bot's username (without @)

### Step 6: Test Your Bot

1. Open Telegram
2. Search for your bot by username
3. Click **Start** or send `/start`
4. Send a message and receive AI-powered responses!

---

## Use Cases

### 1. Customer Support Bot

Automate customer support with AI responses to common questions.

**Configuration:**
```json
{
  "username": "supportbot",
  "system_prompt": "You are {{bot_username}}, a customer support assistant for Our Company. Help users with their questions about our products and services. Be polite and professional.",
  "group_mode": "all",
  "max_history": 20,
  "model": "anthropic/claude-3-haiku"
}
```

**Best for:** E-commerce, SaaS, service businesses

### 2. Personal AI Assistant

Create a personal assistant bot for task management, reminders, and general queries.

**Configuration:**
```json
{
  "username": "myassistant",
  "system_prompt": "You are {{bot_username}}, a personal AI assistant. Help {{user_name}} with tasks, answer questions, and provide useful information.",
  "group_mode": "mention_only",
  "max_history": 50,
  "model": "openai/gpt-4-turbo"
}
```

**Best for:** Productivity, personal use, task automation

### 3. Educational/Tutoring Bot

Build a bot that helps students learn specific subjects.

**Configuration:**
```json
{
  "username": "mathbot",
  "system_prompt": "You are {{bot_username}}, a math tutor. Explain concepts clearly, provide examples, and help students solve problems step by step. Adapt to the student's level.",
  "default_language": "en",
  "welcome_messages": [
    {"lang": "en", "text": "Hi! I'm your math tutor. Ask me any math question!"},
    {"lang": "es", "text": "¡Hola! Soy tu tutor de matemáticas. ¡Pregúntame cualquier cosa!"}
  ],
  "model": "openai/gpt-4"
}
```

**Best for:** Education, training, e-learning platforms

### 4. Content Creation Bot

Help users generate content ideas, write posts, or create marketing copy.

**Configuration:**
```json
{
  "username": "contentbot",
  "system_prompt": "You are {{bot_username}}, a creative content assistant. Help users brainstorm ideas, write engaging posts, and create compelling marketing copy.",
  "model": "anthropic/claude-3-opus",
  "model_params": {
    "temperature": 0.8,
    "max_tokens": 2000
  }
}
```

**Best for:** Marketing teams, social media managers, writers

### 5. Multilingual Community Bot

Serve a global community with automatic language detection and responses.

**Configuration:**
```json
{
  "username": "globalbot",
  "system_prompt": "You are {{bot_username}}, a helpful assistant for our international community. Respond in the user's language ({{language}}).",
  "default_language": "en",
  "welcome_messages": [
    {"lang": "en", "text": "Welcome! How can I help?"},
    {"lang": "es", "text": "¡Bienvenido! ¿Cómo puedo ayudarte?"},
    {"lang": "fr", "text": "Bienvenue ! Comment puis-je vous aider ?"},
    {"lang": "de", "text": "Willkommen! Wie kann ich helfen?"}
  ],
  "group_mode": "mention_only"
}
```

**Best for:** International communities, global brands

### 6. Vision-Enabled Bot

Process and analyze images sent by users.

**Configuration:**
```json
{
  "username": "visionbot",
  "system_prompt": "You are {{bot_username}}, an AI assistant that can analyze images. Describe what you see, answer questions about images, and provide insights.",
  "model": "openai/gpt-4-vision-preview",
  "max_history": 10
}
```

**Best for:** Image analysis, accessibility, visual content review

---

## Configuration Reference

### Bot Configuration Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `username` | string | required | Telegram bot username (without @) |
| `telegram_token` | string | required | Bot token from @BotFather |
| `openrouter_key_id` | string | required | Reference to stored OpenRouter API key |
| `is_active` | boolean | `true` | Whether the bot is active |
| `model` | string | `openai/gpt-3.5-turbo` | OpenRouter model ID |
| `system_prompt` | string | `"You are a helpful assistant."` | System prompt with placeholders |
| `default_language` | string | `"en"` | Default language code |
| `welcome_messages` | array | `[]` | Localized welcome messages |
| `max_history` | number | `20` | Maximum conversation history length |
| `session_ttl` | number | `3600` | Session expiration in seconds |
| `group_mode` | string | `"all"` | `all`, `mention_only`, or `admin_only` |
| `streaming` | boolean | `true` | Enable streaming responses |
| `model_params` | object | `{}` | Model parameters (temperature, max_tokens, etc.) |

### System Prompt Placeholders

| Placeholder | Replaced With |
|-------------|---------------|
| `{{user_name}}` | User's first name |
| `{{user_id}}` | User's Telegram ID |
| `{{language}}` | User's language code |
| `{{chat_type}}` | Chat type (private, group, etc.) |
| `{{chat_title}}` | Group/chat title |
| `{{bot_username}}` | Bot's username |
| `{{date}}` | Current date (ISO) |
| `{{time}}` | Current time |

### Group Modes

| Mode | Description |
|------|-------------|
| `all` | Process all messages in groups |
| `mention_only` | Only process messages mentioning the bot |
| `admin_only` | Only process messages from group admins |

---

## API Reference

### Bot Management

#### List All Bots
```
GET /api/bots
```

#### Get Bot Configuration
```
GET /api/bots/:username
```

#### Create Bot
```
POST /api/bots
Content-Type: application/json

{
  "username": "mybot",
  "telegram_token": "...",
  "openrouter_key_id": "key-uuid",
  ...
}
```

#### Update Bot
```
PUT /api/bots/:username
Content-Type: application/json

{
  "model": "new-model",
  "max_history": 50
}
```

#### Delete Bot
```
DELETE /api/bots/:username
```

### API Keys

#### List Keys
```
GET /api/keys
```

#### Create Key
```
POST /api/keys
Content-Type: application/json

{
  "name": "My Key",
  "key": "sk-or-..."
}
```

#### Delete Key
```
DELETE /api/keys/:id
```

### Global Settings

#### Get Settings
```
GET /api/settings
```

#### Update Settings
```
PUT /api/settings
Content-Type: application/json

{
  "default_max_history": 10,
  "default_session_ttl": 3600
}
```

---

## Development

### Local Development

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

### Testing Webhooks Locally

Use [ngrok](https://ngrok.com/) to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Start tunnel
ngrok http 8787

# Set webhook
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<NGROK_SUBDOMAIN>.ngrok.io/webhook/<BOT_USERNAME>"
```

### View Logs

```bash
wrangler tail
```

Or in Dashboard: **Workers & Pages** → Your Worker → **Logs**

---

## Troubleshooting

### KV Namespace Not Found
Ensure KV namespaces are created and bound **only in the Cloudflare Dashboard**.

### Webhook Not Receiving Updates
1. Verify the webhook URL is correct
2. Check that the bot username matches
3. Ensure the bot isn't in privacy mode (@BotFather → Privacy Mode)

### OpenRouter API Errors
1. Verify the API key is valid and has credits
2. Check the model name exists on [OpenRouter Models](https://openrouter.ai/models)
3. Review rate limits

### Build Errors
```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Security Considerations

- **API Keys**: Store OpenRouter keys securely in `KEYS_KV`. Never expose them client-side.
- **Bot Tokens**: Telegram tokens are stored in `BOT_REGISTRY`; consider encryption for production.
- **Input Validation**: All API endpoints validate input before processing.
- **Rate Limiting**: Consider implementing rate limiting for high-traffic bots.

---

## Links & Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Hono Framework](https://hono.dev/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

## License

MIT

---

## Support

For issues and feature requests, please open an issue on the repository.