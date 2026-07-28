#!/usr/bin/env bash
# Prompts for a Dokploy API token and stores it at ~/.dokploy/token.
# Reusable across projects and sessions; re-run to rotate the token.
set -euo pipefail

mkdir -p "$HOME/.dokploy"
read -r -p "Dokploy API token: " token
if [ -z "$token" ]; then echo "Nothing entered, aborted."; exit 1; fi
printf '%s' "$token" > "$HOME/.dokploy/token"
echo "Token saved to $HOME/.dokploy/token (length ${#token})."
