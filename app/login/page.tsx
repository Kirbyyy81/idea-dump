import { AuthFlow } from '@/app/login/_components/AuthFlow';
import { parseAuthView } from '@/lib/auth/routes';

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default function LoginPage({
    searchParams,
}: {
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    const view = parseAuthView(firstValue(searchParams?.view));
    const queryError = firstValue(searchParams?.error);

    return <AuthFlow key={view} view={view} queryError={queryError} />;
}
