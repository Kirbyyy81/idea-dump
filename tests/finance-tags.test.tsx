import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { FinanceReferenceDataProvider } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import { parseFinanceTagFilter, parseFinanceTagIds, transactionTags, writeFinanceTagFilter } from '@/lib/finance/tagValues';
import { parseFinanceTransactionListFilters, financeTransactionsHref } from '@/lib/finance/transactions/filters';
import { isManualTransactionReplay } from '@/lib/finance/transactions/idempotency';
import { useState } from 'react';
const trip='10000000-0000-4000-8000-000000000001', archived='10000000-0000-4000-8000-000000000002', created='10000000-0000-4000-8000-000000000003';
vi.mock('@/lib/finance/core/client', () => ({ financeApiRequest: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.mocked(financeApiRequest).mockImplementation(async () => ({ data: { sources: [], categories: [], tags: [{id:trip,name:'Holiday',is_archived:false},{id:archived,name:'Hackathon',is_archived:true}] } })));
function Picker({filter=false,initial=[]}:{filter?:boolean;initial?:string[]}) { const [value,setValue]=useState<string[]>(initial);return <FinanceReferenceDataProvider><FinanceTagPicker value={value} onChange={setValue} includeArchived={filter} /><output>{value.join(',')}</output></FinanceReferenceDataProvider>; }
describe('Finance tags', () => {
    it('normalizes IDs, rejects malformed/oversized selections, and round trips combined filters', () => {
        expect(parseFinanceTagIds([trip,trip])).toEqual([trip]);
        expect(() => parseFinanceTagIds(['wrong'])).toThrow();
        expect(() => parseFinanceTagIds(Array(51).fill(trip))).toThrow();
        const query=writeFinanceTagFilter(new URLSearchParams('category_id='+created),{tagIds:[trip],tagMode:'exclude'});
        expect(parseFinanceTagFilter(query)).toEqual({tagIds:[trip],tagMode:'exclude'});
        expect(parseFinanceTransactionListFilters(query)).toMatchObject({ data: { categoryId:created,tagIds:[trip],tagMode:'exclude' } });
        expect(financeTransactionsHref({categoryId:created,tagIds:[trip],tagMode:'exclude'})).toContain('tag_mode=exclude');
        expect(parseFinanceTransactionListFilters(new URLSearchParams('tag_mode=bad'))).toHaveProperty('error');
    });
    it('keeps tag-only input independent from raw joins', () => {
        expect(transactionTags({tag_links:[{tag:{id:trip,name:'Holiday',is_archived:false}},{tag:null}]})).toHaveLength(1);
        expect(isManualTransactionReplay({source_id:'s',category_id:null,direction:'expense',amount:1,currency:'MYR',merchant:null,reference_number:null,transaction_date:'2026-01-01',notes:null,source:'manual',status:'confirmed',tags:[]} as never,
            {source_id:'s',category_id:null,direction:'expense',amount:1,currency:'MYR',merchant:null,payee_name:null,reference_number:null,transaction_date:'2026-01-01',notes:null,tag_ids:[trip]})).toBe(false);
    });
    it('opens on the selected tag without an input, toggles by keyboard and restores focus', async () => {
        render(<Picker initial={[trip]} />);
        const choose = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(choose.hasAttribute('disabled')).toBe(false));
        fireEvent.keyDown(choose, { key: 'ArrowDown' });
        const holiday = screen.getByRole('button', { name: 'Holiday' });
        expect(document.activeElement).toBe(holiday);
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.queryByRole('button', { name: /^(Clear tags|Done)$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Create/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Hackathon (archived)' })).toBeNull();
        fireEvent.keyDown(holiday, { key: 'Enter' });
        expect(screen.getByRole('status').textContent).toBe('');
        fireEvent.keyDown(holiday, { key: ' ' });
        expect(screen.getByRole('status').textContent).toBe(trip);
        fireEvent.keyDown(holiday, { key: 'Escape' });
        expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
        expect(document.activeElement).toBe(choose);
        expect(vi.mocked(financeApiRequest).mock.calls.every(([, init]) => !init?.method)).toBe(true);
    });

    it('keeps options available after blur with no new focus target and closes on outside focus', async () => {
        render(<Picker />);
        const choose = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(choose.hasAttribute('disabled')).toBe(false));
        fireEvent.click(choose);
        const holiday = screen.getByRole('button', { name: 'Holiday' });
        fireEvent.blur(holiday, { relatedTarget: null });
        fireEvent.click(holiday);
        expect(screen.getByRole('status').textContent).toBe(trip);
        fireEvent.focusIn(document.body);
        expect(screen.queryByRole('group', { name: 'Tags' })).toBeNull();
    });

    it('allows archived tags in filters and maintains focus when removing a retained archived tag', async () => {
        const { unmount } = render(<Picker filter />);
        const choose = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(choose.hasAttribute('disabled')).toBe(false));
        fireEvent.click(choose);
        fireEvent.click(screen.getByRole('button', { name: 'Hackathon (archived)' }));
        expect(screen.getByRole('status').textContent).toBe(archived);
        unmount();
        render(<Picker initial={[archived]} />);
        const retained = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(retained.hasAttribute('disabled')).toBe(false));
        fireEvent.click(retained);
        const hackathon = screen.getByRole('button', { name: 'Hackathon (archived)' });
        expect(document.activeElement).toBe(hackathon);
        fireEvent.keyDown(hackathon, { key: 'Enter' });
        expect(screen.queryByRole('button', { name: 'Hackathon (archived)' })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Holiday' }));
    });
});

describe('tag picker typeahead', () => {
    const options = ['Gifts', 'Tango', 'Tea', 'Travel - Taiwan 2026'].map((name, index) => ({
        id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name, is_archived: false,
    }));
    beforeEach(() => vi.mocked(financeApiRequest).mockResolvedValue({ data: { sources: [], categories: [], tags: options } }));
    const open = async () => {
        const trigger = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
        fireEvent.click(trigger);
        return trigger;
    };
    const type = (key: string, extra = {}) => fireEvent.keyDown(document.activeElement!, { key, ...extra });

    it('jumps by case-insensitive prefix, retains the full list and never selects while typing', async () => {
        render(<Picker />);
        await open();
        type('T');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tango' }));
        type('r');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Travel - Taiwan 2026' }));
        for (const option of options) expect(screen.getByRole('button', { name: option.name })).toBeTruthy();
        expect(screen.getByRole('status').textContent).toBe('');
        expect(screen.queryByRole('textbox')).toBeNull();
        type('Enter');
        expect(screen.getByRole('status').textContent).toBe(options[3].id);
    });

    it('cycles repeated letters and wraps through matching names', async () => {
        render(<Picker />);
        await open();
        for (const expected of ['Tango', 'Tea', 'Travel - Taiwan 2026', 'Tango']) {
            type('t');
            expect(document.activeElement).toBe(screen.getByRole('button', { name: expected }));
        }
    });

    it('resets the prefix after one second and keeps focus when there is no match', async () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(2000);
        render(<Picker />);
        await open();
        type('t');
        type('z');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tango' }));
        clock.mockReturnValue(3000);
        type('g');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
        expect(screen.getByRole('status').textContent).toBe('');
    });

    it('opens and jumps from the trigger, ignores shortcuts, and clears the prefix when reopening', async () => {
        render(<Picker />);
        const trigger = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
        fireEvent.keyDown(trigger, { key: 't', ctrlKey: true });
        expect(screen.queryByRole('button', { name: 'Tango' })).toBeNull();
        fireEvent.keyDown(trigger, { key: 't' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tango' }));
        type('r');
        type('Escape');
        fireEvent.click(trigger);
        type('g');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
        for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
            type('t', modifier);
            expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
        }
    });

    it('uses arrows, Home and End independently of the prefix buffer', async () => {
        render(<Picker />);
        await open();
        type('ArrowUp');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Travel - Taiwan 2026' }));
        type('ArrowDown');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
        type('End');
        type('Home');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
        type('t');
        type('ArrowDown');
        type('g');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Gifts' }));
    });

    it('skips disabled options at the selection limit while permitting deselection', async () => {
        const selected = Array.from({ length: 50 }, (_, index) => ({ id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Selected ${index}`, is_archived: false }));
        vi.mocked(financeApiRequest).mockResolvedValue({ data: { sources: [], categories: [], tags: [...selected, ...options] } });
        render(<Picker initial={selected.map(tag => tag.id)} />);
        await open();
        type('t');
        expect((document.activeElement as HTMLButtonElement).textContent).toBe('Selected 0');
        expect(screen.getByRole('button', { name: 'Travel - Taiwan 2026' }).hasAttribute('disabled')).toBe(true);
        type('Enter');
        expect(screen.getByRole('button', { name: 'Travel - Taiwan 2026' }).hasAttribute('disabled')).toBe(false);
        type('Home');
        type('t');
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tango' }));
    });

    it('keeps an empty dropdown keyboard accessible without footer actions', async () => {
        vi.mocked(financeApiRequest).mockResolvedValue({ data: { sources: [], categories: [], tags: [] } });
        render(<Picker />);
        const trigger = await open();
        expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Tags' }));
        expect(screen.getByText('No tags available.')).toBeTruthy();
        type('t');
        expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Tags' }));
        expect(screen.queryByRole('button', { name: /^(Clear tags|Done)$/ })).toBeNull();
        type('Escape');
        expect(document.activeElement).toBe(trigger);
    });
});

it('retains focus when deselecting the last retained archived tag', async () => {
    vi.mocked(financeApiRequest).mockResolvedValue({ data: { sources: [], categories: [], tags: [{ id: archived, name: 'Hackathon', is_archived: true }] } });
    render(<Picker initial={[archived]} />);
    const trigger = screen.getByRole('button', { name: 'Choose tags' });
    await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Hackathon (archived)' }), { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Tags' }));
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
});
