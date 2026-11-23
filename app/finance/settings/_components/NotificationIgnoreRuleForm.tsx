'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { FormDialog } from '@/components/molecules/FormDialog';
import { financeApiRequest } from '@/lib/finance/core/client';
import type { FinanceNotificationPattern } from '@/lib/types';

type Pattern = Pick<FinanceNotificationPattern, 'id' | 'name' | 'revision' | 'definition' | 'source_package' | 'is_active'>;
export function NotificationIgnoreRuleForm({ sourceId, pattern, onClose, onSaved }: {
    sourceId: string; pattern?: Pattern; onClose: () => void; onSaved: () => Promise<void>;
}) {
    const [name, setName] = useState(pattern?.name ?? '');
    const [prefix, setPrefix] = useState(typeof pattern?.definition.parts[0] === 'string' ? pattern.definition.parts[0] : '');
    const [application, setApplication] = useState(pattern?.source_package ?? 'my.rytbank.app');
    const [active, setActive] = useState(pattern?.is_active ?? true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    async function submit(event: FormEvent) {
        event.preventDefault(); setSaving(true); setError('');
        try {
            await financeApiRequest('/api/finance/notification-patterns', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                id: pattern?.id ?? null, revision: pattern?.revision ?? null, source_id: sourceId,
                name, prefix, source_package: application, is_active: active,
            }) });
            await onSaved();
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not save ignore rule'); }
        finally { setSaving(false); }
    }
    return <FormDialog title={pattern ? 'Edit ignore rule' : 'Add ignore rule'} onClose={onClose} busy={saving}>
        <form className="space-y-4" onSubmit={submit}>
            <Input label="Rule name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={saving} />
            <Select label="Application" value={application} onChange={setApplication} disabled={saving || Boolean(pattern)} options={[
                { value: 'my.rytbank.app', label: 'Ryt Bank' }, { value: 'my.com.tngdigital.ewallet', label: 'TnG eWallet' }, { value: '*', label: 'All supported apps' },
            ]} />
            <Input label="Starts with" required minLength={4} maxLength={120} value={prefix} onChange={event => setPrefix(event.target.value)} disabled={saving}
                description="Ignore notifications when a title, body or subtext line starts with this phrase. Matching ignores case and repeated spaces." />
            <Toggle label="Status" toggleLabel="Enabled" checked={active} onChange={setActive} disabled={saving} />
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
                <Button type="submit" isLoading={saving}>Save rule</Button></div>
        </form>
    </FormDialog>;
}
