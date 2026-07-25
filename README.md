# Lehitimo — Verified Employer Identity on Stellar

**Check before you apply.** Job scams are rampant; applicants have no easy way
to confirm an employer is a legitimate, DTI-registered business. Lehitimo gives
DTI-certified businesses an on-chain credential — a classic Stellar asset —
that any job applicant can verify in seconds, and DTI can revoke instantly.

Built for the StellarX workshop (idea #170) on the workshop scaffold.
**Stellar testnet only.** The UI is a small design system — "security paper &
official seal" — built on Tailwind v4 tokens, with the verdict rendered as a
stamped seal.

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
  with the issuer key from `.env.local`; unauthenticated — demo only). The
  API routes behind it are also rate-limited (10/min per IP per route) and
  emit structured single-line request logs.

## Demo arc (2–4 min)

1. Employer connects + funds + applies — one Freighter signature.
2. /dti shows the application (claimed name + DTI cert no.).
3. Approve → trustline authorized + 1 DTICERT issued + registry entry.
4. /verify → search the name → VERIFIED with live ledger proof.
5. Revoke on /dti → /verify now shows REVOKED. No cooperation from the
   scammer needed.

## Tests / verification

- `cargo test` — registry contract unit tests.
- `cd web && npm test` — 22 unit tests over the credential/registry lib layer (vitest).
- `cd web && npm run lint && npx tsc --noEmit`
- `cd web && npm run e2e:testnet` — automated apply→approve→verify→revoke arc
  against testnet through the running dev server (start `npm run dev` first;
  if port 3000 is taken, pass `E2E_BASE_URL`).

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
