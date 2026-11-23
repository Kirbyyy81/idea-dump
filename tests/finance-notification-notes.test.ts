import { describe, expect, it } from 'vitest';
import { parseFinanceNotification } from '@/lib/finance/notifications/parser';
import { learnNotificationPattern } from '@/lib/finance/notifications/learning';
import { notificationDefinitionFromText, notificationFormatText } from '@/lib/finance/notifications/editor';
import { notificationPatterns } from './fixtures/notification-patterns';
import type { FinanceNotificationEventInput } from '@/lib/types';
const event=(notes:string):FinanceNotificationEventInput=>({client_event_id:'00000000-0000-4000-8000-000000000001',source_id:'00000000-0000-4000-8000-000000000002',source_package:'my.com.tngdigital.ewallet',captured_at:'2026-10-02T07:45:58Z',notification_key_hash:'a'.repeat(64),notification:{title:'TNG',text:`RM16.00 received from Alex Tan for ${notes}`,subtext:null,posted_at:'2026-10-02T07:45:54Z'}});
const format='[amount] received from [payee name] for [notes]';
describe('notification notes and editing',()=>{
 it.each(['资金转账','musium ticket','Fund Transfer - lunch','Tickets for adults.','USD 23 Cafe'])('captures changing notes without another pattern: %s',notes=>{
  expect(parseFinanceNotification(event(notes),notificationPatterns,'owner').payload).toMatchObject({amount:16,payee_name:'Alex Tan',direction:'income',notes});
 });
 it('reuses the generic format on manual confirmation without retaining the example note',()=>{
  const result=learnNotificationPattern(event('musium ticket'),{amount:16,direction:'income',merchant:null,payee_name:'Alex Tan',transaction_date:'2026-10-02',reference_number:null,notes:'musium ticket'},notificationPatterns,'owner');
  expect(result?.format_key).toBe('tng-received-notes');
  expect(notificationFormatText(result!.definition)).toBe(format);
  expect(JSON.stringify(result)).not.toContain('musium ticket');
 });
 it('does not overwrite a manually edited saved rule through learning',()=>{
  const starter=notificationPatterns.find(p=>p.format_key==='tng-received-notes')!;
  const manual={...starter,id:'manual',user_id:'owner',source_id:event('').source_id,origin:'override' as const};
  expect(learnNotificationPattern(event('Tickets'),{amount:16,direction:'income',merchant:null,payee_name:'Alex Tan',transaction_date:'2026-10-02',reference_number:null,notes:'Tickets'},[...notificationPatterns,manual],'owner')).toBeNull();
 });
 it('round-trips supported placeholders without widening their match scope',()=>{
  for(const pattern of notificationPatterns.filter(p=>!p.definition.action)) {
   const d=pattern.definition;
   expect(notificationDefinitionFromText(notificationFormatText(d),d.direction??'',d.match??'whole',d.trailing_sentence??false)).toEqual(d);
  }
 });
 it.each(['[amount][payee name]','[unknown] received from [payee name]','[amount] received from [payee name] for [notes] later','[amount] received from [payee name] for [notes] and [notes]'])('rejects ambiguous or unsupported formats: %s',text=>{
  expect(()=>notificationDefinitionFromText(text,'income','whole',false)).toThrow();
 });
 it('requires terminal notes and bounds the extracted text',()=>{
  expect(()=>notificationDefinitionFromText(format,'income','contains',false)).toThrow();
  expect(()=>notificationDefinitionFromText(format,'income','whole',true)).toThrow();
  expect(parseFinanceNotification(event('x'.repeat(2501)),notificationPatterns,'owner').payload?.notes).toBeNull();
  expect(parseFinanceNotification(event('🍜'.repeat(1300)),notificationPatterns,'owner').payload?.notes).toBeNull();
 });
});
