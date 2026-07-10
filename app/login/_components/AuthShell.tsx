import Link from 'next/link';
import { Card } from '@/components/atoms/Card';
import { AUTH_PATHS, AUTH_VIEWS, type AuthView } from '@/lib/auth/routes';
import { cn } from '@/lib/utils';

interface AuthShellProps {
    children: React.ReactNode;
    description: string;
    title: string;
    view: AuthView;
}

export function AuthShell({ children, description, title, view }: AuthShellProps) {
    const signInActive = view === AUTH_VIEWS.signIn;
    const signUpActive = view === AUTH_VIEWS.signUp;

    return (
        <main className="flex min-h-screen items-center justify-center bg-bg-canvas px-4 py-8 sm:px-6">
            <div className="w-full max-w-md">
                <Link
                    href="/"
                    className="mb-6 inline-flex min-h-10 items-center text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
                >
                    Back to home
                </Link>

                <Card className="border-border-strong p-6 sm:p-8">
                    <header className="mb-6 text-center">
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-text-muted">
                            IdeaDump account
                        </p>
                        <h1 className="mb-2 text-2xl font-extrabold text-text-primary">{title}</h1>
                        <p className="text-sm text-text-secondary">{description}</p>
                    </header>

                    <nav
                        aria-label="Account access"
                        className="mb-6 grid grid-cols-2 gap-1 rounded-md border border-border-subtle bg-bg-subtle p-1"
                    >
                        <Link
                            href={AUTH_PATHS.signIn}
                            aria-current={signInActive ? 'page' : undefined}
                            className={cn(
                                'flex min-h-10 items-center justify-center rounded-sm px-3 text-xs font-bold transition-colors',
                                signInActive
                                    ? 'border border-border-default bg-bg-surface text-text-primary'
                                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                            )}
                        >
                            Sign in
                        </Link>
                        <Link
                            href={AUTH_PATHS.signUp}
                            aria-current={signUpActive ? 'page' : undefined}
                            className={cn(
                                'flex min-h-10 items-center justify-center rounded-sm px-3 text-xs font-bold transition-colors',
                                signUpActive
                                    ? 'border border-border-default bg-bg-surface text-text-primary'
                                    : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                            )}
                        >
                            Create account
                        </Link>
                    </nav>

                    {children}
                </Card>
            </div>
        </main>
    );
}
