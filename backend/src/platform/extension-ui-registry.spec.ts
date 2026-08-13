import { EXTENSION_COMPONENT_ACTIONS, EXTENSION_COMPONENT_PROPERTIES, EXTENSION_FIELD_TYPES, EXTENSION_UI_COMPONENTS } from './extension-ui-registry';

describe('extension UI registry', () => {
  it('keeps the v1 component and field registries closed', () => {
    expect(EXTENSION_UI_COMPONENTS).toEqual(['stats', 'form', 'table', 'details', 'chart']);
    expect(EXTENSION_FIELD_TYPES).toEqual(['text', 'number', 'date', 'boolean']);
    expect(EXTENSION_COMPONENT_ACTIONS).toEqual({
      stats: [], form: ['create', 'update'], table: ['view', 'edit', 'delete'], details: [], chart: [],
    });
    expect(Object.keys(EXTENSION_COMPONENT_PROPERTIES)).toEqual(EXTENSION_UI_COMPONENTS);
  });
});
