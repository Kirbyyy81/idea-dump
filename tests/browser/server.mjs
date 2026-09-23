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
    alias: { '@': root, '@/components/organisms/AppShell': path.join(root, 'tests/browser/shell.tsx'), 'next/link': path.join(root, 'tests/browser/link.tsx'), 'next/navigation': path.join(root, 'tests/browser/navigation.ts') } });
await build({ entryPoints: [path.join(root, 'tests/browser/documentation-harness.tsx')], outfile: path.join(output, 'documentation-app.js'), bundle: true, jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    alias: { '@': root, '@/components/organisms/AppShell': path.join(root, 'tests/browser/shell.tsx'), 'next/link': path.join(root, 'tests/browser/link.tsx'), 'next/image': path.join(root, 'tests/browser/image.tsx') } });
const css = await postcss([tailwind(tailwindConfig), autoprefixer]).process(await readFile(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
await writeFile(path.join(output, 'styles.css'), css.css);
const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/documentation')) {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        const id = '11111111-1111-1111-1111-111111111111';
        const page = { id, title: 'Hybrid Technical Documentation', type: 'Technical Documentation', version: 'v002', projectId: null, projectName: null,
            lastEditedTime: '2026-09-23T00:00:00.000Z', notionUrl: `https://www.notion.so/${id}` };
        const rich = (text) => [{ text, href: null, bold: false, italic: false, underline: false, strikethrough: false, code: false }];
        const block = (blockId, type, text, extra = {}) => ({ id: blockId, type, hasChildren: false, richText: rich(text), ...extra });
        let data;
        if (url.pathname === '/api/documentation') data = { documents: [page], nextCursor: null };
        else if (url.pathname.endsWith('/content')) {
            if (url.searchParams.get('parentId') === '22222222-2222-2222-2222-222222222222') {
                data = { blocks: [block('33333333-3333-3333-3333-333333333333', 'table_row', '', { cells: [rich('Field'), rich('A long column heading'), rich('Searchable value')] })], nextCursor: null };
            } else data = { blocks: [
                block('44444444-4444-4444-4444-444444444444', 'heading_1', 'Architecture'),
                block('55555555-5555-5555-5555-555555555555', 'paragraph', 'The hybrid plan checks eligibility before confirmation.'),
                block('22222222-2222-2222-2222-222222222222', 'table', '', { hasChildren: true, tableWidth: 3, tableHeader: true }),
                block('66666666-6666-6666-6666-666666666666', 'code', 'const eligibility = true;', { language: 'typescript' }),
                block('77777777-7777-7777-7777-777777777777', 'code', 'graph TD; A[Start]-->B[Done]', { language: 'mermaid' }),
                block('88888888-8888-8888-8888-888888888888', 'child_page', '', { title: 'Versions', hasChildren: true }),
            ], nextCursor: null };
        } else data = page;
        response.end(JSON.stringify({ data }));
    } else if (['/app.js', '/styles.css', '/documentation-app.js', '/documentation-app.css'].includes(url.pathname)) {
        response.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
        response.end(await readFile(path.join(output, url.pathname.slice(1))));
    } else {
        response.setHeader('Content-Type', 'text/html');
        const documentation = url.pathname.startsWith('/documentation');
        response.end(`<!doctype html><html lang="en" style="--font-sans:Arial,sans-serif"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css">${documentation ? '<link rel="stylesheet" href="/documentation-app.css">' : ''}<title>${documentation ? 'Documentation' : 'Budget'} UI test</title></head><body><div id="root"></div><script src="/${documentation ? 'documentation-app' : 'app'}.js"></script></body></html>`);
    }
});
server.listen(4179, '127.0.0.1', () => process.stdout.write('Budget UI test server ready\n'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
