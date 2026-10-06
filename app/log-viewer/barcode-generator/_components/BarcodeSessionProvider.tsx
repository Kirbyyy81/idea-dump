'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAccess } from '@/lib/contexts/AccessContext';
import { createClient } from '@/lib/supabase/client';
import { BARCODE_STORAGE_PREFIX, barcodeInputError, parseBarcodeHistory, recentBarcodes, serializeBarcodeHistory } from '@/lib/log-viewer/barcode/history';

interface BarcodeSession {
    userId: string | null;
    values: string[];
    storageAvailable: boolean;
    remember: (value: string) => void;
}

const BarcodeSessionContext = createContext<BarcodeSession | null>(null);

// This provider stays mounted across routes so sign-out also clears history from Settings.
export function BarcodeSessionProvider({ children }: { children: ReactNode }) {
    const access = useAccess();
    const userId = access?.allowedModules.includes('log_viewer') ? access.userId : null;
    const [owner, setOwner] = useState<string | null>(null);
    const [values, setValues] = useState<string[]>([]);
    const valuesRef = useRef<string[]>([]);
    const ownerRef = useRef<string | null>(null);
    const [storageAvailable, setStorageAvailable] = useState(true);

    useEffect(() => {
        const key = userId ? BARCODE_STORAGE_PREFIX + userId : null;
        let available = true;
        let restored: string[] = [];
        try {
            const storage = window.sessionStorage;
            for (const storedKey of Object.keys(storage)) {
                if (storedKey.startsWith(BARCODE_STORAGE_PREFIX) && storedKey !== key) storage.removeItem(storedKey);
            }
            if (key) restored = parseBarcodeHistory(storage.getItem(key));
        } catch {
            available = false;
        }
        ownerRef.current = userId;
        valuesRef.current = restored;
        setOwner(userId);
        setValues(restored);
        setStorageAvailable(available);

        const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
            if (event !== 'SIGNED_OUT' && session?.user.id === userId) return;
            // Auth events invalidate local state only; route access still uses the existing guards.
            ownerRef.current = null;
            valuesRef.current = [];
            setOwner(null);
            setValues([]);
            try {
                for (const storedKey of Object.keys(window.sessionStorage)) {
                    if (storedKey.startsWith(BARCODE_STORAGE_PREFIX)) window.sessionStorage.removeItem(storedKey);
                }
            } catch {
                setStorageAvailable(false);
            }
        });
        return () => subscription.unsubscribe();
    }, [userId]);

    const remember = useCallback((value: string) => {
        if (!userId || ownerRef.current !== userId || !value || barcodeInputError(value)) return;
        const next = recentBarcodes([value, ...valuesRef.current]);
        valuesRef.current = next;
        setValues(next);
        try {
            window.sessionStorage.setItem(BARCODE_STORAGE_PREFIX + userId, serializeBarcodeHistory(next));
            setStorageAvailable(true);
        } catch {
            setStorageAvailable(false);
        }
    }, [userId]);

    const context = useMemo<BarcodeSession>(() => ({
        userId: owner === userId ? owner : null,
        values: owner === userId ? values : [],
        storageAvailable,
        remember,
    }), [owner, userId, values, storageAvailable, remember]);

    return <BarcodeSessionContext.Provider value={context}>{children}</BarcodeSessionContext.Provider>;
}

export function useBarcodeSession() {
    return useContext(BarcodeSessionContext);
}
