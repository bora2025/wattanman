import { MODULE_REGISTRY } from './module-registry';

describe('Class Management extension registry', () => {
  const extension = MODULE_REGISTRY.find((entry) => entry.key === 'CLASSES');

  it('publishes Class Management as a versioned first-party extension', () => {
    expect(extension).toMatchObject({
      name: 'Class Management',
      version: '1.1.0',
      managementPath: '/extensions/CLASSES/manage',
    });
  });

  it('separates managed capabilities from shared academic contracts', () => {
    expect(extension?.capabilities).toEqual(
      expect.arrayContaining([
        'classes:create',
        'classes:update',
        'classes:delete',
      ]),
    );
    expect(extension?.sharedCapabilities).toEqual(
      expect.arrayContaining([
        'classes:read',
        'classes:read_assigned',
        'classes:roster_read',
      ]),
    );
  });
});
