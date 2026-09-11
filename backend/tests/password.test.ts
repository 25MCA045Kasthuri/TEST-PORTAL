import { describe, it, expect } from 'vitest';
import {
  generateCandidatePassword,
  isValidCandidateUid,
  hashCandidatePassword,
  verifyCandidatePassword,
  PASSWORD_PREFIX,
} from '../src/services/candidatePassword';

describe('generateCandidatePassword', () => {
  it('uses Jmc + last 4 digits of UID', () => {
    expect(PASSWORD_PREFIX).toBe('Jmc');
    expect(generateCandidatePassword('SWAP2K260001')).toBe('Jmc0001');
    expect(generateCandidatePassword('SWAP2K260009')).toBe('Jmc0009');
    expect(generateCandidatePassword('SWAP2K260010')).toBe('Jmc0010');
    expect(generateCandidatePassword('SWAP2K260100')).toBe('Jmc0100');
    expect(generateCandidatePassword('SWAP2K261000')).toBe('Jmc1000');
  });

  it('normalizes whitespace and case before generating', () => {
    expect(generateCandidatePassword('  swap2k260001  ')).toBe('Jmc0001');
    expect(generateCandidatePassword('swap2k261234')).toBe('Jmc1234');
  });

  it.each(['SWAP001', 'SWAP2K261', 'SWAP2K26001', 'SWAP2K2600001', 'SWAP2K26ABCD', ''])(
    'rejects invalid UID %s',
    (uid) => {
      expect(() => generateCandidatePassword(uid)).toThrow(/Invalid UID format/);
      expect(isValidCandidateUid(uid)).toBe(false);
    },
  );

  it('accepts valid UIDs', () => {
    expect(isValidCandidateUid('SWAP2K260001')).toBe(true);
    expect(isValidCandidateUid('SWAP2K269999')).toBe(true);
  });
});

describe('hashing', () => {
  it('stores a bcrypt hash, never the plaintext', async () => {
    const hash = await hashCandidatePassword('Jmc0001');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('Jmc0001');
  });

  it('verifies correct password and rejects wrong/case-variant password', async () => {
    const hash = await hashCandidatePassword('Jmc0001');
    expect(await verifyCandidatePassword('Jmc0001', hash)).toBe(true);
    expect(await verifyCandidatePassword('Jmc0002', hash)).toBe(false);
    expect(await verifyCandidatePassword('jmc0001', hash)).toBe(false);
    expect(await verifyCandidatePassword('JMC0001', hash)).toBe(false);
  });
});