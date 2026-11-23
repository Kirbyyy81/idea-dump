import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PwaRegister } from '@/components/molecules/PwaRegister';

const descriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
afterEach(() => {
    vi.unstubAllEnvs(); vi.restoreAllMocks();
    if (descriptor) Object.defineProperty(navigator, 'serviceWorker', descriptor);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('PWA registration for early shares', () => {
    it('starts registration while the document is loading instead of waiting for load', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
        const update = vi.fn().mockResolvedValue(undefined);
        const register = vi.fn().mockResolvedValue({ update });
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
        render(<PwaRegister />);
        expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
        await waitFor(() => expect(update).toHaveBeenCalledOnce());
    });
    it('does not register workers during local development', () => {
        vi.stubEnv('NODE_ENV', 'development');
        const register = vi.fn();
        Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
        render(<PwaRegister />);
        expect(register).not.toHaveBeenCalled();
    });
});
