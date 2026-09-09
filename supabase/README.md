# Syncing with your own server

The app is offline-first: every phone or PC keeps its own copy of the household's data and mirrors changes to a Supabase server whenever it can reach it. There are no accounts and there is no hosted service behind the app. **Each household runs its own server**, on a PC or laptop at home, reachable only over that household's private [Tailscale](https://tailscale.com) network. The network is the lock.

Nothing in this repository points at any particular server. A fresh clone, and an APK built from it, connects to nothing until you give it your own server's URL and anon key: in the app's Settings, or in a gitignored `app/.env.local`. The two files in [`migrations/`](migrations/) are the only server-side code, and they are the same for everyone.

## What you need

- A PC or laptop at home that is on while the household uses the app. It does not need to be fast: the app keeps working offline and catches up when the server is back.
- [Docker](https://docs.docker.com/get-docker/) on that machine.
- [Tailscale](https://tailscale.com/download) on that machine and on every phone or PC that should sync, all signed in to the same tailnet. A personal tailnet is free for a household.

## 1. Host Supabase

Follow Supabase's own guide to [self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker). The short version:

```bash
git clone --depth 1 https://github.com/supabase/supabase
mkdir budget-supabase
cp -rf supabase/docker/* budget-supabase
cp supabase/docker/.env.example budget-supabase/.env
cd budget-supabase
```

Before the first start, **replace every placeholder secret in `.env`**. The sample values are public and identical for everyone who downloads them:

- `POSTGRES_PASSWORD`, `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` (the Studio login), `SECRET_KEY_BASE`, `VAULT_ENC_KEY`: long random strings.
- `JWT_SECRET`: a random string of at least 32 characters. Then **generate `ANON_KEY` and `SERVICE_ROLE_KEY` from it** with the key generator on the guide page linked above. The keys are tokens signed with that secret, so a key from anywhere else is refused.
- `SITE_URL`, `API_EXTERNAL_URL` and `SUPABASE_PUBLIC_URL`: the address the app will use. After step 2 that is `https://<machine>.<tailnet>.ts.net`.

Then:

```bash
docker compose pull
docker compose up -d
```

Studio (the dashboard) is at `http://localhost:8000` on that machine, behind the dashboard login. The API answers on the same port; Kong routes both.

## 2. Put it on your tailnet, and only there

1. Install Tailscale on the server machine and sign in. In the [admin console](https://login.tailscale.com/admin/dns), under DNS, make sure **MagicDNS** and **HTTPS certificates** are enabled.
2. Publish Kong to the tailnet over HTTPS:

   ```bash
   tailscale serve --bg --https=443 http://127.0.0.1:8000
   ```

   `tailscale serve status` shows the result: the server is now `https://<machine>.<tailnet>.ts.net`, reachable from your tailnet and nowhere else. The first request can take a few seconds while the certificate is issued.
3. Keep Docker off the LAN. Compose publishes ports on every interface by default, so anyone on your Wi-Fi could otherwise reach port 8000. In `docker-compose.yml`, prefix each published port with the loopback address (`"127.0.0.1:${KONG_HTTP_PORT}:8000/tcp"` and so on) and run `docker compose up -d` again. `tailscale serve` proxies from loopback, so nothing else needs the ports. Alternatively bind them to the machine's Tailscale IP (`100.x.y.z`). Do not forward router ports to the machine.
4. Pick a bland machine name. Tailscale's HTTPS certificates are logged publicly like any other certificate, so the name `<machine>.<tailnet>.ts.net` is not a secret; the tailnet membership is what keeps people out.

Without `tailscale serve`, the Tailscale IP plus the Kong port (`http://100.x.y.z:8000`) also works for the web app in a desktop browser. The packaged Android app refuses a plain `http://` server as mixed content, so phones need the `https://` address.

## 3. Apply the schema

Run both files, in order, once. Both are safe to run again later.

1. [`migrations/20260823_sync_records.sql`](migrations/20260823_sync_records.sql): the `records` table, the `sync_push` function and the access policy.
2. [`migrations/20260902_clock_clamp.sql`](migrations/20260902_clock_clamp.sql): stops a device with a wrong clock from freezing rows, and adds `sync_now()`, which the app uses to correct its own stamps. Until it is applied the app works as before and simply cannot read the server's clock.

Either paste each file into Studio's SQL editor and run it, or from the `budget-supabase` directory:

```bash
docker compose exec -T db psql -U postgres -d postgres < /path/to/repo/supabase/migrations/20260823_sync_records.sql
docker compose exec -T db psql -U postgres -d postgres < /path/to/repo/supabase/migrations/20260902_clock_clamp.sql
```

## 4. Give the app the two values

The app needs the server URL from step 2 and the `ANON_KEY` from your `.env`. Two ways to hand them over:

- **In the app**, on each device: avatar (top right) → **Settings** → **Sync between devices** → paste both → **Connect**. This is all a phone needs.
- **Baked into a build**: copy [`app/.env.example`](../app/.env.example) to `app/.env.local` and fill it in. `npm run dev` and every build made from that clone then connect automatically, and an APK built there carries the values as its default. `.env.local` is gitignored; never commit the real key.

## What must stay true (audit SEC-6)

The design is "anon key + tailnet": the key is not a secret worth much on its own, and the network is the lock. These are the things that would quietly undo that.

- **Never `tailscale funnel` on the server machine.** `serve` publishes to the tailnet; `funnel` is one flag away and publishes to the whole internet. Nothing in the stack would notice or log it, and the household would be world-readable and writable within minutes. Check with `tailscale serve status` and `tailscale funnel status` after touching either.
- **Add a Tailscale ACL** if anyone outside the household has a device on your tailnet: in the admin console under *Access controls*, allow only the household's devices to reach port 443 on the server. Every other tailnet node otherwise has full read, write and hard-delete on the household. A cheap second lock.
- **The anon key means full trust.** Anyone holding it on the tailnet can call the REST API directly: `DELETE` and `PATCH` bypass the newest-edit-wins rule of `sync_push`, `replica identity full` plus the open policy means an unfiltered Realtime subscriber receives every household's rows, and the `data` column has no size cap. Do not paste the key anywhere but the household's devices' Settings screens and `app/.env.local`.
- **If a device is lost:** rotate the key. In `.env` set a new `JWT_SECRET`, regenerate `ANON_KEY` and `SERVICE_ROLE_KEY` from it, `docker compose down && docker compose up -d`, then paste the new key into the remaining devices' Settings → Sync, update `app/.env.local` and rebuild the APK so the next install carries the new default.

## On each device

1. Install and sign in to Tailscale on the phone or PC so it can reach the server.
2. In the app: avatar (top right) → **Settings** → **Sync between devices** → paste the URL and the anon key → **Connect**.
3. The first device to connect uploads its household. The second device, if it is still showing the sample household, joins automatically and asks which of you it is. If both already hold real data you are asked which side wins.

Afterwards everything just syncs: changes made while away from the server queue up and go through the next time it is reachable. A Disconnect in Settings keeps them too, for the next connection to the same household.

## How it works (for later changes)

- Client: `app/src/sync/`. `engine.ts` holds the pure diff and merge rules, `transport-supabase.ts` is the only file that knows about Supabase, and `SyncProvider.tsx` watches every store, queues changes, and pulls on start, on focus, every 30 seconds and on Realtime events.
- Server: one table, `public.records(household_id, collection, id, data jsonb, updated_at, deleted, device_id, synced_at)`, the `sync_push(jsonb)` function and `sync_now()`. Newest `updated_at` wins per row, clamped to the server's clock plus five minutes; `synced_at` is the server clock used for incremental pulls. Each incremental pull starts one minute BEFORE its cursor (`PULL_OVERLAP_MS`): `synced_at` is stamped inside the writer's transaction but the row is visible only at commit, so a pull that lands in between would otherwise skip those rows for good (audit SYN-1). Merges are idempotent, so the repeats are harmless.
- A device that learns its clock is more than three minutes off the server's stamps its changes in server time from then on (`sync_now()`), and shows a warning.
- Realtime (instant updates between devices) is on by default in the self-hosted stack. If it is disabled the app still syncs every 30 seconds and whenever it comes to the foreground.
- Adding a collection later: add its key to `COLLECTIONS` in `app/src/sync/types.ts`, map its store in `SyncProvider.tsx`, and bump `GUARD_VERSION` there. No server change is needed, but older builds drop rows of collections (or shapes) they do not know while their cursor moves on. The bumped tag makes every device re-pull from the start once it updates (audit SYN-3).
