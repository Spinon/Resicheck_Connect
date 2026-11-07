-- Catalog assertions, not a substitute for Supabase advisors or runtime user tests.
begin;
do $$
declare total int;
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity)
    then raise exception 'A Connect table lacks RLS'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef)
    then raise exception 'Exposed schema contains SECURITY DEFINER'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prosecdef
    and not exists(select 1 from unnest(coalesce(p.proconfig,array[]::text[])) option where option in ('search_path=""','search_path=')))
    then raise exception 'Privileged function lacks pinned empty search_path'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'
    and (has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')))
    then raise exception 'Unexpected direct client table privileges'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relkind='r'
    and has_table_privilege('authenticated',c.oid,'SELECT')) then raise exception 'Private rows exposed to client'; end if;
  if has_column_privilege('authenticated','public.conversations','last_sequence','SELECT')
    then raise exception 'Internal sequence counter exposed'; end if;
  if has_function_privilege('authenticated','private.lock_accounts(uuid[])','EXECUTE')
    then raise exception 'Internal account lock callable directly'; end if;
  select count(*) into total from pg_index i join pg_class c on c.oid=i.indexrelid
    where c.relname='staff_one_active_company' and i.indisunique and i.indisvalid and i.indpred is not null;
  if total<>1 then raise exception 'Missing single-active-company constraint'; end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls))
    then raise exception 'Client test roles bypass RLS'; end if;
  raise notice 'Catalog checks passed: RLS, grants, private functions, indexes and nonprivileged roles';
end $$;
rollback;
