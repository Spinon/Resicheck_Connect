// Integration test only. Fixed fixture sessions do not implement login or token verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { TextDecoder } from 'node:util';
import { sendText, listMessages, setImportant, toAccessSnapshot } from '../src/chat.ts';
import type { ChatStore } from '../src/chat.ts';
import { buildNotification } from '../src/notifications.ts';
import { fixture, principal, now } from '../../access/tests/fixtures.ts';

test('local HTTP round trip deduplicates send, scopes reads and importance, then denies revoked retry/push', async () => {
  let authority=fixture();let store:ChatStore={conversations:authority.conversations,messages:[],audit:[]};let serverNumber=0;
  const sessions=new Map([['fixture-patient',principal('patient-a')],['fixture-staff',principal('staff-a')],['fixture-outsider',principal('staff-b')]]);
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    try {
      const actor=sessions.get((req.headers.authorization??'').replace(/^Bearer /,''))??null;
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req) {size+=chunk.length;if(size>256*1024){res.writeHead(413);res.end(JSON.stringify({code:'INVALID_INPUT'}));return;}chunks.push(Buffer.from(chunk));}
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))) as unknown;
      const result=req.url==='/send'?sendText(store,authority,actor,body,now,()=>`server-${++serverNumber}`)
        :req.url==='/important'?setImportant(store,authority,actor,body,now)
        :req.url==='/list'?listMessages(store,authority,actor,body,now):{ok:false as const,code:'UNAVAILABLE'};
      if(result.ok&&'store' in result)store=result.store;
      const status=result.ok?200:result.code==='INVALID_INPUT'?400:result.code==='CONFLICT'?409:404;
      // Never serialize the internal store, authority, audit, exception or raw request.
      res.writeHead(status);res.end(JSON.stringify(result.ok?{value:result.value,...('nextAfter' in result?{nextAfter:result.nextAfter}:{})}:{code:result.code}));
    } catch {res.writeHead(400);res.end(JSON.stringify({code:'INVALID_INPUT'}));}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
    const post=(route:string,body:unknown,token='fixture-patient')=>fetch(base+route,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Role':'admin'},body:JSON.stringify(body)});
    const command={companyId:'a',conversationId:'chat-a',clientMessageId:'offline-message-1',text:'Somente texto sintético para teste.'};
    const sent=await post('/send',command);assert.equal(sent.status,200);const accepted=await sent.json() as {value:{id:string}};
    const retried=await post('/send',command);assert.equal(retried.status,200);assert.deepEqual(await retried.json(),accepted);
    assert.equal(store.messages.length,1);assert.equal(store.audit.length,1);
    const conflict=await post('/send',{...command,text:'Alteração sintética'});assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{code:'CONFLICT'});
    const forged=await post('/send',{...command,senderId:'staff-a',senderRole:'staff'});assert.equal(forged.status,400);
    const list={companyId:'a',conversationId:'chat-a',after:0,limit:10};
    const outsider=await post('/list',list,'fixture-outsider');assert.equal(outsider.status,404);assert.deepEqual(await outsider.json(),{code:'UNAVAILABLE'});
    const staff=await post('/list',list,'fixture-staff');assert.equal(staff.status,200);const staffBody=await staff.text();
    assert.ok(staffBody.includes(command.text));assert.ok(!/clientMessageId|offline-message-1|platformGrants|audit|evidence/.test(staffBody));
    const mark={companyId:'a',messageId:accepted.value.id,important:true};
    assert.equal((await post('/important',mark)).status,404);
    assert.equal((await post('/important',mark,'fixture-staff')).status,200);
    assert.equal((await post('/important',mark,'fixture-staff')).status,200);assert.equal(store.audit.length,2);
    const message=store.messages[0];const event={messageId:message.id,companyId:message.companyId,company:'Empresa sintética A',message:message.text,important:message.important};
    const prefs={systemPermissionGranted:true,filter:'important',privacy:1};
    assert.deepEqual(buildNotification(toAccessSnapshot(store,authority),principal('staff-a'),event,prefs,now),{app:'ResiCheck Connect'});
    const emojiCommand={...command,clientMessageId:'emoji-http',text:'👩🏾‍⚕️'.repeat(2000)};
    const emojiReply=await post('/send',emojiCommand);assert.equal(emojiReply.status,200);
    const emojiAccepted=await emojiReply.json() as {value:{text:string}};assert.equal(emojiAccepted.value.text,emojiCommand.text);
    const emojiRetry=await post('/send',emojiCommand);assert.equal(emojiRetry.status,200);assert.deepEqual(await emojiRetry.json(),emojiAccepted);
    const unicodePage=await post('/list',list,'fixture-staff');assert.equal(unicodePage.status,200);
    assert.equal((await unicodePage.json() as {value:{text:string}[]}).value.at(-1)!.text,emojiCommand.text);
    authority={...authority,memberships:authority.memberships.map(m=>m.userId==='staff-a'?{...m,state:'revoked' as const}:m)};
    assert.equal((await post('/list',list,'fixture-staff')).status,404);
    assert.equal(buildNotification(toAccessSnapshot(store,authority),principal('staff-a'),event,prefs,now),null);
    authority={...authority,memberships:authority.memberships.map(m=>m.userId==='patient-a'?{...m,state:'revoked' as const}:m)};
    const revoked=await post('/send',command);assert.equal(revoked.status,404);assert.deepEqual(await revoked.json(),{code:'UNAVAILABLE'});
    assert.equal(store.messages.length,2);assert.equal(store.audit.length,3);
    const invalid=await fetch(base+'/send',{method:'POST',headers:{Authorization:'Bearer fixture-patient'},body:'{INVALID_JSON_SENTINEL'});
    assert.equal(invalid.status,400);assert.equal((await invalid.text()).includes('SENTINEL'),false);
    for(const bytes of [[0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],[0xf0,0x9f],[0xff]]) {
      const body=Buffer.concat([Buffer.from('{"text":"'),Buffer.from(bytes),Buffer.from('"}')]);
      const malformed=await fetch(base+'/send',{method:'POST',headers:{Authorization:'Bearer fixture-patient'},body});
      assert.equal(malformed.status,400);assert.deepEqual(await malformed.json(),{code:'INVALID_INPUT'});
    }
    assert.equal(store.messages.length,2);assert.equal(store.audit.length,3);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
