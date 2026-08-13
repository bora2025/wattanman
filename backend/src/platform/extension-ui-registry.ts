export const EXTENSION_UI_COMPONENTS = ['stats', 'form', 'table', 'details', 'chart'] as const;
export const EXTENSION_UI_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'REPORTER', 'EMPLOYEE', 'PARENT', 'STUDENT'] as const;
export const EXTENSION_FIELD_TYPES = ['text', 'number', 'date', 'boolean'] as const;

export const EXTENSION_COMPONENT_ACTIONS: Record<(typeof EXTENSION_UI_COMPONENTS)[number], readonly string[]> = {
  stats: [],
  form: ['create', 'update'],
  table: ['view', 'edit', 'delete'],
  details: [],
  chart: [],
};

export const EXTENSION_COMPONENT_PROPERTIES: Record<(typeof EXTENSION_UI_COMPONENTS)[number], readonly string[]> = {
  stats: ['type', 'title', 'titleKey', 'metrics'],
  form: ['type', 'title', 'titleKey', 'actions'],
  table: ['type', 'title', 'titleKey', 'columns', 'actions', 'searchable'],
  details: ['type', 'title', 'titleKey', 'fields'],
  chart: ['type', 'title', 'titleKey', 'categoryField', 'valueField', 'aggregate'],
};
