'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    useEffect(() => {
        const supabase = createClient();

        // Check active session immediately to handle initial redirects
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                router.refresh(); // Update server components
            }
        };
        checkSession();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth State Change:', event);

            if (session) {
                // If we possess a session, refresh the router so Server Components serve authenticated content
                router.refresh();

                // If on login page, redirect to dashboard
                if (window.location.pathname === '/' || window.location.pathname === '/login') {
                    router.push('/dashboard');
                }
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [router]);

    return <>{children}</>;
}
