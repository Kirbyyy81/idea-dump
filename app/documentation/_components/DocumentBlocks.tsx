'use client';

import { ReactNode, useEffect, useId, useState } from 'react';
import Image from 'next/image';
import type { DocumentationRichText, DocumentationTreeBlock } from '@/lib/types';
import { findTextOffsets } from '@/lib/documentation/core/content';

function RichText({ parts, query, prefix, activeId }: {
    parts: DocumentationRichText[];
    query: string;
    prefix: string;
    activeId: string | null;
}) {
    const full = parts.map((part) => part.text).join('');
    const offsets = findTextOffsets(full, query);
    const length = query.trim().length;
    let absolute = 0;
    return <>{parts.map((part, partIndex) => {
        const start = absolute;
        absolute += part.text.length;
        const boundaries = new Set([0, part.text.length]);
        for (const offset of offsets) {
            if (offset < absolute && offset + length > start) {
                boundaries.add(Math.max(0, offset - start));
                boundaries.add(Math.min(part.text.length, offset + length - start));
            }
        }
        const points = [...boundaries].sort((a, b) => a - b);
        const pieces: ReactNode[] = [];
        for (let index = 0; index < points.length - 1; index += 1) {
            const left = points[index];
            const right = points[index + 1];
            if (right === left) continue;
            const match = offsets.find((offset) => start + left >= offset && start + left < offset + length);
            const id = match === undefined ? null : `${prefix}:${match}`;
            const content = part.text.slice(left, right);
            pieces.push(match === undefined ? content : <mark
                key={index}
                data-doc-match={start + left === match ? id : undefined}
                className={id === activeId ? 'documentation-match-active' : undefined}
            >{content}</mark>);
        }
        let content: ReactNode = <span key={partIndex}>{pieces}</span>;
        if (part.code) content = <code key={partIndex}>{content}</code>;
        if (part.bold) content = <strong key={partIndex}>{content}</strong>;
        if (part.italic) content = <em key={partIndex}>{content}</em>;
        if (part.underline) content = <u key={partIndex}>{content}</u>;
        if (part.strikethrough) content = <s key={partIndex}>{content}</s>;
        if (part.href) content = <a key={partIndex} href={part.href} target="_blank" rel="noopener noreferrer">{content}</a>;
        return content;
    })}</>;
}

function MermaidDiagram({ source }: { source: string }) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    const [svg, setSvg] = useState('');
    const [error, setError] = useState(false);
    useEffect(() => {
        let active = true;
        if (source.length > 50_000) { setError(true); return; }
        import('mermaid').then(async ({ default: mermaid }) => {
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false }, maxTextSize: 50_000 });
            const output = await mermaid.render(`documentation-${id}`, source);
            if (active) setSvg(output.svg);
        }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [id, source]);
    return <div className="documentation-diagram">
        {svg && <div className="documentation-diagram-image" role="img" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: svg }} />}
        {error && <p>Diagram preview unavailable. The source is below.</p>}
        <details><summary>Diagram source</summary><pre>{source}</pre></details>
    </div>;
}

function Block({ block, query, activeId }: { block: DocumentationTreeBlock; query: string; activeId: string | null }) {
    const rich = <RichText parts={block.richText} query={query} prefix={block.id} activeId={activeId} />;
    const children = block.children.length > 0 && <DocumentBlocks blocks={block.children} query={query} activeId={activeId} />;
    const source = block.richText.map((part) => part.text).join('');
    const headingId = `section-${block.id}`;
    switch (block.type) {
        case 'heading_1': return <section id={headingId}><h2>{rich}</h2>{children}</section>;
        case 'heading_2': return <section id={headingId}><h3>{rich}</h3>{children}</section>;
        case 'heading_3': return <section id={headingId}><h4>{rich}</h4>{children}</section>;
        case 'paragraph': return <div><p>{rich}</p>{children}</div>;
        case 'bulleted_list_item': case 'numbered_list_item': return <li>{rich}{children}</li>;
        case 'to_do': return <div className="documentation-todo"><span aria-hidden="true">{block.checked ? '☑' : '☐'}</span><span>{rich}</span>{children}</div>;
        case 'quote': return <blockquote>{rich}{children}</blockquote>;
        case 'callout': return <aside className="documentation-callout"><span aria-hidden="true">{block.icon}</span><div>{rich}{children}</div></aside>;
        case 'toggle': return <details open={Boolean(query.trim())}><summary>{rich}</summary>{children}</details>;
        case 'divider': return <hr />;
        case 'code': return block.language?.toLowerCase() === 'mermaid'
            ? <div>{query && <pre className="documentation-code-search"><RichText parts={block.richText} query={query} prefix={block.id} activeId={activeId} /></pre>}<MermaidDiagram source={source} /></div>
            : <pre className="documentation-code"><code>{rich}</code></pre>;
        case 'table': return <div className="documentation-table-wrap"><table><tbody>{block.children.map((row, rowIndex) => <tr key={row.id}>{row.cells?.map((cell, cellIndex) => {
            const Tag = rowIndex === 0 && block.tableHeader ? 'th' : 'td';
            return <Tag key={cellIndex}><RichText parts={cell} query={query} prefix={`${row.id}-cell-${cellIndex}`} activeId={activeId} /></Tag>;
        })}</tr>)}</tbody></table></div>;
        case 'table_row': return null;
        case 'image': return block.url ? <figure><Image unoptimized src={block.url} alt={source || 'Document image'} width={1200} height={800} referrerPolicy="no-referrer" className="documentation-image" /><figcaption>{rich}</figcaption></figure> : <p>Image unavailable.</p>;
        case 'file': case 'pdf': case 'audio': case 'video': return block.url
            ? <p><a href={block.url} target="_blank" rel="noopener noreferrer">{block.title || block.type.toUpperCase()} ↗</a> {rich}</p>
            : <p>Attachment unavailable.</p>;
        case 'bookmark': case 'embed': case 'link_preview': return block.url
            ? <p><a href={block.url} target="_blank" rel="noopener noreferrer">{source || block.url} ↗</a></p>
            : <p>Embedded content unavailable.</p>;
        case 'child_page': return <p><a href={`https://www.notion.so/${block.id.replace(/-/g, '')}`} target="_blank" rel="noopener noreferrer">{block.title || 'Open page in Notion'} ↗</a></p>;
        case 'column_list': case 'column': case 'synced_block': return <div>{children}</div>;
        case 'table_of_contents': return null;
        default: return <div className="documentation-unsupported">{source ? <p>{rich}</p> : <p>{block.type.replace(/_/g, ' ')} content is available in Notion.</p>}{children}</div>;
    }
}

export function DocumentBlocks({ blocks, query, activeId }: {
    blocks: DocumentationTreeBlock[];
    query: string;
    activeId: string | null;
}) {
    const nodes: ReactNode[] = [];
    for (let index = 0; index < blocks.length;) {
        const block = blocks[index];
        if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
            const type = block.type;
            const group: DocumentationTreeBlock[] = [];
            while (index < blocks.length && blocks[index].type === type) group.push(blocks[index++]);
            const items = group.map((item) => <Block key={item.id} block={item} query={query} activeId={activeId} />);
            nodes.push(type === 'bulleted_list_item' ? <ul key={block.id}>{items}</ul> : <ol key={block.id}>{items}</ol>);
        } else {
            nodes.push(<Block key={block.id} block={block} query={query} activeId={activeId} />);
            index += 1;
        }
    }
    return <div className="documentation-blocks">{nodes}</div>;
}
