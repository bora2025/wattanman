const { parentPort } = require('worker_threads');

parentPort.postMessage({
  valid: true,
  manifest: { key: 'FIXTURE' },
  errors: [],
  warnings: [],
  files: [{ path: 'extension.json', size: 2, checksum: 'fixture', mimeType: 'application/json', contents: Buffer.from('{}') }],
});
