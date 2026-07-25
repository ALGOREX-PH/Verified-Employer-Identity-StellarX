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
