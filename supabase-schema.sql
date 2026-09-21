-- Execute no SQL Editor do projeto Supabase.
-- A aplicação usa apenas a chave publishable/anon; nunca use service_role no browser.

create table if not exists public.requests (
    id uuid primary key,
    student text not null check (char_length(trim(student)) > 0),
    task integer not null check (task between 1 and 15),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    first_attempt boolean not null default true,
    created_at timestamptz not null default now(),
    class_id text not null check (class_id in ('1 INFO 01', '1 INFO 02')),
    official_student text,
    nickname text
);

create table if not exists public.competition_state (
    class_id text primary key check (class_id in ('1 INFO 01', '1 INFO 02')),
    released_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    paused_at timestamptz,
    pause_accumulated_ms bigint default 0
);

-- Migração para instalações que já possuíam as tabelas antigas.
alter table public.requests add column if not exists class_id text;
alter table public.requests add column if not exists official_student text;
alter table public.requests add column if not exists nickname text;
update public.requests set class_id = '1 INFO 01' where class_id is null;
alter table public.requests alter column class_id set not null;
alter table public.requests drop constraint if exists requests_class_id_check;
alter table public.requests add constraint requests_class_id_check check (class_id in ('1 INFO 01', '1 INFO 02'));
alter table public.competition_state add column if not exists class_id text;
alter table public.competition_state add column if not exists released_at timestamptz;
alter table public.competition_state add column if not exists paused_at timestamptz;
alter table public.competition_state add column if not exists pause_accumulated_ms bigint default 0;
do $$
begin
    if exists (select 1 from information_schema.columns where table_name = 'competition_state' and column_name = 'id') then
        execute 'update public.competition_state set class_id = case when id = ''competition'' then ''1 INFO 01'' else id end where class_id is null';
    end if;
end $$;
alter table public.competition_state drop constraint if exists competition_state_pkey;
alter table public.competition_state drop column if exists id;
alter table public.competition_state add primary key (class_id);
alter table public.competition_state alter column class_id set not null;
alter table public.competition_state alter column started_at drop not null;
alter table public.competition_state drop constraint if exists competition_state_class_id_check;
alter table public.competition_state add constraint competition_state_class_id_check check (class_id in ('1 INFO 01', '1 INFO 02'));

alter table public.requests enable row level security;
alter table public.competition_state enable row level security;

drop policy if exists "anon can read requests" on public.requests;
create policy "anon can read requests"
    on public.requests for select to anon using (true);

drop policy if exists "anon can insert requests" on public.requests;
create policy "anon can insert requests"
    on public.requests for insert to anon with check (true);

drop policy if exists "anon can update requests" on public.requests;
create policy "anon can update requests"
    on public.requests for update to anon using (true) with check (true);

drop policy if exists "anon can delete requests" on public.requests;
create policy "anon can delete requests"
    on public.requests for delete to anon using (true);

drop policy if exists "anon can read competition state" on public.competition_state;
create policy "anon can read competition state"
    on public.competition_state for select to anon using (true);

drop policy if exists "anon can insert competition state" on public.competition_state;
create policy "anon can insert competition state"
    on public.competition_state for insert to anon with check (true);

drop policy if exists "anon can update competition state" on public.competition_state;
create policy "anon can update competition state"
    on public.competition_state for update to anon using (true) with check (true);

drop policy if exists "anon can delete competition state" on public.competition_state;
create policy "anon can delete competition state"
    on public.competition_state for delete to anon using (true);

alter table public.requests replica identity full;
alter table public.competition_state replica identity full;

do $$
begin
    if not exists (
        select 1 from pg_publication_rel
        where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
          and prrelid = 'public.requests'::regclass
    ) then
        alter publication supabase_realtime add table public.requests;
    end if;
    if not exists (
        select 1 from pg_publication_rel
        where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
          and prrelid = 'public.competition_state'::regclass
    ) then
        alter publication supabase_realtime add table public.competition_state;
    end if;
end $$;
