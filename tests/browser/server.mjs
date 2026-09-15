import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../../tailwind.config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = await mkdtemp(path.join(tmpdir(), 'finance-budget-browser-'));
await build({ entryPoints: [path.join(root, 'tests/browser/harness.tsx')], outfile: path.join(output, 'app.js'), bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: { '@': root, '@/components/organisms/AppShell': path.join(root, 'tests/browser/shell.tsx'), 'next/link': path.join(root, 'tests/browser/link.tsx') } });
const css = await postcss([tailwind(tailwindConfig), autoprefixer]).process(await readFile(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
await writeFile(path.join(output, 'styles.css'), css.css);
const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/app.js' || url.pathname === '/styles.css') {
        response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
        response.end(await readFile(path.join(output, url.pathname.slice(1))));
    } else {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html lang="en" style="--font-sans:Arial,sans-serif"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>Budget UI test</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    }
});
server.listen(4179, '127.0.0.1', () => process.stdout.write('Budget UI test server ready\n'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
