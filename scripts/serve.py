#!/usr/bin/env python3
"""Anteprima locale: genera i dati webcam e serve la cartella ``site``.

Esempio:
    python3 scripts/serve.py --port 8000
"""

import argparse
import functools
import http.server
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
DATA = SITE / "data" / "webcams.json"


def refresh_data():
    print("Aggiornamento dati webcam…")
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "update_webcams.py"), "--out", str(DATA)],
        check=False,
    )
    if result.returncode != 0:
        if DATA.is_file():
            print(
                "Aggiornamento fallito: uso il file dati già presente.",
                file=sys.stderr,
            )
        else:
            raise SystemExit(
                "Aggiornamento fallito e nessun dato locale disponibile."
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Non riscaricare i dati all'avvio",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Apri automaticamente il browser",
    )
    args = parser.parse_args()

    if not args.no_refresh:
        refresh_data()

    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(SITE)
    )
    server = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    url = f"http://{args.host}:{args.port}/"
    print(f"Anteprima su {url} (Ctrl+C per uscire)")
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nChiuso.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
