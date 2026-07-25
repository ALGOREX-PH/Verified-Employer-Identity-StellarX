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
- [x] Production layer: rate-limited, logged, server-signed DTI API routes
- [x] 22 lib unit tests (vitest) + contract unit tests + automated testnet E2E arc

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
