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
                  │  - Assets        │
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
├── dist/
│   └── admin/            # Built admin UI assets (generated after build)
├── wrangler.toml         # Cloudflare Workers configuration
├── package.json          # Dependencies and scripts
├── deploy.sh             # Automated deployment script
├── README.md             # This file
└── DEPLOY_ASSETS.md      # Detailed asset deployment guide
```

---

## ⚠️ IMPORTANT: KV Bindings Must Be Added After Deployment

**This project does NOT use `wrangler.toml` for KV namespace bindings.** All KV namespaces must be configured **after deployment** through the Cloudflare Dashboard or CLI commands. This is intentional to prevent accidental overwrites of Dashboard-configured bindings.

### Why?

If you define `kv_namespaces` in `wrangler.toml`, Wrangler will **OVERWRITE and DELETE all bindings configured in the Cloudflare Dashboard** during deployment. This includes:
- KV Namespace bindings
- Secrets
- Environment Variables
- D1 Database bindings
- R2 Bucket bindings
- All other bindings

### Required KV Namespaces

You need to set up these 5 KV namespaces:

| Binding Name | Purpose |
|--------------|---------|
| `BOT_REGISTRY` | Stores bot configurations |
| `SESSION_KV` | Stores user session data |
| `KEYS_KV` | Stores OpenRouter API keys |
| `SETTINGS_KV` | Stores global settings |
| `Assets` | Stores admin UI static assets |

---

## Setup Instructions

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build the Admin Dashboard

```bash
npm run build:admin
```

This builds the admin UI and outputs files to `dist/admin/`.

### Step 3: Deploy the Worker

```bash
npm run deploy
# or
npx wrangler deploy
```

### Step 4: Configure KV Namespaces (AFTER Deployment)

After deploying, you need to bind the KV namespaces. You can do this via the **Cloudflare Dashboard** or **CLI**.

#### Option A: Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → Select your worker
3. Click **Settings** → **Bindings**
4. Click **Add Binding** → **KV Namespace**
5. Add each namespace:

| Variable Name | KV Namespace |
|---------------|--------------|
| `BOT_REGISTRY` | Create or select your BOT_REGISTRY namespace |
| `SESSION_KV` | Create or select your SESSION_KV namespace |
| `KEYS_KV` | Create or select your KEYS_KV namespace |
| `SETTINGS_KV` | Create or select your SETTINGS_KV namespace |
| `Assets` | Create or select your Assets namespace |

6. Click **Save and Deploy**

#### Option B: CLI Commands

First, create the KV namespaces:

```bash
wrangler kv namespace create "BOT_REGISTRY"
wrangler kv namespace create "SESSION_KV"
wrangler kv namespace create "KEYS_KV"
wrangler kv namespace create "SETTINGS_KV"
wrangler kv namespace create "Assets"
```

Each command will output a namespace ID. Then manually add the bindings in the Cloudflare Dashboard using these IDs.

### Step 5: Upload Admin Assets to KV (AFTER Deployment)

After deploying and binding the `Assets` KV namespace, upload the built admin assets:

```bash
# Check actual filenames first (hashes may vary)
ls dist/admin/assets/

# Upload JavaScript bundle
npx wrangler kv key put --binding=Assets "assets/index-D6ow2Um0.js" --path="./dist/admin/assets/index-D6ow2Um0.js"

# Upload CSS bundle
npx wrangler kv key put --binding=Assets "assets/index-BndC19cd.css" --path="./dist/admin/assets/index-BndC19cd.css"
```

> **Note:** Asset filenames include content hashes (e.g., `index-D6ow2Um0.js`). Always check the actual filenames in `dist/admin/assets/` and adjust the commands accordingly.

### Step 6: Set Admin Password (Optional)

For simple browser-based password protection:

```bash
wrangler secret put ADMIN_PASSWORD
```

Enter your desired password when prompted.

---

## Quick Deploy Script

Use the included `deploy.sh` script to automate the entire process:

```bash
chmod +x deploy.sh
./deploy.sh
```

This script will:
1. Build the admin UI
2. Deploy the worker
3. Upload the admin assets to the Assets KV namespace automatically

---

## Accessing the Admin Panel

- **URL**: `https://your-worker-subdomain.workers.dev/admin`
- If `ADMIN_PASSWORD` is set, your browser will prompt for authentication
- If no password is set, the admin panel is accessible without authentication

---

## Setting Up Telegram Webhooks

After deployment, configure your Telegram bot webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/webhook/<BOT_USERNAME>"
```

Replace:
- `<YOUR_BOT_TOKEN>` with your Telegram bot token from @BotFather
- `<YOUR_WORKER_SUBDOMAIN>` with your Cloudflare Worker subdomain
- `<BOT_USERNAME>` with your bot's username (without @)

---

## Development

### Local Development

Run the development server with hot reload:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`.

### Testing Webhooks Locally

To test Telegram webhooks locally, use a tunnel service like ngrok:

```bash
# Install ngrok (if not already installed)
npm install -g ngrok

# Start ngrok tunnel
ngrok http 8787

# Set webhook to ngrok URL
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<NGROK_SUBDOMAIN>.ngrok.io/webhook/<BOT_USERNAME>"
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
Ensure all 5 KV namespaces are created and properly bound in the Cloudflare Dashboard:
- `BOT_REGISTRY`
- `SESSION_KV`
- `KEYS_KV`
- `SETTINGS_KV`
- `Assets`

**⚠️ DO NOT add `kv_namespaces` to `wrangler.toml`!** Adding bindings to `wrangler.toml` will overwrite and delete all Dashboard-configured bindings.

#### Admin Assets Not Loading
1. Verify the `Assets` KV namespace is bound in the Dashboard
2. Ensure assets were uploaded with correct keys (include `assets/` prefix)
3. Check that filenames in `/src/index.ts` match the actual built files

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
