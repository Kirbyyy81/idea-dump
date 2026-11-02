// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const minimatch = require('minimatch') as typeof import('minimatch-engine').minimatch;

describe('Patched minimatch dependency', () => {
    it('supports the callable API used by ESLint plugins and named API used by TypeScript ESLint', () => {
        const pluginRequire = createRequire(require.resolve('eslint-plugin-react'));
        const legacyMatch = pluginRequire('minimatch') as typeof minimatch;
        expect(legacyMatch('app/page.tsx', '**/*.{ts,tsx}')).toBe(true);
        expect(legacyMatch('app/page.js', '**/*.{ts,tsx}')).toBe(false);
        expect(legacyMatch.defaults({ nocase: true })('PAGE.TSX', '*.tsx')).toBe(true);

        const typescriptRequire = createRequire(require.resolve('@typescript-eslint/typescript-estree'));
        const modernMatch = typescriptRequire('minimatch') as typeof import('minimatch-engine');
        expect(typescriptRequire('minimatch/package.json').version).toBe('11.0.1');
        expect(modernMatch.minimatch('app/page.tsx', '**/*.tsx')).toBe(true);
    });

    it('keeps legacy glob traversal working with globstars, alternatives and dotfiles', () => {
        const fixture = mkdtempSync(join(tmpdir(), 'idea-dump-minimatch-'));
        try {
            mkdirSync(join(fixture, 'nested'));
            for (const file of ['page.ts', '.hidden.ts', 'nested/card.tsx', 'nested/readme.md']) {
                writeFileSync(join(fixture, file), '');
            }
            const rimrafRequire = createRequire(require.resolve('rimraf'));
            const glob = rimrafRequire('glob') as {
                sync(pattern: string, options: { cwd: string; nodir: boolean }): string[];
            };
            expect(glob.sync('**/*.{ts,tsx}', { cwd: fixture, nodir: true }).sort())
                .toEqual(['nested/card.tsx', 'page.ts']);
            expect(glob.sync('**/.*.ts', { cwd: fixture, nodir: true })).toEqual(['.hidden.ts']);
        } finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });

    it('bounds the globstar-parent preprocessing implicated in the advisory', () => {
        const matcher = new minimatch.Minimatch('**/../'.repeat(12) + 'target', {
            optimizationLevel: 2,
            braceExpandMax: 8,
        });
        expect(matcher.globParts.length).toBeLessThanOrEqual(8);
    });
});
