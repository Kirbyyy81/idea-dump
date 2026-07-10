import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@/components/atoms/Card';
import { AUTH_PATHS, AUTH_VIEWS, type AuthView } from '@/lib/auth/routes';
import { cn } from '@/lib/utils';

interface AuthShellProps {
    children: React.ReactNode;
    title: string;
    view: AuthView;
}

export function AuthShell({ children, title, view }: AuthShellProps) {
    const signInActive = view === AUTH_VIEWS.signIn;
    const signUpActive = view === AUTH_VIEWS.signUp;

    return (
        <main className="flex min-h-screen items-center justify-center bg-bg-canvas px-4 py-8 sm:px-6">
            <div className="w-full max-w-md">
                <Card className="border-border-strong p-6 sm:p-8">
                    <div className="mb-5 flex items-center justify-center gap-2">
                        <Image
                            src="/logo.png"
                            alt=""
                            width={36}
                            height={36}
                            priority
                            className="size-9 object-contain"
                        />
                        <span className="text-lg font-extrabold text-text-primary">IdeaDump</span>
                    </div>

                    <nav
                        aria-label="Account access"
                        className="mb-6 flex items-center justify-center gap-8"
                    >
                        <Link
                            href={AUTH_PATHS.signIn}
                            aria-current={signInActive ? 'page' : undefined}
                            className={cn(
                                'flex min-h-10 items-center justify-center border-b-2 px-1 text-sm font-bold transition-colors',
                                signInActive
                                    ? 'border-action-primary text-text-primary'
                                    : 'border-transparent text-text-muted hover:text-text-primary'
                            )}
                        >
                            Sign in
                        </Link>
                        <Link
                            href={AUTH_PATHS.signUp}
                            aria-current={signUpActive ? 'page' : undefined}
                            className={cn(
                                'flex min-h-10 items-center justify-center border-b-2 px-1 text-sm font-bold transition-colors',
                                signUpActive
                                    ? 'border-action-primary text-text-primary'
                                    : 'border-transparent text-text-muted hover:text-text-primary'
                            )}
                        >
                            Create account
                        </Link>
                    </nav>

                    <header className="mb-6 text-center">
                        <h1 className="text-2xl font-extrabold text-text-primary">{title}</h1>
                    </header>

                    {children}
                </Card>
            </div>
        </main>
    );
}
