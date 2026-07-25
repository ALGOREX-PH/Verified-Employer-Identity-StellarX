# Lehitimo — Verified Employer Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Lehitimo — job applicants verify DTI-certified employers via a DTICERT classic-asset credential, with a Soroban name registry, on Stellar testnet.

**Architecture:** The credential is a classic asset from an `AUTH_REQUIRED`+`AUTH_REVOCABLE` issuer: an employer's trustline is the application (with claimed metadata in `manageData` entries), issuer authorization + 1 DTICERT is the credential, freezing is revocation. A small admin-only Soroban registry makes credentials searchable by business name; the classic ledger always wins on disagreement. Next.js frontend: `/employer` (Freighter), `/verify` (no wallet), `/dti` (server-signed API routes holding the issuer secret).

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, `@stellar/stellar-sdk` v15, `@stellar/freighter-api` v6, soroban-sdk 22 (Rust).

**Spec:** `docs/superpowers/specs/2026-07-25-verified-employer-identity-design.md`

## Global Constraints

- Testnet only. Network passphrase ALWAYS `Networks.TESTNET` (the SDK constant), never a hardcoded string.
- stellar-sdk v15: use the `rpc` namespace (the old `SorobanRpc` namespace is gone). No new npm dependencies.
- Freighter v6: dynamic `await import('@stellar/freighter-api')` only (static import breaks SSR); `signTransaction` returns an object — read `.signedTxXdr`.
- Soroban sends: always simulate → `rpc.assembleTransaction` → sign → send → poll (`sendTransaction` PENDING is NOT success).
- Credential asset code is exactly `DTICERT`. Data-entry keys are exactly `dti_name` and `dti_cert`. manageData values ≤ 64 bytes.
- Env vars: `NEXT_PUBLIC_DTI_ISSUER` (public), `DTI_ISSUER_SECRET` (server-only, NO `NEXT_PUBLIC` prefix), `NEXT_PUBLIC_CONTRACT_ID`. `.env.local` is never committed (covered by `web/.gitignore`).
- Contract: soroban-sdk 22, `#![no_std]`, workspace member under `contracts/`, built with `stellar contract build` (target `wasm32v1-none`). Extend TTLs `(1000, 5000)` on every write, matching the old savings-goal style.
- Web verification gate for EVERY web task: from `web/` both `npx tsc --noEmit` and `npm run lint` pass.
- No JS test framework. UI follows the existing Tailwind idiom: `bg-gray-50` page, white bordered cards, indigo primary buttons.
- All `npm`/`npx` commands run from `web/`; `cargo` commands run from the repo root.
- Every commit message ends with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `contracts/employer-registry/Cargo.toml`, `src/lib.rs`, `src/test.rs` | Registry contract (init/register/revoke/get/list) + tests |
| Delete | `contracts/savings-goal/` | Replaced by employer-registry |
| Modify | `web/src/lib/stellar.ts` | Config hub: DTI issuer, DTICERT, configured() helpers |
| Rename | `web/src/lib/payment.ts` → `web/src/lib/submit.ts` | Keep `submitSignedXDR`+`pollTransaction`; drop payment builder |
| Modify | `web/src/lib/sign.ts` | Import path `./payment` → `./submit` |
| Create | `web/src/lib/credential.ts` | Status derivation, data-entry decode, application tx builder |
| Create | `web/src/lib/registry.ts` | Registry simulation reads + server-side admin invokes |
| Create | `web/src/lib/dti.ts` | Horizon accounts-for-asset query → applications list |
| Delete | `web/src/lib/balances.ts`, `trustline.ts`, `contract.ts` | Old demo libs |
| Delete | `web/src/components/SendPayment.tsx`, `AddTrustline.tsx`, `BalanceCard.tsx`, `SavingsGoal.tsx` | Old demo UI |
| Keep | `web/src/components/ConnectWallet.tsx`, `FundAccount.tsx`, `web/src/hooks/useWallet.ts` | Reused as-is |
| Create | `web/src/components/PageShell.tsx`, `StatusBadge.tsx`, `SetupNotice.tsx` | Shared UI |
| Modify | `web/src/app/layout.tsx` | Lehitimo metadata + top nav |
| Modify | `web/src/app/page.tsx` | Landing page (role cards) |
| Create | `web/src/app/employer/page.tsx`, `web/src/components/employer/EmployerPanel.tsx`, `ApplicationForm.tsx` | Employer flow |
| Create | `web/src/app/verify/page.tsx`, `web/src/components/verify/VerifySearch.tsx`, `ResultCard.tsx` | Applicant flow |
| Create | `web/src/app/dti/page.tsx`, `web/src/components/dti/ApplicationsTable.tsx` | DTI portal |
| Create | `web/src/app/api/dti/approve/route.ts`, `web/src/app/api/dti/revoke/route.ts` | Server-signed issuer actions |
| Create | `web/scripts/setup-issuer.mjs`, `web/scripts/e2e-testnet.mjs` | Issuer bootstrap; automated testnet arc check |
| Modify | `web/package.json` | `setup:issuer` + `e2e:testnet` scripts |
| Modify | `scripts/deploy.ps1`, `scripts/deploy.sh` | Retarget to employer-registry, `init --admin <issuer>` |
| Modify | `README.md`, `IDEA.md`, `CLAUDE.md` | Lehitimo docs |

---

### Task 1: Registry contract scaffold — types + `init` + `get` (replaces savings-goal)

**Files:**
- Delete: `contracts/savings-goal/` (entire directory)
- Create: `contracts/employer-registry/Cargo.toml`
- Create: `contracts/employer-registry/src/lib.rs`
- Create: `contracts/employer-registry/src/test.rs`

**Interfaces:**
- Produces (used by Task 2 and the frontend): types `Entry { employer: Address, name: String, cert_no: String, status: Status }`, `Status { Verified, Revoked }`, `Error { AlreadyInitialized = 1, NotInitialized = 2, NotFound = 3 }`, `DataKey { Admin, Index, Entry(Address) }`; functions `init(env, admin: Address) -> Result<(), Error>`, `get(env, employer: Address) -> Option<Entry>`.

- [ ] **Step 1: Delete the old contract and create the new package**

```powershell
git rm -r contracts/savings-goal
New-Item -ItemType Directory -Force contracts\employer-registry\src
```

Create `contracts/employer-registry/Cargo.toml`:

```toml
[package]
name = "employer-registry"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib"]
doctest = false

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
```

(The root `Cargo.toml` workspace uses `members = ["contracts/*"]` — no change needed.)

- [ ] **Step 2: Write the failing tests**

Create `contracts/employer-registry/src/test.rs`:

```rust
#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup(env: &Env) -> (EmployerRegistryContractClient<'_>, Address) {
    let contract_id = env.register(EmployerRegistryContract, ());
    let client = EmployerRegistryContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.init(&admin);
    (client, admin)
}

fn s(env: &Env, v: &str) -> String {
    String::from_str(env, v)
}

#[test]
fn init_once_then_double_init_fails() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let other = Address::generate(&env);
    assert_eq!(client.try_init(&other), Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn get_unknown_employer_is_none() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    assert_eq!(client.get(&Address::generate(&env)), None);
}
```

(The `s` helper is unused until Task 2 — that is fine; `#[allow(dead_code)]` is not needed in test modules.)

- [ ] **Step 3: Run tests to verify they fail**

Run from repo root: `cargo test`
Expected: FAIL to compile — `EmployerRegistryContract` not found.

- [ ] **Step 4: Write the contract skeleton**

Create `contracts/employer-registry/src/lib.rs`:

```rust
#![no_std]
//! Employer Registry — the searchable index for Lehitimo's DTICERT credential.
//!
//! The registry is the *index*; the classic DTICERT trustline is the *truth*.
//! Only the admin (the DTI issuer account) can write. Entries are kept on
//! revocation (status flips to `Revoked`) so the directory can warn applicants
//! instead of forgetting a scammer.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec,
};

const TTL_THRESHOLD: u32 = 1000;
const TTL_EXTEND: u32 = 5000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Status {
    Verified,
    Revoked,
}

/// One verified (or since-revoked) business, returned to the frontend.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entry {
    pub employer: Address,
    pub name: String,
    pub cert_no: String,
    pub status: Status,
}

/// Storage layout: admin + address index in instance storage, one persistent
/// entry per employer address.
#[contracttype]
pub enum DataKey {
    Admin,
    Index,
    Entry(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotFound = 3,
}

#[contract]
pub struct EmployerRegistryContract;

#[contractimpl]
impl EmployerRegistryContract {
    /// Set the admin (the DTI issuer account). Can only be called once.
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Index, &Vec::<Address>::new(&env));
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    /// Read one business by employer address.
    pub fn get(env: Env, employer: Address) -> Option<Entry> {
        env.storage().persistent().get(&DataKey::Entry(employer))
    }
}

mod test;
```

(`symbol_short` is imported now and used by Task 2's events; the unused-import warning until then is acceptable — or expect it and move on.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```powershell
git add -A contracts Cargo.toml
git commit -m "feat(contract): scaffold employer-registry with init/get, replace savings-goal

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Registry contract — `register` / `revoke` / `list` with admin auth

**Files:**
- Modify: `contracts/employer-registry/src/lib.rs`
- Modify: `contracts/employer-registry/src/test.rs`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (invoked from the frontend/API): `register(env, employer: Address, name: String, cert_no: String) -> Result<(), Error>` (admin `require_auth`; creates or overwrites with status `Verified`), `revoke(env, employer: Address) -> Result<(), Error>` (admin auth; flips status to `Revoked`, errors `NotFound`), `list(env) -> Vec<Entry>`.

- [ ] **Step 1: Write the failing tests**

Append to `contracts/employer-registry/src/test.rs`:

```rust
#[test]
fn register_before_init_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(EmployerRegistryContract, ());
    let client = EmployerRegistryContractClient::new(&env, &contract_id);
    let employer = Address::generate(&env);
    assert_eq!(
        client.try_register(&employer, &s(&env, "Acme"), &s(&env, "1234")),
        Err(Ok(Error::NotInitialized))
    );
}

#[test]
fn register_creates_verified_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);

    client.register(&employer, &s(&env, "Acme Manpower"), &s(&env, "6171234"));

    let entry = client.get(&employer).unwrap();
    assert_eq!(entry.employer, employer);
    assert_eq!(entry.name, s(&env, "Acme Manpower"));
    assert_eq!(entry.cert_no, s(&env, "6171234"));
    assert_eq!(entry.status, Status::Verified);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn revoke_marks_entry_and_keeps_it_listed() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    client.register(&employer, &s(&env, "Acme"), &s(&env, "1234"));

    client.revoke(&employer);

    assert_eq!(client.get(&employer).unwrap().status, Status::Revoked);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn revoke_unknown_employer_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    assert_eq!(
        client.try_revoke(&Address::generate(&env)),
        Err(Ok(Error::NotFound))
    );
}

#[test]
fn re_register_updates_and_reinstates_without_duplicates() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    client.register(&employer, &s(&env, "Old Name"), &s(&env, "1111"));
    client.revoke(&employer);

    client.register(&employer, &s(&env, "New Name"), &s(&env, "2222"));

    let entry = client.get(&employer).unwrap();
    assert_eq!(entry.name, s(&env, "New Name"));
    assert_eq!(entry.cert_no, s(&env, "2222"));
    assert_eq!(entry.status, Status::Verified);
    assert_eq!(client.list().len(), 1);
}

#[test]
fn writes_require_auth() {
    let env = Env::default(); // NOTE: no mock_all_auths
    let (client, _admin) = setup(&env);
    let employer = Address::generate(&env);
    assert!(client
        .try_register(&employer, &s(&env, "Acme"), &s(&env, "1234"))
        .is_err());
    assert!(client.try_revoke(&employer).is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test`
Expected: FAIL to compile — no method `register` / `try_register` on the client.

- [ ] **Step 3: Implement register / revoke / list**

Add inside `impl EmployerRegistryContract` in `lib.rs` (before `get`):

```rust
    /// Create or overwrite a business entry with status `Verified`.
    /// Admin-only. Overwriting doubles as "update details" and "reinstate".
    pub fn register(
        env: Env,
        employer: Address,
        name: String,
        cert_no: String,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Entry(employer.clone());
        if !env.storage().persistent().has(&key) {
            let mut index: Vec<Address> = env
                .storage()
                .instance()
                .get(&DataKey::Index)
                .unwrap_or(Vec::new(&env));
            index.push_back(employer.clone());
            env.storage().instance().set(&DataKey::Index, &index);
        }
        let entry = Entry {
            employer: employer.clone(),
            name,
            cert_no,
            status: Status::Verified,
        };
        env.storage().persistent().set(&key, &entry);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events()
            .publish((symbol_short!("register"), employer), ());
        Ok(())
    }

    /// Flip a business to `Revoked` (kept listed so the directory can warn).
    /// Admin-only.
    pub fn revoke(env: Env, employer: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let key = DataKey::Entry(employer.clone());
        let mut entry: Entry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NotFound)?;
        entry.status = Status::Revoked;
        env.storage().persistent().set(&key, &entry);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events().publish((symbol_short!("revoke"), employer), ());
        Ok(())
    }

    /// Every business ever registered (Verified and Revoked alike).
    pub fn list(env: Env) -> Vec<Entry> {
        let index: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::Index)
            .unwrap_or(Vec::new(&env));
        let mut out = Vec::new(&env);
        for addr in index.iter() {
            if let Some(entry) = env.storage().persistent().get(&DataKey::Entry(addr)) {
                out.push_back(entry);
            }
        }
        out
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test`
Expected: 8 passed (2 from Task 1 + 6 new).

- [ ] **Step 5: Commit**

```powershell
git add contracts/employer-registry
git commit -m "feat(contract): register/revoke/get/list with admin auth

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Reshape the web shell — strip the payments demo, add landing + nav + shared UI

**Files:**
- Modify: `web/src/lib/stellar.ts`
- Rename: `web/src/lib/payment.ts` → `web/src/lib/submit.ts` (drop the payment builder)
- Modify: `web/src/lib/sign.ts` (import path only)
- Delete: `web/src/lib/balances.ts`, `web/src/lib/trustline.ts`, `web/src/lib/contract.ts`
- Delete: `web/src/components/SendPayment.tsx`, `AddTrustline.tsx`, `BalanceCard.tsx`, `SavingsGoal.tsx`
- Modify: `web/src/app/layout.tsx`, `web/src/app/page.tsx`
- Create: `web/src/components/PageShell.tsx`, `web/src/components/StatusBadge.tsx`, `web/src/components/SetupNotice.tsx`

**Interfaces:**
- Produces: `stellar.ts` exports `NETWORK_PASSPHRASE`, `RPC_URL`, `HORIZON_URL`, `DTI_ISSUER: string`, `CONTRACT_ID: string`, `CREDENTIAL_CODE = 'DTICERT'`, `server: rpc.Server`, `issuerConfigured(): boolean`, `contractConfigured(): boolean`, `fundTestnetAccount(publicKey: string): Promise<void>`. `submit.ts` exports `submitSignedXDR(signedXdr: string): Promise<string>`, `pollTransaction(hash: string): Promise<void>`. `sign.ts` still exports `signAndSubmit(xdr: string, address: string): Promise<string>`. Components: `PageShell({ title?, children })`, `StatusBadge({ kind: BadgeKind, label? })` with `export type BadgeKind = 'verified' | 'pending' | 'revoked' | 'none'`, `SetupNotice({ missing: 'issuer' | 'contract' })`.

- [ ] **Step 1: Install dependencies (first web task)**

Run from `web/`: `npm install`
Expected: completes without errors; `node_modules/` present.

- [ ] **Step 2: Delete old demo files and rename payment.ts**

```powershell
git rm web/src/lib/balances.ts web/src/lib/trustline.ts web/src/lib/contract.ts
git rm web/src/components/SendPayment.tsx web/src/components/AddTrustline.tsx web/src/components/BalanceCard.tsx web/src/components/SavingsGoal.tsx
git mv web/src/lib/payment.ts web/src/lib/submit.ts
```

- [ ] **Step 3: Rewrite `web/src/lib/stellar.ts`**

```ts
import { rpc, Networks } from '@stellar/stellar-sdk';

// Network passphrase comes from the SDK constant, NOT a hardcoded string —
// a wrong passphrase shows up as a misleading `tx_bad_auth` error.
export const NETWORK_PASSPHRASE = Networks.TESTNET;

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC ?? 'https://soroban-testnet.stellar.org';
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

// The DTI issuer account — the identity behind the DTICERT credential.
// Created by `npm run setup:issuer`.
export const DTI_ISSUER = process.env.NEXT_PUBLIC_DTI_ISSUER ?? '';
// The employer-registry Soroban contract (written by scripts/deploy.*).
export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';

export const CREDENTIAL_CODE = 'DTICERT';

// v15 SDK: use the `rpc` namespace (the old `SorobanRpc` namespace is gone).
export const server = new rpc.Server(RPC_URL);

export function issuerConfigured(): boolean {
  return Boolean(DTI_ISSUER);
}

export function contractConfigured(): boolean {
  return Boolean(CONTRACT_ID);
}

/** Fund a testnet account via Friendbot (~10,000 XLM). */
export async function fundTestnetAccount(publicKey: string): Promise<void> {
  const res = await fetch(
    `https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`,
  );
  // 400 usually means "account already funded" — not a real failure for our flow.
  if (!res.ok && res.status !== 400) {
    throw new Error('Friendbot funding failed. Try again in a moment.');
  }
}
```

- [ ] **Step 4: Trim `web/src/lib/submit.ts` to submit + poll only**

Replace the whole file with:

```ts
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { server, NETWORK_PASSPHRASE } from './stellar';

/** Submit a signed XDR via Soroban RPC. Returns the transaction hash. */
export async function submitSignedXDR(signedXdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const res = await server.sendTransaction(tx);
  if (res.status === 'ERROR') {
    throw new Error(`Submit rejected: ${JSON.stringify(res.errorResult ?? res)}`);
  }
  return res.hash;
}

/**
 * Poll until the transaction reaches finality.
 * `sendTransaction` returning PENDING is NOT success — you must poll.
 */
export async function pollTransaction(hash: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await server.getTransaction(hash);
    if (res.status !== 'NOT_FOUND') {
      if (res.status === 'SUCCESS') return;
      throw new Error(`Transaction ${res.status}`);
    }
  }
  throw new Error('Transaction timed out after 60s');
}
```

In `web/src/lib/sign.ts`, change the import line
`import { submitSignedXDR, pollTransaction } from './payment';`
to
`import { submitSignedXDR, pollTransaction } from './submit';`
(no other changes).

- [ ] **Step 5: Create the three shared components**

`web/src/components/PageShell.tsx`:

```tsx
export default function PageShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen w-full bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {title && <h1 className="mb-6 text-2xl font-bold text-gray-900">{title}</h1>}
        {children}
      </div>
    </main>
  );
}
```

`web/src/components/StatusBadge.tsx`:

```tsx
export type BadgeKind = 'verified' | 'pending' | 'revoked' | 'none';

const STYLES: Record<BadgeKind, string> = {
  verified: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  pending: 'border-amber-300 bg-amber-100 text-amber-800',
  revoked: 'border-red-300 bg-red-100 text-red-800',
  none: 'border-gray-300 bg-gray-100 text-gray-600',
};

const DEFAULT_LABEL: Record<BadgeKind, string> = {
  verified: 'VERIFIED',
  pending: 'PENDING',
  revoked: 'REVOKED',
  none: 'NOT FOUND',
};

export default function StatusBadge({
  kind,
  label,
}: {
  kind: BadgeKind;
  label?: string;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-xs font-semibold tracking-wide ${STYLES[kind]}`}
    >
      {label ?? DEFAULT_LABEL[kind]}
    </span>
  );
}
```

`web/src/components/SetupNotice.tsx`:

```tsx
export default function SetupNotice({ missing }: { missing: 'issuer' | 'contract' }) {
  const cmd =
    missing === 'issuer'
      ? 'cd web && npm run setup:issuer'
      : '.\\scripts\\deploy.ps1   (macOS/Linux: ./scripts/deploy.sh)';
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6">
      <h2 className="text-lg font-semibold text-gray-900">Setup needed</h2>
      <p className="mt-2 text-sm text-gray-600">
        {missing === 'issuer'
          ? 'The DTI issuer account is not configured yet. Create it with:'
          : 'The employer registry contract is not deployed yet. Deploy it with:'}
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{cmd}</pre>
      <p className="mt-2 text-xs text-gray-500">
        Then restart <code>npm run dev</code> so the new <code>.env.local</code> is
        picked up.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `web/src/app/layout.tsx` (brand + nav)**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lehitimo — Verified Employer Identity",
  description:
    "Check before you apply: DTI-verified employer credentials on Stellar testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-bold text-indigo-700">
              Lehitimo
            </Link>
            <div className="flex gap-4 text-sm text-gray-600">
              <Link href="/employer" className="hover:text-indigo-700">
                Employers
              </Link>
              <Link href="/verify" className="hover:text-indigo-700">
                Verify
              </Link>
              <Link href="/dti" className="hover:text-indigo-700">
                DTI Portal
              </Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Rewrite `web/src/app/page.tsx` (landing)**

```tsx
import Link from 'next/link';

const ROLES = [
  {
    href: '/employer',
    title: 'For Employers',
    desc: 'Apply for your DTI verification credential — one wallet signature.',
    cta: 'Get verified',
  },
  {
    href: '/verify',
    title: 'For Job Applicants',
    desc: 'Search a business by name and see live, on-chain proof it is legitimate.',
    cta: 'Check an employer',
  },
  {
    href: '/dti',
    title: 'DTI Portal',
    desc: 'Review applications, issue credentials, revoke scammers instantly.',
    cta: 'Open portal',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-indigo-700">Lehitimo</h1>
          <p className="mt-3 text-lg text-gray-700">Check before you apply.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-500">
            Job scams are rampant. Lehitimo gives DTI-certified businesses an
            on-chain credential any applicant can verify in seconds — live on
            the Stellar ledger, revocable the moment a scam is found.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {ROLES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="rounded border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <h2 className="font-semibold text-gray-900">{r.title}</h2>
              <p className="mt-1 text-sm text-gray-600">{r.desc}</p>
              <p className="mt-3 text-sm font-medium text-indigo-600">{r.cta} →</p>
            </Link>
          ))}
        </div>

        <ol className="mt-12 grid gap-4 text-sm text-gray-600 sm:grid-cols-3">
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">1 · Apply</span>
            <br />
            An employer&rsquo;s trustline to the DTICERT asset is the application
            itself.
          </li>
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">2 · Approve</span>
            <br />
            DTI authorizes the trustline and issues 1 DTICERT — the credential.
          </li>
          <li className="rounded border border-gray-200 bg-white p-4">
            <span className="font-semibold text-gray-900">3 · Verify</span>
            <br />
            Applicants check the live ledger — revoked means the badge dies
            instantly.
          </li>
        </ol>

        <footer className="mt-12 text-center text-xs text-gray-400">
          Stellar testnet · built on the StellarX workshop scaffold
        </footer>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all pass. (The build works with no `.env.local` — later pages guard on `issuerConfigured()`.)

- [ ] **Step 9: Commit**

```powershell
git add -A web
git commit -m "feat(web): reshape shell for Lehitimo - strip payments demo, add landing + nav + shared UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: DTI issuer setup script

**Files:**
- Create: `web/scripts/setup-issuer.mjs`
- Modify: `web/package.json` (add the `setup:issuer` script)

**Interfaces:**
- Produces: `web/.env.local` containing `NEXT_PUBLIC_DTI_ISSUER=G...` and `DTI_ISSUER_SECRET=S...`; the issuer account exists on testnet with `auth_required` + `auth_revocable` flags. Tasks 5–13 consume these env vars.

- [ ] **Step 1: Write `web/scripts/setup-issuer.mjs`**

```js
#!/usr/bin/env node
// One-time DTI issuer bootstrap (testnet): generate a keypair, fund it via
// Friendbot, set AUTH_REQUIRED + AUTH_REVOCABLE, and write the keys into
// web/.env.local. Refuses to replace an existing issuer without --force.
import {
  AuthRequiredFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(webDir, '.env.local');
const force = process.argv.includes('--force');

const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
if (/^NEXT_PUBLIC_DTI_ISSUER=/m.test(existing) && !force) {
  console.error(
    'An issuer is already configured in web/.env.local. Re-run with --force to replace it.',
  );
  process.exit(1);
}

const kp = Keypair.random();
console.log('Issuer public key:', kp.publicKey());

console.log('Funding via Friendbot...');
const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
if (!res.ok) {
  console.error('Friendbot funding failed with HTTP', res.status);
  process.exit(1);
}

console.log('Setting AUTH_REQUIRED + AUTH_REVOCABLE...');
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
const account = await horizon.loadAccount(kp.publicKey());
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.setOptions({ setFlags: AuthRequiredFlag | AuthRevocableFlag }))
  .setTimeout(60)
  .build();
tx.sign(kp);
await horizon.submitTransaction(tx);

const lines = existing
  .split(/\r?\n/)
  .filter(
    (l) =>
      l &&
      !l.startsWith('NEXT_PUBLIC_DTI_ISSUER=') &&
      !l.startsWith('DTI_ISSUER_SECRET='),
  );
lines.push(`NEXT_PUBLIC_DTI_ISSUER=${kp.publicKey()}`);
lines.push(`DTI_ISSUER_SECRET=${kp.secret()}`);
writeFileSync(envPath, lines.join('\n') + '\n');

console.log('Wrote issuer keys to web/.env.local');
console.log('Next: deploy the registry (scripts/deploy.ps1) and restart npm run dev.');
```

- [ ] **Step 2: Add the npm script**

In `web/package.json` `"scripts"`, add:

```json
"setup:issuer": "node scripts/setup-issuer.mjs"
```

- [ ] **Step 3: Run it for real**

Run from `web/`: `npm run setup:issuer`
Expected output: issuer public key printed, "Wrote issuer keys to web/.env.local".

- [ ] **Step 4: Verify the flags on-chain and that the secret stays untracked**

Run (Git Bash), substituting the printed key:
`curl -s "https://horizon-testnet.stellar.org/accounts/GXXXX" | grep -E 'auth_required|auth_revocable'`
Expected: both `true`.
Run: `git status --short`
Expected: `web/.env.local` does NOT appear (ignored by `web/.gitignore`'s `.env*` rule).

- [ ] **Step 5: Re-run guard check**

Run: `npm run setup:issuer`
Expected: exits with the "already configured … --force" message and does not change `.env.local`.

- [ ] **Step 6: Commit**

```powershell
git add web/scripts/setup-issuer.mjs web/package.json
git commit -m "feat(web): DTI issuer setup script (setup:issuer)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Retarget deploy scripts to employer-registry and deploy for real

**Files:**
- Modify: `scripts/deploy.ps1`
- Modify: `scripts/deploy.sh`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_DTI_ISSUER` from `web/.env.local` (Task 4); the contract crate (Tasks 1–2).
- Produces: a deployed + initialised registry on testnet; `NEXT_PUBLIC_CONTRACT_ID=C...` appended to `web/.env.local`.

- [ ] **Step 1: Rewrite `scripts/deploy.ps1`**

```powershell
# Deploy the employer-registry contract to Stellar testnet, initialise it with
# the DTI issuer as admin, then write the contract ID into web\.env.local.
#
# Prereqs: Rust + wasm32v1-none target, the Stellar CLI, and a configured
# issuer (run `npm run setup:issuer` in web\ first).
#
# Usage:  .\scripts\deploy.ps1 [identityName]   (default identity: workshop)

param([string]$Identity = "workshop")

$ErrorActionPreference = "Stop"
$Network = "testnet"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Wasm = "target\wasm32v1-none\release\employer_registry.wasm"
$EnvFile = Join-Path $Root "web\.env.local"

Set-Location $Root

# 0. The registry admin is the DTI issuer — created by `npm run setup:issuer`.
if (-not (Test-Path $EnvFile)) {
  throw "web\.env.local not found. Run 'npm run setup:issuer' in web\ first."
}
$IssuerLine = (Get-Content $EnvFile) | Where-Object { $_ -match '^NEXT_PUBLIC_DTI_ISSUER=' } | Select-Object -First 1
if (-not $IssuerLine) {
  throw "NEXT_PUBLIC_DTI_ISSUER missing from web\.env.local. Run 'npm run setup:issuer' in web\ first."
}
$Issuer = $IssuerLine.Split('=')[1].Trim()

# 1. Ensure a funded testnet identity exists (pays the deploy fees)
$keys = stellar keys ls
if ($keys -notcontains $Identity) {
  Write-Host "Creating + funding testnet identity '$Identity'..."
  stellar keys generate $Identity --network $Network --fund
}

# 2. Build the contract to wasm
Write-Host "Building contract..."
stellar contract build

# 3. Deploy to testnet (returns the contract ID, starting with C...)
Write-Host "Deploying to $Network..."
$ContractId = (stellar contract deploy --wasm $Wasm --source-account $Identity --network $Network).Trim()
Write-Host "Deployed contract ID: $ContractId"

# 4. Initialise the registry with the DTI issuer as admin
Write-Host "Initialising registry (admin = $Issuer)..."
try {
  stellar contract invoke --id $ContractId --source-account $Identity --network $Network -- init --admin $Issuer
} catch {
  Write-Host "(init skipped - contract may already be initialised)"
}

# 5. Write NEXT_PUBLIC_CONTRACT_ID into web\.env.local
(Get-Content $EnvFile) | Where-Object { $_ -notmatch '^NEXT_PUBLIC_CONTRACT_ID=' } | Set-Content $EnvFile
Add-Content $EnvFile "NEXT_PUBLIC_CONTRACT_ID=$ContractId"
Write-Host ""
Write-Host "Wrote NEXT_PUBLIC_CONTRACT_ID=$ContractId to web\.env.local"
Write-Host "Restart 'npm run dev' to pick up the new contract ID."
```

- [ ] **Step 2: Rewrite `scripts/deploy.sh`**

```bash
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
ISSUER="$(grep '^NEXT_PUBLIC_DTI_ISSUER=' "$ENV_FILE" | head -n1 | cut -d= -f2 | tr -d '[:space:]')"
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

# 4. Initialise the registry with the DTI issuer as admin
echo "Initialising registry (admin = $ISSUER)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source-account "$IDENTITY" \
  --network "$NETWORK" \
  -- init --admin "$ISSUER" || echo "(init skipped - contract may already be initialised)"

# 5. Write NEXT_PUBLIC_CONTRACT_ID into web/.env.local
grep -v '^NEXT_PUBLIC_CONTRACT_ID=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"
echo "NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID" >> "$ENV_FILE"
echo ""
echo "Wrote NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID to web/.env.local"
echo "Restart 'npm run dev' to pick up the new contract ID."
```

- [ ] **Step 3: Check the toolchain, then deploy for real**

Run: `stellar --version` and `cargo --version`.
If missing, install per the workshop README:
`winget install --id Rustlang.Rustup -e` / `winget install --id Stellar.StellarCLI -e`, then `rustup default stable-x86_64-pc-windows-gnu` and `rustup target add wasm32v1-none`, then open a fresh terminal.

Run from repo root: `.\scripts\deploy.ps1`
Expected: prints `Deployed contract ID: C...`, init succeeds, and the last lines confirm `NEXT_PUBLIC_CONTRACT_ID` was written.

- [ ] **Step 4: Verify init on-chain**

Run: `stellar contract invoke --id <CONTRACT_ID> --source-account workshop --network testnet -- list`
Expected: `[]` (empty vec — initialised, no entries yet).
Also run: `stellar contract invoke --id <CONTRACT_ID> --source-account workshop --network testnet -- init --admin <ISSUER_G_KEY>`
Expected: fails with contract `Error(1)` / AlreadyInitialized — proving init ran.

- [ ] **Step 5: Commit**

```powershell
git add scripts/deploy.ps1 scripts/deploy.sh
git commit -m "feat: retarget deploy scripts to employer-registry (init --admin issuer)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Credential lib — status derivation + application transaction

**Files:**
- Create: `web/src/lib/credential.ts`

**Interfaces:**
- Consumes: `stellar.ts` exports from Task 3.
- Produces: `DATA_KEY_NAME = 'dti_name'`, `DATA_KEY_CERT = 'dti_cert'`, `type CredentialStatus = 'unfunded' | 'none' | 'pending' | 'verified' | 'revoked'`, `interface CredentialInfo { status: CredentialStatus; name: string; certNo: string }`, `interface TrustlineLike`, `credentialStatusFromAccount(account: { balances: TrustlineLike[] }): Exclude<CredentialStatus, 'unfunded'>`, `decodeDataValue(b64?: string): string`, `dataAttrOf(record: unknown): Record<string, string>`, `byteLength(s: string): number`, `fetchCredentialInfo(publicKey: string): Promise<CredentialInfo>`, `buildApplicationXDR(employer: string, name: string, certNo: string): Promise<string>`.

- [ ] **Step 1: Write `web/src/lib/credential.ts`**

```ts
import {
  Asset,
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  server,
  NETWORK_PASSPHRASE,
  HORIZON_URL,
  DTI_ISSUER,
  CREDENTIAL_CODE,
} from './stellar';

export const DATA_KEY_NAME = 'dti_name';
export const DATA_KEY_CERT = 'dti_cert';

export type CredentialStatus =
  | 'unfunded' // account does not exist on testnet yet
  | 'none' // no DTICERT trustline — never applied
  | 'pending' // trustline exists, not authorized, no token yet
  | 'verified' // authorized AND holds the token
  | 'revoked'; // frozen — token present but deauthorized

export interface CredentialInfo {
  status: CredentialStatus;
  name: string; // claimed business name ('' if absent)
  certNo: string; // claimed DTI cert no. ('' if absent)
}

/** Minimal structural view of a Horizon balance line — works for both
 *  AccountResponse and ServerApi.AccountRecord. */
export interface TrustlineLike {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  is_authorized?: boolean;
}

/** The spec's status table, over an account's balance lines. */
export function credentialStatusFromAccount(account: {
  balances: TrustlineLike[];
}): Exclude<CredentialStatus, 'unfunded'> {
  const line = account.balances.find(
    (b) => b.asset_code === CREDENTIAL_CODE && b.asset_issuer === DTI_ISSUER,
  );
  if (!line) return 'none';
  const holdsToken = parseFloat(line.balance) >= 1;
  if (line.is_authorized && holdsToken) return 'verified';
  if (!line.is_authorized && holdsToken) return 'revoked';
  return 'pending'; // includes the transient authorized-but-no-token edge
}

/** Horizon data-entry values are base64; missing/invalid decode to ''. */
export function decodeDataValue(b64?: string): string {
  if (!b64) return '';
  try {
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

/** Account records expose raw data entries as `data_attr` (AccountResponse)
 *  or `data` (raw record JSON) — normalize both shapes. */
export function dataAttrOf(record: unknown): Record<string, string> {
  const r = record as { data_attr?: Record<string, string>; data?: unknown };
  if (r.data_attr && typeof r.data_attr === 'object') return r.data_attr;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, string>;
  return {};
}

/** UTF-8 byte length — manageData values are capped at 64 bytes. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Live credential status + claimed metadata for one account. */
export async function fetchCredentialInfo(publicKey: string): Promise<CredentialInfo> {
  const horizon = new Horizon.Server(HORIZON_URL);
  try {
    const account = await horizon.loadAccount(publicKey);
    const data = dataAttrOf(account);
    return {
      status: credentialStatusFromAccount(account),
      name: decodeDataValue(data[DATA_KEY_NAME]),
      certNo: decodeDataValue(data[DATA_KEY_CERT]),
    };
  } catch (e: unknown) {
    // 404 = account does not exist yet (not funded).
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (e as { name?: string })?.name === 'NotFoundError') {
      return { status: 'unfunded', name: '', certNo: '' };
    }
    throw e;
  }
}

/**
 * The application is ONE classic tx: changeTrust to DTICERT (the application
 * itself, limit 1) + the claimed business details as manageData entries.
 * Returns unsigned XDR for Freighter.
 */
export async function buildApplicationXDR(
  employer: string,
  name: string,
  certNo: string,
): Promise<string> {
  // Always load the account fresh so we have the current sequence number.
  const account = await server.getAccount(employer);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(CREDENTIAL_CODE, DTI_ISSUER),
        limit: '1',
      }),
    )
    .addOperation(Operation.manageData({ name: DATA_KEY_NAME, value: name }))
    .addOperation(Operation.manageData({ name: DATA_KEY_CERT, value: certNo }))
    .setTimeout(60)
    .build();
  return tx.toXDR();
}
```

- [ ] **Step 2: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```powershell
git add web/src/lib/credential.ts
git commit -m "feat(web): credential lib - status derivation, data decode, application tx

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Registry + DTI libs — simulation reads, admin invokes, applications query

**Files:**
- Create: `web/src/lib/registry.ts`
- Create: `web/src/lib/dti.ts`

**Interfaces:**
- Consumes: `stellar.ts` (Task 3), `submit.ts` `pollTransaction` (Task 3), `credential.ts` helpers (Task 6).
- Produces: `type RegistryStatus = 'Verified' | 'Revoked'`, `interface RegistryEntry { employer: string; name: string; certNo: string; status: RegistryStatus }`, `listEntries(): Promise<RegistryEntry[]>`, `getEntry(employer: string): Promise<RegistryEntry | null>`, `registerArgs(employer, name, certNo): xdr.ScVal[]`, `revokeArgs(employer): xdr.ScVal[]`, `adminInvoke(method: 'register' | 'revoke', issuerSecret: string, args: xdr.ScVal[]): Promise<void>`; `interface Application { employer: string; name: string; certNo: string; status: 'pending' | 'verified' | 'revoked' }`, `fetchApplications(): Promise<Application[]>`.

- [ ] **Step 1: Write `web/src/lib/registry.ts`**

```ts
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { server, NETWORK_PASSPHRASE, CONTRACT_ID, DTI_ISSUER } from './stellar';
import { pollTransaction } from './submit';

export type RegistryStatus = 'Verified' | 'Revoked';

export interface RegistryEntry {
  employer: string;
  name: string;
  certNo: string;
  status: RegistryStatus;
}

interface RawEntry {
  employer: string;
  name: string;
  cert_no: string;
  status: unknown;
}

/** Unit-variant contract enums decode as ['Verified'] (or 'Verified') — normalize. */
function toEntry(raw: RawEntry): RegistryEntry {
  const s = Array.isArray(raw.status) ? String(raw.status[0]) : String(raw.status);
  return {
    employer: raw.employer,
    name: raw.name,
    certNo: raw.cert_no,
    status: s === 'Revoked' ? 'Revoked' : 'Verified',
  };
}

/** Read-only simulation; the (funded) DTI issuer account is the read source —
 *  nothing is signed or submitted for reads. */
async function simulateCall(method: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
  const tx = new TransactionBuilder(new Account(DTI_ISSUER, '0'), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error(
      `Could not read the registry (${method}). Is the contract deployed and initialised?`,
    );
  }
  return sim.result.retval;
}

export async function listEntries(): Promise<RegistryEntry[]> {
  const raw = scValToNative(await simulateCall('list')) as RawEntry[];
  return raw.map(toEntry);
}

export async function getEntry(employer: string): Promise<RegistryEntry | null> {
  const raw = scValToNative(
    await simulateCall('get', new Address(employer).toScVal()),
  ) as RawEntry | null;
  return raw ? toEntry(raw) : null;
}

export function registerArgs(
  employer: string,
  name: string,
  certNo: string,
): xdr.ScVal[] {
  return [
    new Address(employer).toScVal(),
    nativeToScVal(name, { type: 'string' }),
    nativeToScVal(certNo, { type: 'string' }),
  ];
}

export function revokeArgs(employer: string): xdr.ScVal[] {
  return [new Address(employer).toScVal()];
}

/**
 * Server-side admin write (API routes only): simulate → assemble → sign with
 * the issuer key → send → poll to finality. The contract admin IS the issuer,
 * so source-account auth satisfies `require_auth` — no extra signatures.
 */
export async function adminInvoke(
  method: 'register' | 'revoke',
  issuerSecret: string,
  args: xdr.ScVal[],
): Promise<void> {
  const kp = Keypair.fromSecret(issuerSecret);
  const account = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(CONTRACT_ID).call(method, ...args))
    .setTimeout(60)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Registry ${method} simulation failed.`);
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(kp);
  const res = await server.sendTransaction(prepared);
  if (res.status === 'ERROR') {
    throw new Error(`Registry ${method} was rejected.`);
  }
  await pollTransaction(res.hash);
}
```

- [ ] **Step 2: Write `web/src/lib/dti.ts`**

```ts
import { Asset, Horizon } from '@stellar/stellar-sdk';
import { HORIZON_URL, DTI_ISSUER, CREDENTIAL_CODE } from './stellar';
import {
  credentialStatusFromAccount,
  dataAttrOf,
  decodeDataValue,
  DATA_KEY_NAME,
  DATA_KEY_CERT,
} from './credential';

export interface Application {
  employer: string;
  name: string;
  certNo: string;
  status: 'pending' | 'verified' | 'revoked';
}

/** Every account holding a DTICERT trustline IS an application —
 *  "the trustline is the application form". */
export async function fetchApplications(): Promise<Application[]> {
  const horizon = new Horizon.Server(HORIZON_URL);
  const page = await horizon
    .accounts()
    .forAsset(new Asset(CREDENTIAL_CODE, DTI_ISSUER))
    .limit(100)
    .call();

  return page.records.map((rec) => {
    const data = dataAttrOf(rec);
    return {
      employer: rec.account_id,
      // 'none' is impossible here (the query is by-asset), so narrow freely.
      status: credentialStatusFromAccount(rec) as Application['status'],
      name: decodeDataValue(data[DATA_KEY_NAME]),
      certNo: decodeDataValue(data[DATA_KEY_CERT]),
    };
  });
}
```

- [ ] **Step 3: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint`
Expected: both pass. If `credentialStatusFromAccount(rec)` trips on the
`ServerApi.AccountRecord` balances union, cast the argument to
`{ balances: TrustlineLike[] }` via `rec as unknown as { balances: TrustlineLike[] }`
— the structural shape is guaranteed by Horizon.

- [ ] **Step 4: Commit**

```powershell
git add web/src/lib/registry.ts web/src/lib/dti.ts
git commit -m "feat(web): registry reads/admin invokes + DTI applications query

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Server-signed API routes — approve + revoke

**Files:**
- Create: `web/src/app/api/dti/approve/route.ts`
- Create: `web/src/app/api/dti/revoke/route.ts`

**Interfaces:**
- Consumes: `stellar.ts` (Task 3), `credential.ts` (Task 6), `registry.ts` (Task 7), `process.env.DTI_ISSUER_SECRET` (Task 4).
- Produces: `POST /api/dti/approve` and `POST /api/dti/revoke`, both accepting JSON `{ employer: string }` and returning `{ ok: true }` on success or `{ error: string }` with status 400/500/502. Task 11's portal calls these.

- [ ] **Step 1: Write `web/src/app/api/dti/approve/route.ts`**

```ts
import { NextResponse } from 'next/server';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  NETWORK_PASSPHRASE,
  HORIZON_URL,
  DTI_ISSUER,
  CREDENTIAL_CODE,
} from '@/lib/stellar';
import { adminInvoke, registerArgs } from '@/lib/registry';
import {
  credentialStatusFromAccount,
  dataAttrOf,
  decodeDataValue,
  DATA_KEY_NAME,
  DATA_KEY_CERT,
} from '@/lib/credential';

function errMessage(e: unknown): string {
  const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response?.data?.extras?.result_codes;
  if (codes) return JSON.stringify(codes);
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: Request) {
  const secret = process.env.DTI_ISSUER_SECRET ?? '';
  if (!secret || !DTI_ISSUER) {
    return NextResponse.json(
      { error: 'DTI issuer not configured — run npm run setup:issuer.' },
      { status: 500 },
    );
  }

  let employer = '';
  try {
    const body = (await req.json()) as { employer?: string };
    employer = body.employer ?? '';
  } catch {
    // falls through to the address validation below
  }
  if (!/^G[A-Z2-7]{55}$/.test(employer)) {
    return NextResponse.json({ error: 'Invalid employer address.' }, { status: 400 });
  }

  const horizon = new Horizon.Server(HORIZON_URL);
  const asset = new Asset(CREDENTIAL_CODE, DTI_ISSUER);

  // 1. Read the claim + current credential state from the ledger — the ledger,
  //    not the request body, is the source of truth for what gets registered.
  let name = '';
  let certNo = '';
  let alreadyHolds = false;
  try {
    const employerAccount = await horizon.loadAccount(employer);
    const data = dataAttrOf(employerAccount);
    name = decodeDataValue(data[DATA_KEY_NAME]);
    certNo = decodeDataValue(data[DATA_KEY_CERT]);
    const status = credentialStatusFromAccount(employerAccount);
    if (status === 'none') {
      return NextResponse.json(
        { error: 'This account has no DTICERT trustline (no application).' },
        { status: 400 },
      );
    }
    if (!name || !certNo) {
      return NextResponse.json(
        { error: 'Application is missing the business name / DTI cert data entries.' },
        { status: 400 },
      );
    }
    // 'verified' and 'revoked' both mean the token is already held —
    // skipping the payment keeps Approve idempotent (never a 2nd token).
    alreadyHolds = status === 'verified' || status === 'revoked';
  } catch (e) {
    return NextResponse.json(
      { error: `Could not load the employer account: ${errMessage(e)}` },
      { status: 502 },
    );
  }

  // 2. Classic: authorize the trustline (+ issue the credential token once).
  try {
    const kp = Keypair.fromSecret(secret);
    const issuerAccount = await horizon.loadAccount(kp.publicKey());
    const builder = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(
      Operation.setTrustLineFlags({
        trustor: employer,
        asset,
        flags: { authorized: true },
      }),
    );
    if (!alreadyHolds) {
      builder.addOperation(
        Operation.payment({ destination: employer, asset, amount: '1' }),
      );
    }
    const tx = builder.setTimeout(60).build();
    tx.sign(kp);
    await horizon.submitTransaction(tx);
  } catch (e) {
    return NextResponse.json(
      { error: `Credential issuance failed: ${errMessage(e)}` },
      { status: 502 },
    );
  }

  // 3. Soroban: write the verified business into the public registry.
  try {
    await adminInvoke('register', secret, registerArgs(employer, name, certNo));
  } catch {
    return NextResponse.json(
      { error: 'Credential issued, but the registry write failed — press Approve again.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `web/src/app/api/dti/revoke/route.ts`**

```ts
import { NextResponse } from 'next/server';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  NETWORK_PASSPHRASE,
  HORIZON_URL,
  DTI_ISSUER,
  CREDENTIAL_CODE,
} from '@/lib/stellar';
import { adminInvoke, getEntry, revokeArgs } from '@/lib/registry';
import { credentialStatusFromAccount } from '@/lib/credential';

function errMessage(e: unknown): string {
  const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response?.data?.extras?.result_codes;
  if (codes) return JSON.stringify(codes);
  return e instanceof Error ? e.message : String(e);
}

export async function POST(req: Request) {
  const secret = process.env.DTI_ISSUER_SECRET ?? '';
  if (!secret || !DTI_ISSUER) {
    return NextResponse.json(
      { error: 'DTI issuer not configured — run npm run setup:issuer.' },
      { status: 500 },
    );
  }

  let employer = '';
  try {
    const body = (await req.json()) as { employer?: string };
    employer = body.employer ?? '';
  } catch {
    // falls through to the address validation below
  }
  if (!/^G[A-Z2-7]{55}$/.test(employer)) {
    return NextResponse.json({ error: 'Invalid employer address.' }, { status: 400 });
  }

  const horizon = new Horizon.Server(HORIZON_URL);
  const asset = new Asset(CREDENTIAL_CODE, DTI_ISSUER);

  // 1. Freeze the trustline — only when the flag is actually set, which
  //    keeps Revoke idempotent and avoids a redundant classic tx.
  try {
    const employerAccount = await horizon.loadAccount(employer);
    const status = credentialStatusFromAccount(employerAccount);
    if (status === 'none') {
      return NextResponse.json(
        { error: 'This account has no DTICERT trustline.' },
        { status: 400 },
      );
    }
    if (status === 'verified') {
      const kp = Keypair.fromSecret(secret);
      const issuerAccount = await horizon.loadAccount(kp.publicKey());
      const tx = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE,
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.setTrustLineFlags({
            trustor: employer,
            asset,
            flags: { authorized: false },
          }),
        )
        .setTimeout(60)
        .build();
      tx.sign(kp);
      await horizon.submitTransaction(tx);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Freezing the credential failed: ${errMessage(e)}` },
      { status: 502 },
    );
  }

  // 2. Mark it revoked in the registry (skip if it was never registered).
  try {
    if (await getEntry(employer)) {
      await adminInvoke('revoke', secret, revokeArgs(employer));
    }
  } catch {
    return NextResponse.json(
      { error: 'Credential frozen, but the registry update failed — press Revoke again.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify types + a live smoke test of validation**

Run from `web/`: `npx tsc --noEmit` then `npm run lint` — both pass.
Then start the dev server (`npm run dev`, background) and run:
`curl -s -X POST http://localhost:3000/api/dti/approve -H "Content-Type: application/json" -d "{\"employer\":\"not-an-address\"}"`
Expected: `{"error":"Invalid employer address."}`.
(The full approve path is exercised end-to-end in Task 13.)

- [ ] **Step 4: Commit**

```powershell
git add web/src/app/api
git commit -m "feat(web): server-signed approve/revoke API routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Employer flow — `/employer` page, status panel, application form

**Files:**
- Create: `web/src/app/employer/page.tsx`
- Create: `web/src/components/employer/EmployerPanel.tsx`
- Create: `web/src/components/employer/ApplicationForm.tsx`

**Interfaces:**
- Consumes: `useWallet`, `ConnectWallet`, `FundAccount` (existing), `PageShell` / `StatusBadge` / `SetupNotice` (Task 3), `credential.ts` (Task 6), `signAndSubmit` (Task 3).
- Produces: the `/employer` route; no exports consumed by later tasks.

- [ ] **Step 1: Write `web/src/components/employer/ApplicationForm.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { buildApplicationXDR, byteLength } from '@/lib/credential';
import { signAndSubmit } from '@/lib/sign';

export default function ApplicationForm({
  publicKey,
  onDone,
}: {
  publicKey: string;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [certNo, setCertNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameOk = name.trim().length > 0 && byteLength(name.trim()) <= 64;
  const certOk = certNo.trim().length > 0 && byteLength(certNo.trim()) <= 64;

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const xdr = await buildApplicationXDR(publicKey, name.trim(), certNo.trim());
      await signAndSubmit(xdr, publicKey);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Application failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">
        Apply for verification
      </h2>
      <p className="mb-4 text-sm text-gray-600">
        One signed transaction: it opens your DTICERT trustline (the application
        itself) and records your claimed business details on your account.
      </p>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">
            Registered business name
          </label>
          <input
            type="text"
            placeholder="e.g. Acme Manpower Services"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
          />
          {name.length > 0 && !nameOk && (
            <p className="mt-1 text-xs text-red-500">Required, max 64 bytes.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">
            DTI certificate number
          </label>
          <input
            type="text"
            placeholder="e.g. 6171234"
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
          />
          {certNo.length > 0 && !certOk && (
            <p className="mt-1 text-xs text-red-500">Required, max 64 bytes.</p>
          )}
        </div>
        <button
          onClick={apply}
          disabled={busy || !nameOk || !certOk}
          className="w-full rounded bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? 'Waiting for Freighter…' : 'Submit application'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Write `web/src/components/employer/EmployerPanel.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchCredentialInfo, type CredentialInfo } from '@/lib/credential';
import FundAccount from '@/components/FundAccount';
import StatusBadge from '@/components/StatusBadge';
import ApplicationForm from '@/components/employer/ApplicationForm';

export default function EmployerPanel({ publicKey }: { publicKey: string }) {
  const [info, setInfo] = useState<CredentialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setInfo(await fetchCredentialInfo(publicKey));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load credential status');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return <div className="h-32 animate-pulse rounded bg-gray-200" />;
  }
  if (error || !info) {
    return (
      <div>
        <p className="text-sm text-red-500">{error || 'Failed to load status.'}</p>
        <button onClick={refresh} className="mt-2 text-sm text-gray-500 underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {info.status === 'unfunded' && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            This account isn&rsquo;t funded on testnet yet — fund it first (the
            application transaction needs XLM for fees and the trustline).
          </p>
          <div className="mt-3">
            <FundAccount publicKey={publicKey} onFunded={refresh} />
          </div>
        </div>
      )}

      {info.status === 'none' && (
        <ApplicationForm publicKey={publicKey} onDone={refresh} />
      )}

      {info.status === 'pending' && (
        <div className="rounded border border-amber-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Application submitted
            </h2>
            <StatusBadge kind="pending" />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            DTI is reviewing your application. Your trustline to DTICERT is on
            the ledger — once authorized, your credential goes live.
          </p>
          <Claim info={info} />
        </div>
      )}

      {info.status === 'verified' && (
        <div className="rounded border border-emerald-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">You are verified</h2>
            <StatusBadge kind="verified" />
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Your account holds 1 DTICERT, issued and authorized by DTI. Share
            your address on job postings so applicants can verify you.
          </p>
          <Claim info={info} />
          <a
            href={`https://stellar.expert/explorer/testnet/account/${publicKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
          >
            View your credential on Stellar Expert →
          </a>
        </div>
      )}

      {info.status === 'revoked' && (
        <div className="rounded border border-red-200 bg-red-50 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Credential revoked</h2>
            <StatusBadge kind="revoked" />
          </div>
          <p className="mt-2 text-sm text-red-700">
            DTI has frozen this credential. Contact DTI to resolve your case —
            re-approval reinstates the same credential.
          </p>
          <Claim info={info} />
        </div>
      )}

      <button
        onClick={refresh}
        className="text-sm text-gray-500 underline hover:text-gray-700"
      >
        Refresh status
      </button>
    </div>
  );
}

function Claim({ info }: { info: CredentialInfo }) {
  if (!info.name && !info.certNo) return null;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">
          Business name
        </dt>
        <dd className="text-gray-900">{info.name || '—'}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">
          DTI cert no.
        </dt>
        <dd className="text-gray-900">{info.certNo || '—'}</dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 3: Write `web/src/app/employer/page.tsx`**

```tsx
'use client';
import { useWallet } from '@/hooks/useWallet';
import ConnectWallet from '@/components/ConnectWallet';
import EmployerPanel from '@/components/employer/EmployerPanel';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import { issuerConfigured } from '@/lib/stellar';

export default function EmployerPage() {
  const wallet = useWallet();
  const { publicKey } = wallet;

  return (
    <PageShell title="Employer verification">
      {!issuerConfigured() ? (
        <SetupNotice missing="issuer" />
      ) : (
        <>
          <div className="mb-6 flex justify-end">
            <ConnectWallet {...wallet} />
          </div>
          {publicKey ? (
            <EmployerPanel publicKey={publicKey} />
          ) : (
            <div className="rounded border border-gray-200 bg-white py-16 text-center text-gray-500">
              <p>
                Connect your Freighter wallet (Test Net) to apply for
                verification.
              </p>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint` — both pass.
With the dev server running, open `http://localhost:3000/employer`:
Expected: the page renders (Connect prompt, or SetupNotice if `.env.local` is absent).

- [ ] **Step 5: Commit**

```powershell
git add web/src/app/employer web/src/components/employer
git commit -m "feat(web): employer application flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Applicant flow — `/verify` search + cross-checked result card

**Files:**
- Create: `web/src/app/verify/page.tsx`
- Create: `web/src/components/verify/VerifySearch.tsx`
- Create: `web/src/components/verify/ResultCard.tsx`

**Interfaces:**
- Consumes: `PageShell` / `StatusBadge` / `SetupNotice` (Task 3), `registry.ts` `listEntries` + `RegistryEntry` (Task 7), `credential.ts` `fetchCredentialInfo` + `CredentialStatus` (Task 6).
- Produces: the `/verify` route; no exports consumed by later tasks.

- [ ] **Step 1: Write `web/src/components/verify/ResultCard.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { fetchCredentialInfo, type CredentialStatus } from '@/lib/credential';
import type { RegistryEntry } from '@/lib/registry';
import StatusBadge, { type BadgeKind } from '@/components/StatusBadge';

interface Verdict {
  kind: BadgeKind;
  label: string;
  detail: string;
}

/** Registry = index, classic trustline = truth; the ledger wins on conflict. */
function combine(entry: RegistryEntry, chain: CredentialStatus): Verdict {
  if (entry.status === 'Verified' && chain === 'verified') {
    return {
      kind: 'verified',
      label: 'VERIFIED',
      detail: 'DTI credential confirmed live on the Stellar ledger.',
    };
  }
  if (entry.status === 'Revoked' || chain === 'revoked') {
    return {
      kind: 'revoked',
      label: 'REVOKED',
      detail:
        'DTI has revoked this credential. Treat job offers from this business as suspicious.',
    };
  }
  return {
    kind: 'none',
    label: 'NOT VERIFIED',
    detail:
      'The registry and the live ledger disagree — the on-chain credential check did not pass.',
  };
}

export default function ResultCard({ entry }: { entry: RegistryEntry }) {
  const [chain, setChain] = useState<CredentialStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setChain(null);
    setError('');
    fetchCredentialInfo(entry.employer)
      .then((info) => setChain(info.status))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Live ledger check failed'),
      );
  }, [entry]);

  if (error) return <p className="mt-4 text-sm text-red-500">{error}</p>;
  if (!chain) return <div className="mt-4 h-28 animate-pulse rounded bg-gray-200" />;

  const verdict = combine(entry, chain);

  return (
    <div className="mt-4 rounded border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{entry.name}</h3>
          <p className="text-sm text-gray-500">DTI cert no. {entry.certNo}</p>
        </div>
        <StatusBadge kind={verdict.kind} label={verdict.label} />
      </div>
      <p className="mt-3 text-sm text-gray-600">{verdict.detail}</p>
      <p className="mt-3 break-all font-mono text-xs text-gray-400">
        {entry.employer}
      </p>
      <a
        href={`https://stellar.expert/explorer/testnet/account/${entry.employer}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
      >
        See the proof on Stellar Expert →
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Write `web/src/components/verify/VerifySearch.tsx`**

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { listEntries, type RegistryEntry } from '@/lib/registry';
import StatusBadge from '@/components/StatusBadge';
import ResultCard from '@/components/verify/ResultCard';

export default function VerifySearch() {
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<RegistryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listEntries()
      .then(setEntries)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load the registry'),
      )
      .finally(() => setLoading(false));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) || e.certNo.toLowerCase().includes(q),
    );
  }, [entries, query]);

  if (loading) return <div className="h-24 animate-pulse rounded bg-gray-200" />;
  if (error) return <p className="text-sm text-red-500">{error}</p>;

  return (
    <div>
      <input
        type="text"
        placeholder="Search by business name or DTI cert no."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
        }}
        className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900"
      />

      {matches.length === 0 && (
        <div className="mt-4 rounded border border-gray-200 bg-white p-6 text-center">
          <StatusBadge kind="none" />
          <p className="mt-2 text-sm text-gray-600">
            No DTI-verified business matches &ldquo;{query.trim()}&rdquo;. If a
            job posting claims otherwise, treat it as a red flag.
          </p>
        </div>
      )}

      {matches.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 rounded border border-gray-200 bg-white">
          {matches.map((e) => (
            <li key={e.employer}>
              <button
                onClick={() => setSelected(e)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 ${
                  selected?.employer === e.employer ? 'bg-indigo-50' : ''
                }`}
              >
                <span>
                  <span className="block font-medium text-gray-900">{e.name}</span>
                  <span className="block text-xs text-gray-500">
                    DTI cert no. {e.certNo}
                  </span>
                </span>
                <StatusBadge
                  kind={e.status === 'Verified' ? 'verified' : 'revoked'}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <ResultCard entry={selected} />}
    </div>
  );
}
```

- [ ] **Step 3: Write `web/src/app/verify/page.tsx`**

```tsx
'use client';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import VerifySearch from '@/components/verify/VerifySearch';
import { contractConfigured, issuerConfigured } from '@/lib/stellar';

export default function VerifyPage() {
  const missing = !issuerConfigured()
    ? ('issuer' as const)
    : !contractConfigured()
      ? ('contract' as const)
      : null;

  return (
    <PageShell title="Verify an employer">
      {missing ? (
        <SetupNotice missing={missing} />
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-600">
            No wallet needed — the check runs against the public registry and
            the live Stellar ledger.
          </p>
          <VerifySearch />
        </>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint` — both pass.
With the dev server running, open `http://localhost:3000/verify`:
Expected: search box renders with an empty directory ("No DTI-verified business matches…") — no entries exist yet.

- [ ] **Step 5: Commit**

```powershell
git add web/src/app/verify web/src/components/verify
git commit -m "feat(web): applicant verify view with registry + ledger cross-check

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: DTI portal — `/dti` applications table with Approve / Revoke

**Files:**
- Create: `web/src/app/dti/page.tsx`
- Create: `web/src/components/dti/ApplicationsTable.tsx`

**Interfaces:**
- Consumes: `PageShell` / `SetupNotice` / `StatusBadge` (Task 3), `dti.ts` `fetchApplications` + `Application` (Task 7), API routes (Task 8).
- Produces: the `/dti` route; no exports consumed by later tasks.

- [ ] **Step 1: Write `web/src/components/dti/ApplicationsTable.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchApplications, type Application } from '@/lib/dti';
import StatusBadge from '@/components/StatusBadge';

const RANK: Record<Application['status'], number> = {
  pending: 0,
  verified: 1,
  revoked: 2,
};

export default function ApplicationsTable() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFor, setBusyFor] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchApplications();
      setApps([...list].sort((a, b) => RANK[a.status] - RANK[b.status]));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (action: 'approve' | 'revoke', employer: string) => {
    setBusyFor(employer);
    setError('');
    try {
      const res = await fetch(`/api/dti/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employer }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `${action} failed`);
    } finally {
      setBusyFor('');
    }
  };

  if (loading) return <div className="h-32 animate-pulse rounded bg-gray-200" />;

  return (
    <div>
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {apps.length === 0 ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No applications yet — an employer opens one by submitting the form on
          the Employers page.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
          {apps.map((a) => (
            <li
              key={a.employer}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {a.name || '(no business name submitted)'}
                </p>
                <p className="truncate text-xs text-gray-500">
                  DTI cert no. {a.certNo || '—'} · {a.employer.slice(0, 6)}…
                  {a.employer.slice(-6)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge kind={a.status} />
                {a.status !== 'verified' && (
                  <button
                    onClick={() => act('approve', a.employer)}
                    disabled={busyFor !== ''}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busyFor === a.employer
                      ? 'Working…'
                      : a.status === 'revoked'
                        ? 'Re-approve'
                        : 'Approve'}
                  </button>
                )}
                {a.status === 'verified' && (
                  <button
                    onClick={() => act('revoke', a.employer)}
                    disabled={busyFor !== ''}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {busyFor === a.employer ? 'Working…' : 'Revoke'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={refresh}
        className="mt-3 text-sm text-gray-500 underline hover:text-gray-700"
      >
        Refresh
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `web/src/app/dti/page.tsx`**

```tsx
'use client';
import PageShell from '@/components/PageShell';
import SetupNotice from '@/components/SetupNotice';
import ApplicationsTable from '@/components/dti/ApplicationsTable';
import { contractConfigured, issuerConfigured } from '@/lib/stellar';

export default function DtiPage() {
  const missing = !issuerConfigured()
    ? ('issuer' as const)
    : !contractConfigured()
      ? ('contract' as const)
      : null;

  return (
    <PageShell title="DTI Portal">
      {missing ? (
        <SetupNotice missing={missing} />
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-600">
            Applications appear here the moment an employer opens a DTICERT
            trustline. Approving authorizes the trustline, issues the
            credential, and lists the business in the public registry.
          </p>
          <ApplicationsTable />
          <p className="mt-6 text-xs text-gray-400">
            Demo build: this portal is unauthenticated and signs with a testnet
            issuer key on the server. A real deployment would sit behind DTI
            staff authentication.
          </p>
        </>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 3: Verify**

Run from `web/`: `npx tsc --noEmit` then `npm run lint` — both pass.
With the dev server running, open `http://localhost:3000/dti`:
Expected: "No applications yet" empty state (or SetupNotice if env is missing).

- [ ] **Step 4: Commit**

```powershell
git add web/src/app/dti web/src/components/dti
git commit -m "feat(web): DTI portal with approve/revoke actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Docs — README, IDEA.md, CLAUDE.md

**Files:**
- Modify: `README.md` (full rewrite)
- Modify: `IDEA.md` (fill in for idea #170)
- Modify: `CLAUDE.md` (project description + "Where things live")

**Interfaces:**
- Consumes: everything built in Tasks 1–11 (docs must match actual paths/commands).

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# Lehitimo — Verified Employer Identity on Stellar

**Check before you apply.** Job scams are rampant; applicants have no easy way
to confirm an employer is a legitimate, DTI-registered business. Lehitimo gives
DTI-certified businesses an on-chain credential — a classic Stellar asset —
that any job applicant can verify in seconds, and DTI can revoke instantly.

Built for the StellarX workshop (idea #170) on the workshop scaffold.
**Stellar testnet only.**

## How it works (the Stellar part)

| Real-world event | On-chain form |
|---|---|
| Business applies | One tx signed by the employer: `changeTrust(DTICERT, limit 1)` + `manageData(dti_name)` + `manageData(dti_cert)` |
| DTI approves | Issuer tx: `setTrustLineFlags(authorized)` + `payment(1 DTICERT)` |
| Credential valid | Trustline `is_authorized` **and** balance ≥ 1 — checked live on Horizon |
| DTI revokes | `setTrustLineFlags(authorized: false)` — frozen instantly |

DTICERT is issued by a DTI-controlled account with `AUTH_REQUIRED` +
`AUTH_REVOCABLE`. A small Soroban **registry contract**
(`contracts/employer-registry`) maps business names to addresses so applicants
can search by name; the classic trustline remains the source of truth and wins
on any disagreement.

## Run it

Prereqs: Node 20+, the Freighter extension (switched to **Test Net**), and for
the contract: Rust + the `wasm32v1-none` target + the Stellar CLI.

```powershell
cd web
npm install
npm run setup:issuer     # creates + funds the DTI issuer, writes web/.env.local
cd ..
.\scripts\deploy.ps1     # builds + deploys the registry, inits admin, writes contract id
cd web
npm run dev              # http://localhost:3000
```

macOS/Linux: `./scripts/deploy.sh` instead of the PowerShell script.

## The views

- **/** — landing.
- **/employer** — connect Freighter, fund via Friendbot, submit the
  application (one signature).
- **/verify** — applicant search, no wallet needed. VERIFIED / REVOKED /
  NOT FOUND, cross-checked between the registry and the live ledger.
- **/dti** — portal: pending applications, Approve / Revoke (server-signed
  with the issuer key from `.env.local`; unauthenticated — demo only).

## Demo arc (2–4 min)

1. Employer connects + funds + applies — one Freighter signature.
2. /dti shows the application (claimed name + DTI cert no.).
3. Approve → trustline authorized + 1 DTICERT issued + registry entry.
4. /verify → search the name → VERIFIED with live ledger proof.
5. Revoke on /dti → /verify now shows REVOKED. No cooperation from the
   scammer needed.

## Tests / verification

- `cargo test` — registry contract unit tests.
- `cd web && npm run lint && npx tsc --noEmit`
- `cd web && npm run e2e:testnet` — automated apply→approve→verify→revoke
  arc against testnet through the running dev server (start `npm run dev`
  first).

## Manual E2E checklist (before submission)

- [ ] Employer flow with a real Freighter wallet
- [ ] /dti Approve, then the VERIFIED badge on /verify
- [ ] Revoke flips /verify to REVOKED after refresh
- [ ] Fresh clone: setup → deploy → demo works end-to-end

## Troubleshooting

- **Freighter "not detected"** — install/unlock it, reload; must be on Test Net.
- **Setup panels on every page** — run `npm run setup:issuer` and the deploy
  script, then restart `npm run dev`.
- **Approve fails with `op_no_trust`** — the employer hasn't applied (no
  trustline) yet.
- **Registry reads fail** — the deploy script must finish `init`; check
  `NEXT_PUBLIC_CONTRACT_ID` in `web/.env.local`.

## Future work

Portal authentication, SEP-1 `stellar.toml` metadata for DTICERT, real DTI
records integration, name-uniqueness rules, mainnet hardening.

## License

MIT (see LICENSE).
```

- [ ] **Step 2: Fill in `IDEA.md`**

```markdown
# Lehitimo — Verified Employer Identity

## Idea
- **Track:** Social Impact (financial-inclusion angle: protecting job seekers)
- **Idea # (from the 300-ideas list):** 170
- **One-liner:** DTI-certified businesses get a revocable on-chain credential
  (a classic Stellar asset) that any job applicant can verify by name in
  seconds — check before you apply.

## Problem
Job scams are rampant in the Philippines — fake employers collect "processing
fees" or personal data from applicants. There is no quick, trustworthy way for
an applicant to check that an employer is a legitimate DTI-registered
business. Victims are disproportionately first-time and overseas-bound
workers.

## How it uses Stellar
Stellar is the product, not a bolt-on:
- **Classic asset as credential:** DTICERT, issued by a DTI-controlled account
  with `AUTH_REQUIRED` + `AUTH_REVOCABLE`. The employer's trustline IS the
  application; authorization + 1 DTICERT is the credential; freezing the
  trustline is instant revocation.
- **manageData** carries the employer's claimed business name and DTI cert
  number on their own account.
- **Soroban registry contract** (`employer-registry`) makes credentials
  searchable by business name; the classic trustline stays the source of
  truth and wins on any disagreement.
- **Horizon** for live credential checks; **Soroban RPC** for registry reads.

## What works in the demo
- [x] Connect wallet (Freighter, testnet)
- [x] Employer applies with one signature (trustline + metadata)
- [x] DTI portal approves: authorize + issue 1 DTICERT + registry entry
- [x] Applicant searches by name, sees VERIFIED with live ledger cross-check
- [x] Instant revocation flips the badge to REVOKED

## Setup / run
- Network: **testnet**
- `cd web && npm install && npm run setup:issuer`
- `.\scripts\deploy.ps1` (macOS/Linux: `./scripts/deploy.sh`)
- `cd web && npm run dev`

## Demo
- 2–4 min video link: _add after recording_
- Public repo link: _this repository_

## Submission checklist
- [x] Public GitHub repo with a license (MIT)
- [x] README explains problem, Stellar usage, and setup
- [ ] Demo video (2–4 min)
- [ ] Submitted via the workshop's official GitHub issue template
```

- [ ] **Step 3: Update `CLAUDE.md`**

Replace the opening paragraph (the "A monorepo scaffold…" block and the two
bullets under it) with:

```markdown
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
```

Replace the `## Where things live` section body with:

```markdown
- Stellar config + Friendbot: `web/src/lib/stellar.ts`
- Credential (DTICERT) status + application tx: `web/src/lib/credential.ts`
- Registry reads + admin invokes: `web/src/lib/registry.ts`
- DTI applications query (Horizon): `web/src/lib/dti.ts`
- Submit/poll: `web/src/lib/submit.ts`; Freighter sign helper: `web/src/lib/sign.ts`
- Wallet hook: `web/src/hooks/useWallet.ts`
- API routes (issuer-signed): `web/src/app/api/dti/approve/route.ts`, `.../revoke/route.ts`
- UI: `web/src/app/{page,employer,verify,dti}` + `web/src/components/*`
- Contract: `contracts/employer-registry/src/lib.rs` (+ `test.rs`)
- Issuer setup: `web/scripts/setup-issuer.mjs`; E2E: `web/scripts/e2e-testnet.mjs`
- Deploy: `scripts/deploy.ps1` (Windows) / `scripts/deploy.sh`
```

In the testnet reference table, delete the USDC issuer row (USDC is no longer
used). Leave the gotchas section unchanged.

- [ ] **Step 4: Commit**

```powershell
git add README.md IDEA.md CLAUDE.md
git commit -m "docs: Lehitimo README, IDEA submission draft, CLAUDE notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Automated testnet E2E arc + final verification

**Files:**
- Create: `web/scripts/e2e-testnet.mjs`
- Modify: `web/package.json` (add `e2e:testnet` script)

**Interfaces:**
- Consumes: the running dev server (API routes, Task 8), the deployed contract + issuer (Tasks 4–5).
- Produces: `npm run e2e:testnet` exits 0 on a full apply → approve → verify → revoke → re-approve arc. This automates the spec's demo-arc check; the README's manual Freighter checklist (Task 12) remains for the human demo run.

- [ ] **Step 1: Write `web/scripts/e2e-testnet.mjs`**

```js
#!/usr/bin/env node
// Full testnet E2E: apply → approve → verify → revoke → re-approve, using a
// throwaway employer keypair signed locally (no Freighter needed).
//
// Prereqs: `npm run setup:issuer` done, registry deployed, `npm run dev`
// running. Usage (from web/):  npm run e2e:testnet
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const RPC_URL = 'https://soroban-testnet.stellar.org';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const env = readFileSync(path.join(webDir, '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) ?? [])[1]?.trim();
const ISSUER = get('NEXT_PUBLIC_DTI_ISSUER');
const CONTRACT_ID = get('NEXT_PUBLIC_CONTRACT_ID');
if (!ISSUER || !CONTRACT_ID) {
  console.error(
    'Missing NEXT_PUBLIC_DTI_ISSUER / NEXT_PUBLIC_CONTRACT_ID in web/.env.local',
  );
  process.exit(1);
}

const horizon = new Horizon.Server(HORIZON_URL);
const rpcServer = new rpc.Server(RPC_URL);
const asset = new Asset('DTICERT', ISSUER);

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures += 1;
};

const credLine = (account) =>
  account.balances.find(
    (b) => b.asset_code === 'DTICERT' && b.asset_issuer === ISSUER,
  );

async function registryEntry(employer) {
  const tx = new TransactionBuilder(new Account(ISSUER, '0'), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      new Contract(CONTRACT_ID).call('get', new Address(employer).toScVal()),
    )
    .setTimeout(30)
    .build();
  const sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error('registry get simulation failed');
  }
  const raw = scValToNative(sim.result.retval);
  if (!raw) return null;
  const status = Array.isArray(raw.status) ? String(raw.status[0]) : String(raw.status);
  return { name: raw.name, certNo: raw.cert_no, status };
}

async function post(route, employer) {
  const res = await fetch(`${BASE_URL}/api/dti/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employer }),
  });
  return { ok: res.ok, body: await res.json() };
}

// --- 1. Throwaway employer applies ------------------------------------------
const employer = Keypair.random();
const bizName = `E2E Test Corp ${employer.publicKey().slice(-5)}`;
console.log('Employer:', employer.publicKey());
await fetch(`https://friendbot.stellar.org?addr=${employer.publicKey()}`);

const employerAccount = await horizon.loadAccount(employer.publicKey());
const applyTx = new TransactionBuilder(employerAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.changeTrust({ asset, limit: '1' }))
  .addOperation(Operation.manageData({ name: 'dti_name', value: bizName }))
  .addOperation(Operation.manageData({ name: 'dti_cert', value: '6171234' }))
  .setTimeout(60)
  .build();
applyTx.sign(employer);
await horizon.submitTransaction(applyTx);

let acct = await horizon.loadAccount(employer.publicKey());
let line = credLine(acct);
check(
  'apply: trustline exists, unauthorized, balance 0 (PENDING)',
  Boolean(line) && !line.is_authorized && parseFloat(line.balance) === 0,
);

// --- 2. Approve --------------------------------------------------------------
const approve = await post('approve', employer.publicKey());
check(`approve API ok ${approve.ok ? '' : JSON.stringify(approve.body)}`, approve.ok);

acct = await horizon.loadAccount(employer.publicKey());
line = credLine(acct);
check(
  'approve: trustline authorized, balance 1 (VERIFIED)',
  Boolean(line) && line.is_authorized === true && parseFloat(line.balance) === 1,
);

let entry = await registryEntry(employer.publicKey());
check(
  'approve: registry entry Verified with matching name',
  entry !== null && entry.status === 'Verified' && entry.name === bizName,
);

// --- 3. Revoke ---------------------------------------------------------------
const revoke = await post('revoke', employer.publicKey());
check(`revoke API ok ${revoke.ok ? '' : JSON.stringify(revoke.body)}`, revoke.ok);

acct = await horizon.loadAccount(employer.publicKey());
line = credLine(acct);
check(
  'revoke: trustline frozen, balance still 1 (REVOKED)',
  Boolean(line) && line.is_authorized === false && parseFloat(line.balance) === 1,
);

entry = await registryEntry(employer.publicKey());
check('revoke: registry entry Revoked', entry !== null && entry.status === 'Revoked');

// --- 4. Re-approve (reinstate) ----------------------------------------------
const re = await post('approve', employer.publicKey());
check('re-approve API ok', re.ok);

acct = await horizon.loadAccount(employer.publicKey());
line = credLine(acct);
check(
  're-approve: authorized again, balance still exactly 1 (no double token)',
  Boolean(line) && line.is_authorized === true && parseFloat(line.balance) === 1,
);

entry = await registryEntry(employer.publicKey());
check('re-approve: registry entry Verified again', entry !== null && entry.status === 'Verified');

console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL (${failures} checks failed)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the npm script**

In `web/package.json` `"scripts"`, add:

```json
"e2e:testnet": "node scripts/e2e-testnet.mjs"
```

- [ ] **Step 3: Run the arc for real**

Ensure the dev server is running (`npm run dev` from `web/`, background), then
run from `web/`: `npm run e2e:testnet`
Expected: every line `PASS`, final line `E2E PASS`, exit code 0.
If any check fails, debug the failing beat (the script prints the API error
body), fix, and re-run until green.

- [ ] **Step 4: Full verification sweep**

- From repo root: `cargo test` — all contract tests pass.
- From `web/`: `npm run lint` and `npx tsc --noEmit` — clean.
- From `web/`: `npm run build` — production build succeeds.
- Open `http://localhost:3000/verify`, search for the E2E business name —
  it appears with a VERIFIED badge and the result card shows the live check.

- [ ] **Step 5: Commit**

```powershell
git add web/scripts/e2e-testnet.mjs web/package.json
git commit -m "test: automated testnet E2E arc (apply/approve/verify/revoke)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan notes for the executor

- Tasks 4, 5, 8 (smoke test), and 13 hit the live testnet — they need network
  access and, for Task 5, the Rust + Stellar CLI toolchain (install commands
  are in Task 5 Step 3).
- The manual Freighter demo run (README checklist from Task 12) is the user's
  final pre-submission step; the automated arc in Task 13 covers everything
  except the Freighter signing UX itself.






