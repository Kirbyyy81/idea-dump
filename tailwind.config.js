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
                'bg-canvas': 'var(--bg-canvas)',
                'bg-shell': 'var(--bg-shell)',
                'bg-surface': 'var(--bg-surface)',
                'bg-base': 'var(--bg-base)',
                'bg-elevated': 'var(--bg-elevated)',
                'bg-subtle': 'var(--bg-subtle)',
                'bg-hover': 'var(--bg-hover)',
                'bg-selected': 'var(--bg-selected)',

                // Navigation colors
                'nav-bg': 'var(--nav-bg)',
                'nav-bg-hover': 'var(--nav-bg-hover)',
                'nav-text': 'var(--nav-text)',
                'nav-text-muted': 'var(--nav-text-muted)',

                // Text colors
                'text-primary': 'var(--text-primary)',
                'text-secondary': 'var(--text-secondary)',
                'text-muted': 'var(--text-muted)',
                'text-disabled': 'var(--text-disabled)',
                'text-on-dark': 'var(--text-on-dark)',

                // Border colors
                'border-default': 'var(--border-default)',
                'border-subtle': 'var(--border-subtle)',
                'border-strong': 'var(--border-strong)',
                'border-dark': 'var(--border-dark)',

                // Accent colors
                'action-primary': 'var(--action-primary)',
                'action-primary-hover': 'var(--action-primary-hover)',
                'action-primary-text': 'var(--action-primary-text)',
                'accent-rose': 'var(--accent-rose)',
                'accent-coral': 'var(--accent-coral)',
                'accent-sage': 'var(--accent-sage)',
                'accent-blue': 'var(--accent-blue)',
                'accent-apricot': 'var(--accent-apricot)',
                'pastel-pink': 'var(--pastel-pink)',
                'pastel-pink-soft': 'var(--pastel-pink-soft)',
                'pastel-yellow': 'var(--pastel-yellow)',
                'pastel-yellow-soft': 'var(--pastel-yellow-soft)',
                'pastel-olive': 'var(--pastel-olive)',
                'pastel-olive-soft': 'var(--pastel-olive-soft)',
                'pastel-blue': 'var(--pastel-blue)',
                'pastel-blue-soft': 'var(--pastel-blue-soft)',
                'pastel-lilac': 'var(--pastel-lilac)',
                'pastel-peach': 'var(--pastel-peach)',

                // Status colors
                'surface-primary': 'var(--surface-primary)',
                'surface-film-shelf': 'var(--surface-film-shelf)',
                'overlay-backdrop': 'var(--overlay-backdrop)',
                'surface-idea': 'var(--surface-idea)',
                'surface-prd': 'var(--surface-prd)',
                'surface-active': 'var(--surface-active)',
                'surface-complete': 'var(--surface-complete)',
                'surface-archived': 'var(--surface-archived)',
                'status-idea': 'var(--status-idea)',
                'status-prd': 'var(--status-prd)',
                'status-dev': 'var(--status-dev)',
                'status-complete': 'var(--status-complete)',
                'status-deployed': 'var(--status-deployed)',
                'status-archived': 'var(--status-archived)',

                // Semantic colors
                'success': 'var(--success)',
                'success-bg': 'var(--success-bg)',
                'warning': 'var(--warning)',
                'warning-bg': 'var(--warning-bg)',
                'error': 'var(--error)',
                'error-bg': 'var(--error-bg)',
                'info': 'var(--info)',
                'info-bg': 'var(--info-bg)',

                // Chart colors
                'chart-1': 'var(--chart-1)',
                'chart-2': 'var(--chart-2)',
                'chart-3': 'var(--chart-3)',
                'chart-4': 'var(--chart-4)',
                'chart-5': 'var(--chart-5)',
            },
            fontFamily: {
                sans: ['var(--font-body)'],
                body: ['var(--font-body)'],
                heading: ['var(--font-heading)'],
            },
            borderRadius: {
                'xs': 'var(--radius-xs)',
                'sm': 'var(--radius-sm)',
                'md': 'var(--radius-md)',
                'lg': 'var(--radius-lg)',
                'xl': 'var(--radius-xl)',
                'shell': 'var(--radius-shell)',
                'pill': 'var(--radius-pill)',
                'card': 'var(--radius-lg)',
                'button': 'var(--radius-pill)',
            },
            boxShadow: {
                'subtle': 'var(--shadow-subtle)',
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
