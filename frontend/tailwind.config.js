/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#04040f',
          1: '#08081a',
          2: '#0c0c20',
          3: '#111128',
          4: '#16162e',
        },
        brand: {
          DEFAULT: '#7c3aed',
          light:   '#a78bfa',
          dark:    '#5b21b6',
          faint:   'rgba(124,58,237,0.12)',
        },
      },
      boxShadow: {
        'card':        '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        'card-hover':  '0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glow-sm':     '0 0 16px rgba(124,58,237,0.35)',
        'glow':        '0 0 32px rgba(124,58,237,0.45)',
        'glow-lg':     '0 0 64px rgba(124,58,237,0.4)',
        'emerald-glow':'0 0 16px rgba(16,185,129,0.3)',
      },
      backgroundImage: {
        'gradient-brand':   'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
        'gradient-hero':    'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 60%)',
        'gradient-card':    'linear-gradient(135deg, rgba(124,58,237,0.05) 0%, transparent 100%)',
        'gradient-emerald': 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, transparent 100%)',
      },
      padding: {
        'safe': 'env(safe-area-inset-bottom, 0px)',
      },
      animation: {
        'shimmer':    'shimmer 1.8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-right':'slideRight 0.25s cubic-bezier(0.32,0.72,0,1)',
      },
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(124,58,237,0.3)' },
          '50%':      { boxShadow: '0 0 40px rgba(124,58,237,0.6)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          from: { transform: 'translateX(100%)' },
          to:   { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
