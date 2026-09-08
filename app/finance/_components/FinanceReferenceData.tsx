'use client';

import {
    createContext,
    PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Button } from '@/components/atoms/Button';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';
import { financeApiRequest } from '@/lib/finance/core/client';
import { FinanceReferenceData, FinanceReferenceOption } from '@/lib/types';

export type FinanceReferenceDataStatus = 'loading' | 'ready' | 'error';

interface FinanceReferenceDataContextValue extends FinanceReferenceData {
    status: FinanceReferenceDataStatus;
    error: string | null;
    refresh: () => Promise<void>;
    upsertSource: (source: FinanceReferenceOption) => void;
    removeSource: (sourceId: string) => void;
    upsertCategory: (category: FinanceReferenceOption) => void;
    removeCategory: (categoryId: string) => void;
}

const FinanceReferenceDataContext = createContext<FinanceReferenceDataContextValue | null>(null);

function sortFinanceReferenceOptions(options: FinanceReferenceOption[]) {
    return [...options].sort((left, right) => (
        left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
    ));
}

function upsertFinanceReferenceOption(
    options: FinanceReferenceOption[],
    next: FinanceReferenceOption
) {
    return sortFinanceReferenceOptions([
        ...options.filter((option) => option.id !== next.id),
        next,
    ]);
}

function applyFinanceReferenceMutations(
    options: FinanceReferenceOption[],
    mutations: Map<string, FinanceReferenceOption | null>
) {
    const nextOptions = new Map(options.map((option) => [option.id, option]));
    mutations.forEach((option, id) => {
        if (option) nextOptions.set(id, option);
        else nextOptions.delete(id);
    });
    return sortFinanceReferenceOptions([...nextOptions.values()]);
}

export function FinanceReferenceDataProvider({ children }: PropsWithChildren) {
    const [sources, setSources] = useState<FinanceReferenceOption[]>([]);
    const [categories, setCategories] = useState<FinanceReferenceOption[]>([]);
    const [status, setStatus] = useState<FinanceReferenceDataStatus>('loading');
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(false);
    const hasDataRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);
    const sourceMutationsRef = useRef(new Map<string, FinanceReferenceOption | null>());
    const categoryMutationsRef = useRef(new Map<string, FinanceReferenceOption | null>());

    const refresh = useCallback(() => {
        if (inFlightRef.current) return inFlightRef.current;

        const controller = new AbortController();
        controllerRef.current = controller;
        if (!hasDataRef.current) setStatus('loading');
        setError(null);

        const request = financeApiRequest<{ data: FinanceReferenceData }>(
            '/api/finance/reference-data',
            { signal: controller.signal },
            { fallbackMessage: 'Could not load Finance options' }
        ).then((payload) => {
            if (!mountedRef.current || controller.signal.aborted) return;
            setSources(applyFinanceReferenceMutations(
                payload.data.sources || [],
                sourceMutationsRef.current
            ));
            setCategories(applyFinanceReferenceMutations(
                payload.data.categories || [],
                categoryMutationsRef.current
            ));
            sourceMutationsRef.current.clear();
            categoryMutationsRef.current.clear();
            hasDataRef.current = true;
            setStatus('ready');
        }).catch((requestError: unknown) => {
            if (!mountedRef.current || controller.signal.aborted) return;
            sourceMutationsRef.current.clear();
            categoryMutationsRef.current.clear();
            setError(requestError instanceof Error
                ? requestError.message
                : 'Could not load Finance options');
            setStatus(hasDataRef.current ? 'ready' : 'error');
        }).finally(() => {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
                inFlightRef.current = null;
            }
        });

        inFlightRef.current = request;
        return request;
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void refresh();
        return () => {
            mountedRef.current = false;
            const controller = controllerRef.current;
            controllerRef.current = null;
            inFlightRef.current = null;
            controller?.abort();
        };
    }, [refresh]);

    const upsertSource = useCallback((source: FinanceReferenceOption) => {
        if (inFlightRef.current) sourceMutationsRef.current.set(source.id, source);
        setSources((current) => upsertFinanceReferenceOption(current, source));
    }, []);
    const removeSource = useCallback((sourceId: string) => {
        if (inFlightRef.current) sourceMutationsRef.current.set(sourceId, null);
        setSources((current) => current.filter((source) => source.id !== sourceId));
    }, []);
    const upsertCategory = useCallback((category: FinanceReferenceOption) => {
        if (inFlightRef.current) categoryMutationsRef.current.set(category.id, category);
        setCategories((current) => upsertFinanceReferenceOption(current, category));
    }, []);
    const removeCategory = useCallback((categoryId: string) => {
        if (inFlightRef.current) categoryMutationsRef.current.set(categoryId, null);
        setCategories((current) => current.filter((category) => category.id !== categoryId));
    }, []);

    const value = useMemo<FinanceReferenceDataContextValue>(() => ({
        sources,
        categories,
        status,
        error,
        refresh,
        upsertSource,
        removeSource,
        upsertCategory,
        removeCategory,
    }), [
        categories,
        error,
        refresh,
        removeCategory,
        removeSource,
        sources,
        status,
        upsertCategory,
        upsertSource,
    ]);

    return (
        <FinanceReferenceDataContext.Provider value={value}>
            {children}
        </FinanceReferenceDataContext.Provider>
    );
}

export function useFinanceReferenceData() {
    const context = useContext(FinanceReferenceDataContext);
    if (!context) {
        throw new Error('useFinanceReferenceData must be used inside FinanceReferenceDataProvider');
    }
    return context;
}

interface FinanceReferenceDataStateProps {
    status: Exclude<FinanceReferenceDataStatus, 'ready'>;
    error: string | null;
    retry: () => Promise<void>;
}

export function FinanceReferenceDataState({
    status,
    error,
    retry,
}: FinanceReferenceDataStateProps) {
    if (status === 'loading') {
        return <InlineLoadingState label="Loading Finance options..." />;
    }

    return (
        <div className="border border-error bg-error-bg p-5" role="alert">
            <p className="text-sm font-semibold text-error">
                {error || 'Could not load Finance options'}
            </p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => void retry()}>
                Retry
            </Button>
        </div>
    );
}
