import {
    AuthRoutePage,
    type AuthRoutePageProps,
} from '@/app/login/_components/AuthRoutePage';
import { AUTH_VIEWS } from '@/lib/auth/routes';

export default function SignupPage({ searchParams }: AuthRoutePageProps) {
    return <AuthRoutePage view={AUTH_VIEWS.signUp} searchParams={searchParams} />;
}
