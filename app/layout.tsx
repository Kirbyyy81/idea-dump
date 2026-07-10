import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import { AlertDialog } from '@/components/molecules/AlertDialog';
import { PwaRegister } from '@/components/molecules/PwaRegister';
import { AuthenticatedAppShell } from '@/components/organisms/AuthenticatedAppShell';

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-sans',
    display: 'swap',
});

export const metadata: Metadata = {
    applicationName: 'IdeaDump',
    title: 'IdeaDump',
    description: 'All in one stop for random ideas',
    manifest: '/manifest.webmanifest',
    icons: {
        icon: [
            { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        apple: '/icon-192.png',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'IdeaDump',
    },
};

export const viewport: Viewport = {
    themeColor: '#F8F5EF',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={plusJakartaSans.variable}>
            <body className="min-h-screen antialiased">
                <AlertProvider>
                    <AuthenticatedAppShell>{children}</AuthenticatedAppShell>
                    <AlertDialog />
                </AlertProvider>
                <PwaRegister />
            </body>
        </html>
    );
}
