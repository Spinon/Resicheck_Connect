create table private.audio_pilot_scope(
 singleton boolean primary key default true check(singleton),
 company_id uuid not null references public.companies(id)check(company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'::uuid),
 enabled boolean not null default false,created_at timestamptz not null,expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval'7 days')
);
alter table private.audio_pilot_scope enable row level security;
revoke all on private.audio_pilot_scope from public,anon,authenticated,service_role;
create function private.audio_pilot_allowed(p_company uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare scope private.audio_pilot_scope;
begin
 select*into scope from private.audio_pilot_scope where singleton for share;
 return coalesce(found and scope.enabled and scope.company_id=p_company
  and scope.company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'::uuid
  and scope.created_at<=clock_timestamp()and scope.expires_at>clock_timestamp(),false);
exception when others then return false;end$$;
revoke all on function private.audio_pilot_allowed(uuid)from public,anon,authenticated,service_role;
