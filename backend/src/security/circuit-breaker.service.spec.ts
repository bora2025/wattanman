import { ServiceUnavailableException } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = {
      ...original,
      NODE_ENV: 'test',
      REDIS_URL: '',
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: '2',
      CIRCUIT_BREAKER_RESET_TIMEOUT_MS: '1000',
    };
  });
  afterEach(() => { process.env = original; jest.restoreAllMocks(); });

  it('opens after repeated failures and permits one recovery probe', async () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const service = new CircuitBreakerService();
    const failing = jest.fn().mockRejectedValue(new Error('provider unavailable'));

    await expect(service.execute('email-sendgrid', failing)).rejects.toThrow('provider unavailable');
    await expect(service.execute('email-sendgrid', failing)).rejects.toThrow('provider unavailable');
    const blocked = jest.fn();
    await expect(service.execute('email-sendgrid', blocked)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(blocked).not.toHaveBeenCalled();

    now += 1_001;
    await expect(service.execute('email-sendgrid', async () => 'recovered')).resolves.toBe('recovered');
    await expect(service.execute('email-sendgrid', async () => 'healthy')).resolves.toBe('healthy');
  });

  it('requires distributed Redis configuration in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = '';
    expect(() => new CircuitBreakerService()).toThrow('Production REDIS_URL is required');
  });
});
