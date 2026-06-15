# Orakon Trip — Setup ambiente (Supabase, Groq, deploy)

Guida operativa alle variabili d'ambiente e ai servizi. Riflette la configurazione live.

## Variabili d'ambiente

| Variabile | Dove | Obbligatoria | Default / Note |
| --- | --- | --- | --- |
| `PORT` | API | no | Render la inietta; l'app legge `process.env.PORT` |
| `HOST` | API | no | `0.0.0.0` |
| `DATABASE_URL` | API (Render) | no* | Se assente → store in-memory. *Necessaria per persistenza |
| `GROQ_API_KEY` | API (Render) | no | Attiva l'intent LLM (priorità su Anthropic) |
| `GROQ_MODEL` | API (Render) | no | `llama-3.3-70b-versatile` |
| `ANTHROPIC_API_KEY` | API (Render) | no | Fallback LLM (richiede credito API) |
| `VITE_API_URL` | Dashboard (Vercel) | no | Default → API Render |

## 1) Supabase (persistenza)

1. **supabase.com → New project** (`orakon-trip`). Salva la **Database password**.
2. **Connect → Connection string → Session pooler** (IPv4, porta `5432`).
   > ⚠️ Per host serverless/persistenti come Render serve **IPv4**: usa **Session pooler**, NON "Direct connection" (IPv6) né "Transaction pooler" (IPv6 di default).
3. Copia la stringa e sostituisci `[YOUR-PASSWORD]` con la password vera:
   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
4. Render → servizio `orakon-trip-api` → **Environment** → aggiungi `DATABASE_URL` = quella stringa → **Save**.
5. Lo **schema viene creato in automatico** all'avvio (`agents/src/schema.sql`): tabelle `trips`, `devices`, `events`. Nessuna migrazione manuale.
6. Verifica: `GET /health` deve mostrare `"store":"postgres"`.

## 2) Groq (intent LLM)

1. **console.groq.com → API Keys → Create API Key** (`gsk_...`).
2. Render → Environment → `GROQ_API_KEY` = la chiave → **Save**.
3. Verifica: `GET /health` → `intent.provider: "groq"`; `POST /intent` → `source: "llm"`.

## 3) Deploy

- **API (Render)**: Blueprint `render.yaml`, auto-deploy su push a `main`.
- **Dashboard (Vercel)**: progetto `orakon-trip-dashboard`, **Root Directory = `dashboard`**, auto-deploy su push a `main`. Imposta `VITE_API_URL` = URL Render (Environment, Production).

## 4) Smoke test

```bash
curl https://orakon-trip-api.onrender.com/health
# { "ok": true, "store": "postgres", "intent": { "provider": "groq", "model": "..." } }

curl -X POST https://orakon-trip-api.onrender.com/intent \
  -H 'content-type: application/json' \
  -d '{"text":"batteria scarica, trova un charger"}'
# { "action": "charger", "source": "llm", ... }
```
