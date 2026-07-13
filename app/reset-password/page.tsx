import { redirect } from 'next/navigation';
import { AUTH_PATHS } from '@/lib/auth/routes';

export default function LegacyResetPasswordPage() {
    redirect(AUTH_PATHS.forgotPassword);
}
