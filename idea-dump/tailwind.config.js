/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ['class', '[data-theme="dark"]'],
    content: [
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // Base colors
                'bg-base': 'var(--bg-base)',
                'bg-elevated': 'var(--bg-elevated)',
                'bg-hover': 'var(--bg-hover)',

                // Text colors
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-muted': 'var(--text-muted)',

                // Accent colors
                'accent-rose': 'var(--accent-rose)',
                'accent-coral': 'var(--accent-coral)',
                'accent-sage': 'var(--accent-sage)',
                'accent-blue': 'var(--accent-blue)',
                'accent-apricot': 'var(--accent-apricot)',

                // Status colors
                'status-idea': 'var(--status-idea)',
                'status-prd': 'var(--status-prd)',
                'status-dev': 'var(--status-dev)',
                'status-complete': 'var(--status-complete)',
                'status-archived': 'var(--status-archived)',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            borderRadius: {
                'card': '16px',
                'button': '8px',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.5s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};
