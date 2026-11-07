-- PostgreSQL-only fallback fixture. NOT Supabase Auth, JWT verification or production schema.
-- Apply only inside the disposable loopback cluster created by scripts/test-postgres-local.ps1.
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb
);
create table auth.sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz, updated_at timestamptz, not_after timestamptz
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub','')::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
revoke all on auth.users,auth.sessions from public,anon,authenticated;
