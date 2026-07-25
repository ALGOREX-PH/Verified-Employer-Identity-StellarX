#!/usr/bin/env bash
# Deploy the employer-registry contract to Stellar testnet, initialise it with
# the DTI issuer as admin, then write the contract ID into web/.env.local.
#
# Prereqs: Rust + wasm32v1-none target, the Stellar CLI, and a configured
# issuer (run `npm run setup:issuer` in web/ first).
#
# Usage:  ./scripts/deploy.sh [identityName]   (default identity: workshop)
set -euo pipefail

IDENTITY="${1:-workshop}"
NETWORK="testnet"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM="target/wasm32v1-none/release/employer_registry.wasm"
ENV_FILE="$ROOT/web/.env.local"

cd "$ROOT"

# 0. The registry admin is the DTI issuer — created by `npm run setup:issuer`.
if [ ! -f "$ENV_FILE" ]; then
  echo "web/.env.local not found. Run 'npm run setup:issuer' in web/ first." >&2
  exit 1
fi
ISSUER="$(grep '^NEXT_PUBLIC_DTI_ISSUER=' "$ENV_FILE" | head -n1 | cut -d= -f2 | tr -d '[:space:]' || true)"
if [ -z "$ISSUER" ]; then
  echo "NEXT_PUBLIC_DTI_ISSUER missing from web/.env.local. Run 'npm run setup:issuer' in web/ first." >&2
  exit 1
fi

# 1. Ensure a funded testnet identity exists (pays the deploy fees)
if ! stellar keys ls | grep -qx "$IDENTITY"; then
  echo "Creating + funding testnet identity '$IDENTITY'..."
  stellar keys generate "$IDENTITY" --network "$NETWORK" --fund
fi

# 2. Build the contract to wasm
echo "Building contract..."
stellar contract build

# 3. Deploy to testnet (returns the contract ID, starting with C...)
echo "Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source-account "$IDENTITY" \
  --network "$NETWORK")
echo "Deployed contract ID: $CONTRACT_ID"

# 4. Initialise the registry with the DTI issuer as admin.
# A fresh deploy can never be legitimately AlreadyInitialized - if init fails,
# assume the contract id was front-run/hijacked and abort loudly (set -e).
echo "Initialising registry (admin = $ISSUER)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- init --admin "$ISSUER"

# 5. Write NEXT_PUBLIC_CONTRACT_ID into web/.env.local
grep -v '^NEXT_PUBLIC_CONTRACT_ID=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID" >> "$ENV_FILE"
echo ""
echo "Wrote NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID to web/.env.local"
echo "Restart 'npm run dev' to pick up the new contract ID."
