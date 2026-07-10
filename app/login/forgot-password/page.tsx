import {
    AuthRoutePage,
    type AuthRoutePageProps,
} from '@/app/login/_components/AuthRoutePage';
import { AUTH_VIEWS } from '@/lib/auth/routes';

export default function ForgotPasswordPage({ searchParams }: AuthRoutePageProps) {
    return (
        <AuthRoutePage
            view={AUTH_VIEWS.forgotPassword}
            searchParams={searchParams}
        />
    );
}
