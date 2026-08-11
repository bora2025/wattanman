import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROTECTED_DEPENDENCIES = [
  ['r2', 'storage/r2-storage.service.ts'],
  ['email-sendgrid', 'auth/auth-delivery.service.ts'],
  ['sms-twilio', 'auth/auth-delivery.service.ts'],
  ['railway-api', 'platform/railway-domain.service.ts'],
  ['external-image', 'app.controller.ts'],
] as const;

describe('external dependency circuit-breaker registry', () => {
  it('requires every retained outbound provider to use the shared breaker', () => {
    for (const [dependency, file] of PROTECTED_DEPENDENCIES) {
      const source = readFileSync(resolve(process.cwd(), 'src', file), 'utf8');
      expect({ dependency, protected: source.includes(`circuits.execute('${dependency}'`) }).toEqual({ dependency, protected: true });
    }
  });

  it('keeps the provider registry unique', () => {
    expect(new Set(PROTECTED_DEPENDENCIES.map(([dependency]) => dependency)).size).toBe(PROTECTED_DEPENDENCIES.length);
  });
});
