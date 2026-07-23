/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // These map directly to the CSS variables we just added in styles.css
        base: 'var(--bg-base)',
        panel: 'var(--bg-panel)',
        primary: 'var(--text-primary)',
        muted: 'var(--text-muted)',
        line: 'var(--border-line)',
        hover: 'var(--card-hover)',
      }
    },
  },
  plugins: [],
}