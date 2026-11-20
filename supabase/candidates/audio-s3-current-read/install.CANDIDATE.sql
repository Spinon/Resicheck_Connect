-- LOCAL CANDIDATE ONLY; requires specific remote authorization. Does not activate or grant audio.
begin;set local lock_timeout='3s';set local statement_timeout='20s';select pg_advisory_xact_lock(900001,560);
do $$begin if current_user<>'postgres'or session_user<>'postgres'or(select count(*)from supabase_migrations.schema_migrations)<>15 or(select name from supabase_migrations.schema_migrations order by version desc limit 1)<>'connect_audio_metadata_pilot_stop'or has_schema_privilege('postgres','private','CREATE')or exists(select 1 from private.audio_pilot_scope where enabled)or exists(select 1 from private.audio_inspectors where enabled)or exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and(set_option or inherit_option))or exists(select 1 from(values ('private.audio_storage_ready(text,text)','1eafb218cbcb40b520786831b98d442734b0c5700400cf1b1e6026c982791f5b'),('private.audio_storage_leased(text,text)','c608dadafb3180ff95fb13245e8be2c5356ff131dcd2b06c5106c028f6b138e9'))v(sig,digest)left join pg_proc p on p.oid=to_regprocedure(v.sig)where p.oid is null or p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from ARRAY['search_path=""']::text[]or encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex')<>v.digest) then raise exception 'Audio S3 precondition differs';end if;end$$;
create temporary table audio_metadata_before on commit drop as select (select jsonb_agg(jsonb_build_array(oid,proowner,proacl)order by oid)from pg_proc where oid in('private.audio_storage_ready(text,text)'::regprocedure,'private.audio_storage_leased(text,text)'::regprocedure))as acl,(select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)policies;
grant connect_hmac_registration to postgres with inherit false,set true;set local role connect_hmac_registration;grant create on schema private to postgres;set local role postgres;
create or replace function private.audio_storage_ready(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('s3.object.get')
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and private.audio_pilot_allowed(a.company_id)and a.state='ready'and a.message_id is not null
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$$;
create or replace function private.audio_storage_leased(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('s3.object.get')and private.audio_inspector_active()
  and exists(select 1 from private.audio_inspection_jobs j join private.attachment_catalog a on a.id=j.attachment_id
   where a.object_name=p_name and a.state='uploaded'and a.media_kind='audio'and private.audio_pilot_allowed(a.company_id)and a.valid_until>clock_timestamp()and a.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
   and j.inspector_id=auth.uid()and j.session_id::text=auth.jwt()->>'session_id'and j.valid_until>clock_timestamp()and j.result is null
   and exists(select 1 from auth.sessions s where s.id=a.session_id and s.user_id=a.sender_id and(s.not_after is null or s.not_after>clock_timestamp()))
   and exists(select 1 from private.accounts x where x.user_id=a.sender_id and x.state='active')
   and exists(select 1 from private.company_controls c where c.company_id=a.company_id and c.state='active')
   and exists(select 1 from public.memberships m join public.conversations c on c.id=a.conversation_id and c.company_id=a.company_id
      where m.company_id=a.company_id and m.user_id=a.sender_id and m.state='active'and(m.role='staff'or(m.role='patient'and c.patient_id=a.sender_id))));
 exception when others then return false;end$$;

-- S3_RESTORE_BOUNDARY
set local role connect_hmac_registration;revoke create on schema private from postgres;set local role postgres;grant connect_hmac_registration to postgres with inherit false,set false;
do $$begin if (select acl from audio_metadata_before)is distinct from (select jsonb_agg(jsonb_build_array(oid,proowner,proacl)order by oid)from pg_proc where oid in('private.audio_storage_ready(text,text)'::regprocedure,'private.audio_storage_leased(text,text)'::regprocedure))or(select policies from audio_metadata_before)is distinct from(select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)or has_schema_privilege('postgres','private','CREATE')or exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and(set_option or inherit_option))then raise exception 'Audio S3 restoration differs';end if;end$$;commit;
