-- Budget App sync schema, second migration. Run once on the household's
-- Supabase AFTER 20260823_sync_records.sql (SQL editor in Studio, or psql).
-- Safe to re-run.
--
-- 1. sync_push clamps a client's updated_at to the server's clock plus five
--    minutes of tolerance. Newest-edit-wins had no upper bound, so a phone whose
--    clock sat in the future stamped rows the other phone could never edit or
--    delete again until real time caught up (audit SEC-2).
-- 2. sync_now() tells a device the server's clock, so it can correct the stamps
--    it sends instead of pushing wrong ones (audit SEC-2).

create or replace function public.sync_push(rows jsonb) returns setof public.records
language plpgsql as $$
begin
  insert into public.records (household_id, collection, id, data, updated_at, deleted, device_id)
  select r.household_id, r.collection, r.id, r.data,
         least(r.updated_at, clock_timestamp() + interval '5 minutes'),
         coalesce(r.deleted, false), r.device_id
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

create or replace function public.sync_now() returns timestamptz
language sql as $$ select clock_timestamp() $$;

grant execute on function public.sync_push(jsonb) to anon;
grant execute on function public.sync_now() to anon;
