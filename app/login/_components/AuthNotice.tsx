import { cn } from '@/lib/utils';

interface AuthNoticeProps {
    children: React.ReactNode;
    tone: 'error' | 'success' | 'info';
}

export function AuthNotice({ children, tone }: AuthNoticeProps) {
    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            className={cn(
                'rounded-md border p-3 text-sm',
                tone === 'error' && 'border-error bg-error-bg text-error',
                tone === 'success' && 'border-success bg-success-bg text-success',
                tone === 'info' && 'border-info bg-info-bg text-info'
            )}
        >
            {children}
        </div>
    );
}
