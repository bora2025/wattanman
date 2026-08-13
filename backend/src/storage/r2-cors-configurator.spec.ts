const configurator = require('../../scripts/configure-r2-cors');

describe('R2 browser CORS configurator', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      R2_ACCOUNT_ID: 'account-1',
      R2_BUCKET: 'private-bucket',
      R2_BROWSER_ORIGINS: 'https://school.example,https://platform.example',
      CLOUDFLARE_API_TOKEN: 'management-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('accepts a management token without S3 credentials and builds exact rules', () => {
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    const config = configurator.configuration();
    expect(config.apiToken).toBe('management-token');
    expect(configurator.corsRules(config)).toEqual([expect.objectContaining({
      allowed: {
        origins: ['https://school.example', 'https://platform.example'],
        methods: ['GET', 'PUT', 'HEAD'],
        headers: ['Content-Type', 'x-amz-meta-sha256'],
      },
    })]);
  });

  it('sends the management token only in the authorization header', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const config = configurator.configuration();
    await configurator.putCorsViaManagementApi(config);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-1/r2/buckets/private-bucket/cors',
      expect.objectContaining({
        method: 'PUT',
        headers: { Authorization: 'Bearer management-token', 'Content-Type': 'application/json' },
      }),
    );
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('management-token');
  });

  it('rejects wildcard and path-bearing origins', () => {
    process.env.R2_BROWSER_ORIGINS = 'https://*.example.com';
    expect(() => configurator.configuration()).toThrow('Unsafe R2 browser origin');
    process.env.R2_BROWSER_ORIGINS = 'https://school.example/path';
    expect(() => configurator.configuration()).toThrow('Unsafe R2 browser origin');
  });
});
