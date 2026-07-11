import type { InputProps } from '@/components/atoms/Input';
import { Input } from '@/components/atoms/Input';

interface AuthFieldProps extends InputProps {
    label: string;
}

export function AuthField({ id, label, error, ...props }: AuthFieldProps) {
    return (
        <div>
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-semibold text-text-secondary"
            >
                {label}
            </label>
            <Input id={id} error={error} aria-invalid={error || undefined} {...props} />
        </div>
    );
}
