import { expect, test } from '@playwright/test';
import { reviewCandidates } from '../fixtures/finance-review';
const source='52000000-0000-4000-8000-000000000001';
const pattern={id:'52000000-0000-4000-8000-000000000002',name:'Reviewed card payment',is_active:true,evidence_valid:true,revision:2,
 origin:'learned',source_package:'my.rytbank.app',definition:{version:1,parts:[{kind:'amount',field:'amount'},' paid at ',{kind:'text',field:'merchant'},' using your Main Account'],direction:'expense'}};
test.beforeEach(async({page})=>{
 await page.route('**/api/finance/reference-data',route=>route.fulfill({json:{data:{sources:[{id:source,name:'Ryt'}],categories:[]}}}));
});
test('inspects a learned format and disables it with keyboard controls',async({page},info)=>{
 if(info.project.name==='mobile') await page.setViewportSize({width:330,height:800});
 let active=true; let mutation:unknown;
 await page.route('**/api/finance/notification-patterns**',async route=>{
  if(route.request().method()==='PATCH'){mutation=route.request().postDataJSON();active=false;await route.fulfill({json:{success:true}});}
  else await route.fulfill({json:{data:[{...pattern,is_active:active}]}});
 });
 await page.goto('/finance/settings/notifications');
 await expect(page.getByText('Learned from your review',{exact:true})).toBeVisible();
 await expect(page.getByRole('table',{name:'Notification patterns'})).toBeVisible();
 await expect(page.getByRole('columnheader')).toHaveText(['Pattern','Matching format and fields','Direction','Status']);
 await expect(page.getByText('[amount] paid at [merchant] using your Main Account',{exact:true})).toBeVisible();
 const toggle=page.getByRole('switch',{name:'Enable Reviewed card payment'});
 await toggle.focus();await page.keyboard.press('Space');
 await expect(toggle).toHaveAttribute('aria-checked','false');
 expect(mutation).toEqual({id:pattern.id,source_id:source,revision:2,is_active:false});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('notification-patterns.png'),fullPage:true});
});
test('compares formats, directions and evidence without opening rows',async({page},info)=>{
 const starter={...pattern,id:'starter',name:'Transaction amount',origin:'starter',is_active:false,definition:{version:1,parts:['amount: ',{kind:'amount',field:'amount'}]}};
 const stale={...pattern,id:'stale',name:'Incoming transfer',evidence_valid:false,definition:{...pattern.definition,parts:['Received ',{kind:'amount',field:'amount'},' from ',{kind:'text',field:'payee_name'}],direction:'income'}};
 await page.route('**/api/finance/notification-patterns**',route=>route.fulfill({json:{data:[pattern,starter,stale]}}));
 await page.goto('/finance/settings/notifications');
 const table=page.getByRole('table',{name:'Notification patterns'});
 await expect(table.getByRole('row')).toHaveCount(4);
 await expect(table.locator('details, summary')).toHaveCount(0);
 const starterRow=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'Transaction amount Starter pattern',exact:true})});
 await expect(starterRow.getByRole('cell',{name:'amount: [amount]',exact:true})).toBeVisible();
 await expect(starterRow.getByRole('cell',{name:'Not specified',exact:true})).toBeVisible();
 await expect(starterRow.getByRole('switch')).toHaveAttribute('aria-checked','false');
 const incomeRow=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:/Incoming transfer/})});
 await expect(incomeRow.getByText('Received [amount] from [payee name]',{exact:true})).toBeVisible();
 await expect(incomeRow.getByRole('cell',{name:'income',exact:true})).toBeVisible();
 await expect(incomeRow.getByText('Supporting transaction changed. Confirm a new example to relearn.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('notification-patterns-table.png'),fullPage:true});
 const region=page.getByRole('region',{name:'Notification pattern table'});
 await region.focus();
 if(info.project.name==='mobile') {
  await page.keyboard.press('ArrowRight');
  await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 }
});
test('failed status changes preserve the displayed state and show recovery',async({page})=>{
 await page.route('**/api/finance/notification-patterns**',async route=>{
  await route.fulfill(route.request().method()==='PATCH'?{status:409,json:{error:'Pattern changed. Refresh and try again.'}}:{json:{data:[pattern]}});
 });
 await page.goto('/finance/settings/notifications');
 const toggle=page.getByRole('switch',{name:'Enable Reviewed card payment'});
 await toggle.click();
 await expect(page.getByRole('alert')).toHaveText('Pattern changed. Refresh and try again.');
 await expect(toggle).toHaveAttribute('aria-checked','true');
});
test('shows learned field provenance and unresolved conflicts in review',async({page})=>{
 const candidate=structuredClone(reviewCandidates[0]);
 candidate.intake={...candidate.intake!,source:'notification'};
 candidate.payload.notification_extraction={version:1,fields:{amount:{pattern_id:pattern.id,revision:2,learned:true}},conflicts:['direction']};
 await page.addInitScript(candidate=>{(window as unknown as {reviewInitial:unknown}).reviewInitial=[candidate];},candidate);
 await page.goto('/finance/review');
 await expect(page.getByText('Learned from your reviews: amount.',{exact:true})).toBeVisible();
 await expect(page.getByText('Conflicting notification patterns. Review direction.',{exact:true})).toBeVisible();
});

for (const completed of [true,false]) {
 test(completed ? 'Retry adds a complete notification and removes it from review' : 'Retry keeps an incomplete notification available for review',async({page})=>{
  const candidate=structuredClone(reviewCandidates[0]);
  candidate.intake={...candidate.intake!,source:'notification'};
  candidate.payload.duplicate_transaction_id=null;candidate.duplicate_transaction=null;candidate.duplicate_outcome='none';
  await page.addInitScript(candidate=>{(window as unknown as {reviewInitial:unknown}).reviewInitial=[candidate];},candidate);
  await page.route('**/api/finance/review',async route=>{
   expect(route.request().postDataJSON()).toMatchObject({action:'retry',candidate_id:candidate.id});
   await route.fulfill({json:completed?{success:true}:{data:{...candidate,payload:{...candidate.payload,amount:null}}}});
  });
  await page.goto('/finance/review');
  await page.getByRole('button',{name:'Retry and add if complete',exact:true}).click();
  if(completed) {
   await expect(page.getByText('Transaction added automatically',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Retry and add if complete',exact:true})).toHaveCount(0);
  } else {
   await expect(page.getByText('Rules and duplicate checks applied again',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Retry and add if complete',exact:true})).toBeVisible();
  }
 });
}
