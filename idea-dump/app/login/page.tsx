'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordLogin, setIsPasswordLogin] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const error = searchParams.get('error');
        if (error === 'auth_failed') {
            setMessage({ type: 'error', text: 'Authentication failed. Please try again.' });
        } else if (error) {
            setMessage({ type: 'error', text: error });
        }
    }, [searchParams]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage(null);

        const supabase = createClient();

        if (isPasswordLogin) {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                setMessage({ type: 'error', text: error.message });
                setIsLoading(false);
            } else {
                setMessage({ type: 'success', text: 'Login successful! Redirecting...' });

                // Use window.location.href to force a hard reload and ensure cookies 
                // are properly recognized by the server/middleware
                window.location.href = '/dashboard';
            }

        } else {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            setIsLoading(false);

            if (error) {
                setMessage({ type: 'error', text: error.message });
            } else {
                setMessage({ type: 'success', text: 'Check your email for the magic link!' });
            }
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div
                className="w-full max-w-md p-8 rounded-xl"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)'
                }}
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
                        Welcome to <span style={{ color: 'var(--accent-rose)' }}>IdeaDump</span>
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Sign in to continue
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label
                            htmlFor="email"
                            className="block text-sm font-medium mb-2"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            Email address
                        </label>
                        <div className="relative">
                            <Mail
                                size={18}
                                className="absolute left-4 top-1/2 -translate-y-1/2"
                                style={{ color: 'var(--text-muted)' }}
                            />
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                required
                                className="input pl-11"
                            />
                        </div>
                    </div>

                    {isPasswordLogin && (
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-sm font-medium mb-2"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="input"
                            />
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !email}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                        style={{ opacity: isLoading || !email ? 0.7 : 1 }}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                {isPasswordLogin ? 'Signing in...' : 'Sending...'}
                            </>
                        ) : (
                            isPasswordLogin ? 'Sign In' : 'Send Magic Link'
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsPasswordLogin(!isPasswordLogin)}
                        className="w-full text-sm hover:underline mt-2"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {isPasswordLogin ? 'Use Magic Link instead' : 'Use Password instead'}
                    </button>
                </form>

                {/* Message */}
                {message && (
                    <div
                        className="mt-4 p-4 rounded-lg flex items-start gap-3"
                        style={{
                            background: message.type === 'success' ? 'var(--success-bg)' : 'var(--error-bg)',
                            border: `1px solid ${message.type === 'success' ? 'var(--accent-sage)' : 'var(--error)'}`
                        }}
                    >
                        {message.type === 'success' ? (
                            <CheckCircle size={20} style={{ color: 'var(--accent-sage)' }} />
                        ) : (
                            <AlertCircle size={20} style={{ color: 'var(--error)' }} />
                        )}
                        <p
                            className="text-sm"
                            style={{ color: message.type === 'success' ? 'var(--accent-sage)' : 'var(--error)' }}
                        >
                            {message.text}
                        </p>
                    </div>
                )}

                {/* Back link */}
                <div className="mt-6 text-center">
                    <Link
                        href="/"
                        className="text-sm flex items-center justify-center gap-1"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <ArrowLeft size={14} />
                        Back to home
                    </Link>
                </div>
            </div>
        </div>
    );
}
