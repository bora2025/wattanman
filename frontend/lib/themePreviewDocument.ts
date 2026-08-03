export type ThemePreviewMode = 'light' | 'dark'
export type ThemePreviewSurface = 'dashboard' | 'public'

export interface ThemePreviewManifest {
  name?: string
  tokens?: { primaryColor?: string }
}

function text(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || '')
}

export function buildThemePreviewDocument(
  manifest: ThemePreviewManifest,
  css: string,
  mode: ThemePreviewMode,
  surface: ThemePreviewSurface,
) {
  const safeCss = css.replace(/</g, '\\3C ')
  const primaryColor = manifest.tokens?.primaryColor || '#14b8a6'
  const dashboardHtml = `<h1>${text(manifest.name || 'Theme preview')}</h1><p>Authenticated dashboard · ${mode} mode</p><div class="grid"><div class="stat-card"><strong>Students</strong><h2>1,248</h2></div><div class="stat-card"><strong>Attendance</strong><h2>94%</h2></div><div class="stat-card"><strong>Classes</strong><h2>36</h2></div></div><div class="card activity"><h2>Recent activity</h2><p>Theme colors, surfaces, cards, and buttons render inside this sandbox only.</p><button class="btn-primary">Primary action</button></div>`
  const publicHtml = `<div class="page-shell"><div class="page-header"><h1>Wattaman International School</h1><p>Public website · ${mode} mode</p><button class="btn-primary">Apply now</button></div><div class="page-body grid"><div class="card"><h2>Our programs</h2><p>Representative public marketing content.</p></div><div class="card"><h2>Admissions</h2><p>Public surfaces use the same scoped theme package.</p></div></div></div>`
  return `<!doctype html><html class="wattaman-theme ${mode === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root{--brand-500:${primaryColor};--brand-600:${primaryColor}}
    *{box-sizing:border-box}html,body{width:100%;min-height:100%;}body{margin:0;padding:28px;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a}.dark body{background:#071a2b;color:#e2e8f0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card,.stat-card{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:18px}.dark .card,.dark .stat-card{background:#0f2538;border-color:#334155}.activity{margin-top:16px}.btn-primary{display:inline-block;margin-top:18px;padding:10px 16px;border-radius:10px;background:#14b8a6;color:#042f2e;border:0;font-weight:700}
    ${safeCss}
  </style></head><body>${surface === 'dashboard' ? dashboardHtml : publicHtml}</body></html>`
}
