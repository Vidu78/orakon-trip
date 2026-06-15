# Demo video — script (~2 minuti)

Obiettivo: mostrare la **continuità cross-device** e l'**intent** in modo concreto. Tono: chiaro, niente gergo. Registrare a 1080p, schermo + voce.

| # | Durata | Cosa si vede | Voiceover |
| --- | --- | --- | --- |
| 1 | 0:00–0:12 | Logo + dashboard live | "Orakon Trip mantiene un unico viaggio vivo su tutti i tuoi schermi: auto, orologio, laptop." |
| 2 | 0:12–0:30 | Form "Create trip": Milano → Roma, crea | "Creo un viaggio dalla dashboard: parte subito, con rotta e stato condivisi." |
| 3 | 0:30–0:50 | Terminale: `npm run sim:vehicle`, l'auto si muove sulla mappa | "L'auto invia telemetria in tempo reale — posizione, batteria, velocità — e tutti i device si aggiornano insieme." |
| 4 | 0:50–1:10 | `npm run sim:watch`: ETA e batteria sull'orologio | "Lo smartwatch mostra l'ETA e l'autonomia, sempre in sync col resto." |
| 5 | 1:10–1:35 | Intent: "batteria scarica, trova un charger" → suggerimento su tutti i device | "Parlo naturale: 'trova una colonnina'. L'azione viene capita e proposta ovunque, all'istante." |
| 6 | 1:35–1:50 | Click Pause sulla dashboard → auto e orologio reagiscono | "Metto in pausa da uno schermo, e tutto il viaggio risponde. Un solo stato, zero ripartenze." |
| 7 | 1:50–2:00 | URL + call to action | "È già live. Provalo, o parliamo di un pilota: orakon-trip-dashboard.vercel.app." |

## Checklist registrazione
- [ ] Svegliare l'API prima (evitare cold start in video): aprire `/health`.
- [ ] Tre terminali pronti (vehicle, watch, dashboard) con `ORAKON_API_URL` = Render.
- [ ] Dashboard a schermo intero, zoom mappa su Italia.
- [ ] Tagliare i tempi morti; aggiungere sottotitoli.
- [ ] Export 1080p, < 60MB per email/deck.
