'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Mail, ArrowLeft, Loader2, CheckCircle, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [hasSession, setHasSession] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        const queryError = searchParams.get('error');
        if (queryError) {
            setError(queryError);
        }
    }, [searchParams]);

    useEffect(() => {
        const checkSession = async () => {
            const supabase = createClient();
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                setHasSession(true);
                setEmail(data.session.user.email ?? '');
            }
        };

        checkSession();
    }, []);

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback`,
            });

            if (error) {
                setError(error.message);
                return;
            }

            setMessage('Check your email for a reset link.');
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setMessage(null);

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            setIsLoading(false);
            return;
        }

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) {
                setError(error.message);
                return;
            }

            setMessage('Password updated successfully.');
            router.push('/');
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-md">
                <Link
                    href="/login"
                    className="flex items-center gap-2 mb-8 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <ArrowLeft size={20} />
                    Back to Sign In
                </Link>

                <div className="card p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl mb-2">
                            <span className="text-text-primary">Idea</span>
                            <span className="text-accent-rose">Dump</span>
                        </h1>
                        <p className="text-text-secondary">
                            {hasSession ? 'Set a new password' : 'Reset your password'}
                        </p>
                    </div>

                    {message && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-6">
                            <p className="text-sm text-emerald-400">{message}</p>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {hasSession ? (
                        <form onSubmit={handleUpdatePassword} className="space-y-6">
                            <div>
                                <label
                                    htmlFor="newPassword"
                                    className="block text-sm font-medium text-text-secondary mb-2"
                                >
                                    New password
                                </label>
                                <div className="relative">
                                    <input
                                        id="newPassword"
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="input w-full pl-10"
                                    />
                                    <Lock
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                                    />
                                </div>
                            </div>

                            <div>
                                <label
                                    htmlFor="confirmPassword"
                                    className="block text-sm font-medium text-text-secondary mb-2"
                                >
                                    Confirm new password
                                </label>
                                <div className="relative">
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="input w-full pl-10"
                                    />
                                    <Lock
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !newPassword || !confirmPassword}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    'Update Password'
                                )}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRequestReset} className="space-y-6">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-text-secondary mb-2"
                                >
                                    Email address
                                </label>
                                <div className="relative">
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        required
                                        className="input w-full pl-10"
                                    />
                                    <Mail
                                        size={18}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !email}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    'Send Reset Link'
                                )}
                            </button>
                        </form>
                    )}
                </div>

                <p className="text-center text-sm text-text-muted mt-6">
                    Need an account?{' '}
                    <Link
                        href="/signup"
                        className="text-text-secondary hover:text-text-primary transition-colors"
                    >
                        Create one
                    </Link>
                </p>
            </div>
        </div>
    );
}
