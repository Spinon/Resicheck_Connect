import test from 'node:test';import assert from 'node:assert/strict';import {createServer}from'node:http';import{createAttentionEpoch,createQuietLatestRefresh}from'../src/quiet-latest-refresh.ts';import{createRecentConversation}from'../../../packages/chat-client/src/recent-conversation.ts';
function clock(){const jobs=new Map();let n=0;return{schedule:(fn,ms)=>{const id=++n;jobs.set(id,{fn,ms});return()=>jobs.delete(id);},fire:()=>{const [id,{fn}]=jobs.entries().next().value;jobs.delete(id);fn();},get count(){return jobs.size;}};}
test('quiet refresh requires settled bottom geometry, expires missing measurement and rejects stale/duplicate callbacks',async()=>{
 const c=clock();let live=true,done,reads=0,fallback=0;const opts={current:()=>live,measure:cb=>{done=cb;},refresh:async()=>{reads++;return true;},fallback:()=>{fallback++;},schedule:c.schedule};
 const first=createQuietLatestRefresh(opts);assert.equal(reads,0);c.fire();assert.equal(c.count,1);done({viewportTop:100,viewportHeight:400,tailBottom:500});done({viewportTop:100,viewportHeight:400,tailBottom:500});assert.equal(reads,1);assert.equal(c.count,0);first.dispose();
 const missing=createQuietLatestRefresh(opts);c.fire();c.fire();assert.equal(fallback,1);done({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,1);missing.dispose();
 for(const proof of [null,{viewportTop:0,viewportHeight:0,tailBottom:0},{viewportTop:0,viewportHeight:400,tailBottom:440},{viewportTop:0,viewportHeight:400,tailBottom:NaN}]){const watcher=createQuietLatestRefresh(opts);c.fire();done(proof);watcher.dispose();}assert.equal(reads,1);
 const stale=createQuietLatestRefresh(opts);c.fire();stale.dispose();done({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,1);const moved=createQuietLatestRefresh(opts);live=false;c.fire();assert.equal(reads,1);moved.dispose();assert.equal(c.count,0);
});
test('geometry-approved update refreshes real controller through loopback HTTP only; no send/mark and another context cannot receive late refresh',async()=>{
 let version=1,reads=0,writes=0,current=true;const user='59000000-0000-4000-8000-000000000001',company='59000000-0000-4000-8000-000000000002',conversation='59000000-0000-4000-8000-000000000003';
 const server=createServer((_req,res)=>{reads++;res.end(JSON.stringify({items:[{id:'59000000-0000-4000-8000-'+String(100+version).padStart(12,'0'),company_id:company,conversation_id:conversation,sender_id:user,sender_role:'patient',sequence:version,accepted_at:'2026-11-10T14:00:00Z',kind:'text',body:'Synthetic '+version,important:false}],hasOlder:false}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const host=createRecentConversation({context:{userId:user,sessionKey:'synthetic',companyId:company,conversationId:conversation},current:()=>current,rpc:async()=>{writes++;throw Error('No write expected');},readPort:async(_q,signal)=>await(await fetch('http://127.0.0.1:'+server.address().port,{signal})).json(),createId:()=> 'not-used',schedule:(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);},timeoutMs:1000});let watcher;
 try{assert(await host.refreshLatest());const c=clock();let done,pending;watcher=createQuietLatestRefresh({current:()=>current&&host.snapshot().status==='active'&&host.snapshot().draft==='',measure:cb=>done=cb,refresh:()=>pending=host.refreshLatest(),fallback:()=>{},schedule:c.schedule});version=2;c.fire();assert.equal(reads,1);done({viewportTop:0,viewportHeight:400,tailBottom:400});assert(await pending);assert.equal(reads,2);assert.equal(host.history.snapshot().messages[0].sequence,2);assert.equal(writes,0);watcher.dispose();
 watcher=createQuietLatestRefresh({current:()=>current,measure:cb=>done=cb,refresh:()=>host.refreshLatest(),fallback:()=>{},schedule:c.schedule});c.fire();current=false;watcher.dispose();done({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,2);assert.equal(writes,0);
 }finally{watcher?.dispose();host.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('attention cycles invalidate old geometry and rearm quiet refresh from a fresh foreground/focus epoch',()=>{
 const gate=createAttentionEpoch(true),first=gate.snapshot(),c=clock();let done,reads=0,fallback=0;
 const arm=()=>{const captured=gate.snapshot();return createQuietLatestRefresh({current:()=>gate.current(captured),measure:cb=>done=cb,refresh:()=>{reads++;return true;},fallback:()=>fallback++,schedule:c.schedule});};
 let watcher=arm();c.fire();const oldMeasurement=done;
 assert(gate.change(false,true));watcher.dispose();assert(gate.change(true,true));assert(!gate.current(first));oldMeasurement({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,0);assert.equal(fallback,0);
 watcher=arm();c.fire();const covered=done;gate.change(true,false);watcher.dispose();gate.change(true,true);covered({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,0);
 const stable=gate.snapshot();assert(!gate.change(true,true));assert(gate.current(stable));watcher=arm();c.fire();done({viewportTop:0,viewportHeight:400,tailBottom:400});assert.equal(reads,1);watcher.dispose();assert.equal(c.count,0);
 const inactive=createAttentionEpoch(false);assert(!inactive.current(inactive.snapshot()));
});
