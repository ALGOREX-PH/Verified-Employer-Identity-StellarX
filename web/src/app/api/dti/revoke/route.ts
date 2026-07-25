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
import { jsonError, clientIp, rateLimit, parseEmployer, errMessage, logRoute } from '@/lib/api';

const ROUTE = 'revoke';

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

  // 1. Freeze the trustline — only when the flag is actually set, which
  //    keeps Revoke idempotent and avoids a redundant classic tx.
  let didFreeze = false;
  try {
    const employerAccount = await horizon.loadAccount(employer);
    const status = credentialStatusFromAccount(employerAccount);
    if (status === 'none') {
      logRoute(ROUTE, employer, 'no_trustline', startedAt);
      return jsonError('This account has no DTICERT trustline.', 400);
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
      didFreeze = true;
    }
  } catch (e) {
    logRoute(ROUTE, employer, 'freeze_failed', startedAt);
    return jsonError(`Freezing the credential failed: ${errMessage(e)}`, 502);
  }

  // 2. Mark it revoked in the registry (skip if it was never registered).
  try {
    if (await getEntry(employer)) {
      await adminInvoke('revoke', secret, revokeArgs(employer));
    }
  } catch {
    logRoute(ROUTE, employer, 'registry_write_failed', startedAt);
    return jsonError(
      'Credential frozen, but the registry update failed — press Revoke again.',
      502,
    );
  }

  // didFreeze is false when the trustline was already frozen (idempotent
  // no-op) — surface that distinctly from a fresh revoke in the log.
  logRoute(ROUTE, employer, didFreeze ? 'ok' : 'frozen_skip', startedAt);
  return NextResponse.json({ ok: true });
}
