import test from'node:test';import assert from'node:assert/strict';import{createMessageRemovalSync}from'../src/message-removal-sync.ts';
const id=(n:number)=>'26200000-0000-4000-8000-'+String(n).padStart(12,'0'),context={companyId:id(1),conversationId:id(2)},page=()=>({items:[{id:id(3),company_id:id(1),conversation_id:id(2),sender_id:id(4),sender_role:'patient' as const,sequence:1,accepted_at:'2026-11-17T00:00:00Z',kind:'text' as const,body:'Original sintético',important:true}],hasOlder:false});
const feed=(after:string,items:unknown[]=[],more=false,through=items.length?'1':after,latest=through)=>({...context,through,latest,hasMore:more,items});
test('cache barrier scans all pages, masks text and preserves original input',async()=>{
 let calls=0,purges=0;const applied:unknown[]=[];
 const s=createMessageRemovalSync({context,current:()=>true,purgeMedia:async()=>{purges++;},apply:x=>applied.push(x),rpc:async c=>{assert.equal(c.name,'connect_message_removal_changes_v1');calls++;return calls===1?feed('0',[{messageId:id(3),scope:'self'}],true,'1','2'):feed('1',[{messageId:id(3),scope:'all'}],false,'2');}});
 assert.throws(()=>s.protect(page()));await s.poll();assert.equal(calls,2);assert.equal(purges,2);assert.equal(s.protect(page()).items[0].body,'Mensagem removida');assert.equal(s.protect(page()).items[0].removed_scope,'all');assert.equal(page().items[0].body,'Original sintético');assert.equal(s.snapshot().cursor,'2');s.close();
});
test('lost concurrent read is masked at resolution; receipt does not jump feed cursor',async()=>{
 let release!:(v:ReturnType<typeof page>)=>void;const requested:string[]=[];let revision='0';
 const s=createMessageRemovalSync({context,current:()=>true,purgeMedia:async()=>{},apply:()=>{},rpc:async c=>{assert(c.name==='connect_message_removal_changes_v1');requested.push(c.params.p_after);return feed(c.params.p_after,revision==='0'?[]:[{messageId:id(3),scope:'all'}],false,revision);}});
 await s.poll();const pending=s.wrapRead(async()=>new Promise(r=>release=r))({...context,before:null,limit:25});await Promise.resolve();revision='5';
 await s.applyReceipt({...context,operationId:id(8),scope:'self',messageIds:[id(3)],revision:'5'});assert.deepEqual(requested,['0','0']);release(page());assert.equal((await pending).items[0].removed_scope,'all');s.close();
});
test('single flight, failed purge and late context cannot authorize cached presentation',async()=>{
 let release!:(v:unknown)=>void,active=true,calls=0;const s=createMessageRemovalSync({context,current:()=>active,purgeMedia:async()=>{},apply:()=>{},rpc:async()=>{calls++;return new Promise(r=>release=r);}});
 const a=s.poll(),b=s.poll();assert.equal(a,b);assert.equal(calls,1);active=false;release(feed('0'));await assert.rejects(a);assert.throws(()=>s.protect(page()));s.close();
 const bad=createMessageRemovalSync({context,current:()=>true,purgeMedia:async()=>{throw Error('disk failed');},apply:()=>{},rpc:async()=>feed('0',[{messageId:id(3),scope:'self'}])});await assert.rejects(bad.poll());assert.equal(bad.snapshot().started,false);assert.throws(()=>bad.protect(page()));bad.close();
});
test('corrupt/foreign feed never starts cache; close aborts pending transport',async()=>{
 const acs:AbortSignal[]=[];const s=createMessageRemovalSync({context,current:()=>true,purgeMedia:async()=>{},apply:()=>{},rpc:async(_c,signal)=>{acs.push(signal);return{...feed('0'),companyId:id(9)};}});
 await assert.rejects(s.poll());assert.equal(s.snapshot().started,false);s.close();assert(acs[0].aborted);
});
test('no-change polling avoids media purge and wrapper rejects revoked reads',async()=>{
 let live=true,purges=0;const s=createMessageRemovalSync({context,current:()=>live,purgeMedia:async()=>{purges++;},apply:()=>{},rpc:async()=>feed('0')});await s.poll();await s.poll();assert.equal(purges,0);const read=s.wrapRead(async()=>{live=false;return page();});await assert.rejects(read({...context,before:null,limit:25}));s.close();
});
