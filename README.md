# MAGDA

### Make Autostrade Great Damn Again

Vista a griglia delle webcam autostradali italiane, con filtro per direzione,
layout a schermo intero e ricerca di un percorso per vedere le telecamere lungo
il tragitto. È una pagina statica: nessun backend, nessuna API key, nessun
database.
Progetto non affiliato ad Autostrade per l'Italia.

Demo: <https://smartm0use.github.io/MAGDA/>

## Funzionalità

- Griglia 2×2, 3×3, 4×4, 5×5 o tutte le telecamere, con paginazione e rotazione
  automatica.
- Modalità video (MP4) o snapshot, con fallback automatico allo snapshot se il
  video non è disponibile.
- Ricerca di un percorso in tutta Italia: geocoding Photon (fallback
  Nominatim), routing OSRM e selezione delle webcam entro 1,5 km dal percorso,
  separate tra andata e ritorno.
- Stato, orario di aggiornamento e link profondi tramite query string.

## Avvio locale

Requisiti: Python 3.10+ (solo libreria standard) e un browser.

```bash
git clone https://github.com/smartm0use/MAGDA.git
cd MAGDA
python3 scripts/serve.py --open
```

Lo script scarica i dati e serve `site/` su `http://127.0.0.1:8000`.
Per evitare il download all'avvio: `python3 scripts/serve.py --no-refresh`.

In alternativa:

```bash
python3 scripts/update_webcams.py --out site/data/webcams.json
python3 -m http.server 8000 --directory site
```

## Deploy su GitHub Pages

Il repository include già il workflow. Per pubblicarlo su un fork:

1. Push del progetto sul branch `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Esegui manualmente il workflow **Deploy webcam viewer** (tab *Actions*) o
   attendi il prossimo push/schedule.

Non serve configurare secret. L'URL sarà
`https://<utente>.github.io/<nome-repo>/`.

## Licenza

- **Codice**: [MIT](LICENSE).
- **Contenuti webcam** (immagini, video, nomi e metadati della viabilità):
  non sono inclusi in questo repository e **non sono coperti dalla licenza
  MIT**. Restano dei rispettivi titolari, in primis Autostrade per l'Italia.

## Note legali e limiti d'uso

Questo è un progetto indipendente, senza alcun rapporto con Autostrade per
l'Italia, Società Autostrade o altri gestori. I marchi citati appartengono ai
rispettivi proprietari.

Le webcam in diretta sono mostrate tramite i loro URL pubblici. Lo sfondo
iniziale usa invece le immagini di esempio incluse, senza aggiornamenti
automatici né richieste ai server di Autostrade dal browser.

## Privacy

MAGDA non usa cookie di profilazione, analytics o account. Essendo una pagina
statica, il browser contatta direttamente i server di Autostrade per le immagini
e i video: il suo indirizzo IP è quindi visibile a quei server e può essere
associato ai contenuti richiesti. Il geocoding e il routing vengono inoltrati a
Photon/Nominatim e OSRM. L'informativa completa è in
[`site/privacy.html`](site/privacy.html).
