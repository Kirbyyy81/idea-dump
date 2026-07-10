'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthField } from '@/app/login/_components/AuthField';
import { AuthNotice } from '@/app/login/_components/AuthNotice';
import { Button } from '@/components/atoms/Button';
import { LoaderOne } from '@/components/atoms/Loader';
import { AUTH_PATHS } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/client';

interface SignUpFormProps {
    queryError?: string;
}

export function SignUpForm({ queryError }: SignUpFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(queryError ?? null);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsLoading(true);

        try {
            const supabase = createClient();
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`,
                },
            });

            if (signUpError) {
                setError(signUpError.message);
                return;
            }

            if (data.session) {
                window.location.assign('/');
            } else {
                setIsSent(true);
            }
        } catch {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSent) {
        return (
            <div className="space-y-4">
                <AuthNotice tone="success">
                    We sent a confirmation link to <strong>{email}</strong>.
                </AuthNotice>
                <Link
                    href={AUTH_PATHS.signIn}
                    className="btn-primary flex w-full items-center justify-center"
                >
                    Back to sign in
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <AuthField
                id="signup-email"
                label="Email address"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                error={Boolean(error)}
            />
            <AuthField
                id="signup-password"
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a password"
                required
                error={Boolean(error)}
            />
            <AuthField
                id="signup-confirm-password"
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat your password"
                required
                error={Boolean(error)}
            />

            {error && <AuthNotice tone="error">{error}</AuthNotice>}

            <Button
                type="submit"
                disabled={isLoading || !email || !password || !confirmPassword}
                className="w-full"
            >
                {isLoading ? (
                    <>
                        <LoaderOne size="sm" dotClassName="bg-action-primary-text" />
                        Creating account
                    </>
                ) : (
                    'Create account'
                )}
            </Button>
        </form>
    );
}
