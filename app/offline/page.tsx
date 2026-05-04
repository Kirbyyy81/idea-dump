import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';

export default function OfflinePage() {
    return (
        <div className="min-h-screen bg-bg-base px-6 py-12">
            <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-lg items-center justify-center">
                <Card className="w-full p-8 text-center">
                    <p className="mb-3 text-sm uppercase tracking-[0.2em] text-text-muted">
                        Offline
                    </p>
                    <h1 className="mb-4">You are offline</h1>
                    <p className="mb-6 text-text-secondary">
                        IdeaDump needs a network connection to load live data, but you can reopen
                        this page once you are back online.
                    </p>
                    <div className="flex justify-center">
                        <Link href="/dashboard" className="btn-primary">
                            Go to Dashboard
                        </Link>
                    </div>
                </Card>
            </div>
        </div>
    );
}
