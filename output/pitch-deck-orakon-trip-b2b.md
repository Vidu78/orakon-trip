# Orakon Trip — Pitch Deck (B2B Flotte EV)

> ⚠️ Numeri = **stime da validare**, non verificate. Una slide per blocco (`---`). Importabile in Slidev/Marp.

---
## 1. Orakon Trip
La **centrale operativa realtime** per piccole/medie flotte EV.
*Dashboard centrale ↔ driver mobile: un unico stato vivo.*

---
## 2. Problema (B2B)
- Coordinare **carica + posizione**: "chi mando? chi è vicino a una colonnina?"
- L'ufficio non vede lo **stato reale** del driver in tempo reale.
- Serve **audit/compliance** per flotte enterprise.

---
## 3. Soluzione
- Stato realtime condiviso (ufficio + driver, stessa verità).
- Continuità cross-device (cambi schermo, il viaggio continua).
- Intent naturale ("trova un charger" → azione).
- Audit append-only.

---
## 4. Demo (già live)
- Crea trip dalla dashboard → driver mobile in sync.
- Telemetria realtime → posizione/batteria su tutti i device.
- "Batteria scarica, trova un charger" → suggerimento istantaneo.
- *Link: orakon-trip-dashboard.vercel.app · video: demo-video-script.md*

---
## 5. Mercato *(stime da validare)*
- **Contesto** (veicoli e-LCV EU): $7.5B → $29.1B (2023–29), CAGR ~25% *[fonte]* — tailwind, non TAM.
- **TAM software (bottom-up)**: ~$650M (≈2,5M veicoli EV flotta EU × €20/mese × 12).
- **SAM**: ~$78M (12%). **SOM 3 anni**: ~$19,5M (3% → ~80k veicoli).
- **Anno 1 (pilot)**: 500–800 veicoli ≈ €90–240k ARR.

---
## 6. Perché ora
- Elettrificazione flotte → ansia autonomia/ricarica diventa un problema operativo.
- LLM economici abilitano l'interazione naturale (Groq, costo ~0).

---
## 7. Prodotto / Tech
- SvelteKit PWA · Fastify + Socket.io · Supabase · Groq.
- **Già live e deployato** (non vaporware), auto-deploy attivo.

---
## 8. Value B2B
- Efficienza operativa · meno downtime · compliance · decisioni realtime.

---
## 9. Business model
- SaaS **€/veicolo/mese** — Base €15 / Pro €25 (+API/SDK) / Enterprise custom. *[validare con pilot]*

---
## 10. Go-to-market
- Wedge: flotte EV **last-mile / field service** piccole-medie.
- 3–5 call fleet manager → 1–2 pilot → referenze → scale.

---
## 11. Roadmap
- 30 gg: validazione + pilot.
- 90 gg: 2–3 flotte referenziate, pricing validato.
- Fase 2: **API pubbliche/SDK** per integratori (B2B2C/B2B2B).

---
## 12. Team & Ask
- Founder: Vincenzo Durante (full-stack). Co-founder BD/fleet in cerca.
- **Ask: pre-seed €750k** (12 mesi runway, team 3) — prodotto + 2 pilot + GTM.
- 📧 vincedurante@gmail.com · github.com/Vidu78/orakon-trip
