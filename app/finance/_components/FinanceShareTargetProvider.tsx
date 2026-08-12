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
import {
    FINANCE_SHARE_MESSAGE_TYPES,
    FINANCE_SHARE_QUERY_PARAM,
    parseFinanceShareWorkerMessage,
} from '@/lib/finance/share/protocol';
import { postFinanceShareWorkerMessage } from '@/lib/finance/share/workerClient';

export interface IncomingFinanceShareFile {
    id: string;
    file: File;
}

interface FinanceShareTargetContextValue {
    files: IncomingFinanceShareFile[];
    clearFiles: () => void;
    removeFile: (id: string) => void;
}

const FinanceShareTargetContext = createContext<FinanceShareTargetContextValue | null>(null);

function isFileArray(value: unknown): value is File[] {
    return Array.isArray(value) && value.every((entry) => entry instanceof File);
}

export function FinanceShareTargetProvider({ children }: PropsWithChildren) {
    const pathname = usePathname();
    const router = useRouter();
    const { showError } = useAlert();
    const [files, setFiles] = useState<IncomingFinanceShareFile[]>([]);

    const acknowledge = useCallback((shareId: string) => {
        void postFinanceShareWorkerMessage({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId,
        });
    }, []);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;

        const handleMessage = (event: MessageEvent<unknown>) => {
            const message = parseFinanceShareWorkerMessage(event.data);
            if (!message) return;

            if (
                message.type === FINANCE_SHARE_MESSAGE_TYPES.missing
                || message.type === FINANCE_SHARE_MESSAGE_TYPES.error
            ) {
                showError(
                    message.message
                    || 'The shared images could not be received. Share them again from the source app.'
                );
                acknowledge(message.shareId);
                if (new URLSearchParams(window.location.search).has(FINANCE_SHARE_QUERY_PARAM)) {
                    router.replace(pathname);
                }
                return;
            }

            if (message.type !== FINANCE_SHARE_MESSAGE_TYPES.payload) return;

            if (!isFileArray(message.files)) {
                acknowledge(message.shareId);
                showError('The shared images were invalid. Share them again from the source app.');
                if (new URLSearchParams(window.location.search).has(FINANCE_SHARE_QUERY_PARAM)) {
                    router.replace(pathname);
                }
                return;
            }

            setFiles(message.files.map((file) => ({
                id: window.crypto.randomUUID(),
                file,
            })));
            acknowledge(message.shareId);
            router.replace('/finance/add');
        };

        navigator.serviceWorker.addEventListener('message', handleMessage);

        const shareId = new URLSearchParams(window.location.search).get(FINANCE_SHARE_QUERY_PARAM);
        void postFinanceShareWorkerMessage(
            shareId
                ? { type: FINANCE_SHARE_MESSAGE_TYPES.claim, shareId }
                : { type: FINANCE_SHARE_MESSAGE_TYPES.ready }
        );

        return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
    }, [acknowledge, pathname, router, showError]);

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
