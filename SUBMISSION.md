# Lehitimo — Verified Employer Identity

## Project Name
Lehitimo

## One-Line Description
Lehitimo ("legitimate") gives DTI-certified businesses an on-chain credential that any job applicant can verify in seconds — *check before you apply*.

## Track
Track 5 Social Impact

## Problem It Solves
Job scams are rampant in the Philippines: fake employers post listings, collect "processing fees" or personal data, and disappear. Applicants have no easy way to check that an employer is a legitimate, DTI-registered business. Lehitimo lets a DTI officer issue a revocable on-chain credential to verified employers, so any job applicant — no wallet, no account — can search a business by name and see a live VERIFIED / REVOKED / NOT FOUND badge backed by the Stellar ledger. Revocation is instant and needs no cooperation from the scammer.

## How It Uses Stellar
The credential **is** a classic Stellar asset — every lifecycle event is a native ledger primitive, not app logic:

- **`DTICERT` asset with `AUTH_REQUIRED` + `AUTH_REVOCABLE` issuer flags** — a new trustline starts unauthorized, and that unauthorized trustline *is* the pending application; freezing it *is* revocation.
- **Applying = one employer-signed tx**: `changeTrust(DTICERT, limit "1")` + `manageData("dti_name")` + `manageData("dti_cert")` (signed with Freighter).
- **Approval = one issuer-signed atomic tx**: `setTrustLineFlags(authorized: true)` + `payment(1 DTICERT)`.
- **Credential validity is read live from Horizon**: trustline `is_authorized` AND balance ≥ 1. **Revocation** is `setTrustLineFlags(authorized: false)` — the token freezes in place and the badge dies instantly.
- **Soroban registry contract** (`employer-registry`, soroban-sdk 22) makes credentials discoverable by business name: admin-only `register`/`revoke`, free `get`/`list` reads via simulation. Trust model: the registry is the index; the classic trustline is the truth — the applicant view cross-checks both and the ledger wins on disagreement.
- Stack: `@stellar/stellar-sdk` v15 (`rpc` namespace), Freighter v6, Soroban RPC for contract calls, Horizon for trustline/data-entry reads.

## GitHub Repository
https://github.com/ALGOREX-PH/Verified-Employer-Identity-StellarX

## Network & Deployment
- Network: testnet
- Live app URL (if any): runs locally — see README (`cd web && npm install && npm run dev`)
- Contract IDs / asset issuers:
  - `employer-registry` contract ID: `CDT3DICIGHK4OXD6SNMTDAQLJOCGHYXCAJ5BPBIFTIFMWIQ24ODOMBHS`
  - `DTICERT` issuer: `GAGG6IXOES5BVZHUG3EMPKY3SG43WXJWJ356Q5RDWZDDAH2JOQRGOQBO`

## Team
- Danielle — @[github-username]
- _[add remaining members, up to 4]_

## Novelty Note (optional, for bonus points)
Built from idea **#170 (Verified Employer Identity)** in `stellar-300-ideas.md`. Unlike generic on-chain identity/attestation projects, Lehitimo maps a specific Philippine institution (DTI business registration) onto Stellar's *classic* authorization primitives: the pending application, the credential, and the revocation are all native trustline states — no custom token logic to audit. The Soroban contract is deliberately only a name-search index that can never overrule the ledger, and the verification page requires no wallet, which matters for the actual end user: a job applicant on a phone.

## Anything Else
- Known limitations (by design, testnet demo scope): the DTI portal is unauthenticated (demo-only, stated in the UI), no mainnet or real DTI integration, no `stellar.toml` asset metadata, no name-uniqueness enforcement, no registry pagination.
- What we'd build next: SEP-1 asset metadata, authenticated officer portal, real DTI database integration, and clawback-based credential migration.
