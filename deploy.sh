#!/bin/bash
set -euo pipefail

cleanup_generated_config() {
  rm -f wrangler.generated.toml
}
trap cleanup_generated_config EXIT

resolve_kv_namespace_id() {
  local namespace_name="$1"

  node - "$CLOUDFLARE_ACCOUNT_ID" "$CLOUDFLARE_API_TOKEN" "$namespace_name" <<'NODE'
const [accountId, apiToken, namespaceName] = process.argv.slice(2);
let page = 1;

(async () => {
  while (true) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = await response.json();

    if (!response.ok) {
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    const match = (body.result || []).find((namespace) => namespace.title === namespaceName);
    if (match) {
      process.stdout.write(match.id);
      return;
    }

    const resultInfo = body.result_info || {};
    if (!resultInfo.has_more) {
      console.error(`KV namespace not found: ${namespaceName}`);
      process.exit(1);
    }

    page += 1;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

generate_wrangler_config() {
  node - <<'NODE'
const fs = require('node:fs');

const bindings = [
  ['BOT_REGISTRY', process.env.BOT_REGISTRY_ID],
  ['SESSION_KV', process.env.SESSION_KV_ID],
  ['KEYS_KV', process.env.KEYS_KV_ID],
  ['SETTINGS_KV', process.env.SETTINGS_KV_ID],
];
const missing = bindings.filter(([, id]) => !id).map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing KV namespace IDs: ${missing.join(', ')}`);
  process.exit(1);
}

const source = fs.readFileSync('wrangler.toml', 'utf8');
const kvNamespaces = [
  'kv_namespaces = [',
  ...bindings.map(([binding, id]) => `  { binding = "${binding}", id = "${id}" },`),
  ']',
  '',
].join('\n');

if (source.includes('kv_namespaces = [')) {
  console.error('wrangler.toml already contains kv_namespaces; refusing to inject duplicates');
  process.exit(1);
}

fs.writeFileSync('wrangler.generated.toml', source.replace('\n[vars]\n', `\n${kvNamespaces}[vars]\n`));
NODE
}

echo "=== Installing root dependencies ==="
npm ci

echo "=== Building Admin UI ==="
npm run build:admin

echo "=== Typechecking Worker ==="
npm run typecheck

echo "=== Running Tests ==="
npm test

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to resolve existing KV namespaces." >&2
  exit 1
fi

echo "=== Resolving Existing KV Namespace IDs ==="
export BOT_REGISTRY_ID
export SESSION_KV_ID
export KEYS_KV_ID
export SETTINGS_KV_ID

BOT_REGISTRY_ID="$(resolve_kv_namespace_id BOT_REGISTRY)"
SESSION_KV_ID="$(resolve_kv_namespace_id SESSION_KV)"
KEYS_KV_ID="$(resolve_kv_namespace_id KEYS_KV)"
SETTINGS_KV_ID="$(resolve_kv_namespace_id SETTINGS_KV)"

generate_wrangler_config

echo "=== Deploying Worker with Static Assets ==="
npx wrangler deploy --config wrangler.generated.toml
rm wrangler.generated.toml

echo "=== Deployment Complete! ==="
echo "Admin panel available at: https://bots.vladimiruso.workers.dev/admin"
