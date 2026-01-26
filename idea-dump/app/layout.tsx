import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'IdeaDump - Personal PRD Management Hub',
    description: 'Centralize, track, and manage all your PRDs and project ideas in one place.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" data-theme="dark">
            <body className="min-h-screen antialiased">
                {children}
            </body>
        </html>
    );
}
