'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                },
            });

            if (error) {
                setError(error.message);
            } else {
                setIsSent(true);
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsVerifying(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'email',
            });

            if (error) {
                setError(error.message);
            } else {
                router.push('/dashboard');
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                },
            });

            if (error) {
                setError(error.message);
            }
        } catch {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-md">
                {/* Back to Home */}
                <Link
                    href="/"
                    className="flex items-center gap-2 mb-8 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <ArrowLeft size={20} />
                    Back to Home
                </Link>

                {/* Card */}
                <div className="card p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl mb-2">
                            <span className="text-text-primary">Idea</span>
                            <span className="text-accent-rose">Dump</span>
                        </h1>
                        <p className="text-text-secondary">
                            {isSent ? 'Enter the code we emailed you' : 'Sign in with a one-time code'}
                        </p>
                    </div>

                    {isSent ? (
                        /* Verify Code */
                        <form onSubmit={handleVerifyCode} className="space-y-6">
                            <div className="text-center">
                                <div className="mb-4 flex justify-center">
                                    <CheckCircle size={48} className="text-status-complete" />
                                </div>
                                <p className="text-text-primary mb-2">Code sent!</p>
                                <p className="text-sm text-text-secondary">
                                    We emailed a one-time code to <strong>{email}</strong>.
                                </p>
                            </div>

                            <div>
                                <label
                                    htmlFor="code"
                                    className="block text-sm font-medium text-text-secondary mb-2"
                                >
                                    One-time code
                                </label>
                                <input
                                    id="code"
                                    type="text"
                                    inputMode="numeric"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="123456"
                                    required
                                    className="input w-full"
                                />
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <p className="text-sm text-red-400">{error}</p>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isVerifying || !code}
                                className="btn-primary w-full flex items-center justify-center gap-2"
                            >
                                {isVerifying ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Verifying...
                                    </>
                                ) : (
                                    'Verify Code'
                                )}
                            </button>

                            <div className="flex items-center justify-between text-sm">
                                <button
                                    type="button"
                                    onClick={handleResend}
                                    disabled={isLoading}
                                    className="text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    Resend code
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSent(false);
                                        setEmail('');
                                        setCode('');
                                        setError(null);
                                    }}
                                    className="text-text-secondary hover:text-text-primary transition-colors"
                                >
                                    Use different email
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* Send Code */
                        <form onSubmit={handleSendCode} className="space-y-6">
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

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <p className="text-sm text-red-400">{error}</p>
                                </div>
                            )}

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
                                    'Send Code'
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-sm text-text-muted mt-6">
                    No password needed. We&apos;ll email you a one-time code.
                </p>
            </div>
        </div>
    );
}
