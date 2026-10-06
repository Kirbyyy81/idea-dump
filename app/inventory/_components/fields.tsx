'use client';
import { useId, useState } from 'react';
import { DatePicker } from '@/components/atoms/DatePicker';
import { Button } from '@/components/atoms/Button';
import { Toast } from '@/components/molecules/Toast';

export function InventoryDate({ label, value, onChange, optional = false, disabled = false }: {
    label: string; value: string; onChange: (value: string) => void; optional?: boolean; disabled?: boolean;
}) {
    const id = useId();
    return <div className="space-y-2"><label htmlFor={id} className="block text-sm font-semibold">{label}</label>
        <div className="flex items-center gap-2"><DatePicker id={id} ariaLabel={label} value={value} onChange={onChange} disabled={disabled} placeholder={optional ? 'Unknown' : 'Choose date'} className="flex-1" />
            {optional && value && <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange('')} aria-label={`Clear ${label.toLowerCase()}`}>Clear</Button>}</div></div>;
}
export function InventoryErrorNotice({ error }: { error: string }) {
    return error ? <ErrorToast key={error} message={error} /> : null;
}
function ErrorToast({ message }: { message: string }) {
    const [dismissed, setDismissed] = useState(false);
    return dismissed ? null : <Toast message={message} variant="error" onDismiss={() => setDismissed(true)} />;
}
export const panelClass = 'rounded-lg border border-border-default bg-bg-surface p-4 sm:p-5';
