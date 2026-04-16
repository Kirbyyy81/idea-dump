import type { Metadata } from 'next';
import { DM_Serif_Text, Inter } from 'next/font/google';
import './globals.css';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import { AlertDialog } from '@/components/molecules/AlertDialog';

const dmSerifText = DM_Serif_Text({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-heading',
    display: 'swap',
});

const inter = Inter({
    subsets: ['latin'],
    variable: '--font-body',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'IdeaDump - Personal PRD Management Hub',
    description: 'Centralize, track, and manage all your PRDs and project ideas in one place.',
    icons: {
        icon: [
            { url: '/logo.png', sizes: '32x32', type: 'image/png' },
            { url: '/logo.png', sizes: '16x16', type: 'image/png' },
        ],
        apple: '/logo.png',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${dmSerifText.variable} ${inter.variable}`}>
            <body className="min-h-screen antialiased">
                <AlertProvider>
                    {children}
                    <AlertDialog />
                </AlertProvider>
            </body>
        </html>
    );
}
