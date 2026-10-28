import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceTagPicker } from '@/app/finance/_components/FinanceTagPicker';
import { FinanceReferenceDataProvider } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import { parseFinanceTagFilter, parseFinanceTagIds, transactionTags, writeFinanceTagFilter } from '@/lib/finance/tagValues';
import { parseFinanceTransactionListFilters, financeTransactionsHref } from '@/lib/finance/transactions/filters';
import { isManualTransactionReplay } from '@/lib/finance/transactions/idempotency';
import { useState } from 'react';
const trip='10000000-0000-4000-8000-000000000001', archived='10000000-0000-4000-8000-000000000002', created='10000000-0000-4000-8000-000000000003';
vi.mock('@/lib/finance/core/client', () => ({ financeApiRequest: vi.fn() }));
beforeEach(() => vi.mocked(financeApiRequest).mockImplementation(async (_url, init) => init?.method === 'POST'
    ? { data: { id: created, name: 'New trip', is_archived: false } }
    : { data: { sources: [], categories: [], tags: [{id:trip,name:'Holiday',is_archived:false},{id:archived,name:'Hackathon',is_archived:true}] } }));
function Picker({filter=false}:{filter?:boolean}) { const [value,setValue]=useState<string[]>([]);return <FinanceReferenceDataProvider><FinanceTagPicker value={value} onChange={setValue} includeArchived={filter} allowCreate={!filter} /><output>{value.join(',')}</output></FinanceReferenceDataProvider>; }
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
    it('supports keyboard opening, selection, search, inline creation and escape without selecting archived tags', async () => {
        render(<Picker />);
        const choose=screen.getByRole('button',{name:'Choose tags'});
        await waitFor(()=>expect(choose.hasAttribute('disabled')).toBe(false));
        fireEvent.click(choose);
        expect(document.activeElement).toBe(screen.getByRole('textbox',{name:'Search tags'}));
        expect(screen.queryByRole('button',{name:'Hackathon (archived)'})).toBeNull();
        fireEvent.click(screen.getByRole('button',{name:'Holiday'}));
        expect(screen.getByRole('status').textContent).toBe(trip);
        fireEvent.change(screen.getByRole('textbox',{name:'Search tags'}),{target:{value:'New trip'}});
        await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Create “New trip”'})));
        expect(screen.getByRole('status').textContent).toContain(created);
        fireEvent.keyDown(screen.getByRole('textbox',{name:'Search tags'}),{key:'Escape'});
        expect(screen.queryByRole('textbox',{name:'Search tags'})).toBeNull();
        expect(document.activeElement).toBe(choose);
    });
    it('keeps options available when pointer focus leaves the search field without a new focus target', async () => {
        render(<Picker />);
        const choose = screen.getByRole('button', { name: 'Choose tags' });
        await waitFor(() => expect(choose.hasAttribute('disabled')).toBe(false));
        fireEvent.click(choose);
        const search = screen.getByRole('textbox', { name: 'Search tags' });
        fireEvent.blur(search, { relatedTarget: null });
        fireEvent.click(screen.getByRole('button', { name: 'Holiday' }));
        expect(screen.getByRole('status').textContent).toBe(trip);
        fireEvent.focusIn(document.body);
        expect(screen.queryByRole('textbox', { name: 'Search tags' })).toBeNull();
    });
    it('allows archived tags in filters without offering inline creation', async () => {
        render(<Picker filter />);
        const choose=screen.getByRole('button',{name:'Choose tags'});
        await waitFor(()=>expect(choose.hasAttribute('disabled')).toBe(false));fireEvent.click(choose);
        fireEvent.click(screen.getByRole('button',{name:'Hackathon (archived)'}));
        expect(screen.getByRole('status').textContent).toBe(archived);
        fireEvent.change(screen.getByRole('textbox',{name:'Search tags'}),{target:{value:'New trip'}});
        expect(screen.queryByRole('button',{name:'Create “New trip”'})).toBeNull();
    });
});
