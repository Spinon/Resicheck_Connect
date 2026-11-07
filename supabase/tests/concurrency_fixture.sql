-- WARNING: PERSISTENT SYNTHETIC FIXTURE, COMMIT IS INTENTIONAL.
-- Run ONLY in the disposable Connect PostgreSQL cluster under output/postgres-rls.
-- NEVER run in a remote database, ResiCheck, or an existing user database.
-- The runner owns teardown of the ENTIRE disposable cluster after concurrency tests.
-- Requires postgres-auth-fixture.sql and the Connect foundation migration.
-- No credentials, real identities, CPF/CNPJ, medical records or external services.
-- User suffixes: 1 manager A, 2 manager B, 3 invited staff, 4 patient.
-- Both invitation tokens below are public synthetic fixture constants (34 chars).
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

insert into auth.users(id,email,role,aud,created_at,updated_at)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'connect-race-fixture-' || n || '@example.invalid',
  'authenticated', 'authenticated', now(), now()
from generate_series(1,4) n;

insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
select ('71000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  now(), now(), now()+interval '1 hour'
from generate_series(1,4) n;

insert into public.profiles(id,display_name)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Synthetic concurrent person ' || n
from generate_series(1,4) n;

insert into private.accounts(user_id,state)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'active'
from generate_series(1,4) n;
insert into private.account_identity(user_id)
select ('70000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
from generate_series(1,4) n;

insert into public.companies(id,name,address,phone) values
('72000000-0000-4000-8000-000000000001','Synthetic concurrency A','',''),
('72000000-0000-4000-8000-000000000002','Synthetic concurrency B','','');
insert into private.company_controls(company_id,state) values
('72000000-0000-4000-8000-000000000001','active'),
('72000000-0000-4000-8000-000000000002','active');

insert into public.memberships(company_id,user_id,role,state) values
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','manager','active'),
('72000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','manager','active'),
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004','patient','active');

insert into public.conversations(id,company_id,patient_id) values
('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004');

insert into private.staff_invitations(id,company_id,issuer_id,recipient_id,token_hash,expires_at) values
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
 '70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',
 sha256(convert_to('connect_fixture_token_A_0000000001','UTF8')),now()+interval '1 hour'),
('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002',
 '70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003',
 sha256(convert_to('connect_fixture_token_B_0000000001','UTF8')),now()+interval '1 hour');

commit;
