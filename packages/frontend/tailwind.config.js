/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12100e',
        brass: '#d1a45a',
        ember: '#d96c3f',
        moss: '#6d8f63',
        fog: '#d9d0c3'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0,0,0,0.36)',
        insetGlow: 'inset 0 1px 0 rgba(255,255,255,0.08)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
