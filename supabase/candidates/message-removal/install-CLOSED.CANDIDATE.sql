begin;set local lock_timeout='3s';set local statement_timeout='15s';
-- APP-262 LOCAL CANDIDATE. No publication, deletion or operational grants.
-- Apply inside a reviewed transaction. Originals stay in public.messages.
create table private.message_removal_operations(
 revision bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id),operation_id uuid not null,
 company_id uuid not null,conversation_id uuid not null,scope text not null check(scope in('self','all')),
 message_ids uuid[] not null check(cardinality(message_ids)between 1 and 50),
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,operation_id),foreign key(company_id,conversation_id)references public.conversations(company_id,id));
create index message_removal_changes on private.message_removal_operations(company_id,conversation_id,revision);
create table private.message_removals_all(
 message_id uuid primary key,company_id uuid not null,conversation_id uuid not null,
 removed_by uuid not null references public.profiles(id),operation_revision bigint not null references private.message_removal_operations(revision),removed_at timestamptz not null default clock_timestamp(),
 foreign key(company_id,conversation_id,message_id)references public.messages(company_id,conversation_id,id));
create table private.message_removals_self(
 user_id uuid not null references public.profiles(id),message_id uuid not null,company_id uuid not null,conversation_id uuid not null,
 operation_revision bigint not null references private.message_removal_operations(revision),removed_at timestamptz not null default clock_timestamp(),
 primary key(user_id,message_id),foreign key(company_id,conversation_id,message_id)references public.messages(company_id,conversation_id,id));
alter table private.message_removal_operations enable row level security;
alter table private.message_removal_operations force row level security;
alter table private.message_removals_all enable row level security;
alter table private.message_removals_all force row level security;
alter table private.message_removals_self enable row level security;
alter table private.message_removals_self force row level security;
revoke all on private.message_removal_operations,private.message_removals_all,private.message_removals_self from public,anon,authenticated,service_role;
revoke all on sequence private.message_removal_operations_revision_seq from public,anon,authenticated,service_role;

create function private.message_is_removed(p_company uuid,p_conversation uuid,p_message uuid)returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then return true;end if;
 return exists(select 1 from private.message_removals_all where company_id=p_company and conversation_id=p_conversation and message_id=p_message)
 or exists(select 1 from private.message_removals_self where user_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and message_id=p_message);
exception when others then return true;end$$;

create function private.remove_messages_v1(p_company uuid,p_conversation uuid,p_operation uuid,p_scope text,p_messages uuid[])returns jsonb
language plpgsql security definer set search_path='' as $$
declare normalized uuid[];old private.message_removal_operations;op private.message_removal_operations;matched integer;
begin
 if p_company is null or p_conversation is null or p_operation is null or p_scope is null or p_scope not in('self','all')or p_messages is null or array_ndims(p_messages)<>1 or array_lower(p_messages,1)<>1 or cardinality(p_messages)not between 1 and 50 or array_position(p_messages,null)is not null then raise exception 'Message action unavailable';end if;
 select array_agg(distinct x order by x)into normalized from unnest(p_messages)x;
 if cardinality(normalized)<>cardinality(p_messages)then raise exception 'Message action unavailable';end if;
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Message action unavailable';end if;
 select * into old from private.message_removal_operations where user_id=auth.uid()and operation_id=p_operation;
 if found then
  if old.company_id<>p_company or old.conversation_id<>p_conversation or old.scope<>p_scope or old.message_ids<>normalized then raise exception 'Message action unavailable';end if;op:=old;
 else
  perform id from public.messages where company_id=p_company and conversation_id=p_conversation and id=any(normalized)order by id for update;
  get diagnostics matched=row_count;
  if matched<>cardinality(normalized)or(p_scope='all'and exists(select 1 from public.messages where id=any(normalized)and sender_id<>auth.uid()))then raise exception 'Message action unavailable';end if;
  if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Message action unavailable';end if;
  insert into private.message_removal_operations(user_id,operation_id,company_id,conversation_id,scope,message_ids)values(auth.uid(),p_operation,p_company,p_conversation,p_scope,normalized)returning * into op;
  if p_scope='all'then insert into private.message_removals_all(message_id,company_id,conversation_id,removed_by,operation_revision)select x,p_company,p_conversation,auth.uid(),op.revision from unnest(normalized)x on conflict(message_id)do nothing;
  else insert into private.message_removals_self(user_id,message_id,company_id,conversation_id,operation_revision)select auth.uid(),x,p_company,p_conversation,op.revision from unnest(normalized)x on conflict(user_id,message_id)do nothing;end if;
 end if;
 return jsonb_build_object('companyId',p_company,'conversationId',p_conversation,'operationId',op.operation_id,'scope',op.scope,'messageIds',to_jsonb(op.message_ids),'revision',op.revision::text);
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;

create function private.lookup_message_removal_v1(p_company uuid,p_conversation uuid,p_operation uuid)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare op private.message_removal_operations;
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_operation is null then raise exception 'Message action unavailable';end if;
 select * into op from private.message_removal_operations where user_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and operation_id=p_operation;
 if not found then return jsonb_build_object('state','not_observed');end if;
 return jsonb_build_object('state','accepted','receipt',jsonb_build_object('companyId',p_company,'conversationId',p_conversation,'operationId',op.operation_id,'scope',op.scope,'messageIds',to_jsonb(op.message_ids),'revision',op.revision::text));
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;

create function private.message_removal_changes_v1(p_company uuid,p_conversation uuid,p_after bigint,p_limit integer)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare latest bigint;through bigint;items jsonb;
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Message action unavailable';end if;
 select coalesce(max(revision),0)into latest from private.message_removal_operations where company_id=p_company and conversation_id=p_conversation and(scope='all'or user_id=auth.uid());
 if p_after>latest then raise exception 'Message action unavailable';end if;
 with selected as materialized(select revision,message_ids from private.message_removal_operations where company_id=p_company and conversation_id=p_conversation and revision>p_after and(scope='all'or user_id=auth.uid())order by revision limit p_limit),
 affected as(select distinct unnest(message_ids)id from selected)
 select coalesce((select max(revision)from selected),p_after),coalesce((select jsonb_agg(jsonb_build_object('messageId',a.id,'scope',case when exists(select 1 from private.message_removals_all g where g.message_id=a.id and g.company_id=p_company and g.conversation_id=p_conversation)then'all'else'self'end)order by a.id)from affected a),'[]'::jsonb)into through,items;
 return jsonb_build_object('companyId',p_company,'conversationId',p_conversation,'through',through::text,'latest',latest::text,'hasMore',through<latest,'items',items);
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;

create function private.read_messages_projection_v2(p_company uuid,p_conversation uuid,p_before bigint,p_after bigint,p_limit integer)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare result jsonb;
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_limit is null or p_limit not between 1 and 100 or(p_before is not null and p_before<1)or(p_after is not null and p_after<0)or(p_before is not null and p_after is not null)then raise exception 'Message action unavailable';end if;
 with page as materialized(select m.*,case when exists(select 1 from private.message_removals_all g where g.message_id=m.id and g.company_id=p_company and g.conversation_id=p_conversation)then'all'when exists(select 1 from private.message_removals_self s where s.user_id=auth.uid()and s.message_id=m.id and s.company_id=p_company and s.conversation_id=p_conversation)then'self'else null end removed_scope
 from public.messages m where m.company_id=p_company and m.conversation_id=p_conversation and(p_before is null or m.sequence<p_before)and(p_after is null or m.sequence>p_after)
 order by case when p_after is not null then m.sequence end asc,case when p_after is null then m.sequence end desc limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'company_id',company_id,'conversation_id',conversation_id,'sender_id',sender_id,'sender_role',sender_role,'sequence',sequence,
 'accepted_at',to_char(accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'kind',case when removed_scope is null then kind else'text'end,'body',case when removed_scope is null then body else'Mensagem removida'end,'important',case when removed_scope is null then important else false end,'removed_scope',removed_scope)
 order by case when p_after is not null then sequence end asc,case when p_after is null then sequence end desc),'[]'::jsonb)into result from page;
 return result;
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;

create function public.remove_connect_messages_v1(p_company uuid,p_conversation uuid,p_operation uuid,p_scope text,p_messages uuid[])returns jsonb language sql security invoker set search_path=''as $$select private.remove_messages_v1(p_company,p_conversation,p_operation,p_scope,p_messages)$$;
create function public.lookup_connect_message_removal_v1(p_company uuid,p_conversation uuid,p_operation uuid)returns jsonb language sql stable security invoker set search_path=''as $$select private.lookup_message_removal_v1(p_company,p_conversation,p_operation)$$;
create function public.connect_message_removal_changes_v1(p_company uuid,p_conversation uuid,p_after bigint,p_limit integer)returns jsonb language sql stable security invoker set search_path=''as $$select private.message_removal_changes_v1(p_company,p_conversation,p_after,p_limit)$$;
create function public.read_connect_messages_v2(p_company uuid,p_conversation uuid,p_before bigint default null,p_after bigint default null,p_limit integer default 25)returns jsonb language sql stable security invoker set search_path=''as $$select private.read_messages_projection_v2(p_company,p_conversation,p_before,p_after,p_limit)$$;
revoke all on function private.message_is_removed(uuid,uuid,uuid),private.remove_messages_v1(uuid,uuid,uuid,text,uuid[]),private.lookup_message_removal_v1(uuid,uuid,uuid),private.message_removal_changes_v1(uuid,uuid,bigint,integer),private.read_messages_projection_v2(uuid,uuid,bigint,bigint,integer),public.remove_connect_messages_v1(uuid,uuid,uuid,text,uuid[]),public.lookup_connect_message_removal_v1(uuid,uuid,uuid),public.connect_message_removal_changes_v1(uuid,uuid,bigint,integer),public.read_connect_messages_v2(uuid,uuid,bigint,bigint,integer)from public,anon,authenticated,service_role;

alter table private.message_removal_operations owner to postgres;
alter table private.message_removals_all owner to postgres;
alter table private.message_removals_self owner to postgres;
alter function private.message_is_removed(uuid,uuid,uuid) owner to postgres;
alter function private.remove_messages_v1(uuid,uuid,uuid,text,uuid[]) owner to postgres;
alter function private.lookup_message_removal_v1(uuid,uuid,uuid) owner to postgres;
alter function private.message_removal_changes_v1(uuid,uuid,bigint,integer) owner to postgres;
alter function private.read_messages_projection_v2(uuid,uuid,bigint,bigint,integer) owner to postgres;
alter function public.remove_connect_messages_v1(uuid,uuid,uuid,text,uuid[]) owner to postgres;
alter function public.lookup_connect_message_removal_v1(uuid,uuid,uuid) owner to postgres;
alter function public.connect_message_removal_changes_v1(uuid,uuid,bigint,integer) owner to postgres;
alter function public.read_connect_messages_v2(uuid,uuid,bigint,bigint,integer) owner to postgres;
-- REMOVAL_CLOSED_COMMIT
commit;
