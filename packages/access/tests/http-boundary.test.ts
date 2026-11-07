// Test-only HTTP adapter. Fixture sessions are not an authentication implementation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readConversationMetadata } from '../src/boundary.ts';
import { fixture, now, principal } from './fixtures.ts';

test('direct HTTP attempts cannot promote role, forge subject/company or enumerate inaccessible objects', async () => {
  const db=fixture();
  const serverSessions=new Map([['fixture-patient-session',principal('patient-a')],['fixture-staff-session',principal('staff-a')]]);
  const server=createServer((req,res)=>{
    const url=new URL(req.url!,'http://127.0.0.1');
    const match=/^\/companies\/([^/]+)\/conversations\/([^/]+)$/.exec(url.pathname);
    const actor=serverSessions.get((req.headers.authorization??'').replace(/^Bearer /,''))??null;
    const response=match?readConversationMetadata(db,actor,match[1],match[2],now):{status:404,body:{code:'RESOURCE_UNAVAILABLE',message:'Não foi possível acessar este conteúdo.'}};
    res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(response.body));
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    const address=server.address();assert.ok(address&&typeof address==='object');
    const base=`http://127.0.0.1:${address.port}`;
    const headers={Authorization:'Bearer fixture-patient-session','X-Role':'admin','X-User-Id':'staff-a','X-Company-Id':'b'};
    const own=await fetch(`${base}/companies/a/conversations/chat-a?role=admin&subject=staff-a`,{headers});
    assert.equal(own.status,200);assert.deepEqual(await own.json(),{id:'chat-a',companyId:'a',patientId:'patient-a'});
    let opaque:string|undefined;
    for(const pathname of ['/companies/a/conversations/chat-other','/companies/b/conversations/chat-b','/companies/a/conversations/missing','/companies/b/conversations/chat-a']) {
      const result=await fetch(base+pathname,{headers});const body=await result.text();
      assert.equal(result.status,404);opaque??=body;assert.equal(body,opaque);
      assert.ok(!/stack|sql|PRIVATE|DEVELOPMENT|staff-a|chat-b/.test(body));
      assert.equal(result.headers.get('cache-control'),'no-store');
    }
    const forged=await fetch(`${base}/companies/a/conversations/chat-a`,{headers:{Authorization:'Bearer admin','X-Role':'staff'}});
    assert.equal(forged.status,404);
    const staff=await fetch(`${base}/companies/a/conversations/chat-other`,{headers:{Authorization:'Bearer fixture-staff-session'}});
    assert.equal(staff.status,200);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
