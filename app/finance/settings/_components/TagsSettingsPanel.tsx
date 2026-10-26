'use client';
import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { FinanceReferenceDataState, useFinanceReferenceData } from '@/app/finance/_components/FinanceReferenceData';
import { financeApiRequest } from '@/lib/finance/core/client';
import { useAlert } from '@/lib/contexts/AlertContext';
import type { FinanceTag } from '@/lib/types';
import { FinanceSettingsColumns, FinanceSettingsFormCard, FinanceSettingsLibrary, FinanceSettingsPanelLayout } from './FinanceSettingsPanelLayout';
export function TagsSettingsPanel() {
    const { tags = [], upsertTag, status, error, refresh } = useFinanceReferenceData();
    const { showError, showSuccessToast } = useAlert();
    const [name, setName] = useState(''); const [editing, setEditing] = useState<FinanceTag | null>(null); const [saving, setSaving] = useState(false);
    const save = async (body: Partial<FinanceTag>, update = false) => {
        setSaving(true);
        try { const { data } = await financeApiRequest<{ data: FinanceTag }>('/api/finance/tags', { method: update ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            upsertTag(data); setEditing(null); setName(''); showSuccessToast(update ? 'Tag updated' : 'Tag saved');
        } catch (error) { showError(error instanceof Error ? error.message : 'Could not save tag'); }
        finally { setSaving(false); }
    };
    if (status !== 'ready') return <FinanceReferenceDataState status={status} error={error} retry={refresh} />;
    return <FinanceSettingsPanelLayout><FinanceSettingsColumns>
        <form onSubmit={event => { event.preventDefault(); void save({ name: name.trim(), ...(editing ? { id: editing.id } : {}) }, Boolean(editing)); }}>
            <FinanceSettingsFormCard title={editing ? 'Edit tag' : 'New tag'} action={<div className="flex gap-2"><Button type="submit" disabled={saving || !name.trim()} isLoading={saving}>{editing ? 'Save tag' : 'Add tag'}</Button>{editing && <Button type="button" variant="secondary" onClick={() => { setEditing(null); setName(''); }}>Cancel</Button>}</div>}>
                <Input label="Name" required value={name} maxLength={120} onChange={event => setName(event.target.value)} />
            </FinanceSettingsFormCard>
        </form>
        <FinanceSettingsLibrary title="Tags" headingId="finance-tags" emptyMessage="No tags yet." isEmpty={!tags.length} isLoading={false} loadingLabel="Loading tags...">
            {[...tags].sort((a,b) => Number(a.is_archived)-Number(b.is_archived) || a.name.localeCompare(b.name)).map(tag => <div key={tag.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><span className="min-w-0 break-words">{tag.name}{tag.is_archived ? ' (archived)' : ''}</span><div className="flex gap-2">
                <Button type="button" variant="ghost" disabled={saving} aria-label={`Edit tag ${tag.name}`} onClick={() => { setEditing(tag); setName(tag.name); }}>Edit</Button>
                <Button type="button" variant="ghost" disabled={saving} aria-label={`${tag.is_archived ? 'Restore' : 'Archive'} tag ${tag.name}`} onClick={() => void save({ id: tag.id, is_archived: !tag.is_archived }, true)}>{tag.is_archived ? 'Restore' : 'Archive'}</Button>
            </div></div>)}
        </FinanceSettingsLibrary>
    </FinanceSettingsColumns></FinanceSettingsPanelLayout>;
}
