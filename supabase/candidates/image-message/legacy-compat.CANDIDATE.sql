BEGIN;
create or replace function private.read_messages_projection_v2(p_company uuid,p_conversation uuid,p_before bigint,p_after bigint,p_limit integer)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare result jsonb;
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_limit is null or p_limit not between 1 and 100 or(p_before is not null and p_before<1)or(p_after is not null and p_after<0)or(p_before is not null and p_after is not null)then raise exception 'Message action unavailable';end if;
 with page as materialized(select m.*,case when exists(select 1 from private.message_removals_all g where g.message_id=m.id and g.company_id=p_company and g.conversation_id=p_conversation)then'all'when exists(select 1 from private.message_removals_self s where s.user_id=auth.uid()and s.message_id=m.id and s.company_id=p_company and s.conversation_id=p_conversation)then'self'else null end removed_scope
 from public.messages m where m.company_id=p_company and m.conversation_id=p_conversation and m.kind in('text','audio')and(p_before is null or m.sequence<p_before)and(p_after is null or m.sequence>p_after)
 order by case when p_after is not null then m.sequence end asc,case when p_after is null then m.sequence end desc limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'company_id',company_id,'conversation_id',conversation_id,'sender_id',sender_id,'sender_role',sender_role,'sequence',sequence,
 'accepted_at',to_char(accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'kind',case when removed_scope is null then kind else'text'end,'body',case when removed_scope is null then body else'Mensagem removida'end,'important',case when removed_scope is null then important else false end,'removed_scope',removed_scope)
 order by case when p_after is not null then sequence end asc,case when p_after is null then sequence end desc),'[]'::jsonb)into result from page;
 return result;
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;
create policy message_image_legacy_hide on public.messages as restrictive for select to authenticated using(kind<>'image');
COMMIT;
