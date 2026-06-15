# Orakon Trip — One Pager (B2B Flotte EV)

> ⚠️ I numeri di mercato/pricing/ask sono **stime da validare**, non dati verificati. Sostituire con fonti reali prima dell'invio.

## Vision
**La centrale operativa realtime per piccole/medie flotte EV**: vedi dove sono i mezzi, se arriveranno con la carica, e coordini autista↔ufficio su un unico stato vivo.

## Problema (dolore B2B)
- **Coordinamento carica + posizione**: "chi mando? chi è vicino a una colonnina? arriverà con la carica?"
- **Passaggio campo↔ufficio**: l'operatore in ufficio non vede lo stato reale del driver sul telefono.
- **Compliance/tracciabilità**: serve un log eventi affidabile per flotte enterprise.

## Soluzione (mappata su ciò che è già live)
- **Stato realtime condiviso**: dashboard centrale + driver mobile, stessa verità.
- **Continuità cross-device**: cambi schermo, il viaggio continua (snapshot per chi si collega dopo).
- **Intent in linguaggio naturale**: "trova un charger" → azione (charger/pause/route).
- **Audit append-only**: tracciabilità eventi (valore B2B, quasi nullo in B2C).

## Mercato — *fonti reali (ACEA + report); regola: il SOM si valida in **veicoli***
> Il parco *veicoli* è il contesto; il TAM è il **software/telematica per flotte EV**. TAM/SAM possono essere top-down (mercato *potenziale*), ma il **SOM (cattura a 3 anni) è bottom-up sui veicoli reali**.
- **Contesto (ACEA 2026)**: ~31M van (LCV) in EU, ~0,8% BEV ≈ **~290k van elettrici** oggi, CAGR ~25%. *[ACEA]*
- **TAM (riferimento)**: **~$5,1B** — EV fleet telematics/software EU 2025. *[report — verificare citazione]*
- **SAM (potenziale a regime)**: **~$612M** (~12% del TAM) — quando il parco van EV commerciale sarà ampiamente elettrificato. *Oggi, bottom-up, il servibile è ~$75M (≈290k van × €240/anno).*
- **SOM 3 anni**: **~$1–3M ARR** (≈4–12k veicoli, ~2–4% dei van EV attuali) — ancorato ai veicoli. ⚠️ *$153M = ~640k veicoli > intero parco EU (~290k): non usabile come SOM a 3 anni.*
- **Anno 1 (pilot)**: 500–800 veicoli ≈ **€90–240k ARR**.

## Value proposition B2B
- **Efficienza operativa**: coordinamento carica + posizione + assegnazione mezzi.
- **Meno downtime**: ricarica pianificata, meno veicoli fuori servizio.
- **Compliance**: audit log per requisiti enterprise.
- **Decisione realtime**: cruscotto centrale allineato col driver.

## Tech (già in produzione)
- Dashboard: SvelteKit PWA (Leaflet, WebSocket) → Vercel
- API: Fastify (REST + Socket.io), Node 22 → Render
- DB: Supabase Postgres (Session pooler IPv4)
- LLM: Groq (`llama-3.3-70b`)

## Pricing (ipotesi — validare con pilot)
- **Base**: €15/veicolo/mese (dashboard + API)
- **Pro**: €25/veicolo/mese (+ API pubblica/SDK)
- **Enterprise**: custom (multi-tenant, SLA, integrazione ERP)

## Roadmap 30 giorni (validazione)
- 3–5 call con fleet manager (validare il dolore reale)
- 1–2 pilot con flotte piccole (proof of value)
- Demo video (3 scenari: start | pause | resume+charger)

## Team
- **Founder**: Vincenzo Durante — full-stack · Noci (Bari), Italia
- **Co-founder (in cerca)**: profilo BD/fleet con accesso a operatori di flotta *(vedi cofounder-search-list.md)*

## Ask
- **Pre-seed €750k** — 12 mesi di runway, team di 3 (founder + 2 co-founder). Impieghi: prodotto, 2 pilot, go-to-market. *[dettagliare la ripartizione]*

## Contatti
- Repo: https://github.com/Vidu78/orakon-trip
- Dashboard: https://orakon-trip-dashboard.vercel.app · API: https://orakon-trip-api.onrender.com
- Email: vincedurante@gmail.com
- LinkedIn: https://www.linkedin.com/in/vincenzo-durante-94706498/
