/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f1117',
        surface: '#1a1d27',
        border: '#2a2d3a',
        accent: '#00d4aa',
        green: '#00c853',
        red: '#ff3d57',
        warn: '#ffa726',
        muted: '#6b7280',
      },
    },
  },
  plugins: [],
}

