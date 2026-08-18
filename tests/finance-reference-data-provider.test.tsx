import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FinanceReferenceDataProvider,
    useFinanceReferenceData,
} from '@/app/finance/_components/FinanceReferenceDataProvider';
import { financeApiRequest } from '@/lib/finance/core/client';

vi.mock('@/lib/finance/core/client', () => ({
    financeApiRequest: vi.fn(),
}));

const initialData = {
    sources: [
        { id: 'source-z', name: 'Zeta Bank' },
        { id: 'source-a', name: 'Alpha Bank' },
    ],
    categories: [
        { id: 'category-z', name: 'Transport' },
        { id: 'category-a', name: 'Food' },
    ],
};

function ReferenceProbe() {
    const referenceData = useFinanceReferenceData();
    return (
        <div>
            <output data-testid="status">{referenceData.status}</output>
            <output data-testid="error">{referenceData.error}</output>
            <output data-testid="sources">
                {referenceData.sources.map((source) => `${source.id}:${source.name}`).join('|')}
            </output>
            <output data-testid="categories">
                {referenceData.categories.map((category) => `${category.id}:${category.name}`).join('|')}
            </output>
            <button type="button" onClick={() => void referenceData.refresh()}>Refresh</button>
            <button
                type="button"
                onClick={() => referenceData.upsertSource({ id: 'source-z', name: 'Beta Bank' })}
            >
                Rename source
            </button>
            <button type="button" onClick={() => referenceData.removeSource('source-a')}>
                Remove source
            </button>
            <button
                type="button"
                onClick={() => referenceData.upsertCategory({ id: 'category-n', name: 'Dining' })}
            >
                Add category
            </button>
            <button type="button" onClick={() => referenceData.removeCategory('category-z')}>
                Remove category
            </button>
        </div>
    );
}

function ReferenceHarness({ children }: PropsWithChildren) {
    return (
        <FinanceReferenceDataProvider>
            {children}
        </FinanceReferenceDataProvider>
    );
}

describe('FinanceReferenceDataProvider', () => {
    beforeEach(() => {
        vi.mocked(financeApiRequest).mockReset();
    });

    it('loads and sorts one minimal payload per module mount', async () => {
        vi.mocked(financeApiRequest).mockResolvedValue({ data: initialData });
        const view = render(<ReferenceProbe />, { wrapper: ReferenceHarness });

        expect(await screen.findByText('ready', { selector: '[data-testid="status"]' })).toBeTruthy();
        expect(screen.getByTestId('sources').textContent)
            .toBe('source-a:Alpha Bank|source-z:Zeta Bank');
        expect(screen.getByTestId('categories').textContent)
            .toBe('category-a:Food|category-z:Transport');
        expect(financeApiRequest).toHaveBeenCalledTimes(1);
        expect(financeApiRequest).toHaveBeenCalledWith(
            '/api/finance/reference-data',
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
            { fallbackMessage: 'Could not load Finance options' }
        );

        view.rerender(<ReferenceProbe />);
        expect(financeApiRequest).toHaveBeenCalledTimes(1);

        view.unmount();
        render(<ReferenceProbe />, { wrapper: ReferenceHarness });
        await waitFor(() => expect(financeApiRequest).toHaveBeenCalledTimes(2));
    });

    it('deduplicates refreshes and preserves successful data when refresh fails', async () => {
        let rejectRefresh: ((reason?: unknown) => void) | undefined;
        vi.mocked(financeApiRequest)
            .mockResolvedValueOnce({ data: initialData })
            .mockImplementationOnce(() => new Promise((_resolve, reject) => {
                rejectRefresh = reject;
            }));
        render(<ReferenceProbe />, { wrapper: ReferenceHarness });
        await screen.findByText('ready', { selector: '[data-testid="status"]' });

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        expect(financeApiRequest).toHaveBeenCalledTimes(2);

        await act(async () => rejectRefresh?.(new Error('Refresh failed')));
        expect(screen.getByTestId('status').textContent).toBe('ready');
        expect(screen.getByTestId('error').textContent).toBe('Refresh failed');
        expect(screen.getByTestId('sources').textContent)
            .toBe('source-a:Alpha Bank|source-z:Zeta Bank');
    });

    it('retries initial failures and synchronizes focused mutations', async () => {
        vi.mocked(financeApiRequest)
            .mockRejectedValueOnce(new Error('Initial load failed'))
            .mockResolvedValueOnce({ data: initialData });
        render(<ReferenceProbe />, { wrapper: ReferenceHarness });

        expect(await screen.findByText('error', { selector: '[data-testid="status"]' })).toBeTruthy();
        expect(screen.getByTestId('error').textContent).toBe('Initial load failed');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await screen.findByText('ready', { selector: '[data-testid="status"]' });

        fireEvent.click(screen.getByRole('button', { name: 'Rename source' }));
        expect(screen.getByTestId('sources').textContent)
            .toBe('source-a:Alpha Bank|source-z:Beta Bank');
        fireEvent.click(screen.getByRole('button', { name: 'Remove source' }));
        expect(screen.getByTestId('sources').textContent).toBe('source-z:Beta Bank');

        fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
        expect(screen.getByTestId('categories').textContent)
            .toBe('category-n:Dining|category-a:Food|category-z:Transport');
        fireEvent.click(screen.getByRole('button', { name: 'Remove category' }));
        expect(screen.getByTestId('categories').textContent)
            .toBe('category-n:Dining|category-a:Food');
    });

    it('aborts and ignores an unfinished request when the module unmounts', () => {
        vi.mocked(financeApiRequest).mockImplementation(() => new Promise(() => undefined));
        const view = render(<ReferenceProbe />, { wrapper: ReferenceHarness });
        const signal = vi.mocked(financeApiRequest).mock.calls[0]?.[1]?.signal;

        expect(signal?.aborted).toBe(false);
        view.unmount();
        expect(signal?.aborted).toBe(true);
    });

    it('does not overwrite mutations when an older request completes', async () => {
        let resolveInitial: ((value: { data: typeof initialData }) => void) | undefined;
        vi.mocked(financeApiRequest).mockImplementation(() => new Promise((resolve) => {
            resolveInitial = resolve;
        }));
        render(<ReferenceProbe />, { wrapper: ReferenceHarness });

        fireEvent.click(screen.getByRole('button', { name: 'Rename source' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove category' }));
        await act(async () => resolveInitial?.({ data: initialData }));

        expect(screen.getByTestId('status').textContent).toBe('ready');
        expect(screen.getByTestId('sources').textContent)
            .toBe('source-a:Alpha Bank|source-z:Beta Bank');
        expect(screen.getByTestId('categories').textContent).toBe('category-a:Food');
    });
});
