import Link from 'next/link';
import { FileText, Target, Link2 } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col">
            {/* Hero Section */}
            <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
                <div className="max-w-3xl mx-auto text-center">
                    {/* Logo/Title */}
                    <div className="mb-8">
                        <h1 className="text-5xl md:text-6xl tracking-tight mb-4">
                            <span style={{ color: 'var(--text-primary)' }}>Idea</span>
                            <span style={{ color: 'var(--accent-rose)' }}>Dump</span>
                        </h1>
                        <p className="text-xl max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
                            Your personal hub to centralize, track, and manage all your PRDs and project ideas.
                        </p>
                    </div>

                    {/* Features */}
                    <div className="grid md:grid-cols-3 gap-6 mb-12 text-left">
                        <div className="card">
                            <div className="mb-3" style={{ color: 'var(--accent-blue)' }}>
                                <FileText size={28} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>Store PRDs</h3>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Import and store all your PRDs in beautiful markdown format.
                            </p>
                        </div>
                        <div className="card">
                            <div className="mb-3" style={{ color: 'var(--accent-sage)' }}>
                                <Target size={28} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>Track Progress</h3>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Status auto-updates as you add content and link repos.
                            </p>
                        </div>
                        <div className="card">
                            <div className="mb-3" style={{ color: 'var(--accent-apricot)' }}>
                                <Link2 size={28} />
                            </div>
                            <h3 className="font-semibold mb-2" style={{ fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>API Access</h3>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
            <footer
                className="py-6 px-6 text-center text-sm"
                style={{
                    color: 'var(--text-muted)',
                    borderTop: '1px solid var(--border-subtle)'
                }}
            >
                <p>Built with Next.js + Supabase</p>
            </footer>
        </div>
    );
}
