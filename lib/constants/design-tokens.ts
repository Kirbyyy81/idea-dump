export const designTokens = {
    accent: {
        rose: 'accent-rose',
    },
    background: {
        base: 'bg-base',
        hover: 'bg-hover',
        subtle: 'bg-subtle',
    },
    border: {
        default: 'border-default',
        strong: 'border-strong',
        subtle: 'border-subtle',
    },
    status: {
        complete: 'status-complete',
    },
    surface: {
        primary: 'surface-primary',
        tertiary: 'surface-tertiary',
    },
    text: {
        muted: 'text-muted',
        primary: 'text-primary',
        secondary: 'text-secondary',
    },
    typography: {
        body: 'font-body',
        heading: 'font-heading',
    },
} as const;

export type DesignTokens = typeof designTokens;
