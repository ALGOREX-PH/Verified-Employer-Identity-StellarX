# Lehitimo — project notes for AI tools

Verified Employer Identity on Stellar testnet (StellarX workshop idea #170).
Two parts:

- `web/` — Next.js 16 + TypeScript + Tailwind v4 frontend. Routes: `/`
  (landing), `/employer` (Freighter application flow), `/verify` (applicant
  search, no wallet), `/dti` (portal; approve/revoke via server-signed API
  routes using `DTI_ISSUER_SECRET` from `web/.env.local`).
- `contracts/employer-registry/` — Rust Soroban registry
  (`init` / `register` / `revoke` / `get` / `list`) with unit tests. Admin is
  the DTI issuer account. The registry is the index; the classic DTICERT
  trustline is the truth.

## Stack / versions

- `@stellar/stellar-sdk` v15 — use the `rpc` namespace (NOT the old `SorobanRpc`).
- `@stellar/freighter-api` v6 — `signTransaction` returns `{ signedTxXdr, signerAddress }`.
- `soroban-sdk` 22; build target `wasm32v1-none` via `stellar contract build`.
- Network: **testnet** only.

## Testnet reference

| Resource | Value |
|---|---|
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Horizon | `https://horizon-testnet.stellar.org` |
| Friendbot | `https://friendbot.stellar.org?addr=YOUR_KEY` |
| Network passphrase | `Test SDF Network ; September 2015` |
| Explorer | `https://stellar.expert/explorer/testnet` |

## Stellar gotchas (these waste the most time)

1. Use the `rpc` namespace, NOT `SorobanRpc` (v15 SDK).
2. Always **simulate** a Soroban tx before sending (`server.simulateTransaction` → `rpc.assembleTransaction`).
3. `sendTransaction` returning PENDING is NOT success — poll `getTransaction` every 1s for up to 60s.
4. Network passphrase: use `Networks.TESTNET`, never a hardcoded string (wrong one → misleading `tx_bad_auth`).
5. Freighter: **dynamic import only** (`await import('@stellar/freighter-api')`) — static import breaks SSR.
6. Freighter v6: `signTransaction` returns an object → read `.signedTxXdr`.
7. Wrap Freighter calls with a timeout — they can hang if the extension is missing.
8. Trustlines are required before an account can receive a non-native asset (e.g. USDC).
9. Use Soroban RPC for contract calls; use Horizon for balances/history.
10. Soroban i128 args: pass `nativeToScVal(BigInt(x), { type: 'i128' })`.

## Where things live

- Stellar config + Friendbot: `web/src/lib/stellar.ts`
- Credential (DTICERT) status + application tx: `web/src/lib/credential.ts`
- Registry reads + admin invokes: `web/src/lib/registry.ts`
- DTI applications query (Horizon): `web/src/lib/dti.ts`
- Submit/poll: `web/src/lib/submit.ts`; Freighter sign helper: `web/src/lib/sign.ts`
- Wallet hook: `web/src/hooks/useWallet.ts`
- API routes (issuer-signed): `web/src/app/api/dti/approve/route.ts`, `.../revoke/route.ts`
- API helpers (validation/rate-limit/logging): `web/src/lib/api.ts`
- Design tokens + fonts: `web/src/app/globals.css` (@theme), `web/src/app/layout.tsx`
- Seal (verdict stamp): `web/src/components/Seal.tsx`
- UI: `web/src/app/{page,employer,verify,dti}` + `web/src/components/*`
- Contract: `contracts/employer-registry/src/lib.rs` (+ `test.rs`)
- Unit tests: `web/src/lib/__tests__/` (`npm test`)
- Issuer setup: `web/scripts/setup-issuer.mjs`; E2E: `web/scripts/e2e-testnet.mjs`
- Deploy: `scripts/deploy.ps1` (Windows) / `scripts/deploy.sh`
