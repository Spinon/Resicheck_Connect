-- CANDIDATE ACTIVATION ONLY. Separate approval and exact bucket preflight required.
begin;
set local lock_timeout='3s';set local statement_timeout='15s';
do $$begin
 if current_user<>'postgres'or session_user<>'postgres'or has_schema_privilege('postgres','private','CREATE')then raise exception 'Audio activation boundary refused';end if;
 if not exists(select 1 from storage.buckets where id='connect-private-attachments'and public=false and file_size_limit=1048576 and allowed_mime_types=array['audio/mp4'])then raise exception 'Audio private bucket preflight refused';end if;
 if exists(select 1 from storage.objects where bucket_id='connect-private-attachments')or exists(select 1 from pg_policy where polrelid='storage.objects'::regclass)then raise exception 'Audio initial Storage state refused';end if;
end$$;
grant usage on schema private to authenticated;
grant execute on function public.send_connect_audio_message_v1(uuid,uuid,text,uuid),public.lookup_connect_audio_message_v1(uuid,uuid,text,uuid),public.resolve_connect_audio_message_v1(uuid,uuid,uuid),private.audio_message_send(uuid,uuid,text,uuid),private.audio_message_lookup(uuid,uuid,text,uuid),private.audio_message_resolve(uuid,uuid,uuid),private.audio_storage_insert(text,text,text),private.audio_storage_ready(text,text),private.audio_storage_leased(text,text),private.audio_reserve_scoped(uuid,uuid,text,text,integer),private.audio_confirm_scoped(uuid,uuid,uuid),private.audio_status_scoped(uuid,uuid,text),private.audio_claim_scoped(),private.audio_finish_scoped(uuid,uuid,text,integer,boolean,integer,text),public.reserve_connect_audio_scoped_v1(uuid,uuid,text,text,integer),public.confirm_connect_audio_scoped_v1(uuid,uuid,uuid),public.status_connect_audio_scoped_v1(uuid,uuid,text),public.claim_connect_audio_inspection_v1(),public.finish_connect_audio_inspection_v1(uuid,uuid,text,integer,boolean,integer,text),private.audio_read_scoped(uuid,uuid,uuid),public.resolve_connect_audio_storage_v1(uuid,uuid,uuid) to authenticated;
create policy connect_audio_insert on storage.objects for insert to authenticated with check(private.audio_storage_insert(bucket_id,name,owner_id));
create policy connect_audio_ready on storage.objects for select to authenticated using(private.audio_storage_ready(bucket_id,name));
create policy connect_audio_lease on storage.objects for select to authenticated using(private.audio_storage_leased(bucket_id,name));
-- Bucket-specific restrictive guards survive unrelated permissive policies.
create policy connect_audio_select_guard on storage.objects as restrictive for select to public using(case when bucket_id<>'connect-private-attachments'then true when current_user='authenticated'then private.audio_storage_ready(bucket_id,name)or private.audio_storage_leased(bucket_id,name)else false end);
create policy connect_audio_insert_guard on storage.objects as restrictive for insert to public with check(case when bucket_id<>'connect-private-attachments'then true when current_user='authenticated'then private.audio_storage_insert(bucket_id,name,owner_id)else false end);
create policy connect_audio_update_guard on storage.objects as restrictive for update to public using(bucket_id<>'connect-private-attachments')with check(bucket_id<>'connect-private-attachments');
create policy connect_audio_delete_guard on storage.objects as restrictive for delete to public using(bucket_id<>'connect-private-attachments');
commit;
