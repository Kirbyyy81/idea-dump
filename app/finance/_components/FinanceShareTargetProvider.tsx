'use client';

import {
    createContext,
    PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAlert } from '@/lib/contexts/AlertContext';
import { useAccess } from '@/lib/contexts/AccessContext';

export interface IncomingFinanceShareFile {
    id: string;
    file: File;
}

interface FinanceShareTargetContextValue {
    files: IncomingFinanceShareFile[];
    clearFiles: () => void;
    removeFile: (id: string) => void;
}

type FinanceShareWorkerMessage = {
    type?: unknown;
    shareId?: unknown;
    files?: unknown;
    message?: unknown;
};

const FinanceShareTargetContext = createContext<FinanceShareTargetContextValue | null>(null);

function serviceWorkerTarget() {
    if (!('serviceWorker' in navigator)) return Promise.resolve<ServiceWorker | null>(null);
    if (navigator.serviceWorker.controller) {
        return Promise.resolve(navigator.serviceWorker.controller);
    }
    return navigator.serviceWorker.ready.then((registration) => registration.active);
}

async function postToServiceWorker(message: Record<string, unknown>) {
    const worker = await serviceWorkerTarget();
    worker?.postMessage(message);
}

function isFileArray(value: unknown): value is File[] {
    return Array.isArray(value) && value.every((entry) => entry instanceof File);
}

export function FinanceShareTargetProvider({ children }: PropsWithChildren) {
    const access = useAccess();
    const pathname = usePathname();
    const router = useRouter();
    const { showError } = useAlert();
    const [files, setFiles] = useState<IncomingFinanceShareFile[]>([]);

    const acknowledge = useCallback((shareId: string) => {
        void postToServiceWorker({
            type: 'finance-share:acknowledge',
            shareId,
        });
    }, []);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const handleMessage = (event: MessageEvent<FinanceShareWorkerMessage>) => {
            const message = event.data;
            const shareId = typeof message?.shareId === 'string' ? message.shareId : '';
            if (!shareId || typeof message?.type !== 'string') return;

            if (message.type === 'finance-share:missing' || message.type === 'finance-share:error') {
                showError(
                    typeof message.message === 'string'
                        ? message.message
                        : 'The shared images could not be received. Share them again from the source app.'
                );
                acknowledge(shareId);
                if (window.location.search.includes('finance_share=')) router.replace(pathname);
                return;
            }

            if (message.type !== 'finance-share:payload' || !isFileArray(message.files)) return;

            if (!access) {
                acknowledge(shareId);
                showError('Sign in first, then return to the source app and share the images again.');
                if (window.location.search.includes('finance_share=')) router.replace('/login');
                return;
            }

            if (!access.allowedModules.includes('finance')) {
                acknowledge(shareId);
                showError('You do not have access to Finance. The shared images were discarded.');
                if (window.location.search.includes('finance_share=')) router.replace(pathname);
                return;
            }

            setFiles(message.files.map((file) => ({
                id: window.crypto.randomUUID(),
                file,
            })));
            acknowledge(shareId);
            router.replace('/finance/add');
        };

        navigator.serviceWorker.addEventListener('message', handleMessage);

        const shareId = new URLSearchParams(window.location.search).get('finance_share');
        void postToServiceWorker(
            shareId
                ? { type: 'finance-share:claim', shareId }
                : { type: 'finance-share:ready' }
        );

        return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
    }, [access, acknowledge, pathname, router, showError]);

    const value = useMemo<FinanceShareTargetContextValue>(() => ({
        files,
        clearFiles: () => setFiles([]),
        removeFile: (id) => setFiles((current) => current.filter((entry) => entry.id !== id)),
    }), [files]);

    return (
        <FinanceShareTargetContext.Provider value={value}>
            {children}
        </FinanceShareTargetContext.Provider>
    );
}

export function useFinanceShareTarget() {
    const context = useContext(FinanceShareTargetContext);
    if (!context) {
        throw new Error('useFinanceShareTarget must be used inside FinanceShareTargetProvider');
    }
    return context;
}
