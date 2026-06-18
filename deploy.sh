#!/bin/bash
set -e

echo "=== Building Admin UI ==="
npm run build:admin

echo "=== Deploying Worker with Static Assets ==="
npx wrangler deploy --remote

echo "=== Deployment Complete! ==="
echo "Admin panel available at: https://bots.vladimiruso.workers.dev/admin"
