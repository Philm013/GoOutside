/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'media',
    content: [
        './index.html',
        './js/**/*.js',
        './css/**/*.css'
    ],
    theme: {
        extend: {
            colors: {
                brand: { light: '#d8f3dc', DEFAULT: '#2d6a4f', dark: '#1b4332', accent: '#e9c46a' },
                surface: { light: '#ffffff', dark: '#242b1e' },
                canvas:  { light: '#f8f4ef', dark: '#1a1e14' }
            },
            fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui'] },
            spacing: {
                'safe-t': 'env(safe-area-inset-top)',
                'safe-b': 'env(safe-area-inset-bottom)',
                'nav': 'calc(64px + env(safe-area-inset-bottom))'
            }
        }
    },
    plugins: []
}
