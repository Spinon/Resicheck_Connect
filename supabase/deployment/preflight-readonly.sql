-- READ ONLY. Does not establish project identity, authorization or absence of real data.
-- Coordinator must select and verify ONLY the new Connect project before running this.
begin read only;
select jsonb_build_object(
  'server_version',current_setting('server_version'),
  'postgres_major_tested',current_setting('server_version_num')::int between 170000 and 179999,
  'auth_functions_present',to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null,
  'auth_sessions_columns_present',(select count(*)=3 from information_schema.columns
    where table_schema='auth' and table_name='sessions' and column_name in ('id','user_id','not_after')),
  'client_roles_nonprivileged',(select count(*)=2 and bool_and(not rolsuper and not rolbypassrls)
    from pg_roles where rolname in ('anon','authenticated')),
  'nonextension_objects',coalesce((
    select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','S','f')
      and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
  ),'[]'::jsonb),
  'nonextension_functions',coalesce((
    select jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
      and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
  ),'[]'::jsonb),
  'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion)) from pg_extension),
  'project_identity_verified_by_this_sql',false,
  'deployment_authorized_by_this_sql',false
) as connect_preflight;
commit;
