#!/usr/bin/env node
// Full testnet E2E: apply → approve → verify → revoke → re-approve → final
// revoke, using a throwaway employer keypair signed locally (no Freighter
// needed). The arc always ends on a revoke so no E2E artifact is left
// Verified in the live registry.
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

// Sliding-window rate limit is 10/min per IP per route. A re-run within the
// same minute after a prior failed run can trip a 429 here — wait out the
// window and retry the POST exactly once before giving up.
async function post(route, employer) {
  const attempt = () =>
    fetch(`${BASE_URL}/api/dti/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employer }),
    });

  let res = await attempt();
  if (res.status === 429) {
    console.log(`  rate limited on ${route}, waiting 65s and retrying once...`);
    await new Promise((resolve) => setTimeout(resolve, 65_000));
    res = await attempt();
  }
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

// --- 5. Final revoke (leave no Verified test artifact in the registry) ------
const finalRevoke = await post('revoke', employer.publicKey());
check(
  `final revoke API ok ${finalRevoke.ok ? '' : JSON.stringify(finalRevoke.body)}`,
  finalRevoke.ok,
);

acct = await horizon.loadAccount(employer.publicKey());
line = credLine(acct);
check(
  'final revoke: trustline frozen (REVOKED)',
  Boolean(line) && line.is_authorized === false,
);

entry = await registryEntry(employer.publicKey());
check(
  'final revoke: registry entry Revoked',
  entry !== null && entry.status === 'Revoked',
);

console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL (${failures} checks failed)`);
process.exit(failures === 0 ? 0 : 1);
