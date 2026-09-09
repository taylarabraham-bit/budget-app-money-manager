-- Budget App sync schema. Run once on the household's Supabase (SQL editor
-- in Studio, or psql). Safe to re-run.
--
-- One generic table holds every synced row of every collection (members,
-- transactions, goals, bills, ...). The app keeps its own copy on each device
-- and mirrors changes here: newest edit wins per row, deletes are tombstones,
-- and `synced_at` (the server clock) lets devices pull only what changed.

create table if not exists public.records (
  household_id text        not null,
  collection   text        not null,
  id           text        not null,
  data         jsonb,
  updated_at   timestamptz not null,                 -- when the row was edited (the editing device's clock)
  deleted      boolean     not null default false,   -- tombstone
  device_id    text,
  synced_at    timestamptz not null default now(),   -- when the server last stored it (drives incremental pulls)
  primary key (household_id, collection, id)
);

create index if not exists records_household_synced_idx on public.records (household_id, synced_at);
create index if not exists records_households_idx on public.records (collection) where collection = 'household';

-- Stamp synced_at with the server clock on every write.
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- Upsert a batch: a row only changes when the incoming edit is newer than the
-- stored one. Returns every addressed row as the server now has it, so a
-- device whose edit lost learns the winning version straight away.
create or replace function public.sync_push(rows jsonb) returns setof public.records
language plpgsql as $$
begin
  insert into public.records (household_id, collection, id, data, updated_at, deleted, device_id)
  select r.household_id, r.collection, r.id, r.data, r.updated_at, coalesce(r.deleted, false), r.device_id
  from jsonb_to_recordset(rows)
    as r(household_id text, collection text, id text, data jsonb, updated_at timestamptz, deleted boolean, device_id text)
  on conflict (household_id, collection, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        device_id = excluded.device_id
    where excluded.updated_at > public.records.updated_at;

  return query
    select rec.*
    from public.records rec
    join jsonb_to_recordset(rows) as r(household_id text, collection text, id text)
      on r.household_id = rec.household_id and r.collection = rec.collection and r.id = rec.id;
end $$;

-- Access. There are no user accounts: the app talks to this server with the
-- anon key, and the Tailscale network is what keeps everyone else out.
-- NEVER expose this Supabase to the public internet with this policy in place.
alter table public.records enable row level security;
drop policy if exists records_anon_all on public.records;
create policy records_anon_all on public.records for all to anon using (true) with check (true);
grant usage on schema public to anon;
grant select, insert, update, delete on public.records to anon;
grant execute on function public.sync_push(jsonb) to anon;

-- Live updates: let Realtime stream changes to the other device.
alter table public.records replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
