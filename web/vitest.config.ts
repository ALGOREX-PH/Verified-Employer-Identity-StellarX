import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // Syntactically valid testnet-style values so lib modules import cleanly.
      NEXT_PUBLIC_DTI_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      NEXT_PUBLIC_CONTRACT_ID: 'CDT3DICIGHK4OXD6SNMTDAQLJOCGHYXCAJ5BPBIFTIFMWIQ24ODOMBHS',
    },
  },
});
