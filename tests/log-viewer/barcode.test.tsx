import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BitArray, Code128Reader } from '@zxing/library';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import type { UserAppAccess } from '@/lib/rbac/types';
import { findModuleRouteRule } from '@/lib/rbac/routes';
import { BarcodeSessionProvider } from '@/app/log-viewer/barcode-generator/_components/BarcodeSessionProvider';
import { BarcodeGenerator } from '@/app/log-viewer/barcode-generator/_components/BarcodeGenerator';
import { BARCODE_STORAGE_PREFIX, parseBarcodeHistory, serializeBarcodeHistory } from '@/lib/log-viewer/barcode/history';

const auth = vi.hoisted(() => ({
    callback: null as null | ((event: string, session: { user: { id: string } } | null) => void),
    unsubscribe: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { onAuthStateChange: (callback: typeof auth.callback) => {
        auth.callback = callback;
        return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    } } }),
}));

const access = (userId = 'user-a', allowed = true): UserAppAccess => ({
    userId, allowedModules: allowed ? ['log_viewer'] : [], modules: [], role: 'member', overrides: {}, canManageAccess: false,
});
function Workspace({ user = 'user-a', allowed = true, visible = true }: { user?: string; allowed?: boolean; visible?: boolean }) {
    return <AccessProvider access={access(user, allowed)}><BarcodeSessionProvider>
        {visible && <BarcodeGenerator />}
    </BarcodeSessionProvider></AccessProvider>;
}
const key = BARCODE_STORAGE_PREFIX + 'user-a';
function enter(value: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Number' }), { target: { value } });
}
function settle() { act(() => vi.advanceTimersByTime(400)); }
function historyButtons() { return within(screen.getByRole('complementary', { name: 'Recent numbers' })).queryAllByRole('button'); }

beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        measureText: (text: string) => ({ width: text.length * 12 }),
    } as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('barcode generation and session history', () => {
    it('debounces input, preserves exact digits and immediately removes a stale preview', () => {
        render(<Workspace />);
        enter('000123');
        act(() => vi.advanceTimersByTime(300));
        enter('0001234567890123456789');
        act(() => vi.advanceTimersByTime(399));
        expect(screen.queryByRole('img')).toBeNull();
        expect(historyButtons()).toHaveLength(0);
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Barcode for 0001234567890123456789');
        expect(historyButtons().map(button => button.textContent)).toEqual(['0001234567890123456789']);
        enter('123x');
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
        settle();
        expect(historyButtons()).toHaveLength(1);
        enter(' ');
        settle();
        expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBeNull();
    });

    it('keeps seven distinct values and recall supersedes pending generation', () => {
        render(<Workspace />);
        for (let i = 1; i <= 8; i++) { enter(String(i)); settle(); }
        expect(historyButtons().map(button => button.textContent)).toEqual(['8', '7', '6', '5', '4', '3', '2']);
        enter('999');
        fireEvent.click(screen.getByRole('button', { name: '3' }));
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Barcode for 3');
        settle();
        expect(historyButtons().map(button => button.textContent)).toEqual(['3', '8', '7', '6', '5', '4', '2']);
        expect(parseBarcodeHistory(sessionStorage.getItem(key))).toEqual(['3', '8', '7', '6', '5', '4', '2']);
    });

    it('trims the input but rejects multiline pastes before the browser joins them', () => {
        render(<Workspace />);
        enter(' 00123 ');
        settle();
        expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Barcode for 00123');
        const field = screen.getByRole('textbox') as HTMLInputElement;
        field.setSelectionRange(0, field.value.length);
        fireEvent.paste(field, { clipboardData: { getData: () => '123\n456' } });
        settle();
        expect(screen.queryByRole('img')).toBeNull();
        expect(historyButtons()).toHaveLength(1);
    });

    it('restores validated history without automatically displaying an old barcode', () => {
        sessionStorage.setItem(key, JSON.stringify({ version: 1, values: ['0001', '0001', null, 'bad', '<svg>', '2'] }));
        const { unmount } = render(<Workspace />);
        expect(historyButtons().map(button => button.textContent)).toEqual(['0001', '2']);
        expect(screen.queryByRole('img')).toBeNull();
        enter('003');
        settle();
        unmount();
        render(<Workspace />);
        expect(historyButtons().map(button => button.textContent)).toEqual(['003', '0001', '2']);
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('survives blocked storage and retains bounded in-memory history across routes', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        const { rerender } = render(<Workspace />);
        enter('001');
        settle();
        expect(historyButtons()).toHaveLength(1);
        expect(screen.getByText(/Temporary storage is unavailable/)).toBeTruthy();
        rerender(<Workspace visible={false} />);
        rerender(<Workspace />);
        expect(historyButtons()[0].textContent).toBe('001');
    });

    it('clears on sign-out even away from the generator and isolates account changes', () => {
        const { rerender } = render(<Workspace />);
        enter('001');
        settle();
        rerender(<Workspace visible={false} />);
        act(() => auth.callback?.('SIGNED_OUT', null));
        expect(sessionStorage.getItem(key)).toBeNull();
        rerender(<Workspace user="user-b" />);
        expect(historyButtons()).toHaveLength(0);
        enter('002');
        settle();
        rerender(<Workspace />);
        expect(historyButtons()).toHaveLength(0);
        expect(sessionStorage.getItem(BARCODE_STORAGE_PREFIX + 'user-b')).toBeNull();
    });

    it('cancels pending work when auth changes or the page unmounts', () => {
        const { rerender } = render(<Workspace />);
        enter('001');
        act(() => auth.callback?.('SIGNED_OUT', null));
        settle();
        expect(sessionStorage.getItem(key)).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        rerender(<Workspace user="user-b" />);
        enter('002');
        rerender(<Workspace user="user-b" visible={false} />);
        settle();
        expect(sessionStorage.getItem(BARCODE_STORAGE_PREFIX + 'user-b')).toBeNull();
    });

    it('does not add a failed rendering to history', () => {
        render(<Workspace />);
        enter('123');
        vi.spyOn(document, 'createElementNS').mockImplementationOnce(() => { throw new Error('renderer failed'); });
        settle();
        expect(screen.queryByRole('img')).toBeNull();
        expect(historyButtons()).toHaveLength(0);
        expect(screen.getByText(/Unable to generate/)).toBeTruthy();
        enter('456');
        settle();
        expect(historyButtons()).toHaveLength(1);
    });

    it('uses existing nested-route permission and does not render without access', () => {
        expect(findModuleRouteRule('/log-viewer/barcode-generator')?.module).toBe('log_viewer');
        render(<Workspace allowed={false} />);
        expect(screen.queryByRole('textbox')).toBeNull();
    });

    it.each(['not json', '{"version":2,"values":["123"]}', '{"version":1,"values":{}}'])('recovers malformed storage: %s', raw => {
        expect(parseBarcodeHistory(raw)).toEqual([]);
    });


    it('rejects noncanonical stored values and clears stale state on an empty initial auth session', () => {
        expect(parseBarcodeHistory(JSON.stringify({ version: 1, values: ['123\n', ' 123', '１２３', '00123'] }))).toEqual(['00123']);
        sessionStorage.setItem(key, serializeBarcodeHistory(['00123']));
        render(<Workspace />);
        act(() => auth.callback?.('INITIAL_SESSION', null));
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(sessionStorage.getItem(key)).toBeNull();
    });

    it('rejects oversized values without truncating identifiers', () => {
        render(<Workspace />);
        enter('1'.repeat(257));
        settle();
        expect(screen.queryByRole('img')).toBeNull();
        expect(screen.getByText('Use 256 digits or fewer.')).toBeTruthy();
        expect(parseBarcodeHistory(serializeBarcodeHistory(['0001', '1'.repeat(257)]))).toEqual(['0001']);
    });

    it.each(['0', '0001234', '12345678', '000123456789012345678901234567890'])('independently decodes the actual SVG bars for %s', value => {
        render(<Workspace />);
        enter(value);
        settle();
        const svg = screen.getByRole('img');
        const width = parseFloat(svg.getAttribute('width')!);
        const row = new BitArray(width);
        const group = svg.querySelector('g')!;
        const offset = Number(group.getAttribute('transform')!.match(/translate\((\d+)/)![1]);
        for (const rect of group.querySelectorAll('rect')) {
            const x = Number(rect.getAttribute('x')) + offset;
            const barWidth = Number(rect.getAttribute('width'));
            for (let pixel = x; pixel < x + barWidth; pixel++) row.set(pixel);
        }
        expect(new Code128Reader().decodeRow(0, row, new Map()).getText()).toBe(value);
        expect(svg.querySelector('text')!.textContent).toBe(value);
        expect(svg.querySelector(':scope > rect')!.getAttribute('fill')).toBe('#ffffff');
    });
});
