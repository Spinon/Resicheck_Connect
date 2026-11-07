// Runs only inside the disposable PostgreSQL runner, with fixture Auth and temporary password.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [bin, output] = process.argv.slice(2);
assert(bin && output && process.env.PGPASSWORD, 'Use the disposable PowerShell runner; no interactive credentials.');
const psql = join(bin, 'psql.exe');
const checks = [];
function query(sql, app = 'connect-concurrency-check') {
  const environment = { ...process.env, PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1', PGPORT: '56332', PGDATABASE: 'postgres',
    PGUSER: 'connect_test_owner', PGAPPNAME: app, PGCONNECT_TIMEOUT: '3', PGSSLMODE: 'disable' };
  delete environment.PGSERVICE;
  delete environment.PGSERVICEFILE;
  const child = spawn(psql, ['-X','-h','127.0.0.1','-p','56332','-U','connect_test_owner','-d','postgres','--no-password','-v','ON_ERROR_STOP=1','-At'], {
    windowsHide: true, stdio: ['pipe','pipe','pipe'],
    env: environment,
  });
  let stdout = ''; let stderr = ''; const signals = [];
  child.stdout.on('data', chunk => { stdout += chunk; for (const signal of signals) if (stdout.includes(signal.marker)) signal.resolve(); });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill(), 15000);
  const done = once(child, 'close').then(([code]) => ({ code, stdout, stderr })).finally(() => clearTimeout(timeout));
  child.stdin.end(sql);
  return { done, async ready(marker) {
    if (stdout.includes(marker)) return;
    let timer;
    try { await Promise.race([new Promise(resolve => signals.push({marker,resolve})),
      new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('Concurrency barrier timed out')),7000); }),
      done.then(result=>{throw Error(`First transaction ended before barrier: ${result.stderr}`);})]); }
    finally {clearTimeout(timer);}
  } };
}
async function success(sql) { const result=await query(sql).done;assert.equal(result.code,0,result.stderr);return result.stdout; }
const actor = `begin; set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub','70000000-0000-4000-8000-000000000003','role','authenticated',
  'session_id','71000000-0000-4000-8000-000000000003','exp',extract(epoch from now()+interval '1 hour')::bigint)::text,true);
select current_user;`;
async function proveWaiting(app) {
  const until=Date.now()+2500;
  while(Date.now()<until) {
    const result=await success(`select count(*) from pg_stat_activity where application_name='${app}' and wait_event_type='Lock';`);
    if(result.trim()==='1')return;
    await new Promise(resolve=>setTimeout(resolve,75));
  }
  throw Error('Second connection did not demonstrate a real lock wait');
}

// Transaction A holds the staff account lock until commit. B must wait, then deny activation.
const inviteA=query(`${actor}
select public.accept_staff_invite('74000000-0000-4000-8000-000000000001','connect_fixture_token_A_0000000001');
select 'FIRST_INVITE_READY';
select pg_sleep(4); commit;`, 'connect-race-invite-a');
await inviteA.ready('FIRST_INVITE_READY');
const inviteB=query(`${actor}
select public.accept_staff_invite('74000000-0000-4000-8000-000000000002','connect_fixture_token_B_0000000001'); commit;`, 'connect-race-invite-b');
await proveWaiting('connect-race-invite-b');
const [a,b]=await Promise.all([inviteA.done,inviteB.done]);
assert.equal(a.code,0,a.stderr);assert.notEqual(b.code,0);assert.ok(a.stdout.includes('authenticated'));
const membership=JSON.parse((await success(`select json_build_object('active',(select count(*) from public.memberships where user_id='70000000-0000-4000-8000-000000000003' and role='staff' and state='active'),
  'consumed',(select count(*) from private.staff_invitations where consumed_by='70000000-0000-4000-8000-000000000003'));`)).trim());
assert.deepEqual(membership,{active:1,consumed:1});checks.push('Two actual connections contend; exactly one staff company and invitation commit');

const sendSql=`select (public.send_text('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','concurrent-retry','Texto sintético concorrente.')).id;`;
const first=query(`${actor}${sendSql}
select 'FIRST_SEND_READY';
select pg_sleep(4); commit;`, 'connect-race-send-a');
await first.ready('FIRST_SEND_READY');
const second=query(`${actor}${sendSql} commit;`, 'connect-race-send-b');
await proveWaiting('connect-race-send-b');
const [one,two]=await Promise.all([first.done,second.done]);assert.equal(one.code,0,one.stderr);assert.equal(two.code,0,two.stderr);
const messageId=one.stdout.split(/\r?\n/).find(line=>/^[0-9a-f-]{36}$/.test(line));assert.ok(messageId);assert.ok(two.stdout.includes(messageId));
const counts=JSON.parse((await success(`select json_build_object('messages',(select count(*) from public.messages),
  'receipts',(select count(*) from private.message_receipts),'sequence',(select last_sequence from public.conversations where id='73000000-0000-4000-8000-000000000001'),
  'audit',(select count(*) from private.audit_events where action='message-accepted'));`)).trim());
assert.deepEqual(counts,{messages:1,receipts:1,sequence:1,audit:1});checks.push('Concurrent same-key sends return one ID, one message, receipt, sequence and audit event');

const abort=await query(`${actor}
select (public.send_text('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','rollback-message','Texto sintético descartado.')).id;
select 1/0; commit;`, 'connect-rollback').done;
assert.notEqual(abort.code,0);
const rolledBack=JSON.parse((await success(`select json_build_object('messages',(select count(*) from public.messages),
  'receipts',(select count(*) from private.message_receipts),'sequence',(select last_sequence from public.conversations where id='73000000-0000-4000-8000-000000000001'),
  'audit',(select count(*) from private.audit_events where action='message-accepted'));`)).trim());
assert.deepEqual(rolledBack,counts);checks.push('Transaction failure rolls back message, receipt, sequence and audit together');
const summary={status:'passed',checks,realPostgresConnections:true,realLockContentionObserved:true,auth:'fixture functions and claims; not JWT verification',productionSecurityValidated:false};
writeFileSync(resolve(output),JSON.stringify(summary,null,2)+'\n');
process.stdout.write(JSON.stringify(summary)+'\n');
