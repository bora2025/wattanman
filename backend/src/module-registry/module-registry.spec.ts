import { MODULE_REGISTRY } from './module-registry';

describe('Module registry after feature removal', () => {
  it('does not seed any legacy core modules', () => {
    expect(MODULE_REGISTRY).toEqual([]);
  });
});
