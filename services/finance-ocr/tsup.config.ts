import path from 'node:path';
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        server: 'src/server.ts',
        benchmark: 'scripts/benchmark.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    bundle: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    dts: false,
    esbuildOptions(options) {
        options.alias = {
            ...(options.alias ?? {}),
            '@': path.resolve(import.meta.dirname, '../..'),
        };
    },
});
