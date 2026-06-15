# Orakon Trip — Diagramma sequenziale

Flusso end-to-end di un viaggio con continuità cross-device e intent LLM.

## Scenario: avvio viaggio → telemetria → richiesta charger → handoff

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard PWA
    participant A as API (Render)
    participant DB as Supabase
    participant G as Groq LLM
    participant C as Vehicle Sim
    participant W as Smartwatch Sim

    D->>A: POST /trips {start, end, batteryEst}
    A->>DB: insert trips + event trip.created
    A-->>D: 201 {id, status: running}
    D->>A: WS trip:join {tripId}
    A-->>D: trip:snapshot {trip, telemetry, devices}

    C->>A: WS telemetry {gps, battery, speed}
    A->>DB: append event telemetry
    A-->>D: WS telemetry (broadcast)
    A-->>W: WS telemetry (broadcast)
    W-->>W: calcola ETA + batteria

    W->>A: POST /intent {text: "batteria scarica, trova un charger"}
    A->>G: chat/completions (JSON mode)
    G-->>A: {action: charger, reason}
    A->>DB: append event intent
    A-->>D: WS intent:suggestion {action: charger}
    A-->>W: WS intent:suggestion {action: charger}

    D->>A: PUT /trips/{id} {status: paused}
    A->>DB: update trips + event trip.updated
    A-->>C: WS trip:state {status: paused}
    A-->>W: WS trip:state {status: paused}
    Note over C,W: il veicolo smette di muoversi, il watch aggiorna lo stato
```

## Continuità (un device entra a viaggio in corso)

```mermaid
sequenceDiagram
    autonumber
    participant L as Laptop (entra dopo)
    participant A as API
    participant SM as SessionManager

    L->>A: WS trip:join {tripId}
    A->>SM: leggi ultimo stato + telemetria del trip
    SM-->>A: {trip, lastTelemetry}
    A-->>L: trip:snapshot (stato corrente, NON da zero)
    Note over L: il viaggio "continua" senza ripartire
```
