# MAGDA

### Make Autostrade Great Damn Again

Interfaccia a griglia per guardare le webcam autostradali italiane. Permette di
filtrare per autostrada e direzione, andare a schermo intero o calcolare un
percorso per vedere solo le telecamere lungo il tragitto. Gira tutto su pagina
statica, senza backend.

Demo: <https://smartm0use.github.io/MAGDA/>

## Cosa fa

- Griglia configurabile (da 2x2 a 5x5, oppure tutte assieme) con paginazione e
  rotazione automatica.
- Flusso video MP4 o singola immagine, con passaggio automatico allo snapshot se
  il video non carica.
- Calcolo del percorso (geocoding via Photon/Nominatim e routing OSRM) per
  mostrare le webcam nel raggio di 1,5 km dalla tratta, divise tra andata e
  ritorno.
- Layout, modalità e direzione salvati nella query string dell'URL. I percorsi
  si condividono tramite il pulsante "Copia link al percorso".

## Avvio in locale

Serve solo Python 3.10+ (libreria standard) e un browser.

```bash
git clone https://github.com/smartm0use/MAGDA.git
cd MAGDA
python3 scripts/serve.py --open
```

`serve.py` aggiorna l'elenco delle webcam e avvia un server su
`http://127.0.0.1:8000`. Se hai già i dati scaricati puoi saltare l'aggiornamento
con `python3 scripts/serve.py --no-refresh`, oppure fare i due passaggi a mano:

```bash
python3 scripts/update_webcams.py --out site/data/webcams.json
python3 -m http.server 8000 --directory site
```

## Deploy su GitHub Pages

C'è già il workflow configurato in `.github/workflows/`. Su un fork basta:

1. Fare push su `main`.
2. In **Settings > Pages > Build and deployment**, impostare **Source** su
   **GitHub Actions**.
3. Avviare il workflow **Deploy webcam viewer** dal tab *Actions* (o aspettare
   il primo giro schedulato).

## Note legali e privacy

Il codice di questo repository è sotto licenza [MIT](LICENSE).

Il progetto è amatoriale e non ha alcun legame con Autostrade per l'Italia o
altri gestori autostradali. Immagini, video e metadati delle webcam appartengono
ai rispettivi titolari. La pagina carica i flussi in diretta dagli URL pubblici
originali.

Lo sfondo iniziale usa invece le immagini di esempio incluse, senza aggiornamenti
automatici né richieste ai server di Autostrade dal browser.

Non ci sono cookie, tracker o analytics. Visto che i flussi vengono caricati
direttamente dal browser, i server di Autostrade (così come Photon, Nominatim e
OSRM quando si cerca un percorso) vedono l'indirizzo IP di chi visita la pagina.
I dettagli sono in [`site/privacy.html`](site/privacy.html).
