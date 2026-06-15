# Orakon Trip — Flussi di errore

5 scenari di guasto con gestione, messaggio UI e tempo di recupero. Riflettono il comportamento reale del codice.

---

## 1. WebSocket drop (connessione realtime persa)

| Aspetto | Dettaglio |
| --- | --- |
| **Causa** | Rete instabile, sleep del server, riavvio API |
| **Handling** | `socket.io-client` riconnette in automatico (backoff). Al `connect` ri-emette `trip:join` → riceve `trip:snapshot` con lo stato corrente |
| **Messaggio UI** | Badge in alto a destra passa a **"offline"** (rosso), poi torna **"live"** (verde) |
| **Recovery** | ~1–5 s in rete normale; fino a ~50 s se l'API era in cold start |
| **Perdita dati** | Nessuna: lo stato è ricostruito dallo snapshot + audit |

## 2. API timeout / non raggiungibile

| Aspetto | Dettaglio |
| --- | --- |
| **Causa** | Cold start free tier, deploy in corso, sovraccarico |
| **Handling** | Dashboard: `fetch` in `try/catch`, la UI non crasha; il canale WS riempie i dati appena torna su. Simulatori: **warm-up** (`/health` in loop) + **retry** sulle POST (404/5xx transitori) |
| **Messaggio UI** | "offline" finché l'API non risponde; i dati compaiono dopo lo snapshot |
| **Recovery** | 30–50 s tipico cold start Render; poi immediato |
| **Perdita dati** | Nessuna su scritture confermate (la POST viene ritentata) |

## 3. Database fail (Supabase non raggiungibile / `DATABASE_URL` errato)

| Aspetto | Dettaglio |
| --- | --- |
| **Causa** | Credenziali errate, pooler giù, IPv6/IPv4 mismatch |
| **Handling** | All'avvio, se `DATABASE_URL` è assente → store **in-memory** (degrado controllato, niente crash). Se la stringa è errata, l'init fallisce e va diagnosticata (log Render); `/health` mostra `store` |
| **Messaggio UI** | Nessun errore visibile all'utente finale; l'app resta operativa (dati non persistiti) |
| **Recovery** | Immediato in-memory; persistenza ripristinata al fix di `DATABASE_URL` + redeploy |
| **Perdita dati** | Solo lo stato in-memory si azzera allo sleep |

## 4. LLM fail (Groq giù / quota / key errata)

| Aspetto | Dettaglio |
| --- | --- |
| **Causa** | Provider down, rate limit, chiave non valida, modello non disponibile |
| **Handling** | Router con priorità **Groq → Anthropic → classificatore keyword**. Ogni errore è loggato (`[intent] ...`) e si degrada al livello successivo |
| **Messaggio UI** | Nessun errore: `/intent` risponde comunque; `source` indica `llm` o `fallback` |
| **Recovery** | Immediato (fallback sincrono) |
| **Perdita dati** | Nessuna; al massimo classificazione meno raffinata |

## 5. Keep-alive fail (l'API si addormenta)

| Aspetto | Dettaglio |
| --- | --- |
| **Causa** | GitHub Action saltata/ritardata, free tier in sleep |
| **Handling** | Il prossimo accesso (utente o cron) risveglia il servizio; i client gestiscono il cold start (warm-up/retry, riconnessione WS) |
| **Messaggio UI** | Primo caricamento lento + "offline" temporaneo |
| **Recovery** | 30–50 s al primo hit |
| **Mitigazione** | Cron `*/10 min`; per zero-sleep: upgrade piano Render |

---

### Principio generale
Ogni dipendenza esterna (DB, LLM, realtime) ha un **fallback** o un **retry**: nessun guasto singolo manda in crash l'app, al massimo ne riduce le funzionalità in modo controllato.
