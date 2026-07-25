import { Asset, Horizon } from '@stellar/stellar-sdk';
import { HORIZON_URL, DTI_ISSUER, CREDENTIAL_CODE } from './stellar';
import {
  credentialStatusFromAccount,
  dataAttrOf,
  decodeDataValue,
  DATA_KEY_NAME,
  DATA_KEY_CERT,
} from './credential';

export interface Application {
  employer: string;
  name: string;
  certNo: string;
  status: 'pending' | 'verified' | 'revoked';
}

/** Every account holding a DTICERT trustline IS an application —
 *  "the trustline is the application form". */
export async function fetchApplications(): Promise<Application[]> {
  const horizon = new Horizon.Server(HORIZON_URL);
  const page = await horizon
    .accounts()
    .forAsset(new Asset(CREDENTIAL_CODE, DTI_ISSUER))
    .limit(100)
    .call();

  return page.records.map((rec) => {
    const data = dataAttrOf(rec);
    return {
      employer: rec.account_id,
      // 'none' is impossible here (the query is by-asset), so narrow freely.
      status: credentialStatusFromAccount(rec) as Application['status'],
      name: decodeDataValue(data[DATA_KEY_NAME]),
      certNo: decodeDataValue(data[DATA_KEY_CERT]),
    };
  });
}
