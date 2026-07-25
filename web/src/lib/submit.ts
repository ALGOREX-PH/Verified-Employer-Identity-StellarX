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
