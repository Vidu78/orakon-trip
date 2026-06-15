# Orakon Trip — Deployment checklist

Checklist riutilizzabile per ogni rilascio. Spuntare in ordine.

## Pre-deploy
- [ ] `npm install` pulito (Node ≥ 20)
- [ ] `npm test` verde (3 scenari: start | pause | resume+charger)
- [ ] `npm run typecheck` pulito (agents, api, device-sim)
- [ ] `npm run build --workspace @orakon/dashboard` ok
- [ ] Nessun segreto committato (`.env` in `.gitignore`)

## Backend (API → Render)
- [ ] `render.yaml` aggiornato (env, start command, healthCheckPath `/health`)
- [ ] Env su Render: `DATABASE_URL`, `GROQ_API_KEY` (+ opzionali)
- [ ] Push su `main` → Render auto-deploy
- [ ] `GET /health` → `store: postgres`, `intent.provider: groq`
- [ ] `POST /trips` / `PUT` / `GET /audit` rispondono

## Frontend (Dashboard → Vercel)
- [ ] Root Directory = `dashboard`
- [ ] Env `VITE_API_URL` = URL API (Production)
- [ ] Push su `main` → Vercel auto-deploy (`source=git` → READY)
- [ ] Dashboard live HTTP 200; service worker aggiornato (hard refresh se serve)

## Database (Supabase)
- [ ] Connection string = **Session pooler** (IPv4)
- [ ] Tabelle `trips` / `devices` / `events` presenti (auto-create)

## Smoke test end-to-end
- [ ] Crea trip dal form → vedi ID + status
- [ ] `npm run sim:vehicle` (ORAKON_API_URL = Render) → telemetria sulla mappa
- [ ] `npm run sim:watch` → ETA + richiesta charger (`source: llm`)
- [ ] Comando pause/resume/redirect riflesso su tutti i device

## Post-deploy
- [ ] Keep-alive GitHub Action verde (run recente)
- [ ] Log Render senza errori `[intent]` / DB
- [ ] (Opzionale) tag/release nel repo

## Rollback
- [ ] Vercel: **Promote** un deployment precedente (Deployments → ⋯ → Promote)
- [ ] Render: **Rollback** all'ultimo deploy sano (Events → Rollback)
- [ ] DB: nessuna migrazione distruttiva (schema additivo / `if not exists`)
