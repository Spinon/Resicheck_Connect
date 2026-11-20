create table private.audio_producer_permit(
 singleton boolean primary key default true check(singleton),permit_id uuid not null unique,
 company_id uuid not null check(company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'),
 sender_id uuid not null check(sender_id='e3fe7071-f9ea-48fd-afe5-41d5915998a2'),
 conversation_id uuid not null check(conversation_id='d834fa16-90ab-4065-a9a7-5da30ac71945'),session_id uuid not null,
 client_id text not null check(client_id~'^pilot-producer-[a-f0-9-]{36}$'),attachment_id uuid unique references private.attachment_catalog(id),
 expected_digest text not null check(expected_digest='29aa11618029a0cfb6f0fd9e9ffc421b7a36f327339f2aee57e6532945ac5743'),expected_bytes integer not null check(expected_bytes=9724),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 enabled boolean not null default false,phase text not null default 'armed'check(phase in('armed','reserved','confirmed','closed','revoked')),
 check(expires_at>created_at and expires_at<=created_at+interval '10 minutes'and expires_at<='2026-11-18T02:04:16.140534Z'),
 check((phase='armed'and attachment_id is null)or(phase in('reserved','confirmed')and attachment_id is not null)or phase in('closed','revoked'))
);
alter table private.audio_producer_permit enable row level security;
revoke all on private.audio_producer_permit from public,anon,authenticated,service_role;
create function private.audio_producer_allowed(p_company uuid)returns boolean language plpgsql security definer set search_path=''as $$
declare p private.audio_producer_permit;
begin
 perform 1 from private.audio_pilot_scope where singleton for share;
 select*into p from private.audio_producer_permit where singleton for share;
 return coalesce(p.enabled and p.phase in('armed','reserved','confirmed')and p.company_id=p_company and p.sender_id=auth.uid()
  and p.session_id=(auth.jwt()->>'session_id')::uuid and p.created_at<=clock_timestamp()and p.expires_at>clock_timestamp()
  and auth.jwt()->>'role'='authenticated'and(auth.jwt()->>'exp')::numeric>extract(epoch from clock_timestamp())
  and exists(select 1 from auth.sessions s where s.id=p.session_id and s.user_id=p.sender_id and(s.not_after is null or s.not_after>clock_timestamp()))
  and exists(select 1 from private.audio_pilot_scope s where s.singleton and not s.enabled and s.company_id=p.company_id and s.created_at<=clock_timestamp()and s.expires_at>=p.expires_at)
  and not exists(select 1 from private.audio_inspectors where enabled)
  and not exists(select 1 from private.audio_one_task_permit where enabled),false);
exception when others then return false;end$$;
revoke all on function private.audio_producer_allowed(uuid)from public,anon,authenticated,service_role;
