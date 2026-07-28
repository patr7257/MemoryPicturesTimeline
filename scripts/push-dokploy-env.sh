#!/usr/bin/env bash
# Pushes PRODUCTION env vars for the memories app to Dokploy via its API.
# Reads secrets from the local .env and the token from ~/.dokploy/token.
# Generates a fresh BETTER_AUTH_SECRET for prod. Portable to macOS bash 3.2.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

APPLICATION_ID="aO-snDweznAl5O7zsPhHc"
DOKPLOY_BASE="https://deploy.patrickrobel.dk/api"

[ -f .env ] || { echo "No .env; run scripts/setup-env.sh first."; exit 1; }
[ -f "$HOME/.dokploy/token" ] || { echo "No token; run scripts/save-dokploy-token.sh first."; exit 1; }

get_val() { grep "^$1=" .env | head -n1 | cut -d= -f2-; }

prod_secret="$(head -c 32 /dev/urandom | base64)"
env_block="BETTER_AUTH_SECRET=$prod_secret
BETTER_AUTH_URL=https://memories.patrickrobel.dk
NEXT_PUBLIC_BASE_URL=https://memories.patrickrobel.dk
PASSKEY_RP_ID=patrickrobel.dk
PASSKEY_ORIGIN=https://memories.patrickrobel.dk"
for k in DATABASE_URL FAMILY_EMAILS ZEPTOMAIL_TOKEN ZEPTOMAIL_FROM ZEPTOMAIL_BASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  v="$(get_val "$k" || true)"
  env_block="$env_block
$k=$v"
  echo "$k: length ${#v}"
done

token="$(cat "$HOME/.dokploy/token")"
payload="$(node -e 'const [app, env] = process.argv.slice(1); process.stdout.write(JSON.stringify({applicationId: app, env, buildArgs: null, buildSecrets: null, createEnvFile: false}))' "$APPLICATION_ID" "$env_block")"
curl -sf -X POST "$DOKPLOY_BASE/application.saveEnvironment" -H "x-api-key: $token" -H "Content-Type: application/json" -d "$payload" > /dev/null
echo ""
echo "Production env pushed to Dokploy app $APPLICATION_ID."
