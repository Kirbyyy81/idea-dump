import { describe, expect, it } from 'vitest';
import { learnNotificationPattern } from '@/lib/finance/notifications/learning';
import { parseFinanceNotification } from '@/lib/finance/notifications/parser';
import { notificationPatterns } from './fixtures/notification-patterns';
import type { FinanceNotificationEventInput, FinanceNotificationPattern } from '@/lib/types';

const event=(text:string):FinanceNotificationEventInput=>({
 client_event_id:'00000000-0000-4000-8000-000000000001',source_id:'00000000-0000-4000-8000-000000000002',
 source_package:'my.rytbank.app',captured_at:'2026-10-02T07:45:58Z',notification_key_hash:'a'.repeat(64),
 notification:{title:'Account activity',text,subtext:null,posted_at:'2026-10-02T07:45:54Z'},
});
const reviewed: Parameters<typeof learnNotificationPattern>[1]={amount:16,direction:'expense' as const,merchant:'FIRST CAFE',payee_name:null,transaction_date:'2026-10-02',reference_number:'ABC123'};
const message='Settled RM16.00 with FIRST CAFE dated 02/10/2026 ref ABC123.';
function rule(input=event(message), values=reviewed):FinanceNotificationPattern {
 const result=learnNotificationPattern(input,values,notificationPatterns,'owner');
 expect(result).not.toBeNull();
 return {...result!,id:'learned',user_id:'owner',source_id:input.source_id,source_package:input.source_package,
  revision:1,is_active:true,evidence_valid:true,origin:'learned'};
}
describe('notification learning from one review',()=>{
 it('extracts changing values from a second message without adding code or constants',()=>{
  const learned=rule();
  expect(JSON.stringify(learned.definition)).not.toMatch(/FIRST CAFE|16\.00|02\/10\/2026|ABC123/);
  const second=event('Settled RM24.90 with SECOND CAFE dated 03/10/2026 ref XYZ999.');
  expect(parseFinanceNotification(second,[...notificationPatterns,learned],'owner').payload).toMatchObject({
   amount:24.9,direction:'expense',merchant:'SECOND CAFE',transaction_date:'2026-10-03',reference_number:'XYZ999',category_id:null,notes:null,
   notification_extraction:{fields:{merchant:{learned:true}}},
  });
 });
 it('does not apply personalized rules to another owner, source, or package',()=>{
  const learned=rule();
  for(const [input,owner] of [[event(message),'other'],[{...event(message),source_id:'other-source'},'owner'],
   [{...event(message),source_package:'my.com.tngdigital.ewallet' as const},'owner']] as const){
   expect(parseFinanceNotification(input,[learned],owner).payload?.merchant).toBeNull();
  }
 });
 it('reuses a starter scope when the reviewed direction or party classification changes',()=>{
  const input=event('RM16.00 paid at FIRST CAFE using your Main Account.');
  const learned=rule(input,{...reviewed,reference_number:null,direction:'income'});
  expect(learned.format_key).toBe('ryt-card-payment');
  expect(parseFinanceNotification(input,[...notificationPatterns,learned],'owner').payload?.direction).toBe('income');
 });
 it('does not learn ambiguous values, unsafe notifications or retained identifiers',()=>{
  for(const input of [
   event(message+' Balance RM200.00.'), event('Your OTP is 123456 for '+message),
   event('Promotion: '+message), event('Settled RM16.00 with FIRST CAFE account 777777.'),
  ]) expect(learnNotificationPattern(input,reviewed,notificationPatterns,'owner')).toBeNull();
 });
 it('does not invent selectors for corrections absent from the message',()=>{
  expect(learnNotificationPattern(event(message),{...reviewed,merchant:'DIFFERENT NAME'},[],'owner')).toBeNull();
  const learned=rule(event(message),{...reviewed,amount:99});
  expect(parseFinanceNotification(event(message),[learned],'owner').payload?.amount).toBeNull();
 });
 it('keeps disabled learned rules inactive on subsequent parsing',()=>{
  const learned={...rule(),is_active:false};
  expect(parseFinanceNotification(event(message),[learned],'owner').payload?.direction).toBeNull();
 });
});
