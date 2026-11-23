'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAlert } from '@/lib/contexts/AlertContext';
import { useAccess } from '@/lib/contexts/AccessContext';
import {
    FINANCE_SHARE_MESSAGE_TYPES,
    FINANCE_SHARE_QUERY_PARAM,
    FINANCE_SHARE_ERROR_QUERY_PARAM,
    FINANCE_SHARE_NOT_READY,
    parseFinanceShareWorkerMessage,
} from '@/lib/finance/share/protocol';
import { postFinanceShareWorkerMessage } from '@/lib/finance/share/workerClient';

export function FinanceShareRejectionBridge() {
    const access = useAccess();
    const pathname = usePathname();
    const router = useRouter();
    const { showError } = useAlert();
    const canAccessFinance = Boolean(access?.allowedModules.includes('finance'));

    const acknowledge = useCallback((shareId: string) => {
        void postFinanceShareWorkerMessage({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId,
        });
    }, []);

    const removeShareQuery = useCallback(() => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has(FINANCE_SHARE_QUERY_PARAM) && !params.has(FINANCE_SHARE_ERROR_QUERY_PARAM)) return;
        params.delete(FINANCE_SHARE_QUERY_PARAM);
        params.delete(FINANCE_SHARE_ERROR_QUERY_PARAM);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
    }, [pathname, router]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get(FINANCE_SHARE_ERROR_QUERY_PARAM) !== FINANCE_SHARE_NOT_READY) return;
        if (!access) {
            showError('Sign in first, then reopen IdeaDump and share the images again. Image sharing was not ready.');
        } else if (!canAccessFinance) {
            showError('You do not have access to Finance. The shared images were not saved.');
        } else {
            showError('Image sharing was not ready. Reopen IdeaDump, then return to the source app and share the images again. You can also use Upload image.');
        }
        removeShareQuery();
    }, [access, canAccessFinance, removeShareQuery, showError]);

    useEffect(() => {
        if (canAccessFinance || !('serviceWorker' in navigator)) return;

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
                removeShareQuery();
                return;
            }

            acknowledge(message.shareId);
            if (!access) {
                showError('Sign in first, then return to the source app and share the images again.');
                if (pathname !== '/login') router.replace('/login');
                else removeShareQuery();
                return;
            }

            showError('You do not have access to Finance. The shared images were discarded.');
            removeShareQuery();
        };

        navigator.serviceWorker.addEventListener('message', handleMessage);

        const shareId = new URLSearchParams(window.location.search).get(FINANCE_SHARE_QUERY_PARAM);
        void postFinanceShareWorkerMessage(
            shareId
                ? { type: FINANCE_SHARE_MESSAGE_TYPES.claim, shareId }
                : { type: FINANCE_SHARE_MESSAGE_TYPES.ready }
        );

        return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
    }, [access, acknowledge, canAccessFinance, pathname, removeShareQuery, router, showError]);

    return null;
}
