'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthField } from '@/app/login/_components/AuthField';
import { AuthNotice } from '@/app/login/_components/AuthNotice';
import { Button } from '@/components/atoms/Button';
import { LoaderOne } from '@/components/atoms/Loader';
import { AUTH_PATHS } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/client';

type SessionState = 'checking' | 'ready' | 'missing';

interface PasswordRecoveryFormProps {
    isReset: boolean;
    queryError?: string;
}

export function PasswordRecoveryForm({ isReset, queryError }: PasswordRecoveryFormProps) {
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [sessionState, setSessionState] = useState<SessionState>(
        isReset ? 'checking' : 'missing'
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(queryError ?? null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isReset) return;

        let cancelled = false;

        async function checkSession() {
            const supabase = createClient();
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;

            if (data.session) {
                setEmail(data.session.user.email ?? '');
                setSessionState('ready');
            } else {
                setSessionState('missing');
            }
        }

        checkSession();
        return () => {
            cancelled = true;
        };
    }, [isReset]);

    const handleRequestReset = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const supabase = createClient();
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(AUTH_PATHS.resetPassword)}`,
            });

            if (resetError) {
                setError(resetError.message);
            } else {
                setMessage('Check your email for a password reset link.');
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) {
                setError(updateError.message);
                return;
            }

            setMessage('Password updated. Taking you back to the app.');
            window.location.assign('/');
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isReset && sessionState === 'checking') {
        return (
            <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-sm text-text-muted">
                <LoaderOne size="md" />
                Verifying your reset link
            </div>
        );
    }

    if (isReset && sessionState === 'missing') {
        return (
            <div className="space-y-4">
                <AuthNotice tone="error">
                    {error ?? 'This password reset link is invalid or has expired.'}
                </AuthNotice>
                <Link
                    href={AUTH_PATHS.forgotPassword}
                    className="btn-primary flex w-full items-center justify-center"
                >
                    Request a new reset link
                </Link>
            </div>
        );
    }

    if (isReset) {
        return (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
                {email && <AuthNotice tone="info">Updating the password for {email}.</AuthNotice>}

                <AuthField
                    id="reset-new-password"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter a new password"
                    required
                    error={Boolean(error)}
                />
                <AuthField
                    id="reset-confirm-password"
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your new password"
                    required
                    error={Boolean(error)}
                />

                {message && <AuthNotice tone="success">{message}</AuthNotice>}
                {error && <AuthNotice tone="error">{error}</AuthNotice>}

                <Button
                    type="submit"
                    disabled={isLoading || !newPassword || !confirmPassword}
                    className="w-full"
                >
                    {isLoading ? (
                        <>
                            <LoaderOne size="sm" dotClassName="bg-action-primary-text" />
                            Updating password
                        </>
                    ) : (
                        'Update password'
                    )}
                </Button>
            </form>
        );
    }

    return (
        <form onSubmit={handleRequestReset} className="space-y-4">
            <AuthField
                id="recovery-email"
                label="Email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                error={Boolean(error)}
            />

            {message && <AuthNotice tone="success">{message}</AuthNotice>}
            {error && <AuthNotice tone="error">{error}</AuthNotice>}

            <Button type="submit" disabled={isLoading || !email} className="w-full">
                {isLoading ? (
                    <>
                        <LoaderOne size="sm" dotClassName="bg-action-primary-text" />
                        Sending reset link
                    </>
                ) : (
                    'Send reset link'
                )}
            </Button>

            <p className="text-center text-sm text-text-muted">
                <Link
                    href={AUTH_PATHS.signIn}
                    className="font-semibold text-text-secondary transition-colors hover:text-text-primary"
                >
                    Back to sign in
                </Link>
            </p>
        </form>
    );
}
