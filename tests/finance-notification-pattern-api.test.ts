import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),set:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/rbac/guards',()=>({authorizeSessionModule:mocks.auth}));
vi.mock('@/lib/finance/notifications/settings',()=>({getNotificationPatternSettings:mocks.get,setNotificationPatternStatus:mocks.set,saveNotificationIgnoreRule:mocks.save}));
import { GET,PATCH,PUT } from '@/app/api/finance/notification-patterns/route';
import { CompanionError } from '@/lib/companion/core/http';
const id='52000000-0000-4000-8000-000000000001';
const body={id,source_id:id,is_active:false,revision:1,user_id:'untrusted'};
const patch=(input:unknown=body,origin='https://app.test')=>new NextRequest('https://app.test/api/finance/notification-patterns',{
 method:'PATCH',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(input),
});
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({user:{id:'verified'}});mocks.get.mockResolvedValue([]);});
describe('notification pattern API',()=>{
 const rule={id:null,revision:null,source_id:id,source_package:'my.rytbank.app',name:' Approval prompts ',prefix:'  Tap  to confirm card payment  ',is_active:true,user_id:'untrusted'};
 const put=(input:unknown=rule,origin='https://app.test')=>new NextRequest('https://app.test/api/finance/notification-patterns',{
  method:'PUT',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(input),
 });
 it('saves normalized ignore rules under the verified identity',async()=>{
  expect((await PUT(put())).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith('verified',{id:null,revision:null,source_id:id,source_package:'my.rytbank.app',name:'Approval prompts',prefix:'Tap to confirm card payment',is_active:true});
 });
 it.each([{...rule,prefix:'.*'},{...rule,prefix:'x'.repeat(121)},{...rule,source_package:'other'},{...rule,id},{...rule,id,revision:0},{...rule,source_id:'wrong'},{...rule,name:' '}])('rejects invalid ignore rules',async input=>{
  expect((await PUT(put(input))).status).toBe(422);expect(mocks.save).not.toHaveBeenCalled();
 });
 it('blocks cross-origin rule creation before persistence',async()=>{
  expect((await PUT(put(rule,'https://other.test'))).status).toBe(403);expect(mocks.save).not.toHaveBeenCalled();
 });
 it('scopes reads and updates to authenticated ownership',async()=>{
  expect((await GET(new NextRequest('https://app.test/api/finance/notification-patterns?source_id='+id))).status).toBe(200);
  expect(mocks.get).toHaveBeenCalledWith('verified',id);
  expect((await PATCH(patch())).status).toBe(200);
  expect(mocks.set).toHaveBeenCalledWith('verified',id,id,false,1);
 });
 it('rejects cross-origin writes and unauthorized access before the service',async()=>{
  expect((await PATCH(patch(body,'https://other.test'))).status).toBe(403);
  expect(mocks.set).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({response:NextResponse.json({error:'Denied'},{status:403})});
  expect((await GET(new NextRequest('https://app.test/api/finance/notification-patterns?source_id='+id))).status).toBe(403);
  expect(mocks.get).not.toHaveBeenCalled();
 });
 it.each([{...body,id:'wrong'},{...body,revision:0},{...body,is_active:'yes'},null])('validates status updates',async input=>{
  expect((await PATCH(patch(input))).status).toBe(422);expect(mocks.set).not.toHaveBeenCalled();
 });
 it('maps stale versions and hides unexpected internal errors',async()=>{
  mocks.set.mockRejectedValue(new CompanionError('Pattern changed. Refresh and try again.',409));
  expect((await PATCH(patch())).status).toBe(409);
  mocks.set.mockRejectedValue(new Error('private database value'));
  const response=await PATCH(patch());expect(response.status).toBe(503);expect(await response.text()).not.toContain('private database value');
 });
});
