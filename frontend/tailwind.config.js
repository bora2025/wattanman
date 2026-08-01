/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // --font-theme is set per-tenant by the active theme (Phase 19); it
        // falls back to the original fixed Inter face when no theme (or a
        // theme with no font override) is active, so this is a strict
        // superset of the pre-Phase-19 behavior, not a breaking change.
        sans: ['var(--font-theme, var(--font-inter))', 'var(--font-khmer)', 'sans-serif'],
        khmer: ['var(--font-khmer)', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      screens: {
        'xs': '475px',
      },
      colors: {
        // Theme brand colors (Phase 19) — resolved through CSS variables
        // defined in app/styles.css, so any curated color a platform admin
        // picks for a theme "just works" as bg-brand-600, ring-brand-500,
        // etc. across every file that uses these classes, with no
        // per-theme code changes ever needed again.
        brand: {
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
          950: 'var(--brand-950)',
        },
        'brand-secondary': {
          100: 'var(--brand-secondary-100)',
          200: 'var(--brand-secondary-200)',
          600: 'var(--brand-secondary-600)',
          700: 'var(--brand-secondary-700)',
          800: 'var(--brand-secondary-800)',
          900: 'var(--brand-secondary-900)',
          950: 'var(--brand-secondary-950)',
        },
      },
    },
  },
  plugins: [],
}
