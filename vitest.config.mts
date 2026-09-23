import { defineConfig } from 'vitest/config';

export default defineConfig({
    oxc: {
        jsx: {
            runtime: 'automatic',
        },
    },
    resolve: {
        alias: {
            'server-only': `${import.meta.dirname}/node_modules/next/dist/compiled/server-only/empty.js`,
            '@': import.meta.dirname,
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.{ts,tsx}'],
    },
});
