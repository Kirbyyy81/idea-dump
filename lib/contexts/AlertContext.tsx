'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Toast } from '@/components/molecules/Toast';

interface AlertState {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'warning' | 'info';
}

interface AlertContextType {
    alert: AlertState;
    showAlert: (message: string, title?: string, type?: AlertState['type']) => void;
    showError: (message: string, title?: string) => void;
    showSuccess: (message: string, title?: string) => void;
    showSuccessToast: (message: string) => void;
    hideAlert: () => void;
}

const defaultState: AlertState = {
    isOpen: false,
    title: '',
    message: '',
    type: 'error',
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
    const [alert, setAlert] = useState<AlertState>(defaultState);
    const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
    const toastId = useRef(0);

    const showAlert = useCallback((message: string, title = 'Alert', type: AlertState['type'] = 'info') => {
        setAlert({ isOpen: true, title, message, type });
    }, []);

    const showError = useCallback((message: string, title = 'Error') => {
        setAlert({ isOpen: true, title, message, type: 'error' });
    }, []);

    const showSuccess = useCallback((message: string, title = 'Success') => {
        setAlert({ isOpen: true, title, message, type: 'success' });
    }, []);

    const showSuccessToast = useCallback((message: string) => {
        setToast({ id: ++toastId.current, message });
    }, []);

    const hideAlert = useCallback(() => {
        setAlert(defaultState);
    }, []);

    return (
        <AlertContext.Provider value={{ alert, showAlert, showError, showSuccess, showSuccessToast, hideAlert }}>
            {children}
            {toast && <Toast key={toast.id} message={toast.message} onDismiss={() => setToast(null)} />}
        </AlertContext.Provider>
    );
}

export function useAlert() {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
}
