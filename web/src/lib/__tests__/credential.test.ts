import { describe, it, expect } from 'vitest';
import {
  credentialStatusFromAccount,
  decodeDataValue,
  byteLength,
  dataAttrOf,
  type TrustlineLike,
} from '../credential';
import { DTI_ISSUER, CREDENTIAL_CODE } from '../stellar';

const OTHER_ISSUER = 'GA36JIYSJUYCPUY673VXP7CNGCK67MOMSNKZUFO7DXP2NP7DYPZ2SVUA';

function line(overrides: Partial<TrustlineLike> = {}): TrustlineLike {
  return {
    asset_type: 'credit_alphanum12',
    asset_code: CREDENTIAL_CODE,
    asset_issuer: DTI_ISSUER,
    balance: '0.0000000',
    is_authorized: false,
    ...overrides,
  };
}

describe('credentialStatusFromAccount', () => {
  it('returns none when there are no balances', () => {
    expect(credentialStatusFromAccount({ balances: [] })).toBe('none');
  });

  it('returns none for a DTICERT line from a different issuer (spoof guard)', () => {
    const account = {
      balances: [line({ asset_issuer: OTHER_ISSUER, is_authorized: true, balance: '1.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('none');
  });

  it('returns none for a different asset code with the same issuer', () => {
    const account = {
      balances: [line({ asset_code: 'OTHERCODE', is_authorized: true, balance: '1.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('none');
  });

  it('returns pending when unauthorized with a zero balance', () => {
    const account = {
      balances: [line({ is_authorized: false, balance: '0.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('pending');
  });

  it('returns verified when authorized and holding the token', () => {
    const account = {
      balances: [line({ is_authorized: true, balance: '1.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('verified');
  });

  it('returns revoked when unauthorized but still holding the token', () => {
    const account = {
      balances: [line({ is_authorized: false, balance: '1.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('revoked');
  });

  it('returns pending for the transient authorized-but-no-token edge', () => {
    const account = {
      balances: [line({ is_authorized: true, balance: '0.0000000' })],
    };
    expect(credentialStatusFromAccount(account)).toBe('pending');
  });
});

describe('decodeDataValue', () => {
  it('decodes valid base64 of an ASCII string', () => {
    // Buffer.from('Sari-Sari Store', 'utf8').toString('base64')
    expect(decodeDataValue('U2FyaS1TYXJpIFN0b3Jl')).toBe('Sari-Sari Store');
  });

  it('decodes valid base64 of a multibyte UTF-8 string', () => {
    // Buffer.from('Sari-Sari Store ñ', 'utf8').toString('base64')
    expect(decodeDataValue('U2FyaS1TYXJpIFN0b3JlIMOx')).toBe('Sari-Sari Store ñ');
  });

  it('returns empty string for undefined input', () => {
    expect(decodeDataValue(undefined)).toBe('');
  });

  it('returns empty string for garbage non-base64 input', () => {
    expect(decodeDataValue('not-valid-base64!!!')).toBe('');
  });
});

describe('byteLength', () => {
  it('measures ascii strings by character count', () => {
    expect(byteLength('hello')).toBe(5);
  });

  it('measures multibyte characters by UTF-8 byte count', () => {
    expect(byteLength('ñ')).toBe(2);
    expect(byteLength('🎉')).toBe(4);
  });

  it('is 0 for an empty string', () => {
    expect(byteLength('')).toBe(0);
  });
});

describe('dataAttrOf', () => {
  it('reads the data_attr shape', () => {
    const record = { data_attr: { dti_name: 'abc' } };
    expect(dataAttrOf(record)).toEqual({ dti_name: 'abc' });
  });

  it('reads the data shape', () => {
    const record = { data: { dti_name: 'abc' } };
    expect(dataAttrOf(record)).toEqual({ dti_name: 'abc' });
  });

  it('returns {} for an empty or unrelated object', () => {
    expect(dataAttrOf({})).toEqual({});
    expect(dataAttrOf({ unrelated: 'field' })).toEqual({});
  });
});
