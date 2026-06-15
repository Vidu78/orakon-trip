# Orakon Trip — Pitch Deck (outline)

> Bozza in markdown, una slide per blocco (`---`). Importabile in Slidev/Marp/reveal.js. I dati con *(placeholder)* vanno validati.

---
## 1. Orakon Trip
La continuità del viaggio su ogni schermo.
*Auto → smartwatch → laptop, un solo stato in tempo reale.*

---
## 2. Problema
- Il viaggio è frammentato tra dispositivi.
- Cambiando schermo, lo stato si perde e le azioni si ripetono.
- Con gli EV il problema esplode: ricarica, autonomia, deviazioni.

---
## 3. Soluzione
- Un unico **stato di viaggio vivo**, condiviso in realtime.
- Ogni device che entra riceve lo **snapshot** e continua, non riparte.
- Comandi in **linguaggio naturale** → azioni.

---
## 4. Demo
- Crea trip dalla dashboard → ID + rotta sulla mappa.
- Vehicle invia telemetria → orologio e laptop si aggiornano live.
- "Batteria scarica, trova un charger" → intent → suggerimento su tutti i device.
- *(Link demo + video: vedi `demo-video-script.md`.)*

---
## 5. Perché ora
- Boom EV e connected car in EU.
- Multi-device come abitudine quotidiana.
- LLM economici e veloci abilitano l'interazione naturale.

---
## 6. Prodotto / Tecnologia
- Realtime broker (WebSocket) + continuità (SessionManager).
- Intent LLM con fallback robusto.
- Audit append-only.
- **Già live e deployato** (non vaporware).

---
## 7. Mercato
- TAM / SAM / SOM *(placeholder con fonti)*.
- Segmenti: OEM automotive, app mobilità, reti di ricarica, flotte.

---
## 8. Modello di business
- B2B2C / white-label (licenza + API).
- SaaS flotte.
- *(Pricing da validare con design partner.)*

---
## 9. Go-to-market
- 3–5 design partner nei prossimi 90 giorni.
- Verticale d'ingresso: **ricarica EV** (dolore acuto, ROI chiaro).
- Canali: acceleratori mobility EU, partnership OEM/charging.

---
## 10. Competizione
- Navigatori e app singole non sono cross-device-stateful.
- Differenziatore: **continuità realtime + intent**, white-label.
- *(Mappa competitor da completare.)*

---
## 11. Roadmap
- Q3: design partner + verticale ricarica.
- Q4: pilota con OEM/flotta, metriche d'uso.
- *(Vedi `roadmap-30-days-tasks.csv` per i primi 30 giorni.)*

---
## 12. Team & Ask
- Founder: Vincenzo Durante (+ co-founder in cerca).
- **Ask:** pre-seed €___ per team + 2 piloti. *(Completare.)*
- 📧 vincedurante@gmail.com
