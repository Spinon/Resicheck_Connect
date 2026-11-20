import{test}from'node:test';import assert from'node:assert/strict';import{validateActivationHold,validBackendReady}from'./activation-gate.mjs';
test('activation waits for exact root coordination scope and expires closed',()=>{
 const co='ee330000-0000-4000-8000-000000000201',now=1000000,h=validateActivationHold({schemaVersion:1,gateId:'96860000-0000-4000-8000-000000000001',companyId:co,createdAt:now,activationDeadline:now+300000},co,now),ready={schemaVersion:1,gateId:h.gateId,companyId:co,expiresAt:now+86400000};
 assert.equal(validBackendReady(null,h,now),false);assert.equal(validBackendReady(ready,h,now),true);
 for(const change of[{gateId:'96860000-0000-4000-8000-000000000002'},{companyId:'96860000-0000-4000-8000-000000000003'},{expiresAt:now},{expiresAt:now+32*86400000},{extra:true}])assert.equal(validBackendReady({...ready,...change},h,now),false);
 assert.throws(()=>validateActivationHold({...h,activationDeadline:h.activationDeadline+1},co,now));assert.throws(()=>validateActivationHold(h,'wrong-company',now));
});
