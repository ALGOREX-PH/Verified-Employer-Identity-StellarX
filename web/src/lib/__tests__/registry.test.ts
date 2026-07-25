import { describe, it, expect } from 'vitest';
import { toEntry } from '../registry';

describe('toEntry', () => {
  it('normalizes a unit-variant-array status of Verified', () => {
    const entry = toEntry({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      cert_no: 'DTI-0001',
      status: ['Verified'],
    });
    expect(entry.status).toBe('Verified');
  });

  it('normalizes a unit-variant-array status of Revoked', () => {
    const entry = toEntry({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      cert_no: 'DTI-0001',
      status: ['Revoked'],
    });
    expect(entry.status).toBe('Revoked');
  });

  it('normalizes a plain string status of Revoked', () => {
    const entry = toEntry({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      cert_no: 'DTI-0001',
      status: 'Revoked',
    });
    expect(entry.status).toBe('Revoked');
  });

  it('maps unknown/garbage status to Verified (two-variant enum: anything not Revoked is Verified)', () => {
    const entry = toEntry({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      cert_no: 'DTI-0001',
      status: 'garbage',
    });
    expect(entry.status).toBe('Verified');
  });

  it('maps cert_no to certNo and passes employer/name through', () => {
    const entry = toEntry({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      cert_no: 'DTI-0001',
      status: ['Verified'],
    });
    expect(entry).toEqual({
      employer: 'GEMPLOYER',
      name: 'Sari-Sari Store',
      certNo: 'DTI-0001',
      status: 'Verified',
    });
  });
});
