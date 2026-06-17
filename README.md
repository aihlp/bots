# Telegram Bot Platform

A multi-tenant Telegram bot platform built on Cloudflare Workers that enables users to create custom AI-powered Telegram bots using OpenRouter's API.

## Features

- **Multi-bot Support**: Create and manage multiple Telegram bots from a single deployment
- **AI-Powered Responses**: Connect bots to various AI models via OpenRouter
- **Session Management**: Maintain conversation context with configurable history limits
- **Group Chat Support**: Configurable group modes (all messages, mentions only, admin only)
- **Streaming Responses**: Real-time streaming of AI responses to Telegram
- **Vision Support**: Process images sent to the bot
- **Multi-language**: Support for multiple languages with customizable welcome messages
- **Custom System Prompts**: Template-based system prompts with placeholder support
- **Admin Dashboard**: Web-based admin interface for bot management

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

## Prerequisites

- Node.js 18+ and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Wrangler CLI installed (`npm install -g wrangler`)
- A [Telegram Bot Token](https://core.telegram.org/bots/features#botfather) (from @BotFather)
- An [OpenRouter API Key](https://openrouter.ai/keys)

## Project Structure

```
/workspace
├── src/
│   ├── index.ts          # Main entry point and router
│   ├── types.ts          # TypeScript types and KV helpers
│   ├── api/
│   │   ├── webhook.ts    # Telegram webhook handler
│   │   ├── bots.ts       # Bot management API
│   │   ├── keys.ts       # API key management
│   │   └── settings.ts   # Global settings API
│   └── admin/            # Admin dashboard (separate build)
├── wrangler.toml         # Cloudflare Workers configuration
├── package.json          # Dependencies and scripts
└── README.md             # This file
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Wrangler

The `wrangler.toml` file contains the basic configuration. You may need to update it with your Cloudflare account details:

```toml
name = "bot"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist/admin"

[vars]
ENVIRONMENT = "production"
```

### 3. Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser window for authentication.

### 4. Create KV Namespaces

You need to create four KV namespaces for the application to function:

```bash
# Create namespaces
wrangler kv namespace create "BOT_REGISTRY"
wrangler kv namespace create "SESSION_KV"
wrangler kv namespace create "KEYS_KV"
wrangler kv namespace create "SETTINGS_KV"
```

Each command will output a namespace ID. Copy these IDs.

### 5. Update wrangler.toml with KV Namespace IDs

> **⚠️ CRITICAL WARNING: DO NOT ADD kv_namespaces TO wrangler.toml! ⚠️**
> 
> If you define `kv_namespaces` in `wrangler.toml`, Wrangler will **OVERWRITE and DELETE all bindings configured in the Cloudflare Dashboard**. This includes ALL KV namespaces, secrets, and other bindings.
> 
> **To preserve your Dashboard bindings:**
> - Configure KV namespace bindings ONLY in the Cloudflare Dashboard UI
> - NEVER add a `[[kv_namespaces]]` block to `wrangler.toml`
> - The current `wrangler.toml` intentionally omits `kv_namespaces` for this reason
> 
> If you accidentally add `kv_namespaces` to `wrangler.toml` and deploy, you will need to manually re-add all bindings in the Dashboard.

### 6. Build the Admin Dashboard

```bash
npm run build
```

This builds both the admin dashboard and the worker.

### 7. Deploy to Cloudflare

```bash
npm run deploy
```

Or directly:

```bash
wrangler deploy
```

After deployment, note the URL provided (e.g., `https://bot.your-subdomain.workers.dev`).

---

## Cloudflare Dashboard Configuration

### ⚠️ CRITICAL WARNING ABOUT BINDINGS ⚠️

**DO NOT add `kv_namespaces` or any bindings to `wrangler.toml`!**

If you define bindings in `wrangler.toml`, Wrangler will **OVERWRITE and DELETE all bindings configured in the Cloudflare Dashboard**. This includes:
- KV Namespace bindings
- Secrets
- Environment Variables
- D1 Database bindings
- R2 Bucket bindings
- All other bindings

**To preserve your Dashboard bindings:**
- Configure ALL bindings ONLY in the Cloudflare Dashboard UI
- NEVER add binding configurations to `wrangler.toml`
- The current `wrangler.toml` intentionally omits all binding blocks for this reason

### Setting Up KV Namespaces via Dashboard

If you prefer to configure KV namespaces through the Cloudflare Dashboard:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **KV**
3. Click **Create a namespace**
4. Create the following namespaces:
   - `BOT_REGISTRY` - Stores bot configurations
   - `SESSION_KV` - Stores user session data
   - `KEYS_KV` - Stores OpenRouter API keys
   - `SETTINGS_KV` - Stores global settings

5. After creating namespaces, go to your Worker in the Dashboard
6. Click on **Settings** > **Variables**
7. Under **KV Namespace Bindings**, click **Add Binding**
8. Add each namespace with its corresponding binding name:

| Variable Name | KV Namespace |
|---------------|--------------|
| `BOT_REGISTRY` | Select your BOT_REGISTRY namespace |
| `SESSION_KV` | Select your SESSION_KV namespace |
| `KEYS_KV` | Select your KEYS_KV namespace |
| `SETTINGS_KV` | Select your SETTINGS_KV namespace |

9. Click **Save and Deploy**

### Setting Up Webhooks

After deploying your worker, you need to set up the Telegram webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/webhook/<BOT_USERNAME>"
```

Replace:
- `<YOUR_BOT_TOKEN>` with your Telegram bot token
- `<YOUR_WORKER_SUBDOMAIN>` with your Cloudflare Worker subdomain
- `<BOT_USERNAME>` with your bot's username (without @)

### Environment Variables

Configure environment variables in the Cloudflare Dashboard:

1. Go to your Worker in the Dashboard
2. Click **Settings** > **Variables**
3. Under **Environment Variables**, click **Add Variable**
4. Add any additional environment variables needed

### Custom Domains (Optional)

To use a custom domain instead of `.workers.dev`:

1. Go to your Worker in the Dashboard
2. Click **Triggers** > **Custom Domains**
3. Click **Add Custom Domain**
4. Enter your domain and follow the DNS configuration instructions

---

## Development

### Local Development

Run the development server with hot reload:

```bash
npm run dev
```

This starts Wrangler's local development server. The worker will be available at `http://localhost:8787`.

### Testing Webhooks Locally

To test Telegram webhooks locally, you'll need a tunnel service like ngrok:

```bash
# Install ngrok (if not already installed)
npm install -g ngrok

# Start ngrok tunnel
ngrok http 8787

# Set webhook to ngrok URL
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<NGROK_SUBDOMAIN>.ngrok.io/webhook/<BOT_USERNAME>"
```

### Building for Production

```bash
# Build admin dashboard and worker
npm run build

# Deploy
npm run deploy
```

---

## API Reference

### Bot Management

#### List Bots
```
GET /api/bots
```

#### Get Bot Config
```
GET /api/bots/:username
```

#### Create/Update Bot
```
POST /api/bots
Content-Type: application/json

{
  "username": "mybot",
  "telegram_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "openrouter_key_id": "key-uuid",
  "is_active": true,
  "model": "openai/gpt-3.5-turbo",
  "system_prompt": "You are {{bot_username}}, a helpful assistant.",
  "default_language": "en",
  "welcome_messages": [{"lang": "en", "text": "Hello!"}],
  "max_history": 10,
  "session_ttl": 3600,
  "group_mode": "mention_only",
  "streaming": true,
  "model_params": {
    "temperature": 0.7,
    "max_tokens": 1000
  }
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
  "name": "My OpenRouter Key",
  "key": "sk-or-..."
}
```

#### Delete Key
```
DELETE /api/keys/:id
```

### Settings

#### Get Global Settings
```
GET /api/settings
```

#### Update Global Settings
```
PUT /api/settings
Content-Type: application/json

{
  "default_max_history": 10,
  "default_session_ttl": 3600
}
```

---

## Configuration Options

### Bot Configuration

| Field | Type | Description |
|-------|------|-------------|
| `username` | string | Telegram bot username (without @) |
| `telegram_token` | string | Bot token from @BotFather |
| `openrouter_key_id` | string | Reference to stored API key |
| `is_active` | boolean | Whether the bot is active |
| `model` | string | OpenRouter model ID |
| `system_prompt` | string | System prompt with placeholders |
| `default_language` | string | Default language code |
| `welcome_messages` | array | Localized welcome messages |
| `max_history` | number | Maximum conversation history |
| `session_ttl` | number | Session expiration in seconds |
| `group_mode` | string | `all`, `mention_only`, or `admin_only` |
| `streaming` | boolean | Enable streaming responses |
| `model_params` | object | Model parameters (temperature, etc.) |

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

- **`all`**: Process all messages in groups
- **`mention_only`**: Only process messages mentioning the bot
- **`admin_only`**: Only process messages from group admins

---

## Troubleshooting

### Common Issues

#### KV Namespace Not Found
Ensure KV namespaces are created and properly bound **ONLY in the Cloudflare Dashboard**. 

**⚠️ DO NOT add `kv_namespaces` to `wrangler.toml`!** Adding bindings to `wrangler.toml` will overwrite and delete all Dashboard-configured bindings.

#### Webhook Not Receiving Updates
1. Verify the webhook URL is correct
2. Check that the bot username in the URL matches
3. Ensure the bot is not in privacy mode (check @BotFather)

#### OpenRouter API Errors
1. Verify the API key is valid and has credits
2. Check the model name is correct
3. Review rate limits

#### Build Errors
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Logs

View worker logs:

```bash
wrangler tail
```

Or in the Dashboard: **Workers & Pages** > Your Worker > **Logs**

---

## Security Considerations

- **API Keys**: Store OpenRouter keys securely in KEYS_KV. Never expose them in client-side code.
- **Bot Tokens**: Telegram bot tokens should be stored encrypted in production.
- **Input Validation**: All API endpoints validate input before processing.
- **Rate Limiting**: Consider implementing rate limiting for API endpoints.

---

## License

MIT

---

## Support

For issues and feature requests, please open an issue on the repository.