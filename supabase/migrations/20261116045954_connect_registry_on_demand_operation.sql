begin;set local lock_timeout='3s';set local statement_timeout='25s';select pg_advisory_xact_lock(78104,0);
do $$begin if current_user<>'postgres'or session_user<>'postgres'or(jsonb_build_object('source',(select to_jsonb(s)from private.company_registry_sources s where source='minhareceita-cnpj-v1'and policy_version='company-legal-name-v2'),'schemaAcl',(select nspacl::text from pg_namespace where nspname='private'),'members',(select jsonb_agg(to_jsonb(m)order by roleid,member,grantor)from pg_auth_members m where roleid='connect_hmac_registration'::regrole),'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'hash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definer',p.prosecdef,'config',p.proconfig)order by p.proname)from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in('request_company_registry_check','claim_company_registry_request_job','finish_company_registry_job','company_registry_job_projection','finalize_registry_company','company_registry_manager_intent')),'claimPublicAcl',(select proacl::text from pg_proc where oid='public.claim_company_registry_request_job(uuid,uuid,uuid,uuid)'::regprocedure)))is distinct from '{"source":{"source":"minhareceita-cnpj-v1","enabled":false,"policy_version":"company-legal-name-v2","synthetic_only":false,"max_age_seconds":600,"max_dataset_age_days":62},"members":[{"oid":"17961","member":"16384","roleid":"17960","grantor":"10","set_option":false,"admin_option":true,"inherit_option":false},{"oid":"17962","member":"16384","roleid":"17960","grantor":"16384","set_option":false,"admin_option":false,"inherit_option":false}],"functions":[{"acl":"{connect_hmac_registration=X/connect_hmac_registration}","hash":"43e2abbd910a921d96cc6f83b747a4f03d9645e06f7bd3b7a433189f4f699444","name":"claim_company_registry_request_job","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_operation uuid, p_subject uuid, p_session uuid, p_lease uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"0163d4a75269c6433d1eb0750736907b0bdd440bdcdf1c04fcb4aa602eaefb31","name":"company_registry_job_projection","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,postgres=X/connect_hmac_registration}","hash":"d350bc241eb7bb7c647475fade61951040c167624308a0d1123952741b408f40","name":"company_registry_manager_intent","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_operation uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"e5a751596b21b2f9980c9cc957f4b5325384f49eed81d19b52931e77027c4a2e","name":"finalize_registry_company","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid, p_proof uuid, p_operation uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,service_role=X/connect_hmac_registration}","hash":"958ea4745d4c647f1336df006521e0fd163e3d571d55528f83c3f5456321622e","name":"finish_company_registry_job","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_job uuid, p_lease uuid, p_result jsonb"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"6dce201e5e356ee1d5a7cbd41a4dd44b1292abc978e3bef326e184842c5628a6","name":"request_company_registry_check","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid, p_operation uuid"}],"schemaAcl":"{connect_hmac_registration=UC/connect_hmac_registration,authenticated=U/connect_hmac_registration,postgres=U/connect_hmac_registration,service_role=U/connect_hmac_registration}","claimPublicAcl":"{connect_hmac_registration=X/connect_hmac_registration}"}'::jsonb or exists(select 1 from private.company_registry_execution_windows where closed_at is null)then raise exception 'Registry operation baseline differs';end if;end$$;
grant connect_hmac_registration to postgres with inherit false,set true;set local role connect_hmac_registration;
CREATE OR REPLACE FUNCTION private.request_company_registry_check(p_request uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;sid uuid;expiry timestamptz;r private.company_registrations;cfg private.company_registry_sources;j private.company_registry_jobs;o private.company_registry_job_requests;snap bytea;new_job uuid;
begin
 perform pg_advisory_xact_lock_shared(78104,0);actor:=private.company_registry_job_actor();sid:=(private.company_registry_request_context()->>'session_id')::uuid;expiry:=to_timestamp((private.company_registry_request_context()->>'exp')::double precision);
 if p_request is null or p_operation is null then perform private.hmac_model_fail('P0001');end if;
 perform pg_advisory_xact_lock(78103,hashtext(actor::text));
 select*into strict r from private.company_registrations z where z.requester_id=actor and z.request_id=p_request for update;
 snap:=private.company_registry_snapshot(actor,p_request);
 select*into o from private.company_registry_job_requests z where z.operation_id=p_operation;
 if found then
  if o.subject is distinct from actor or o.request_id is distinct from p_request or o.request_snapshot is distinct from snap or o.requester_session is distinct from sid then perform private.hmac_model_fail('P0001');end if;
  return private.company_registry_job_projection(p_request);
 end if;
 if r.state<>'pending'then return private.company_registry_job_projection(p_request);end if;
 if not exists(select 1 from private.company_controls c where c.company_id=r.company_id and c.state='pending'and c.cnpj is null and c.representation_state='unconfirmed')then perform private.hmac_model_fail('P0001');end if;
 select*into cfg from private.company_registry_sources z where z.enabled and z.policy_version='company-legal-name-v2'and z.source='minhareceita-cnpj-v1'order by(z.source='minhareceita-cnpj-v1')desc limit 1 for share;
 if not found or exists(select 1 from private.company_controls c where c.cnpj=r.cnpj and c.company_id<>r.company_id)then return private.company_registry_job_projection(p_request);end if;
 select*into j from private.company_registry_jobs z where z.subject=actor and z.request_id=p_request and z.request_snapshot=snap and z.requester_session=sid and(z.source,z.policy_version)=(cfg.source,cfg.policy_version)and z.state<>'retired'order by z.created_at desc limit 1 for update;
 if found and j.state='ready'and private.company_registry_job_projection(p_request)->>'state'<>'ready'then
  update private.company_registry_jobs set state='retired',updated_at=clock_timestamp()where job_id=j.job_id;j.job_id:=null;
 elsif found and j.state='checking'and j.lease_expires_at<=clock_timestamp()and j.attempts>=3 then
  update private.company_registry_jobs set state='retired',updated_at=clock_timestamp()where job_id=j.job_id;j.job_id:=null;
 elsif found and j.state in('mismatch','not-found','unavailable')and j.retry_after<=clock_timestamp()then
  update private.company_registry_jobs set state='retired',updated_at=clock_timestamp()where job_id=j.job_id;j.job_id:=null;
 end if;
 if j.job_id is null then
  insert into private.company_registry_jobs(subject,request_id,company_id,request_snapshot,source,policy_version,requester_session,requester_expires)
   values(actor,p_request,r.company_id,snap,cfg.source,cfg.policy_version,sid,expiry)returning job_id into new_job;
 else new_job:=j.job_id;end if;
 insert into private.company_registry_job_requests(operation_id,subject,request_id,request_snapshot,requester_session,job_id)values(p_operation,actor,p_request,snap,sid,new_job);
 if private.company_registry_job_actor()<>actor or private.company_registry_snapshot(actor,p_request)is distinct from snap then perform private.hmac_model_fail('P0001');end if;
 return private.company_registry_job_projection(p_request);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$function$;
CREATE OR REPLACE FUNCTION private.claim_company_registry_request_job(p_operation uuid, p_subject uuid, p_session uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o private.company_registry_job_requests;j private.company_registry_jobs;r private.company_registrations;cfg private.company_registry_sources;
begin
 perform pg_advisory_xact_lock_shared(78104,0);
 if p_operation is null or p_subject is null or p_session is null or p_lease is null or p_lease<>p_operation then perform private.hmac_model_fail('P0001');end if;
 -- Resolve this exact original intent before any subject/job lock or retirement.
 select*into o from private.company_registry_job_requests x where x.operation_id=p_operation and x.subject=p_subject and x.requester_session=p_session;
 if not found then return null;end if;
 select*into j from private.company_registry_jobs x where x.job_id=o.job_id and x.subject=p_subject and x.request_id=o.request_id and x.requester_session=p_session and x.request_snapshot=o.request_snapshot and x.source='minhareceita-cnpj-v1'and x.policy_version='company-legal-name-v2';
 if not found then return null;end if;
 select*into cfg from private.company_registry_sources x where x.source=j.source and x.policy_version=j.policy_version and x.enabled for share;
 if not found then return null;end if;
 if exists(select 1 from private.company_registry_jobs x where x.lease_id=p_lease)then return null;end if;
 if not pg_try_advisory_xact_lock(78103,hashtext(p_subject::text))then return null;end if;
 select*into r from private.company_registrations x where x.requester_id=p_subject and x.request_id=o.request_id and x.company_id=j.company_id for update;
 if not found then return null;end if;
 select*into j from private.company_registry_jobs x where x.job_id=o.job_id and x.subject=p_subject and x.request_id=o.request_id and x.requester_session=p_session and x.request_snapshot=o.request_snapshot and x.source=cfg.source and x.policy_version=cfg.policy_version for update skip locked;
 if not found or j.state not in('pending','checking')then return null;end if;
 if r.state is distinct from'pending'or not private.company_registry_job_session(j.subject,j.requester_session,j.requester_expires)
  or private.company_registry_snapshot(j.subject,j.request_id)is distinct from j.request_snapshot
  or not exists(select 1 from private.company_controls c where c.company_id=j.company_id and c.state='pending'and c.cnpj is null and c.representation_state='unconfirmed')
  or exists(select 1 from private.company_controls c where c.cnpj=r.cnpj and c.company_id<>j.company_id)
 then update private.company_registry_jobs set state='retired',updated_at=clock_timestamp()where job_id=j.job_id;return null;end if;
 -- The lease is the original operation UUID: replay cannot acquire another lease.
 -- Only a NEW explicit enqueue operation may retry an expired job, within its existing three-attempt budget.
 if j.state='checking'and j.lease_expires_at>clock_timestamp()then return null;end if;
 if j.attempts>=3 then update private.company_registry_jobs set state='unavailable',retry_after=clock_timestamp()+interval'30seconds',updated_at=clock_timestamp()where job_id=j.job_id;return null;end if;
 if j.state='pending'and(j.attempts<>0 or j.lease_id is not null)then return null;end if;
 update private.company_registry_jobs set state='checking',lease_id=p_lease,lease_expires_at=least(clock_timestamp()+interval'30seconds',j.requester_expires),attempts=attempts+1,updated_at=clock_timestamp()where job_id=j.job_id;
 return private.company_registry_claim_dto(j.job_id);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$function$;
CREATE OR REPLACE FUNCTION private.finish_company_registry_job(p_job uuid, p_lease uuid, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j private.company_registry_jobs;r private.company_registrations;cfg private.company_registry_sources;v_state text;result_digest bytea;observed timestamptz;expiry timestamptz;dataset date;ref uuid;new_proof uuid;value text;
begin
 perform pg_advisory_xact_lock_shared(78104,0);
 if p_job is null or p_lease is null or jsonb_typeof(p_result)is distinct from'object'then perform private.hmac_model_fail('P0001');end if;
 v_state:=p_result->>'state';
 if v_state in('mismatch','not-found','unavailable')then
  if not private.company_registry_json_keys(p_result,array['state'])then perform private.hmac_model_fail('P0001');end if;
 elsif v_state='ready'then
  if not private.company_registry_json_keys(p_result,array['state','source_reference','matched_by','legal_name','official_name','normalised_name','registration_status','observed_at','dataset_date'])
   or jsonb_typeof(p_result->'registration_status')is distinct from'number'or p_result->>'registration_status'not in('1','2','3','4','8')
   or p_result->>'matched_by'is distinct from'legal-name' or p_result->>'official_name'is distinct from p_result->>'legal_name'
   or jsonb_typeof(p_result->'source_reference')is distinct from'string'or(p_result->>'source_reference')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   or jsonb_typeof(p_result->'observed_at')is distinct from'string'or(p_result->>'observed_at')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
   then perform private.hmac_model_fail('P0001');end if;
  foreach value in array array['legal_name','official_name','normalised_name']loop
   if jsonb_typeof(p_result->value)is distinct from'string'or char_length(p_result->>value)<1 or char_length(p_result->>value)>(case when value='normalised_name'then 400 else 200 end)then perform private.hmac_model_fail('P0001');end if;
  end loop;
  if p_result->'dataset_date'<>'null'::jsonb then
   if jsonb_typeof(p_result->'dataset_date')is distinct from'string'or(p_result->>'dataset_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'then perform private.hmac_model_fail('P0001');end if;
   dataset:=(p_result->>'dataset_date')::date;if to_char(dataset,'YYYY-MM-DD')<>p_result->>'dataset_date'then perform private.hmac_model_fail('P0001');end if;
  end if;
  ref:=(p_result->>'source_reference')::uuid;observed:=(p_result->>'observed_at')::timestamptz;
 else perform private.hmac_model_fail('P0001');end if;
 result_digest:=sha256(convert_to(p_result::text,'UTF8'));
 select*into strict j from private.company_registry_jobs z where z.job_id=p_job;
 perform pg_advisory_xact_lock(78103,hashtext(j.subject::text));
 select*into r from private.company_registrations z where z.requester_id=j.subject and z.request_id=j.request_id for update;
 select*into strict j from private.company_registry_jobs z where z.job_id=p_job for update;
 if j.policy_version<>'company-legal-name-v2'or j.source<>'minhareceita-cnpj-v1'or j.lease_id is distinct from p_lease then perform private.hmac_model_fail('P0001');end if;
 if j.result_hash is not null then
  if j.result_hash is distinct from result_digest then perform private.hmac_model_fail('P0001');end if;
  if not private.company_registry_job_session(j.subject,j.requester_session,j.requester_expires)or private.company_registry_snapshot(j.subject,j.request_id)is distinct from j.request_snapshot or not exists(select 1 from private.company_registry_sources z where(z.source,z.policy_version)=(j.source,j.policy_version)and z.enabled)then return jsonb_build_object('job_id',j.job_id,'state','unavailable');end if;
  return jsonb_build_object('job_id',j.job_id,'state',j.state);
 end if;
 if j.state<>'checking'or j.lease_expires_at<=clock_timestamp()then perform private.hmac_model_fail('P0001');end if;
 select*into cfg from private.company_registry_sources z where(z.source,z.policy_version)=(j.source,j.policy_version)for share;
 if r.state is distinct from'pending'or not cfg.enabled or not private.company_registry_job_session(j.subject,j.requester_session,j.requester_expires)
 or private.company_registry_snapshot(j.subject,j.request_id)is distinct from j.request_snapshot
 then update private.company_registry_jobs set state='retired',result_hash=result_digest,updated_at=clock_timestamp()where job_id=j.job_id;return jsonb_build_object('job_id',j.job_id,'state','unavailable');end if;
 if v_state='ready'then
  if private.company_registry_legal_name_key(p_result->>'legal_name')is null
   or private.company_registry_legal_name_key(p_result->>'legal_name')is distinct from private.company_registry_legal_name_key((select name from public.companies where id=j.company_id))
   or p_result->>'normalised_name'is distinct from private.company_registry_legal_name_key(p_result->>'legal_name')then perform private.hmac_model_fail('P0001');end if;
  expiry:=observed+make_interval(secs=>cfg.max_age_seconds);
  if cfg.source='minhareceita-cnpj-v1'then
   if dataset is null or extract(day from dataset)<>1 then perform private.hmac_model_fail('P0001');end if;
   expiry:=least(expiry,((dataset+cfg.max_dataset_age_days)::timestamp at time zone'UTC'),((dataset+interval'2months')at time zone'UTC'));
  elsif dataset is not null then perform private.hmac_model_fail('P0001');end if;
  if not private.company_registry_source_allowed(j.source,j.policy_version,observed,expiry,dataset)then v_state:='unavailable';
  else
   if not exists(select 1 from private.company_controls c where c.company_id=j.company_id and c.state='pending'and c.cnpj is null and c.representation_state='unconfirmed')
   or private.company_registry_snapshot(j.subject,j.request_id)is distinct from j.request_snapshot then perform private.hmac_model_fail('P0001');end if;
   new_proof:=gen_random_uuid();
   insert into private.company_registry_proofs(proof_id,subject,request_id,company_id,cnpj,requested_name,request_snapshot,source,policy_version,source_reference,matched_by,legal_name,official_name,normalised_name,registration_status,observed_at,expires_at,dataset_date)
    values(new_proof,j.subject,j.request_id,j.company_id,r.cnpj,(select c.name from public.companies c where c.id=j.company_id),j.request_snapshot,j.source,j.policy_version,ref,p_result->>'matched_by',p_result->>'legal_name',p_result->>'official_name',p_result->>'normalised_name',p_result->>'registration_status',observed,expiry,dataset);
  end if;
 end if;
 update private.company_registry_jobs set state=v_state,proof_id=new_proof,result_hash=result_digest,retry_after=case when v_state='ready'then null else clock_timestamp()+interval'30seconds'end,updated_at=clock_timestamp()where job_id=j.job_id;
 if not private.company_registry_job_session(j.subject,j.requester_session,j.requester_expires)
 or private.company_registry_snapshot(j.subject,j.request_id)is distinct from j.request_snapshot
 or not exists(select 1 from private.company_registry_sources z where(z.source,z.policy_version)=(j.source,j.policy_version)and z.enabled)
 then perform private.hmac_model_fail('P0001');end if;
 return jsonb_build_object('job_id',j.job_id,'state',v_state);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$function$;
CREATE OR REPLACE FUNCTION private.company_registry_job_projection(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;sid uuid;r private.company_registrations;j private.company_registry_jobs;p private.company_registry_proofs;cfg private.company_registry_sources;snap bytea;state text;outcome jsonb;
begin
 perform pg_advisory_xact_lock_shared(78104,0);actor:=private.company_registry_job_actor();sid:=(private.company_registry_request_context()->>'session_id')::uuid;
 if p_request is null then perform private.hmac_model_fail('P0001');end if;
 select*into strict r from private.company_registrations z where z.requester_id=actor and z.request_id=p_request;
 state:='unavailable';
 if r.state='approved'then outcome:=jsonb_build_object('request_id',p_request,'state','approved','company_id',r.company_id);
 elsif r.state='pending'and exists(select 1 from private.company_controls c where c.company_id=r.company_id and c.state='pending'and c.cnpj is null and c.representation_state='unconfirmed')then
  select*into cfg from private.company_registry_sources z where z.enabled and z.policy_version='company-legal-name-v2'and z.source='minhareceita-cnpj-v1'order by(z.source='minhareceita-cnpj-v1')desc limit 1;
  if found then
   if exists(select 1 from private.company_controls c where c.cnpj=r.cnpj and c.company_id<>r.company_id)then state:='cnpj-in-use';
   else
    snap:=private.company_registry_snapshot(actor,p_request);
    select*into j from private.company_registry_jobs z where z.subject=actor and z.request_id=p_request and z.request_snapshot=snap and z.requester_session=sid and(z.source,z.policy_version)=(cfg.source,cfg.policy_version)order by z.created_at desc limit 1;
    if not found then state:='pending';
    elsif j.state='ready'then
     select*into p from private.company_registry_proofs z where z.proof_id=j.proof_id and z.subject=actor and z.request_id=p_request and z.request_snapshot=snap and z.revoked_at is null and z.consumed_operation is null;
     if found and private.company_registry_legal_proof(p)and private.company_registry_source_allowed(p.source,p.policy_version,p.observed_at,p.expires_at,p.dataset_date)then
      outcome:=jsonb_build_object('request_id',p_request,'state','ready','proof_id',p.proof_id,'expires_at',p.expires_at);
     else state:='unavailable';end if;
    elsif j.state='pending'then state:='pending';
    elsif j.state='checking'then state:=case when j.lease_expires_at>clock_timestamp()then'checking'when j.attempts<3 then'pending'else'unavailable'end;
    elsif j.state='retired'then state:='unavailable';
    elsif j.retry_after is not null and j.retry_after<=clock_timestamp()then state:='unavailable';
    else state:=j.state;end if;
   end if;
  end if;
 end if;
 if private.company_registry_job_actor()<>actor then perform private.hmac_model_fail('P0001');end if;
 return coalesce(outcome,jsonb_build_object('request_id',p_request,'state',state));
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$function$;
CREATE OR REPLACE FUNCTION private.finalize_registry_company(p_request uuid, p_proof uuid, p_operation uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;sid uuid;r private.company_registrations;p private.company_registry_proofs;d private.company_registry_decisions;policy private.company_registry_sources;s bytea;v_constraint text;
begin
 perform pg_advisory_xact_lock_shared(78104,0);perform private.hmac_model_lock();actor:=private.onboarding_actor();perform pg_advisory_xact_lock(78103,hashtext(actor::text));sid:=(private.company_registry_request_context()->>'session_id')::uuid;
 if p_request is null or p_proof is null or p_operation is null then perform private.hmac_model_fail('P0001');end if;
 if not exists(select 1 from private.profile_registrations pr join private.accounts a on a.user_id=pr.user_id join private.account_identity i on i.user_id=pr.user_id where pr.user_id=actor and pr.state='approved' and a.state='active' and i.identity_state<>'disputed')then perform private.hmac_model_fail('P0001');end if;
 select * into d from private.company_registry_decisions where operation_id=p_operation;
 if found then if d.subject<>actor or d.request_id<>p_request or d.proof_id<>p_proof then perform private.hmac_model_fail('P0001');end if;return private.company_registry_receipt(p_operation,true);end if;
 select * into strict r from private.company_registrations where requester_id=actor and request_id=p_request and state='pending' for update;
 perform 1 from public.companies where id=r.company_id for update;if not found then perform private.hmac_model_fail('P0001');end if;
 perform 1 from private.company_controls where company_id=r.company_id and state='pending' and cnpj is null and representation_state='unconfirmed' for update;if not found or not private.company_registry_vacant(r.company_id)then perform private.hmac_model_fail('P0001');end if;
 select * into strict p from private.company_registry_proofs where proof_id=p_proof and subject=actor and request_id=p_request and company_id=r.company_id and consumed_operation is null and revoked_at is null for update;
 select * into strict policy from private.company_registry_sources where(source,policy_version)=(p.source,p.policy_version)and enabled for share;
 s:=private.company_registry_snapshot(actor,p_request);
 if not private.company_registry_legal_proof(p)or p.request_snapshot is distinct from s or p.cnpj<>r.cnpj or p.requested_name<>(select name from public.companies where id=r.company_id)or p.observed_at>clock_timestamp()or p.expires_at<=clock_timestamp()or p.expires_at>p.observed_at+make_interval(secs=>policy.max_age_seconds)or not private.company_registry_source_allowed(p.source,p.policy_version,p.observed_at,p.expires_at,p.dataset_date)then perform private.hmac_model_fail('P0001');end if;
 -- Existing global UNIQUE(cnpj), including suspended Connect companies, wins races.
 -- Registry existence/name match is NOT representation confirmation.
 update private.company_controls set cnpj=r.cnpj,state='active' where company_id=r.company_id and state='pending' and cnpj is null and representation_state='unconfirmed';if not found then perform private.hmac_model_fail('P0001');end if;
 update private.company_registrations set state='approved' where id=r.id and state='pending';if not found then perform private.hmac_model_fail('P0001');end if;
 update private.company_registry_proofs set consumed_operation=p_operation,consumed_at=clock_timestamp()where proof_id=p_proof and consumed_operation is null and revoked_at is null;if not found then perform private.hmac_model_fail('P0001');end if;
 insert into private.company_registry_decisions(operation_id,subject,request_id,company_id,proof_id,request_snapshot,actor_session_id)values(p_operation,actor,p_request,r.company_id,p_proof,s,sid);
 perform private.company_registry_insert_manager(p_operation);
 if private.onboarding_actor()<>actor
 or not exists(select 1 from private.company_controls where company_id=r.company_id and state='active' and cnpj=r.cnpj and representation_state='unconfirmed')
 or not exists(select 1 from private.company_registrations where id=r.id and request_id=p_request and state='approved')
 or p.request_snapshot is distinct from private.company_registry_snapshot(actor,p_request)
 or not exists(select 1 from private.company_registry_proofs where proof_id=p_proof and consumed_operation=p_operation and revoked_at is null and expires_at>clock_timestamp())
 or not private.company_registry_source_allowed(p.source,p.policy_version,p.observed_at,p.expires_at,p.dataset_date)
 or not exists(select 1 from private.profile_registrations pr join private.accounts a on a.user_id=pr.user_id join private.account_identity i on i.user_id=pr.user_id where pr.user_id=actor and pr.state='approved' and a.state='active' and i.identity_state<>'disputed')then perform private.hmac_model_fail('P0001');end if;
 return private.company_registry_receipt(p_operation,false);
exception when unique_violation then
 get stacked diagnostics v_constraint=CONSTRAINT_NAME;
 if v_constraint='company_controls_cnpj_key' and actor is not null and private.onboarding_actor()=actor
 and exists(select 1 from private.company_registrations cr join private.company_controls cc using(company_id)where cr.requester_id=actor and cr.request_id=p_request and cr.state='pending' and cc.state='pending' and cc.cnpj is null and cc.representation_state='unconfirmed')
 then return jsonb_build_object('request_id',p_request,'registration_state','pending','result','cnpj-in-use');end if;perform private.hmac_model_fail('23505');return null;
 when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$function$;
CREATE OR REPLACE FUNCTION private.company_registry_manager_intent(p_operation uuid)
 RETURNS TABLE(company_id uuid, subject uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d private.company_registry_decisions;p private.company_registry_proofs;r private.company_registrations;actor uuid;
begin
 select * into strict d from private.company_registry_decisions where operation_id=p_operation and transaction_id=pg_current_xact_id();actor:=private.onboarding_actor();
 if actor<>d.subject or(private.company_registry_request_context()->>'session_id')::uuid<>d.actor_session_id then perform private.hmac_model_fail('P0001');end if;
 select * into strict r from private.company_registrations where requester_id=d.subject and request_id=d.request_id and company_registrations.company_id=d.company_id and state='approved';
 select * into strict p from private.company_registry_proofs b where b.proof_id=d.proof_id and b.subject=d.subject and b.request_id=d.request_id and b.company_id=d.company_id and b.consumed_operation=d.operation_id and b.revoked_at is null and b.expires_at>clock_timestamp();
 if not private.company_registry_legal_proof(p)or d.request_snapshot is distinct from private.company_registry_snapshot(d.subject,d.request_id)or p.request_snapshot is distinct from d.request_snapshot or p.cnpj<>r.cnpj
 or not exists(select 1 from private.company_controls where company_controls.company_id=d.company_id and state='active' and cnpj=r.cnpj and representation_state='unconfirmed')
 or not private.company_registry_source_allowed(p.source,p.policy_version,p.observed_at,p.expires_at,p.dataset_date)
 or not exists(select 1 from private.profile_registrations pr join private.accounts a on a.user_id=pr.user_id join private.account_identity i on i.user_id=pr.user_id where pr.user_id=d.subject and pr.state='approved' and a.state='active' and i.identity_state<>'disputed')then perform private.hmac_model_fail('P0001');end if;
 return query select d.company_id,d.subject;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return;end$function$;
grant execute on function private.claim_company_registry_request_job(uuid,uuid,uuid,uuid),public.claim_company_registry_request_job(uuid,uuid,uuid,uuid) to service_role;
update private.company_registry_sources set enabled=true where source='minhareceita-cnpj-v1'and policy_version='company-legal-name-v2';
set local role postgres;grant connect_hmac_registration to postgres with inherit false,set false;
do $$begin if current_user<>'postgres'or session_user<>'postgres'or(jsonb_build_object('source',(select to_jsonb(s)from private.company_registry_sources s where source='minhareceita-cnpj-v1'and policy_version='company-legal-name-v2'),'schemaAcl',(select nspacl::text from pg_namespace where nspname='private'),'members',(select jsonb_agg(to_jsonb(m)order by roleid,member,grantor)from pg_auth_members m where roleid='connect_hmac_registration'::regrole),'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'hash',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'definer',p.prosecdef,'config',p.proconfig)order by p.proname)from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in('request_company_registry_check','claim_company_registry_request_job','finish_company_registry_job','company_registry_job_projection','finalize_registry_company','company_registry_manager_intent')),'claimPublicAcl',(select proacl::text from pg_proc where oid='public.claim_company_registry_request_job(uuid,uuid,uuid,uuid)'::regprocedure)))is distinct from '{"source":{"source":"minhareceita-cnpj-v1","enabled":true,"policy_version":"company-legal-name-v2","synthetic_only":false,"max_age_seconds":600,"max_dataset_age_days":62},"members":[{"oid":"17961","member":"16384","roleid":"17960","grantor":"10","set_option":false,"admin_option":true,"inherit_option":false},{"oid":"17962","member":"16384","roleid":"17960","grantor":"16384","set_option":false,"admin_option":false,"inherit_option":false}],"functions":[{"acl":"{connect_hmac_registration=X/connect_hmac_registration,service_role=X/connect_hmac_registration}","hash":"f7bb17a83d1ea400bfadb51d4d36410a3f9027a102482b6b43531f1024c934a5","name":"claim_company_registry_request_job","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_operation uuid, p_subject uuid, p_session uuid, p_lease uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"c7f6cba8b4d1ed59bb3bc926c46d547b5eb7e6be91b04578392f21ff2699b12c","name":"company_registry_job_projection","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,postgres=X/connect_hmac_registration}","hash":"73cdb5fb0f42c4424d98cf165ed321355589c20436fe71f77ec1a77521ddc612","name":"company_registry_manager_intent","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_operation uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"8bbed5431864131f3022c3000f13c4f922beaa5f866bd833b19d8592f5b47a2c","name":"finalize_registry_company","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid, p_proof uuid, p_operation uuid"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,service_role=X/connect_hmac_registration}","hash":"56e480a898a056acac96c91ec4bb44830b880c1ff921892e754939cb5f299566","name":"finish_company_registry_job","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_job uuid, p_lease uuid, p_result jsonb"},{"acl":"{connect_hmac_registration=X/connect_hmac_registration,authenticated=X/connect_hmac_registration}","hash":"073830e236fd47729e860a37bcd47244290cbbc2a3203ff39933331c86a0c6ce","name":"request_company_registry_check","owner":"connect_hmac_registration","config":["search_path=\"\""],"definer":true,"signature":"p_request uuid, p_operation uuid"}],"schemaAcl":"{connect_hmac_registration=UC/connect_hmac_registration,authenticated=U/connect_hmac_registration,postgres=U/connect_hmac_registration,service_role=U/connect_hmac_registration}","claimPublicAcl":"{connect_hmac_registration=X/connect_hmac_registration,service_role=X/connect_hmac_registration}"}'::jsonb or exists(select 1 from private.company_registry_execution_windows where closed_at is null)then raise exception 'Registry operation baseline differs';end if;end$$;
-- OPERATION_BEFORE_COMMIT
commit;
