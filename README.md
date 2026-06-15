# Orakon Trip — MVP

**Trip continuity across devices.** A trip starts in the **car**, follows you to your **smartwatch**, and lands on your **laptop** — all sharing one live state. The car streams telemetry, the watch shows ETA/battery and asks for actions, and the dashboard renders the map and drives controls. Any device that joins late instantly receives the current snapshot, so the trip never "restarts".

- **REST** for CRUD (`/trips`, `/devices`, `/intent`, `/audit`)
- **WebSocket** (Socket.io) for realtime telemetry + state fan-out
- **Postgres** (Supabase-ready) for state + an immutable audit log — or zero-config **in-memory** when no `DATABASE_URL` is set
- **Claude** (Haiku) turns natural language into an action (`route` / `pause` / `charger`), with a keyword fallback so it runs without an API key

TypeScript strict, ESM, minimal dependencies, runnable in one `npm install`.

---

## Quickstart

```bash
npm install           # installs all workspaces
cp .env.example .env  # optional — defaults work out of the box

npm test              # 3 scenarios: start | pause | resume + charger

# Terminal 1 — API + realtime server (http://localhost:4000)
npm run dev:api

# Terminal 2 — SvelteKit dashboard PWA (http://localhost:5173)
npm run dev:dashboard
```

> No `DATABASE_URL` → in-memory store. No `ANTHROPIC_API_KEY` → keyword intent classifier. Both are optional; the whole stack runs with neither.

`npm run dev` starts the API **and** dashboard together (tmux split panes if available, otherwise interleaved in one terminal).

## Demo flow (cross-device continuity)

Open the dashboard at <http://localhost:5173>, then in three more terminals:

```bash
npm run sim:vehicle           # car: streams gps / battery / speed
npm run sim:watch             # watch: shows ETA, asks for a charger after ~8s
npm run sim:dashboard         # laptop: observes the live trip
```

All sims share the trip id `demo-trip` — whichever starts first creates it, the rest join the trip already in progress (that's the continuity). Then drive the trip from any device:

```bash
npm run sim:dashboard -- pause      # pause the trip
npm run sim:dashboard -- resume     # resume
npm run sim:dashboard -- redirect   # mark redirected
# …or click Pause / Resume / Redirect in the web dashboard
```

Watch the car pause/resume, the watch update its ETA, and the dashboard map track the vehicle — all in sync. Every change lands in the audit log: `curl "http://localhost:4000/audit?tripId=demo-trip"`.

## With Postgres (Supabase-ready)

```bash
npm run db:up                                       # local Postgres via Docker
export DATABASE_URL=postgres://orakon:orakon@localhost:5432/orakon
npm run dev:api                                     # now persists to Postgres
```

Or run the full stack (Postgres + API) in containers:

```bash
npm run stack:up   # docker compose -f scripts/docker-compose.yml up --build
```

For **Supabase**: set `DATABASE_URL` to the connection string from *Project Settings → Database*. The schema ([`agents/src/schema.sql`](agents/src/schema.sql)) is created automatically on boot.

## API

| Method | Path                | Body / Query                                   | Description                                   |
| ------ | ------------------- | ---------------------------------------------- | --------------------------------------------- |
| `POST` | `/trips`            | `{ id?, start, end, route?, batteryEst? }`     | Create a trip (status starts `running`)       |
| `GET`  | `/trips/:id`        | —                                              | Trip state **+** its event list               |
| `PUT`  | `/trips/:id`        | `{ status }` (`running\|paused\|redirected\|completed`) | Update trip state                    |
| `POST` | `/devices`          | `{ type, capabilities? }` (`car\|watch\|laptop`) | Register a device                           |
| `POST` | `/intent`           | `{ text, deviceId?, tripId? }`                 | NL → `{ action: route\|pause\|charger, reason, target?, source }` |
| `GET`  | `/audit`            | `?tripId=`                                     | Immutable event log for a trip                |
| `GET`  | `/health`           | —                                              | `{ ok, store }`                               |

```bash
curl -X POST localhost:4000/trips -H 'content-type: application/json' \
  -d '{"id":"demo-trip","start":{"lat":45.46,"lng":9.19},"end":{"lat":41.9,"lng":12.5},"batteryEst":80}'

curl -X POST localhost:4000/intent -H 'content-type: application/json' \
  -d '{"text":"battery is low, find a charger","tripId":"demo-trip"}'
# → { "action": "charger", "reason": "...", "source": "fallback" }
```

### WebSocket events

Client → server: `trip:join`, `telemetry`, `trip:control`, `device:action`
Server → client: `trip:snapshot` (join state), `trip:state`, `telemetry`, `devices:update`, `intent:suggestion`, `device:action`

## Project layout

```
orakon-trip/
├─ api/          Fastify REST + Socket.io server, LLM intent, tests
├─ agents/       Agent core: trip state store (Postgres/in-memory), session manager, sync channel
├─ device-sim/   WebSocket simulators: vehicle · smartwatch · dashboard
├─ dashboard/    SvelteKit PWA (Leaflet map, live state, controls)
└─ scripts/      dev.sh · docker-compose.yml
```

## Tech stack

Fastify 5 · Socket.io 4 · Postgres (`pg`) / Supabase · `@anthropic-ai/sdk` (Claude Haiku) · SvelteKit 2 + Svelte 5 · Leaflet · TypeScript (strict, ESM) · `tsx` · Node ≥ 20.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how continuity works end to end.

## Tests

```bash
npm test   # node --test via tsx, in-memory store, no network/DB/API key
```

Three scenarios: **start** (create trip + audit), **pause** (state update), **resume + charger** (resume then NL intent → `charger`).

## License

MIT © 2026 Vincenzo Durante
