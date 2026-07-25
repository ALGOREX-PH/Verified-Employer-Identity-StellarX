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
import { jsonError, clientIp, rateLimit, parseEmployer, errMessage, logRoute } from '@/lib/api';

const ROUTE = 'approve';

export async function POST(req: Request) {
  const startedAt = Date.now();
  const ip = clientIp(req);

  if (!rateLimit(`${ip}:${ROUTE}`)) {
    logRoute(ROUTE, '', 'rate_limited', startedAt);
    return jsonError('Too many requests — try again in a minute.', 429);
  }

  const secret = process.env.DTI_ISSUER_SECRET ?? '';
  if (!secret || !DTI_ISSUER) {
    logRoute(ROUTE, '', 'unconfigured', startedAt);
    return jsonError('DTI issuer not configured — run npm run setup:issuer.', 500);
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // falls through — parseEmployer(null) rejects a missing/invalid body
  }
  const employer = parseEmployer(body);
  if (!employer) {
    logRoute(ROUTE, '', 'bad_request', startedAt);
    return jsonError('Invalid employer address.', 400);
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
      logRoute(ROUTE, employer, 'no_trustline', startedAt);
      return jsonError('This account has no DTICERT trustline (no application).', 400);
    }
    if (!name || !certNo) {
      logRoute(ROUTE, employer, 'missing_metadata', startedAt);
      return jsonError(
        'Application is missing the business name / DTI cert data entries.',
        400,
      );
    }
    // 'verified' and 'revoked' both mean the token is already held —
    // skipping the payment keeps Approve idempotent (never a 2nd token).
    alreadyHolds = status === 'verified' || status === 'revoked';
  } catch (e) {
    logRoute(ROUTE, employer, 'ledger_read_failed', startedAt);
    return jsonError(`Could not load the employer account: ${errMessage(e)}`, 502);
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
    logRoute(ROUTE, employer, 'issuance_failed', startedAt);
    return jsonError(`Credential issuance failed: ${errMessage(e)}`, 502);
  }

  // 3. Soroban: write the verified business into the public registry.
  try {
    await adminInvoke('register', secret, registerArgs(employer, name, certNo));
  } catch {
    logRoute(ROUTE, employer, 'registry_write_failed', startedAt);
    return jsonError(
      'Credential issued, but the registry write failed — press Approve again.',
      502,
    );
  }

  logRoute(ROUTE, employer, 'ok', startedAt);
  return NextResponse.json({ ok: true });
}
