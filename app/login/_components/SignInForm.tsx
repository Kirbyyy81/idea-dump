'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthField } from '@/app/login/_components/AuthField';
import { AuthNotice } from '@/app/login/_components/AuthNotice';
import { Button } from '@/components/atoms/Button';
import { LoaderOne } from '@/components/atoms/Loader';
import { buildCachedProfile, clearCachedProfile, setCachedProfile } from '@/lib/auth/profileCache';
import { AUTH_PATHS } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type AuthMethod = 'otp' | 'password';

interface SignInFormProps {
    queryError?: string;
}

export function SignInForm({ queryError }: SignInFormProps) {
    const [authMethod, setAuthMethod] = useState<AuthMethod>('otp');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(queryError ?? null);

    const redirectToApp = () => window.location.assign('/');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            clearCachedProfile();

            if (authMethod === 'otp') {
                const { error: signInError } = await supabase.auth.signInWithOtp({
                    email,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`,
                    },
                });

                if (signInError) {
                    setError(signInError.message);
                } else {
                    setIsSent(true);
                }
                return;
            }

            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                setError(signInError.message);
                return;
            }

            if (!data.session) {
                setError('Sign in succeeded, but no session was returned.');
                return;
            }

            setCachedProfile(buildCachedProfile(data.session.user));
            redirectToApp();
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsVerifying(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'email',
            });

            if (verifyError) {
                setError(verifyError.message);
                return;
            }

            const { data } = await supabase.auth.getUser();
            if (data.user) setCachedProfile(buildCachedProfile(data.user));
            redirectToApp();
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error: resendError } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`,
                },
            });

            if (resendError) setError(resendError.message);
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSent) {
        return (
            <form onSubmit={handleVerifyCode} className="space-y-4">
                <AuthNotice tone="success">
                    We sent a one-time code to <strong>{email}</strong>.
                </AuthNotice>

                <AuthField
                    id="signin-code"
                    label="One-time code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    required
                    error={Boolean(error)}
                />

                {error && <AuthNotice tone="error">{error}</AuthNotice>}

                <Button
                    type="submit"
                    disabled={isVerifying || !code}
                    className="w-full"
                >
                    {isVerifying ? (
                        <>
                            <LoaderOne size="sm" dotClassName="bg-action-primary-text" />
                            Verifying code
                        </>
                    ) : (
                        'Verify code'
                    )}
                </Button>

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={isLoading}
                        onClick={handleResend}
                    >
                        Resend code
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            setIsSent(false);
                            setCode('');
                            setError(null);
                        }}
                    >
                        Change email
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div
                role="group"
                aria-label="Sign-in method"
                className="grid grid-cols-2 gap-1 rounded-md bg-bg-subtle p-1"
            >
                {(['otp', 'password'] as const).map((method) => {
                    const active = authMethod === method;
                    return (
                        <Button
                            key={method}
                            type="button"
                            variant="ghost"
                            aria-pressed={active}
                            onClick={() => {
                                setAuthMethod(method);
                                setError(null);
                            }}
                            className={cn(
                                'min-h-9',
                                active && 'border-border-default bg-bg-surface text-text-primary'
                            )}
                        >
                            {method === 'otp' ? 'Email code' : 'Password'}
                        </Button>
                    );
                })}
            </div>

            <AuthField
                id="signin-email"
                label="Email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                error={Boolean(error)}
            />

            {authMethod === 'password' && (
                <AuthField
                    id="signin-password"
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    required
                    error={Boolean(error)}
                />
            )}

            {error && <AuthNotice tone="error">{error}</AuthNotice>}

            <Button
                type="submit"
                disabled={isLoading || !email || (authMethod === 'password' && !password)}
                className="w-full"
            >
                {isLoading ? (
                    <>
                        <LoaderOne size="sm" dotClassName="bg-action-primary-text" />
                        {authMethod === 'otp' ? 'Sending code' : 'Signing in'}
                    </>
                ) : authMethod === 'otp' ? (
                    'Send sign-in code'
                ) : (
                    'Sign in'
                )}
            </Button>

            {authMethod === 'password' && (
                <p className="text-center text-sm text-text-muted">
                    <Link
                        href={AUTH_PATHS.forgotPassword}
                        className="font-semibold text-text-secondary transition-colors hover:text-text-primary"
                    >
                        Forgot your password?
                    </Link>
                </p>
            )}
        </form>
    );
}
