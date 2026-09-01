import type { ReactNode } from 'react';
import { Select } from '@/components/atoms/Select';
import type { SelectProps } from '@/components/atoms/Select';
import { FieldShell } from '@/components/molecules/FieldShell';

export interface SelectFieldProps extends Omit<
    SelectProps,
    'ariaDescribedBy' | 'ariaLabel' | 'dataFinanceField' | 'error' | 'id' | 'required'
> {
    'aria-describedby'?: string;
    'aria-label'?: string;
    containerClassName?: string;
    'data-finance-field'?: string;
    description?: ReactNode;
    error?: boolean;
    errorMessage?: string;
    id: string;
    label: ReactNode;
    required?: boolean;
}

export function SelectField({
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
    ...selectProps
}: SelectFieldProps) {
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
                <Select
                    {...selectProps}
                    id={controlId}
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
