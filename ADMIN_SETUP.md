# Admin Panel Access

## Quick Setup

### 1. Build the Admin UI
```bash
npm run build:admin
```
This creates the built assets in `dist/admin/assets/`.

### 2. Upload Assets to KV
Upload the built assets from `dist/admin/assets/` to your **Assets** KV namespace in Cloudflare Dashboard:
- Go to Workers & Pages → Your Worker → Settings → Bindings
- Add a KV Namespace binding named `Assets` (or create a new KV namespace)
- Go to Workers & Pages → KV → Select your Assets namespace
- Upload each file from `dist/admin/assets/`:
  - Upload `index-D6ow2Um0.js` with key `assets/index-D6ow2Um0.js`
  - Upload `index-BndC19cd.css` with key `assets/index-BndC19cd.css`

### 3. Set Admin Password (Optional)
For simple browser-based password protection:
```bash
wrangler secret put ADMIN_PASSWORD
```
Enter your desired password when prompted.

### 4. Configure KV Bindings in Dashboard
Ensure these KV namespaces are bound in Cloudflare Dashboard:
- `BOT_REGISTRY` - Bot configurations
- `SESSION_KV` - User sessions  
- `KEYS_KV` - API keys
- `SETTINGS_KV` - Global settings
- `Assets` - Admin UI static assets

## Access

- **Admin Panel**: `https://your-worker.workers.dev/admin`
- If `ADMIN_PASSWORD` is set, browser will prompt for password using native HTTP Basic Auth
- If no password is set, admin panel is accessible without authentication

## How It Works

The admin panel uses simple HTTP Basic Authentication:
1. Browser shows native password prompt when accessing `/admin`
2. Password is checked against `ADMIN_PASSWORD` secret
3. On success, user can access the admin panel
4. No complex auth system - just simple password check stored in Dashboard secrets

## Important Notes

- The asset filenames include hashes (e.g., `index-D6ow2Um0.js`). After each rebuild, you need to:
  1. Upload the new files to the Assets KV
  2. Update the filenames in `src/index.ts` to match the new hash
- Or use a script to automate this process
