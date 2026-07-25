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

/** Unit-variant contract enums decode as ['Verified'] (or 'Verified') — normalize.
 *  Exported for unit testing and reuse. */
export function toEntry(raw: RawEntry): RegistryEntry {
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
