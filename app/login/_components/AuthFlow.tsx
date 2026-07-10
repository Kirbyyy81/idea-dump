'use client';

import { useEffect, useState } from 'react';
import { AuthNotice } from '@/app/login/_components/AuthNotice';
import { AuthShell } from '@/app/login/_components/AuthShell';
import { PasswordRecoveryForm } from '@/app/login/_components/PasswordRecoveryForm';
import { SignInForm } from '@/app/login/_components/SignInForm';
import { SignUpForm } from '@/app/login/_components/SignUpForm';
import { LoaderOne } from '@/components/atoms/Loader';
import {
    AUTH_PATHS,
    AUTH_VIEWS,
    getSafeNextPath,
    type AuthView,
} from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/client';

interface AuthFlowProps {
    queryError?: string;
    view: AuthView;
}

const VIEW_COPY: Record<AuthView, { title: string; description: string }> = {
    [AUTH_VIEWS.signIn]: {
        title: 'Welcome back',
        description: 'Sign in with an email code or your password.',
    },
    [AUTH_VIEWS.signUp]: {
        title: 'Create your account',
        description: 'Use your email and a password to get started.',
    },
    [AUTH_VIEWS.forgotPassword]: {
        title: 'Reset your password',
        description: 'We will email you a secure password reset link.',
    },
    [AUTH_VIEWS.resetPassword]: {
        title: 'Choose a new password',
        description: 'Set a new password for your IdeaDump account.',
    },
};

export function AuthFlow({ queryError, view }: AuthFlowProps) {
    const [isCompletingAuth, setIsCompletingAuth] = useState(false);
    const [callbackError, setCallbackError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const tokenHash = params.get('token_hash') ?? params.get('token');
        const type = params.get('type');

        if (!code && !(tokenHash && type)) return;

        let cancelled = false;

        async function completeAuth() {
            setIsCompletingAuth(true);
            setCallbackError(null);

            try {
                const supabase = createClient();
                const { error } = code
                    ? await supabase.auth.exchangeCodeForSession(code)
                    : await supabase.auth.verifyOtp({
                        type: type as
                            | 'signup'
                            | 'invite'
                            | 'magiclink'
                            | 'recovery'
                            | 'email_change'
                            | 'email',
                        token_hash: tokenHash as string,
                    });

                if (cancelled) return;
                if (error) {
                    setCallbackError(error.message);
                    return;
                }

                const requestedNext = getSafeNextPath(params.get('next'));
                window.location.assign(
                    type === 'recovery' ? AUTH_PATHS.resetPassword : requestedNext
                );
            } catch {
                if (!cancelled) {
                    setCallbackError('We could not complete authentication. Please try again.');
                }
            } finally {
                if (!cancelled) setIsCompletingAuth(false);
            }
        }

        completeAuth();
        return () => {
            cancelled = true;
        };
    }, []);

    const copy = VIEW_COPY[view];

    return (
        <AuthShell view={view} title={copy.title} description={copy.description}>
            {isCompletingAuth ? (
                <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-sm text-text-muted">
                    <LoaderOne size="md" />
                    Completing authentication
                </div>
            ) : callbackError ? (
                <AuthNotice tone="error">{callbackError}</AuthNotice>
            ) : view === AUTH_VIEWS.signUp ? (
                <SignUpForm queryError={queryError} />
            ) : view === AUTH_VIEWS.forgotPassword ? (
                <PasswordRecoveryForm queryError={queryError} isReset={false} />
            ) : view === AUTH_VIEWS.resetPassword ? (
                <PasswordRecoveryForm queryError={queryError} isReset />
            ) : (
                <SignInForm queryError={queryError} />
            )}
        </AuthShell>
    );
}
