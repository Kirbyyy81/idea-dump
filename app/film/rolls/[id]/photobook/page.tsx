import { redirect } from 'next/navigation';

interface PhotobookRedirectPageProps {
    params: {
        id: string;
    };
}

export default function PhotobookRedirectPage({ params }: PhotobookRedirectPageProps) {
    redirect(`/film/rolls/${params.id}?step=photobook`);
}
