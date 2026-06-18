/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: '#09090b',
        primary: '#ffffff',
        primaryHover: '#e4e4e7',
        accent: '#52525b',
        textMain: '#fafafa',
        textMuted: '#a1a1aa',
        border: '#27272a',
        slate: {
          800: '#18181b',
          900: '#09090b'
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace']
      }
    },
  },
  plugins: [],
}
