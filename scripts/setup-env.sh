#!/usr/bin/env bash
# Creates .env for local dev by prompting for each secret. Safe to re-run:
# asks before overwriting. Portable to macOS bash 3.2.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

if [ -f .env ]; then
  read -r -p ".env already exists. Overwrite it? (y/N) " answer
  if [ "$answer" != "y" ]; then echo "Aborted, .env untouched."; exit 0; fi
fi

echo ""
echo "Family Memories local .env setup. Paste values at each prompt."
echo "(Input is raw: special characters are safe here.)"
echo ""

read -r -p "DATABASE_URL (Neon pooled connection string): " database_url
read -r -p "FAMILY_EMAILS (comma-separated allowlist): " family_emails
read -r -p "ZEPTOMAIL_TOKEN (raw Send Mail token, Enter to skip): " zepto_token
read -r -p "ZEPTOMAIL_FROM (verified From address, Enter to skip): " zepto_from

secret="$(head -c 32 /dev/urandom | base64)"

cat > .env <<EOF
DATABASE_URL=$database_url
BETTER_AUTH_SECRET=$secret
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
PASSKEY_RP_ID=localhost
PASSKEY_ORIGIN=http://localhost:3000
FAMILY_EMAILS=$family_emails
ZEPTOMAIL_TOKEN=$zepto_token
ZEPTOMAIL_FROM=$zepto_from
ZEPTOMAIL_BASE_URL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
EOF

echo ""
echo ".env written (BETTER_AUTH_SECRET generated automatically)."
echo "Next: run: pnpm db:migrate"
