import {
    AuthRoutePage,
    type AuthRoutePageProps,
} from '@/app/login/_components/AuthRoutePage';
import { AUTH_VIEWS } from '@/lib/auth/routes';

export default function LoginPage({ searchParams }: AuthRoutePageProps) {
    return <AuthRoutePage view={AUTH_VIEWS.signIn} searchParams={searchParams} />;
}
