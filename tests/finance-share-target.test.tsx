import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceShareRejectionBridge } from '@/app/_components/FinanceShareRejectionBridge';
import {
    FinanceShareTargetProvider,
    useFinanceShareTarget,
} from '@/app/finance/_components/FinanceShareTargetProvider';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import {
    FINANCE_SHARE_MESSAGE_TYPES,
    FINANCE_SHARE_QUERY_PARAM,
} from '@/lib/finance/share/protocol';
import type { UserAppAccess } from '@/lib/rbac/types';

const navigation = vi.hoisted(() => ({
    pathname: '/finance/add',
    replace: vi.fn(),
}));

const alerts = vi.hoisted(() => ({
    showError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock('@/lib/contexts/AlertContext', () => ({
    useAlert: () => ({ showError: alerts.showError }),
}));

type MessageListener = (event: MessageEvent<unknown>) => void;

class ServiceWorkerHarness {
    private listeners = new Set<MessageListener>();

    readonly postMessage = vi.fn();
    readonly controller = { postMessage: this.postMessage };
    readonly ready = Promise.resolve({ active: this.controller });

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'message' && typeof listener === 'function') {
            this.listeners.add(listener as MessageListener);
        }
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        if (type === 'message' && typeof listener === 'function') {
            this.listeners.delete(listener as MessageListener);
        }
    }

    dispatch(data: unknown) {
        const event = { data } as MessageEvent<unknown>;
        this.listeners.forEach((listener) => listener(event));
    }

    listenerCount() {
        return this.listeners.size;
    }
}

function appAccess(allowedModules: UserAppAccess['allowedModules']): UserAppAccess {
    return {
        allowedModules,
        canManageAccess: false,
        modules: [],
        overrides: {},
        role: 'member',
        userId: '00000000-0000-4000-8000-000000000001',
    };
}

function FileCount() {
    const { files } = useFinanceShareTarget();
    return <output data-testid="file-count">{files.length}</output>;
}

function installServiceWorkerHarness() {
    const harness = new ServiceWorkerHarness();
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: harness,
    });
    return harness;
}

beforeEach(() => {
    navigation.pathname = '/finance/add';
    navigation.replace.mockReset();
    alerts.showError.mockReset();
    window.history.replaceState({}, '', '/finance/add');
});

describe('Finance share-target lifecycle', () => {
    it('claims, stores, and acknowledges files for an authorized Finance flow', async () => {
        const worker = installServiceWorkerHarness();
        window.history.replaceState(
            {},
            '',
            `/finance/add?${FINANCE_SHARE_QUERY_PARAM}=accepted-share`
        );

        render(
            <FinanceShareTargetProvider>
                <FileCount />
            </FinanceShareTargetProvider>
        );

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.claim,
            shareId: 'accepted-share',
        }));

        act(() => worker.dispatch({
            type: FINANCE_SHARE_MESSAGE_TYPES.payload,
            shareId: 'accepted-share',
            files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })],
        }));

        await waitFor(() => expect(screen.getByTestId('file-count').textContent).toBe('1'));
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId: 'accepted-share',
        });
        expect(navigation.replace).toHaveBeenCalledWith('/finance/add');
    });

    it('discards a signed-out share and explains that sign-in is required', async () => {
        const worker = installServiceWorkerHarness();
        navigation.pathname = '/login';
        window.history.replaceState({}, '', '/login');

        render(
            <AccessProvider access={null}>
                <FinanceShareRejectionBridge />
            </AccessProvider>
        );

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.ready,
        }));

        act(() => worker.dispatch({
            type: FINANCE_SHARE_MESSAGE_TYPES.payload,
            shareId: 'signed-out-share',
            files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })],
        }));

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId: 'signed-out-share',
        }));
        expect(alerts.showError).toHaveBeenCalledWith(
            'Sign in first, then return to the source app and share the images again.'
        );
    });

    it('discards a share when the user lacks Finance access', async () => {
        const worker = installServiceWorkerHarness();
        navigation.pathname = '/dashboard';
        window.history.replaceState({}, '', '/dashboard');

        render(
            <AccessProvider access={appAccess(['dashboard'])}>
                <FinanceShareRejectionBridge />
            </AccessProvider>
        );

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.ready,
        }));

        act(() => worker.dispatch({
            type: FINANCE_SHARE_MESSAGE_TYPES.payload,
            shareId: 'unauthorized-share',
            files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })],
        }));

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId: 'unauthorized-share',
        }));
        expect(alerts.showError).toHaveBeenCalledWith(
            'You do not have access to Finance. The shared images were discarded.'
        );
    });

    it('leaves authorized Finance traffic exclusively to the scoped provider', async () => {
        const worker = installServiceWorkerHarness();

        render(
            <AccessProvider access={appAccess(['dashboard', 'finance'])}>
                <FinanceShareRejectionBridge />
            </AccessProvider>
        );

        await act(async () => Promise.resolve());
        expect(worker.listenerCount()).toBe(0);
        expect(worker.postMessage).not.toHaveBeenCalled();
    });

    it('handles an expired share and removes its query parameter', async () => {
        const worker = installServiceWorkerHarness();
        window.history.replaceState(
            {},
            '',
            `/finance/add?${FINANCE_SHARE_QUERY_PARAM}=expired-share`
        );

        render(
            <FinanceShareTargetProvider>
                <FileCount />
            </FinanceShareTargetProvider>
        );

        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.claim,
            shareId: 'expired-share',
        }));

        act(() => worker.dispatch({
            type: FINANCE_SHARE_MESSAGE_TYPES.missing,
            shareId: 'expired-share',
            message: 'The shared images are no longer available.',
        }));

        expect(alerts.showError).toHaveBeenCalledWith('The shared images are no longer available.');
        await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({
            type: FINANCE_SHARE_MESSAGE_TYPES.acknowledge,
            shareId: 'expired-share',
        }));
        expect(navigation.replace).toHaveBeenCalledWith('/finance/add');
    });

    it('discards unsubmitted files when the Finance provider unmounts', async () => {
        const worker = installServiceWorkerHarness();
        const first = render(
            <FinanceShareTargetProvider>
                <FileCount />
            </FinanceShareTargetProvider>
        );

        act(() => worker.dispatch({
            type: FINANCE_SHARE_MESSAGE_TYPES.payload,
            shareId: 'navigation-share',
            files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })],
        }));
        await waitFor(() => expect(screen.getByTestId('file-count').textContent).toBe('1'));

        first.unmount();
        render(
            <FinanceShareTargetProvider>
                <FileCount />
            </FinanceShareTargetProvider>
        );

        expect(screen.getByTestId('file-count').textContent).toBe('0');
    });
});
