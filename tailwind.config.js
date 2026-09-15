/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      animation: {
        speaking: 'speaking-pulse 2s ease-in-out infinite',
        'toast-in': 'toast-in 0.15s ease-out',
      },
      keyframes: {
        'speaking-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(0.5rem)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
