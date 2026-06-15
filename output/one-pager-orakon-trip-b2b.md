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

## Mercato — *tutte STIME da validare con fonti*
> Distinzione cruciale: il **mercato dei veicoli** (e-LCV) è il *contesto*, non il tuo TAM. Il TAM di Orakon è la **spesa software** di gestione flotte.
- **Contesto / tailwind (veicoli e-LCV EU)**: USD 7.5B (2023) → 29.1B (2029), CAGR ~25%. *[fonte]* — **NON è il TAM del SaaS**.
- **TAM software (bottom-up)**: **~$650M** = ~2,5M veicoli commerciali EV in flotte EU × €20/veicolo/mese × 12. *[STIMA — verificare il n° veicoli con fonte: report fleet telematics EU]*
- **SAM**: ~$78M (Italia + EU sud, ~12% del TAM).
- **SOM 3 anni**: ~$19,5M (3% del TAM) ≈ **~80k veicoli serviti** — obiettivo ambizioso.
- **Anno 1 (pilot)**: 500–800 veicoli ≈ **€90–240k ARR** — il punto di partenza, *non* il SOM.

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
- **Founder**: Vincenzo Durante — full-stack
- **Co-founder (in cerca)**: profilo BD/fleet con accesso a operatori di flotta *(vedi cofounder-search-list.md)*

## Ask
- **Pre-seed €750k** — 12 mesi di runway, team di 3 (founder + 2 co-founder). Impieghi: prodotto, 2 pilot, go-to-market. *[dettagliare la ripartizione]*

## Contatti
- Repo: https://github.com/Vidu78/orakon-trip
- Dashboard: https://orakon-trip-dashboard.vercel.app · API: https://orakon-trip-api.onrender.com
- Email: vincedurante@gmail.com
