/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: 'var(--bg)',
        card: 'var(--bg-card)',
        ink: 'var(--text)',
        muted: 'var(--text-muted)',
        edge: 'var(--border)',
        accent: 'var(--accent)',
        saved: 'var(--bookmark)',
        'saved-border': 'var(--bookmark-border)',
      },
    },
  },
  plugins: [],
}
