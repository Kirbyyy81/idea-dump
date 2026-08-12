import { describe, expect, it } from 'vitest';
import { AuthRoutePage } from '@/app/login/_components/AuthRoutePage';
import { AUTH_VIEWS } from '@/lib/auth/routes';

describe('AuthRoutePage', () => {
    it('awaits Next.js search params and forwards the first query error', async () => {
        const page = await AuthRoutePage({
            searchParams: Promise.resolve({
                error: ['Authentication failed', 'Ignored error'],
            }),
            view: AUTH_VIEWS.signIn,
        });

        expect(page.props).toMatchObject({
            queryError: 'Authentication failed',
            view: AUTH_VIEWS.signIn,
        });
    });

    it('preserves an absent query error', async () => {
        const page = await AuthRoutePage({
            searchParams: Promise.resolve({}),
            view: AUTH_VIEWS.forgotPassword,
        });

        expect(page.props).toMatchObject({
            queryError: undefined,
            view: AUTH_VIEWS.forgotPassword,
        });
    });
});
