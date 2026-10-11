#!/usr/bin/env bash
# Creates or completes .env for local dev. Prompts ONLY for keys that are
# still empty (Enter skips). Safe to re-run. Portable to macOS bash 3.2.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

source_file=".env"
if [ ! -f .env ]; then source_file=".env.example"; fi

keys=()
vals=()
while IFS= read -r line; do
  case "$line" in \#*|"") continue ;; esac
  key="${line%%=*}"
  val="${line#*=}"
  keys+=("$key")
  vals+=("$val")
done < "$source_file"

set_default() {
  local k="$1" d="$2" i
  for i in "${!keys[@]}"; do
    if [ "${keys[$i]}" = "$k" ] && [ -z "${vals[$i]}" ]; then vals[$i]="$d"; fi
  done
}
set_default BETTER_AUTH_URL "http://localhost:3000"
set_default NEXT_PUBLIC_BASE_URL "http://localhost:3000"
set_default PASSKEY_RP_ID "localhost"
set_default PASSKEY_ORIGIN "http://localhost:3000"

for i in "${!keys[@]}"; do
  if [ "${keys[$i]}" = "BETTER_AUTH_SECRET" ] && [ -z "${vals[$i]}" ]; then
    vals[$i]="$(head -c 32 /dev/urandom | base64)"
    echo "BETTER_AUTH_SECRET: generated"
  fi
done

set_default VAPID_SUBJECT "mailto:patr7257@gmail.com"
for i in "${!keys[@]}"; do
  if [ "${keys[$i]}" = "CRON_SECRET" ] && [ -z "${vals[$i]}" ]; then
    vals[$i]="$(head -c 32 /dev/urandom | base64)"
    echo "CRON_SECRET: generated"
  fi
done

echo ""
echo "Prompting for empty keys only. Enter skips (leaves empty)."
echo ""

for i in "${!keys[@]}"; do
  # PUSH_SEND is a prod-only switch; VAPID keys come from scripts/gen-vapid-keys.mjs.
  case "${keys[$i]}" in
    PUSH_SEND) continue ;;
    VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)
      [ -z "${vals[$i]}" ] && echo "${keys[$i]}: empty, run: node scripts/gen-vapid-keys.mjs"
      continue ;;
  esac
  if [ -z "${vals[$i]}" ]; then
    read -r -p "${keys[$i]} (Enter to skip): " answer
    if [ -n "$answer" ]; then vals[$i]="$answer"; fi
  else
    echo "${keys[$i]}: already set (length ${#vals[$i]})"
  fi
done

: > .env
for i in "${!keys[@]}"; do
  printf '%s=%s\n' "${keys[$i]}" "${vals[$i]}" >> .env
done
echo ""
echo ".env written"
