-- LOCAL ONLY. No grants to runtime/client roles. Requires historical catalog and repository candidates.
begin;
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check check(kind in('text','audio'));
alter table public.messages alter column body drop not null;
alter table public.messages add constraint messages_kind_body_check check((kind='text'and body is not null)or(kind='audio'and body is null));
create unique index attachment_one_message on private.attachment_catalog(message_id)where message_id is not null;
create table private.audio_message_receipts(
 sender_id uuid not null references public.profiles(id),company_id uuid not null,conversation_id uuid not null,
 client_message_id text not null check(client_message_id~'^[A-Za-z0-9_-]{1,80}$'),
 attachment_id uuid not null unique references private.attachment_catalog(id),message_id uuid not null unique,
 primary key(sender_id,company_id,conversation_id,client_message_id),
 foreign key(company_id,conversation_id,message_id)references public.messages(company_id,conversation_id,id)
);
alter table private.audio_message_receipts enable row level security;
revoke all on private.audio_message_receipts from public,anon,authenticated;
create function private.audio_message_lookup(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare m public.messages;r private.audio_message_receipts;result jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_client is null or p_client!~'^[A-Za-z0-9_-]{1,80}$'or p_attachment is null then raise exception 'Audio unavailable';end if;
 result:=jsonb_build_object('sender_id',auth.uid(),'company_id',p_company,'conversation_id',p_conversation,'client_message_id',p_client,'kind','audio','attachment_id',p_attachment);
 select * into r from private.audio_message_receipts where sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and client_message_id=p_client;
 if not found then return result||jsonb_build_object('state','not_observed');end if;
 if r.attachment_id<>p_attachment then raise exception 'Audio unavailable';end if;
 select * into strict m from public.messages where id=r.message_id and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and kind='audio';
 return result||jsonb_build_object('state','accepted','receipt',jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',m.accepted_at));
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_message_send(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare c public.conversations;a private.attachment_catalog;m public.messages;seq bigint;role_name text;prior jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select * into strict c from public.conversations where company_id=p_company and id=p_conversation for update;
 prior:=private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment);
 if prior->>'state'='accepted'then return prior;end if;
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()for update;
 if not found or a.message_id is not null or a.media_kind<>'audio'or a.state<>'ready'or a.detected_type is distinct from 'audio/mp4'or a.duration_ms is null or a.duration_ms not between 500 and 60500 or a.expected_bytes>1048576 or a.observed_bytes is distinct from a.expected_bytes or a.observed_sha256 is distinct from a.expected_sha256 then raise exception 'Audio unavailable';end if;
 if private.has_role(p_company,'staff')then
  if c.patient_id=auth.uid()and private.has_role(p_company,'patient')then raise exception 'Audio unavailable';end if;role_name:='staff';
 else role_name:='patient';end if;
 update public.conversations set last_sequence=last_sequence+1 where company_id=p_company and id=p_conversation returning last_sequence into seq;
 insert into public.messages(company_id,conversation_id,sender_id,sender_role,sequence,kind,body)values(p_company,p_conversation,auth.uid(),role_name,seq,'audio',null)returning * into m;
 update private.attachment_catalog set message_id=m.id where id=a.id;
 insert into private.audio_message_receipts values(auth.uid(),p_company,p_conversation,p_client,a.id,m.id);
 insert into private.audit_events(actor_id,company_id,action,target_id)values(auth.uid(),p_company,'message-accepted',m.id);
 return private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
revoke all on function private.audio_message_lookup(uuid,uuid,text,uuid),private.audio_message_send(uuid,uuid,text,uuid)from public,anon,authenticated;
commit;
