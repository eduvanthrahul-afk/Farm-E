/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        display: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Professional SaaS palette inspired by the blue-gray product palette.
        primary: {
          50:  '#f4f6f5',
          100: '#eef0ef',
          200: '#ccd0cf',
          300: '#9ba8ab',
          400: '#71818b',
          500: '#4a5c6a',
          600: '#253745',
          700: '#1d2e3a',
          800: '#11212d',
          900: '#06141b',
          950: '#030b10',
        },
        amber: {
          50:  '#faf7ec',
          100: '#f2ead1',
          200: '#e8d9aa',
          300: '#ddc77e',
          400: '#cfb25b',
          500: '#c9a44b',
          600: '#9e7c30',
          700: '#755d27',
          800: '#5b491e',
          900: '#493b1a',
        },
        earth: {
          50:  '#f4f6f5',
          100: '#eef0ef',
          200: '#ccd0cf',
          300: '#9ba8ab',
          400: '#71818b',
          500: '#4a5c6a',
          600: '#253745',
          700: '#1d2e3a',
          800: '#11212d',
          900: '#06141b',
        },
        surface: {
          DEFAULT: '#f4f6f5',
          dark: '#06141b',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: 0, transform: 'scale(0.95)' }, to: { opacity: 1, transform: 'scale(1)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.12), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        'modal': '0 20px 60px -8px rgb(0 0 0 / 0.25)',
        'glow-green': '0 0 20px rgb(74 92 106 / 0.2)',
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
