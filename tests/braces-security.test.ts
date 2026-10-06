import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
type Node = { type: string; nodes?: Node[]; value?: string };
const braces = require('braces') as {
    (pattern: string, options?: { expand?: boolean }): string[];
    parse(pattern: string): Node;
    compile(pattern: string | Node): string;
    expand(pattern: string | Node): string[];
    stringify(pattern: string | Node): string;
};

describe('Patched brace matching dependency', () => {
    it('installs the guarded local package through the dependency override', () => {
        expect(require('braces/package.json').name).toBe('@idea-dump/braces');
        for (const consumer of ['micromatch', 'chokidar']) {
            const consumerRequire = createRequire(require.resolve(consumer));
            expect(consumerRequire('braces/package.json').name).toBe('@idea-dump/braces');
        }
    });

    it('preserves application content globs, alternatives and numeric ranges', () => {
        expect(braces('app/**/*.{js,ts,jsx,tsx,mdx}')).toEqual(['app/**/*.(js|ts|jsx|tsx|mdx)']);
        expect(braces('a/{b,{c,d}}', { expand: true })).toEqual(['a/b', 'a/c', 'a/d']);
        expect(braces('item-{1..3}', { expand: true })).toEqual(['item-1', 'item-2', 'item-3']);
    });

    it.each(['{', '('])('rejects deeply nested %s patterns before recursive traversal', (opening) => {
        const closing = opening === '{' ? '}' : ')';
        const pattern = opening.repeat(4_000) + 'a,b' + closing.repeat(4_000);
        for (const operation of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
            expect(() => operation(pattern)).toThrow(SyntaxError);
            expect(() => operation(pattern)).toThrow('nesting exceeds 128 levels');
        }
    });

    it('guards directly supplied deep and cyclic ASTs', () => {
        let deep: Node = { type: 'text', value: 'x' };
        for (let index = 0; index < 10_000; index++) deep = { type: 'root', nodes: [deep] };
        const cyclic: Node = { type: 'root' };
        cyclic.nodes = [cyclic];
        for (const ast of [deep, cyclic]) {
            for (const operation of [braces.compile, braces.expand, braces.stringify]) {
                expect(() => operation(ast)).toThrow('nesting exceeds 128 levels');
            }
        }
    });
});
