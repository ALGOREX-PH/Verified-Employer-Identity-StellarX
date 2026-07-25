# Lehitimo — Verified Employer Identity (design)

**Date:** 2026-07-25
**Idea:** #170 from the workshop 300-ideas list — *Verified Employer Identity*
**Base:** StellarX Workshop Template 2026 scaffold (Next.js 16 + stellar-sdk v15 + Freighter v6 frontend, soroban-sdk 22 contract workspace). Testnet only.

## Problem & product

Job scams are rampant in the Philippines; applicants have no easy way to check
that an employer is a legitimate, DTI-registered business. **Lehitimo**
("legitimate") gives DTI-certified businesses an on-chain credential that any
job applicant can check in seconds — *"Lehitimo — check before you apply."*

Three roles:

- **Employer** — applies for verification with their Freighter wallet.
- **DTI officer** — reviews applications, approves or revokes credentials.
- **Job applicant** — searches a business by name, sees a live VERIFIED /
  REVOKED / NOT FOUND badge. No wallet required.

## Why Stellar is central

The credential **is** a classic Stellar asset. Every lifecycle event is a
native ledger primitive, not app logic:

| Real-world event | On-chain form |
|---|---|
| Business applies | Employer signs **one tx**: `changeTrust(DTICERT, limit "1")` + `manageData("dti_name", name)` + `manageData("dti_cert", certNo)` |
| DTI approves | Issuer signs one tx: `setTrustLineFlags(authorized: true)` + `payment(1 DTICERT)` |
| Credential valid | Trustline `is_authorized` **and** balance ≥ 1, read live from Horizon |
| DTI revokes | Issuer signs `setTrustLineFlags(authorized: false)` — token frozen in place, badge dies instantly |
| Reinstate | Re-run approve (idempotent) |

A small Soroban **registry contract** (admin-written at approval time) makes
credentials *discoverable by business name*. Trust model: **the registry is the
index; the classic trustline is the truth.** The applicant view cross-checks
both, and on disagreement the classic ledger wins.

## On-chain design

### The DTICERT asset

- Code `DTICERT` (credit_alphanum12), issued by a dedicated testnet account
  created once by a setup script.
- Issuer flags: `AUTH_REQUIRED` (a new trustline starts unauthorized — that
  unauthorized trustline *is* the pending application) and `AUTH_REVOCABLE`
  (freeze = revocation). No clawback flag — freezing is sufficient and simpler.
- Trustline limit "1": an employer can hold at most one credential token.
- Approve is atomic (flags + payment in one tx), so `authorized && balance 0`
  never persists.

### Credential status derivation (single shared function)

| Trustline state | Status |
|---|---|
| No DTICERT trustline | NOT APPLIED / NOT FOUND |
| `is_authorized: false`, balance 0 | PENDING |
| `is_authorized: true`, balance ≥ 1 | VERIFIED |
| `is_authorized: false`, balance ≥ 1 | REVOKED |
| `is_authorized: true`, balance 0 | PENDING (transient edge; approve is atomic) |

### Registry contract — `contracts/employer-registry/`

Replaces `contracts/savings-goal/` in the Cargo workspace. soroban-sdk 22,
same style/optimization profile as the existing contract.

- `init(admin: Address)` — once; errors `AlreadyInitialized`. Admin is the
  DTI issuer account.
- `register(employer: Address, name: String, cert_no: String)` — admin-only
  (`admin.require_auth()`). Creates or overwrites the entry with status
  `Verified` (overwrite doubles as update + reinstate). Errors
  `NotInitialized`.
- `revoke(employer: Address)` — admin-only; sets status `Revoked`, entry
  remains so the directory can *warn* rather than forget. Errors `NotFound`.
- `get(employer: Address) -> Option<Entry>`; `list() -> Vec<Entry>` — free
  reads via simulation.
- `Entry { employer: Address, name: String, cert_no: String, status: Status }`,
  `Status { Verified, Revoked }`.
- Storage: admin + `Vec<Address>` index in instance storage; entries in
  persistent storage keyed by employer address. Writes extend TTL (same
  threshold/extend pattern as savings-goal). Scale target ≤ ~100 entries
  (workshop scale); no pagination.
- Publishes `register` / `revoke` events.
- Name search is client-side (case-insensitive substring over `list()`); the
  contract does no string matching and does not enforce name uniqueness.

## App structure (`web/`)

### Routes

- **`/`** — landing: pitch line, three role cards linking to the views below,
  short "how it works" strip.
- **`/employer`** — connect Freighter → Friendbot fund button (reused
  `FundAccount`) → status card showing their live credential status (from the
  status table above) → application form (business name, DTI cert no.) →
  one Freighter signature. Form validation: both fields non-empty, each ≤ 64
  bytes UTF-8 (manageData value limit).
- **`/verify`** — applicant view, no wallet: search box filtering the registry
  `list()`, result card with a large badge + business details + live-ledger
  cross-check + stellar.expert account link.
  Badge logic: VERIFIED iff registry `Verified` AND trustline VERIFIED;
  REVOKED if registry `Revoked` OR trustline REVOKED; otherwise NOT FOUND /
  NOT VERIFIED with an explanatory line.
- **`/dti`** — portal. Client-side Horizon read: accounts holding a DTICERT
  trustline (`accounts().forAsset(...)`), split into Pending / Verified /
  Revoked via the status function, with base64-decoded `dti_name` / `dti_cert`
  data entries shown per row. Approve / Revoke buttons call the API routes.
  The portal is **unauthenticated — demo-only**, stated in the UI footer.

### API routes (server-signed, the only server-side code)

- `POST /api/dti/approve` `{ employer }` —
  1. Server re-reads the employer's claimed `dti_name` / `dti_cert` from
     Horizon (single source of truth; request body carries only the address).
  2. Classic tx signed with the issuer secret:
     `setTrustLineFlags(authorized: true)` + `payment(1 DTICERT)` — the
     payment op is skipped if the employer already holds ≥ 1 (idempotence).
     Submitted via Horizon (synchronous result).
  3. Soroban `register(employer, name, cert_no)`: simulate → assemble → sign
     with issuer secret → send via RPC → poll to finality.
  4. If (3) fails after (2) succeeded, respond with a partial-failure error;
     the portal shows "credential issued, registry write failed — press
     Approve again" (safe because both steps are idempotent).
- `POST /api/dti/revoke` `{ employer }` — classic
  `setTrustLineFlags(authorized: false)`, then Soroban `revoke(employer)`.
  Same idempotence and partial-failure handling.
- Errors return `{ error: string }` with appropriate status codes.

### Environment (`web/.env.local`)

- `NEXT_PUBLIC_DTI_ISSUER` — issuer public key (client-visible; also used as
  the read-source account for simulations, replacing the hardcoded Circle
  account trick in the current `contract.ts`).
- `DTI_ISSUER_SECRET` — issuer secret, **server-only** (no `NEXT_PUBLIC`
  prefix). Testnet-only key; acceptable in `.env.local`, never committed.
- `NEXT_PUBLIC_CONTRACT_ID` — registry contract id (written by deploy script).
- Existing `NEXT_PUBLIC_SOROBAN_RPC` / `NEXT_PUBLIC_HORIZON_URL` defaults keep
  working. `NEXT_PUBLIC_USDC_ISSUER` is dropped.
- Missing-config UX mirrors today's savings-goal panel: `/employer`, `/verify`
  and `/dti` render setup instructions when issuer or contract id is unset.

### Lib layer

- Keep: `stellar.ts` (add issuer env exports, drop USDC), `sign.ts`,
  `useWallet.ts`. `payment.ts` is renamed to `submit.ts`, keeping
  `submitSignedXDR` + `pollTransaction`; the payment *builder* is removed.
- New: `credential.ts` (build the 3-op application tx; shared
  credential-status function over a Horizon account record),
  `registry.ts` (simulation reads `list`/`get`; admin invocation builders used
  by the API routes), `dti.ts` (Horizon accounts-for-asset query + data-entry
  decoding).
- Removed: `trustline.ts`, `contract.ts`, `balances.ts`, and components
  `SendPayment`, `AddTrustline`, `BalanceCard`, `SavingsGoal`. `FundAccount`
  and `ConnectWallet` are kept and reused.

## Scripts

- **`web/scripts/setup-issuer.mjs`** (new, Node, cross-platform; run as
  `npm run setup:issuer` from `web/`): generate keypair → Friendbot fund →
  `setOptions` with `AuthRequired | AuthRevocable` → write
  `NEXT_PUBLIC_DTI_ISSUER` + `DTI_ISSUER_SECRET` into `web/.env.local`.
  Refuses to overwrite an existing issuer unless `--force`.
- **`scripts/deploy.ps1` / `deploy.sh`** (retargeted): build + deploy
  `employer-registry`, then `invoke -- init --admin <NEXT_PUBLIC_DTI_ISSUER>`
  (read from `web/.env.local`; fail with a clear message if setup-issuer
  hasn't run), then write `NEXT_PUBLIC_CONTRACT_ID`. Setup order:
  `setup:issuer` → deploy → `npm run dev`.

## Demo arc (2–4 min, judge-facing)

1. Employer connects, funds, submits application — one signature.
2. `/dti` shows the pending application with claimed name + cert no.
3. Officer clicks Approve → trustline authorized + 1 DTICERT issued +
   registry write.
4. Applicant searches the business name on `/verify` → VERIFIED badge with
   live ledger proof.
5. Officer clicks Revoke → applicant refreshes → REVOKED warning. (The
   money shot: revocation is instant and needs no cooperation from the scammer.)

## Error handling

Scaffold patterns carry over unchanged: Freighter calls raced against a 3s
timeout; dynamic Freighter imports only; simulate before every Soroban send;
`sendTransaction` PENDING ≠ success — poll to finality; friendly messages for
unfunded accounts, rejected signatures, and missing config.

## Testing

- **Contract:** Rust unit tests mirroring the existing style — init/double-init,
  admin-auth enforcement via `mock_auths` (unauthorized register/revoke
  rejected), register + overwrite-updates + reinstate, revoke + `NotFound`,
  `list`/`get` correctness.
- **Web:** `npm run lint` and `npx tsc --noEmit` must pass.
- **E2E:** manual checklist in the README following the demo arc, run on
  testnet before submission.

## Non-goals

Mainnet, real DTI integration, portal authentication, SEP-1 `stellar.toml`
asset metadata, name-uniqueness enforcement, registry pagination, clawback,
i18n. Candidates for "future work" in the README, not this build.

## Docs to update

- `IDEA.md` filled in for idea #170 (track: Social Impact / Financial
  Inclusion angle, one-liner, Stellar-usage section, demo checklist).
- `README.md` rewritten around Lehitimo: story, setup order, demo script,
  troubleshooting. `CLAUDE.md` "where things live" table updated.
