import { redactValue, redactString, REDACTED } from './redaction';

describe('redaction', () => {
  describe('redactValue — key-based', () => {
    it('redacts top-level secret fields, keeps the rest', () => {
      const out = redactValue({
        email: 'user@jobfit.test',
        password: 'Password123',
        userId: 'abc-123',
      });
      expect(out).toEqual({
        email: 'user@jobfit.test',
        password: REDACTED,
        userId: 'abc-123',
      });
    });

    it('redacts every sensitive credential field name (case-insensitive)', () => {
      const out = redactValue({
        Password: 'x',
        passwordHash: 'x',
        Authorization: 'Bearer abc',
        token: 'x',
        accessToken: 'x',
        refreshToken: 'x',
        apiKey: 'x',
        verificationCode: '123456',
        passwordResetCode: '654321',
        ssn: '123-45-6789',
      });
      for (const v of Object.values(out)) expect(v).toBe(REDACTED);
    });

    it('redacts secrets nested in objects and arrays', () => {
      const out = redactValue({
        user: { name: 'Jane', password: 'secret' },
        tokens: [{ refreshToken: 'r1' }, { refreshToken: 'r2' }],
      });
      expect(out.user).toEqual({ name: 'Jane', password: REDACTED });
      expect(out.tokens).toEqual([
        { refreshToken: REDACTED },
        { refreshToken: REDACTED },
      ]);
    });

    it('does not mutate the original object', () => {
      const original = { password: 'keepme' };
      redactValue(original);
      expect(original.password).toBe('keepme');
    });

    it('is safe on circular references', () => {
      const a: Record<string, unknown> = { password: 'x' };
      a.self = a;
      expect(() => redactValue(a)).not.toThrow();
      expect((redactValue(a) as Record<string, unknown>).password).toBe(REDACTED);
    });
  });

  describe('redactString — pattern-based', () => {
    it('redacts credit-card numbers', () => {
      expect(redactString('card 4532-1234-5678-9012 end')).toBe('card **CARD** end');
      expect(redactString('4532123456789012')).toBe('**CARD**');
    });

    it('redacts SSNs', () => {
      expect(redactString('ssn 123-45-6789')).toBe('ssn **SSN**');
    });

    it('redacts Bearer tokens', () => {
      expect(redactString('Authorization: Bearer eyJhbGci.abc123')).toBe(
        'Authorization: Bearer ' + REDACTED,
      );
    });

    it('leaves ordinary strings untouched', () => {
      expect(redactString('just a normal message')).toBe('just a normal message');
    });
  });

  it('applies pattern redaction to string values inside objects', () => {
    const out = redactValue({ note: 'paid with 4532 1234 5678 9012' });
    expect(out.note).toBe('paid with **CARD**');
  });
});
