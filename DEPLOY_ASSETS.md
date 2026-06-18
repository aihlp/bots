# Admin Assets Deployment Guide

The admin UI is built with Vite and produces hashed asset filenames. Since wrangler deployment wipes KV bindings configured in wrangler.toml, you need to upload assets **after** each deployment.

## Build and Deploy Process

### 1. Build the admin UI
```bash
npm run build:admin
```

This creates:
- `dist/admin/index.html`
- `dist/admin/assets/index-D6ow2Um0.js` (hash may change)
- `dist/admin/assets/index-BndC19cd.css` (hash may change)

### 2. Deploy the worker
```bash
npx wrangler deploy
```

### 3. Upload admin assets to KV (AFTER deployment)
```bash
# Upload JavaScript bundle
npx wrangler kv key put --binding=Assets "assets/index-D6ow2Um0.js" --path="./dist/admin/assets/index-D6ow2Um0.js"

# Upload CSS bundle  
npx wrangler kv key put --binding=Assets "assets/index-BndC19cd.css" --path="./dist/admin/assets/index-BndC19cd.css"
```

## Important Notes

1. **Asset filenames are hashed**: When you rebuild the admin UI, Vite may generate new hash values. Check the actual filenames in `dist/admin/assets/` and update the commands accordingly.

2. **HTML references must match**: The `index.html` served by the worker contains hardcoded references to the asset filenames. If Vite generates new hashes, you need to update `/src/index.ts` to reference the correct filenames.

3. **KV Binding Required**: Ensure the `Assets` KV namespace is bound to your worker in the Cloudflare Dashboard before uploading assets.

4. **Automation Option**: To automate this process, you can create a deploy script:

```bash
#!/bin/bash
# deploy.sh

# Build admin UI
npm run build:admin

# Get current asset filenames
JS_FILE=$(ls dist/admin/assets/*.js | head -1 | xargs basename)
CSS_FILE=$(ls dist/admin/assets/*.css | head -1 | xargs basename)

# Deploy worker
npx wrangler deploy

# Upload assets
npx wrangler kv key put --binding=Assets "assets/$JS_FILE" --path="./dist/admin/assets/$JS_FILE"
npx wrangler kv key put --binding=Assets "assets/$CSS_FILE" --path="./dist/admin/assets/$CSS_FILE"

echo "Deployment complete!"
```

## Troubleshooting

If you see 404 errors for assets:
1. Verify the Assets KV binding exists in Cloudflare Dashboard
2. Check that assets were uploaded with correct keys (include `assets/` prefix)
3. Verify the filenames in `/src/index.ts` HTML match the actual built files
