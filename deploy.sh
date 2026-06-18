#!/bin/bash
set -e

echo "=== Building Admin UI ==="
npm run build:admin

# Get current asset filenames
JS_FILE=$(ls dist/admin/assets/*.js | head -1 | xargs basename)
CSS_FILE=$(ls dist/admin/assets/*.css | head -1 | xargs basename)

echo "Found assets: $JS_FILE, $CSS_FILE"

echo "=== Deploying Worker ==="
npx wrangler deploy

echo "=== Uploading Assets to KV ==="
npx wrangler kv key put --binding=Assets "assets/$JS_FILE" --path="./dist/admin/assets/$JS_FILE"
npx wrangler kv key put --binding=Assets "assets/$CSS_FILE" --path="./dist/admin/assets/$CSS_FILE"

echo "=== Deployment Complete! ==="
echo "Admin panel available at: https://bots.vladimiruso.workers.dev/admin"
