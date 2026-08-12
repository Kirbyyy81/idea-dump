import { AuthFlow } from '@/app/login/_components/AuthFlow';
import type { AuthView } from '@/lib/auth/routes';

export interface AuthRoutePageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export async function AuthRoutePage({
    searchParams,
    view,
}: AuthRoutePageProps & { view: AuthView }) {
    const resolvedSearchParams = await searchParams;
    const queryError = firstValue(resolvedSearchParams?.error);

    return <AuthFlow key={view} view={view} queryError={queryError} />;
}
