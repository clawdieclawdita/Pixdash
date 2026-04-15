/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#09070b',
        pixel: '#151015',
        ink: '#12100e',
        brass: '#d1a45a',
        circuit: '#00d4aa',
        ember: '#d96c3f',
        moss: '#6d8f63',
        fog: '#d9d0c3'
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0,0,0,0.36)',
        insetGlow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        pixelFrame: '0 0 0 2px rgba(42,37,32,0.95), 0 0 0 4px rgba(209,164,90,0.42), inset 2px 2px 0 rgba(255,230,183,0.12), inset -2px -2px 0 rgba(0,0,0,0.55), 0 18px 38px rgba(0,0,0,0.45)',
        pixelInset: 'inset 2px 2px 0 rgba(255,230,183,0.08), inset -2px -2px 0 rgba(0,0,0,0.62)'
      },
      fontFamily: {
        sans: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Press Start 2P"', '"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      animation: {
        'crt-flicker': 'crtFlicker 6s steps(2, end) infinite',
        'status-blink': 'statusBlink 1.2s steps(2, end) infinite'
      },
      keyframes: {
        crtFlicker: {
          '0%, 100%': { opacity: '0.16' },
          '50%': { opacity: '0.22' },
          '52%': { opacity: '0.12' }
        },
        statusBlink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' }
        }
      }
    }
  },
  plugins: []
};
