/** @type {import('tailwindcss').Config} */
// Al Mihad Training Centre — brand palette
//   maroon  #7A1418  primary (sidebar, headings, primary buttons)
//   gold    #C9A227  accent  (active nav, highlights, tagline)
//   cream   #FBF6E9  warm tint for panels and page background
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: '#7A1418',
          50: '#FBF3F3',
          100: '#F4E2E3',
          600: '#94222A',
          700: '#651015',
          800: '#5C0D16',
          900: '#4A0A11',
          950: '#2E060A',
        },
        gold: {
          DEFAULT: '#C9A227',
          50: '#FBF6E9',
          100: '#F3E6BF',
          400: '#D9B84E',
          500: '#C9A227',
          600: '#8F7213',
        },
        cream: {
          DEFAULT: '#FBF6E9',
          50: '#FDFBF6',
          100: '#FBF6E9',
          200: '#F3EAD3',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', '-apple-system', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(74,10,17,.06), 0 8px 24px -12px rgba(74,10,17,.18)',
      },
    },
  },
  plugins: [],
};
