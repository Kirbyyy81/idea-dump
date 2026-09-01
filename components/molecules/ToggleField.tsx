import type { ReactNode } from 'react';
import { Toggle } from '@/components/atoms/Toggle';
import type { ToggleProps } from '@/components/atoms/Toggle';
import { FieldShell } from '@/components/molecules/FieldShell';

export interface ToggleFieldProps extends Omit<
    ToggleProps,
    'ariaDescribedBy' | 'ariaLabel' | 'dataFinanceField' | 'error' | 'id' | 'label' | 'required'
> {
    'aria-describedby'?: string;
    'aria-label'?: string;
    containerClassName?: string;
    'data-finance-field'?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    id: string;
    label?: ReactNode;
    required?: boolean;
    toggleLabel: string;
}

export function ToggleField({
    'aria-describedby': ariaDescribedBy,
    'aria-label': ariaLabel,
    containerClassName,
    'data-finance-field': dataFinanceField,
    description,
    error,
    errorMessage,
    id,
    label,
    required,
    toggleLabel,
    ...toggleProps
}: ToggleFieldProps) {
    return (
        <FieldShell
            id={id}
            label={label}
            required={required}
            description={description}
            errorMessage={errorMessage}
            ariaDescribedBy={ariaDescribedBy}
            className={containerClassName}
        >
            {({ controlId, describedBy, hasError }) => (
                <Toggle
                    {...toggleProps}
                    id={controlId}
                    label={toggleLabel}
                    required={required}
                    error={error || hasError}
                    ariaLabel={ariaLabel}
                    ariaDescribedBy={describedBy}
                    dataFinanceField={dataFinanceField}
                />
            )}
        </FieldShell>
    );
}
