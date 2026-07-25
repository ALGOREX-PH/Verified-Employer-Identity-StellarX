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
let res;
try {
  res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
} catch (err) {
  console.error('Friendbot request failed:', err.message);
  process.exit(1);
}
if (!res.ok) {
  console.error('Friendbot funding failed with HTTP', res.status);
  process.exit(1);
}

console.log('Setting AUTH_REQUIRED + AUTH_REVOCABLE...');
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
try {
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
} catch (err) {
  console.error(
    'Failed while setting AUTH_REQUIRED/AUTH_REVOCABLE flags:',
    err.message,
  );
  console.error(
    `The account ${kp.publicKey()} was funded by Friendbot but never configured — it has been abandoned (orphaned testnet accounts are free).`,
  );
  console.error('Just re-run: npm run setup:issuer -- --force (a fresh issuer will be generated).');
  process.exit(1);
}

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
