# Orakon Trip — One Pager

**Tagline:** la continuità del viaggio su ogni schermo. Auto → smartwatch → laptop, un solo stato condiviso in tempo reale.

## Problema
Il viaggio oggi è frammentato tra dispositivi: navigatore in auto, notifiche sul telefono/orologio, pianificazione sul laptop. Cambiando schermo lo stato si perde, le azioni si ripetono, l'esperienza si rompe — un problema acuito dai veicoli elettrici (ricarica, autonomia, deviazioni).

## Soluzione
Orakon Trip mantiene **un unico stato di viaggio vivo** su tutti i dispositivi: ogni device che si collega riceve subito lo snapshot corrente e prosegue senza ripartire. Comandi in linguaggio naturale ("trova una colonnina") vengono tradotti in azioni.

## Come funziona
- **Realtime broker** (WebSocket) che sincronizza telemetria e stato tra auto, orologio e dashboard.
- **Continuità cross-device**: snapshot allo join (nessun "ricomincia da capo").
- **Intent LLM**: linguaggio naturale → azione (`route` / `pause` / `charger`).
- **Audit append-only**: ogni evento del viaggio è tracciato e ricostruibile.

## Stato (MVP live)
- Dashboard PWA: https://orakon-trip-dashboard.vercel.app
- API: https://orakon-trip-api.onrender.com
- Stack in produzione, persistenza su Postgres, intent LLM attivo, deploy automatico.
- 3 scenari end-to-end verificati (start | pause | resume+charger) + telemetria realtime.

## Mercato (perché ora)
- Crescita EV e connected car in EU → bisogno di esperienze cross-device su ricarica/autonomia.
- Diffusione wearable + multi-device come abitudine d'uso.
- *(Inserire dati TAM/SAM/SOM con fonti — placeholder da validare.)*

## Modello di business (ipotesi)
- **B2B2C / white-label** per OEM automotive, app di mobilità, reti di ricarica (licenza/API).
- **SaaS** per flotte (continuità + audit dei viaggi).
- *(Da validare con i primi design partner.)*

## Trazione & roadmap
- MVP funzionante e deployato (questo documento).
- Prossimi 30 giorni: design partner, demo verticale ricarica EV, primi colloqui investitori (vedi `roadmap-30-days-tasks.csv`).

## Team & Ask
- Founder: Vincenzo Durante. **Cerchiamo un co-founder tecnico/commerciale** (vedi `cofounder-search-list.md`).
- **Ask:** *(pre-seed €___ / design partner / accesso a un OEM o rete di ricarica — completare.)*

📧 vincedurante@gmail.com
