/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        accent: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        muted: '#6B7280',
        surface: '#1F2937',
        background: '#111827',
      },
    },
  },
  plugins: [],
};
