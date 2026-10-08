# Edit Canvas Free

Questo progetto è un editor web ispirato a Canva, con capacità di modificare PDF e disegnare liberamente.
È stato derivato da un precedente "PDF Editor Pro" e ampliato con strumenti innovativi (forme, esportazione PNG, gestore livelli base, ecc.).

## Funzionalità principali

- Modifica testi e immagini dei PDF
- Aggiungi, ridimensiona e sposta caselle di testo
- Disegna con penna, gomma, aggiungi forme (rettangoli, cerchi, linee)
- Pulsante per attivare una griglia di allineamento
- Pannello "Livelli" che mostra conteggi di testo/immagini/forme/disegni
- Pannello "Risorse" con elementi grafici pronti da trascinare
- Drag‑and‑drop di PDF e immagini; le immagini vengono convertite in PDF automaticamente
- Esporta la prima pagina come immagine PNG
- Pulsante "Cloud" per inviare il file a un endpoint (stub)
- Bottone placeholder per collaborazione in tempo reale
- Interfaccia "Canva style" con barra strumenti contestuale

## Ambiente di sviluppo

Il progetto utilizza Vite come server di sviluppo. Le librerie PDF sono ora installate tramite npm anziché dai CDN.

### Installazione

```bash
npm install
```
### Avviare il server di sviluppo

```bash
npm run dev
```

Apri il browser all'indirizzo mostrato (di solito http://localhost:5173) e modifica i file: la pagina si ricaricherà automaticamente.

### Build di produzione

```bash
npm run build
npm run serve   # per provare la versione ottimizzata
```

Buon lavoro con **Edit Canvas Free**! 😊