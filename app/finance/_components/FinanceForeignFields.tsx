import { Input } from '@/components/atoms/Input';
import type { FinanceFieldErrors } from '@/lib/finance/core/values';
import { formatFinanceForeignDetails, type ForeignForm } from '@/lib/finance/transactions/foreignCurrency';

export function FinanceForeignFields({ id, value, myrAmount, errors, disabled, onChange }: {
    id: string;
    value: ForeignForm;
    myrAmount: string;
    errors: FinanceFieldErrors;
    disabled: boolean;
    onChange: (field: keyof ForeignForm, value: string) => void;
}) {
    const conversion = formatFinanceForeignDetails(myrAmount, value);
    return <div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id={id + '-foreign-currency'} label="Foreign currency" placeholder="TWD"
                data-finance-field="foreign_currency" autoCapitalize="characters" spellCheck={false}
                maxLength={3} value={value.foreign_currency} disabled={disabled}
                errorMessage={errors.foreign_currency}
                onChange={event => onChange('foreign_currency', event.target.value.toUpperCase())} />
            <Input id={id + '-foreign-amount'} label="Foreign amount" placeholder="0.00"
                data-finance-field="foreign_amount" inputMode="decimal" maxLength={17}
                value={value.foreign_amount} disabled={disabled} errorMessage={errors.foreign_amount}
                onChange={event => onChange('foreign_amount', event.target.value)} />
        </div>
        {conversion && <p className="mt-2 text-xs text-text-secondary">{conversion}</p>}
    </div>;
}
