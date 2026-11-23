'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import { Select } from '@/components/atoms/Select';
import { Toggle } from '@/components/atoms/Toggle';
import { FormDialog } from '@/components/molecules/FormDialog';
import { financeApiRequest } from '@/lib/finance/core/client';
import { notificationEditorFields, notificationFormatText, notificationDefinitionFromText } from '@/lib/finance/notifications/editor';
import type { FinanceNotificationPattern } from '@/lib/types';

export function NotificationPatternForm({ sourceId, pattern, onClose, onSaved }: {
    sourceId: string; pattern: Pick<FinanceNotificationPattern,'id'|'name'|'revision'|'definition'|'is_active'>;
    onClose: () => void; onSaved: () => Promise<void>;
}) {
    const [name,setName]=useState(pattern.name), [format,setFormat]=useState(notificationFormatText(pattern.definition));
    const [direction,setDirection]=useState<string>(pattern.definition.direction ?? '');
    const [match,setMatch]=useState(pattern.definition.match ?? 'whole');
    const [trailing,setTrailing]=useState(pattern.definition.trailing_sentence ?? false);
    const [active,setActive]=useState(pattern.is_active), [saving,setSaving]=useState(false), [error,setError]=useState('');
    const field=useRef<HTMLTextAreaElement>(null);
    function insert(token: string) {
        const start=field.current?.selectionStart ?? format.length, end=field.current?.selectionEnd ?? format.length;
        const text=`[${token}]`;setFormat(format.slice(0,start)+text+format.slice(end));
        requestAnimationFrame(()=>{field.current?.focus();field.current?.setSelectionRange(start+text.length,start+text.length);});
    }
    async function save(event: FormEvent) {
        event.preventDefault();setError('');setSaving(true);
        try {
            const definition=notificationDefinitionFromText(format,direction,match,trailing);
            await financeApiRequest('/api/finance/notification-patterns',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
                kind:'extract',id:pattern.id,revision:pattern.revision,source_id:sourceId,name,definition,is_active:active,
            })});
            await onSaved();
        } catch(e){setError(e instanceof Error ? e.message : 'Could not save pattern');}
        finally{setSaving(false);}
    }
    return <FormDialog title="Edit notification pattern" onClose={onClose} busy={saving}>
        <form onSubmit={save} className="space-y-4">
            <Input label="Rule name" value={name} onChange={event=>setName(event.target.value)} required maxLength={100} disabled={saving}/>
            <Textarea ref={field} label="Matching format" value={format} onChange={event=>setFormat(event.target.value)} required maxLength={3000} disabled={saving}
                description="Use fields for changing values. Put [notes] last to capture the trailing description."/>
            <Select label="Insert field" value="" options={[{value:'',label:'Choose a field'},...notificationEditorFields.map(value=>({value,label:value}))]} onChange={insert} disabled={saving}/>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select label="Direction" value={direction} onChange={setDirection} disabled={saving} options={[{value:'',label:'Not specified'},{value:'expense',label:'Expense'},{value:'income',label:'Income'}]}/>
                <Select label="Match" value={match} onChange={setMatch} disabled={saving} options={[{value:'whole',label:'Whole notification body'},{value:'contains',label:'Contains this format'}]}/>
            </div>
            <Toggle toggleLabel="Allow trailing text" checked={trailing} onChange={setTrailing} disabled={saving}/>
            <Toggle toggleLabel="Enabled" checked={active} onChange={setActive} disabled={saving}/>
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" isLoading={saving}>Save pattern</Button></div>
        </form>
    </FormDialog>;
}
