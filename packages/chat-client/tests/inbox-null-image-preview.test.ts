import test from 'node:test';import assert from 'node:assert/strict';import {decodeRecentInbox} from '../src/recent-inbox.ts';
const id=(n:number)=>'00330000-0000-4000-8000-'+String(n).padStart(12,'0'),company=id(1);
// Shape from the hosted inbox after PNG publication, with synthetic identifiers/name/time.
const message={id:id(4),sequence:7,accepted_at:'2026-11-20T20:23:32.801057Z',sender_role:'patient',preview:null,truncated:null};
const row={company_id:company,conversation_id:id(2),patient_id:id(3),display_name:'Cliente sintetico',last_message:message};
const payload={items:[row],has_more:false,next_cursor:null};
test('hosted image summary null pair gets a fixed label without weakening inbox authority or shape',()=>{
 const decoded=decodeRecentInbox(payload,company,null);assert.equal(decoded.items.length,1);assert.equal(decoded.items[0].conversationId,id(2));assert.deepEqual(decoded.items[0].latestMessage,{id:id(4),sequence:7,acceptedAt:message.accepted_at,senderRole:'patient',preview:'Imagem',truncated:false});assert.equal(decoded.nextCursor,null);assert.equal(decoded.hasMore,false);
 for(const change of [{preview:undefined},{preview:''},{preview:'x'.repeat(241),truncated:false},{preview:null,truncated:false},{preview:null,truncated:true},{preview:'normal',truncated:null},{preview:42},{sequence:0},{sequence:1.5},{accepted_at:'bad'},{sender_role:'manager'},{id:'bad'}])assert.throws(()=>decodeRecentInbox({...payload,items:[{...row,last_message:{...message,...change}}]},company,null));
 for(const change of [{company_id:id(9)},{conversation_id:'bad'},{patient_id:'bad'},{display_name:''}])assert.throws(()=>decodeRecentInbox({...payload,items:[{...row,...change}]},company,null));
 assert.throws(()=>decodeRecentInbox({...payload,items:[row,row]},company,null));assert.throws(()=>decodeRecentInbox({...payload,has_more:true},company,null));
 const removed=decodeRecentInbox({...payload,items:[{...row,last_message:{...message,preview:'Mensagem removida',truncated:false}}]},company,null);assert.equal(removed.items[0].latestMessage?.preview,'Mensagem removida');
});
