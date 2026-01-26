import Link from 'next/link';

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
                <div className="max-w-3xl mx-auto text-center animate-fade-in">
                    {/* Logo/Title */}
                    <div className="mb-8">
                        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
                            <span className="text-text-primary">Idea</span>
                            <span
                                className="bg-clip-text text-transparent"
                                style={{ backgroundImage: 'var(--gradient-accent)' }}
                            >
                                Dump
                            </span>
                        </h1>
                        <p className="text-xl text-text-secondary max-w-xl mx-auto">
                            Your personal hub to centralize, track, and manage all your PRDs and project ideas.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="grid md:grid-cols-3 gap-6 mb-12 text-left">
                        <div className="card">
                            <div className="text-2xl mb-3">📄</div>
                            <h3 className="font-semibold text-text-primary mb-2">Store PRDs</h3>
                            <p className="text-sm text-text-secondary">
                                Import and store all your PRDs in beautiful markdown format.
                            </p>
                        </div>
                        <div className="card">
                            <div className="text-2xl mb-3">🎯</div>
                            <h3 className="font-semibold text-text-primary mb-2">Track Progress</h3>
                            <p className="text-sm text-text-secondary">
                                Status auto-updates as you add content and link repos.
                            </p>
                        </div>
                        <div className="card">
                            <div className="text-2xl mb-3">🔗</div>
                            <h3 className="font-semibold text-text-primary mb-2">API Access</h3>
                            <p className="text-sm text-text-secondary">
                                Send PRDs directly from tools like Antigravity.
                            </p>
                        </div>
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link href="/dashboard" className="btn-primary text-center">
                            Go to Dashboard
                        </Link>
                        <a
                            href="https://github.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary text-center"
                        >
                            View on GitHub
                        </a>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-6 px-6 text-center text-text-muted text-sm border-t border-border-subtle">
                <p>Built with Next.js + Supabase</p>
            </footer>
        </div>
    );
}
