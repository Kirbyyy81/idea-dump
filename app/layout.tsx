import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AlertProvider } from '@/lib/contexts/AlertContext';
import { AlertDialog } from '@/components/molecules/AlertDialog';

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ['latin'],
    variable: '--font-sans',
    display: 'swap',
});

export const metadata: Metadata = {
    title: 'IdeaDump',
    description: 'All in one stop for random ideas',
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
        <html lang="en" className={plusJakartaSans.variable}>
            <body className="min-h-screen antialiased">
                <AlertProvider>
                    {children}
                    <AlertDialog />
                </AlertProvider>
            </body>
        </html>
    );
}
