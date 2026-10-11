'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FilmRoll } from '@/lib/types';
import { AddRollLink } from './AddRollLink';
import { FilmCanister, FILM_ROLL_EXPANDED_WIDTH, FILM_ROLL_WIDTH } from './FilmCanister';

const GAP = 12;
const ADD_ROLL_WIDTH = 48;
const SHADOW_SPACE = 16;

export function FilmShelf({ rolls }: { rolls: FilmRoll[] }) {
    const shelfRef = useRef<HTMLDivElement>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingId = useRef<string | null>(null);
    const [width, setWidth] = useState(0);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const activeId = hoveredId ?? focusedId;

    useLayoutEffect(() => {
        const shelf = shelfRef.current;
        if (!shelf) return;
        setWidth(shelf.getBoundingClientRect().width);
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(shelf);
        return () => observer.disconnect();
    }, []);

    useEffect(() => () => {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    }, []);

    function cancelHover() {
        if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
        pendingId.current = null;
    }

    function previewRoll(id: string, pointerType: string) {
        if (pointerType === 'touch') return;
        if (id === activeId) {
            cancelHover();
            return;
        }
        if (id === pendingId.current) return;
        cancelHover();
        pendingId.current = id;
        // Pointer movement, rather than enter events, prevents layout motion from opening another roll.
        hoverTimer.current = setTimeout(() => {
            setHoveredId(id);
            pendingId.current = null;
            hoverTimer.current = null;
        }, 100);
    }

    const availableWidth = Math.max(1, width - SHADOW_SPACE);
    const scale = width ? Math.min(1, availableWidth / FILM_ROLL_EXPANDED_WIDTH) : 1;
    const collapsedWidth = FILM_ROLL_WIDTH * scale;
    const expansionSpace = (FILM_ROLL_EXPANDED_WIDTH - FILM_ROLL_WIDTH) * scale;
    const perRow = Math.max(1, Math.floor((availableWidth - expansionSpace + GAP) / (collapsedWidth + GAP)));
    const rows: { roll: FilmRoll; index: number }[][] = [];
    for (let index = 0; index < rolls.length; index += perRow) {
        rows.push(rolls.slice(index, index + perRow).map((roll, offset) => ({ roll, index: index + offset })));
    }
    const lastRow = rows.at(-1);
    const addFits = lastRow && lastRow.length * (collapsedWidth + GAP) + expansionSpace + ADD_ROLL_WIDTH <= availableWidth;

    return (
        <div className="bg-surface-film-shelf px-3 py-4 sm:px-5">
            <div
                ref={shelfRef}
                className="space-y-3"
                onPointerLeave={() => { cancelHover(); setHoveredId(null); }}
            >
                {rows.map((row, rowIndex) => (
                    <div key={row[0].roll.id} data-film-row className="flex items-center gap-3">
                        {row.map(({ roll, index }) => (
                            <FilmCanister
                                key={roll.id}
                                roll={roll}
                                index={index}
                                scale={scale}
                                expanded={activeId === roll.id}
                                onHover={previewRoll}
                                onFocus={(id) => { cancelHover(); setHoveredId(null); setFocusedId(id); }}
                                onBlur={() => setFocusedId(null)}
                            />
                        ))}
                        {rowIndex === rows.length - 1 && addFits && <AddRollLink />}
                    </div>
                ))}
                {!addFits && <div className="py-2"><AddRollLink /></div>}
            </div>
        </div>
    );
}
