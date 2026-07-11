import { redirect } from 'next/navigation';
import { AUTH_PATHS } from '@/lib/auth/routes';

export default function LegacySignupPage() {
    redirect(AUTH_PATHS.signUp);
}
