// One real PostgreSQL regression; Auth/session/membership/media are SQL fixtures.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{startLocalPostgres}from'../../../tests/local-postgres-harness.mjs';import{compose}from'./compile.mjs';
const c=await compose(),db=await startLocalPostgres('image-history-off-focused'),id=n=>'90660000-0000-4000-8000-'+String(n).padStart(12,'0'),user=id(1),sid=id(2),co=id(3),cv=id(4),foreign=id(5),q=s=>"'"+s.replaceAll("'","''")+"'";let step=0;const sql=async(s,error)=>(await db.sql('history-'+(++step),s,error)).output.trim(),report={state:'running',realPostgres:true,realSupabase:false,authAndMembership:'SQL fixtures',media:'typed envelope fixtures only, no byte/codec test',checks:[],remoteCalls:0};
const ctx=s=>'BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='+q(JSON.stringify({sub:user,session_id:sid}))+';'+s+';COMMIT;';
try{
 await sql(`CREATE SCHEMA private;CREATE SCHEMA auth;CREATE ROLE authenticated NOLOGIN;GRANT USAGE ON SCHEMA private,auth TO authenticated;
 CREATE FUNCTION auth.uid()RETURNS uuid LANGUAGE sql STABLE AS $$SELECT(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 CREATE TABLE private.actor_fixture(user_id uuid,session_id uuid,active boolean);
 CREATE TABLE private.membership_fixture(user_id uuid,company_id uuid,conversation_id uuid);
 CREATE FUNCTION private.active_actor()RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM private.actor_fixture WHERE user_id=auth.uid()AND session_id=(current_setting('request.jwt.claims')::jsonb->>'session_id')::uuid AND active)$$;
 CREATE FUNCTION private.can_read_conversation(co uuid,cv uuid)RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM private.membership_fixture WHERE user_id=auth.uid()AND company_id=co AND conversation_id=cv)$$;
 CREATE FUNCTION private.lock_accounts(uuid[])RETURNS void LANGUAGE sql AS $$SELECT$$;
 CREATE TABLE private.company_controls(company_id uuid,state text);CREATE TABLE private.image_company_rollout(company_id uuid,enabled boolean);CREATE TABLE private.image_settings(enabled boolean);
 CREATE TABLE public.messages(id uuid,company_id uuid,conversation_id uuid,sender_id uuid,sender_role text,sequence bigint,accepted_at timestamptz,kind text,body text,important boolean);
 CREATE TABLE private.message_removals_all(message_id uuid,company_id uuid,conversation_id uuid);CREATE TABLE private.message_removals_self(user_id uuid,message_id uuid,company_id uuid,conversation_id uuid);
 INSERT INTO private.actor_fixture VALUES(${q(user)},${q(sid)},true);INSERT INTO private.membership_fixture VALUES(${q(user)},${q(co)},${q(cv)});INSERT INTO private.company_controls VALUES(${q(co)},'active');INSERT INTO private.image_company_rollout VALUES(${q(co)},false);INSERT INTO private.image_settings VALUES(false);
 `+c.after.find(f=>f.name==='read_messages_projection_v3').sql+c.after.find(f=>f.name==='image_catalog_authorize').sql);
 const rows=[['text','synthetic first'],['audio','synthetic audio envelope'],['text','preserved hidden self'],['audio','preserved hidden all'],['text','synthetic latest'],['image',null]];
 for(let i=0;i<rows.length;i++)await sql('INSERT INTO public.messages VALUES('+[id(20+i),co,cv,user,'patient'].map(q).join(',')+','+(i+1)+",clock_timestamp(),"+q(rows[i][0])+','+(rows[i][1]===null?'null':q(rows[i][1]))+',false)');
 await sql(`INSERT INTO private.message_removals_self VALUES(${q(user)},${q(id(22))},${q(co)},${q(cv)});INSERT INTO private.message_removals_all VALUES(${q(id(23))},${q(co)},${q(cv)});`);
 const read=(before,after,limit=3)=>'SELECT private.read_messages_projection_v3('+[q(co),q(cv),before??'null',after??'null',limit].join(',')+')';
 const parse=s=>JSON.parse(s.split(/\r?\n/).findLast(x=>x.startsWith('[')));
 const latest=parse(await sql(ctx(read(null,null))));assert.deepEqual(latest.map(x=>x.sequence),[6,5,4]);assert.equal(latest[2].body,'Mensagem removida');assert.equal(latest[2].kind,'text');assert.equal(latest[2].removed_scope,'all');
 const older=parse(await sql(ctx(read(4,null))));assert.deepEqual(older.map(x=>x.sequence),[3,2,1]);assert.equal(older[0].removed_scope,'self');assert.equal(older[0].body,'Mensagem removida');assert.equal(older[1].kind,'audio');assert.equal(older[1].body,'synthetic audio envelope');assert.equal(older[2].body,'synthetic first');
 const incremental=parse(await sql(ctx(read(null,2,10))));assert.deepEqual(incremental.map(x=>x.sequence),[3,4,5,6]);
 await sql(ctx('SELECT private.image_catalog_authorize('+[co,cv].map(q).join(',')+')'),'Image unavailable');
 await sql(ctx('SELECT private.read_messages_projection_v3('+[q(foreign),q(cv),'null','null','3'].join(',')+')'),'Message action unavailable');
 await sql(ctx(read(4,2)),'Message action unavailable');
 await sql('UPDATE private.actor_fixture SET active=false');await sql(ctx(read(null,null)),'Message action unavailable');
 assert.equal(await sql('SELECT count(*)FROM public.messages'),'6');assert.equal(await sql("SELECT count(*)FROM public.messages WHERE body LIKE'preserved hidden%'"),'2');
 report.state='passed-real-postgres-history-text-audio-pagination-tombstones-with-images-off';report.checks=['latest/older/incremental pages work with all image flags OFF','text/audio envelopes unchanged; image row is descriptor only','self/all tombstones retain originals','image authorization remains denied','foreign conversation/company and revoked actor remain denied','invalid cursor combination remains denied'];
}finally{await db.stop();report.clusterStopped=true;await fs.writeFile('supabase/candidates/image-message/normal-activation/history-off-validation.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
