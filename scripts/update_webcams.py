#!/usr/bin/env python3
"""Scarica il JSON ufficiale delle webcam e genera un file statico normalizzato.

GitHub Pages serve solo file statici: questo script viene eseguito dalla
GitHub Action prima del deploy (e in locale con ``scripts/serve.py``) per
aggirare l'assenza di header CORS sul JSON di Autostrade.

Uso:
    python3 scripts/update_webcams.py --out site/data/webcams.json
"""

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UPSTREAM = "https://viabilita.autostrade.it/json/webcams.json"
UPSTREAM_REFERER = "https://viabilita.autostrade.it/it/viabilita/webcam"
VIDEO_BASE = "https://video.autostrade.it/video-mp4_hq/"
FRAME_BASE = "https://video.autostrade.it/video-frames/"
APP_UA = "MAGDA/1.0 (+https://github.com/smartm0use/MAGDA)"
MAX_FEED_BYTES = 10 * 1024 * 1024
MAX_CAMERAS = 10_000


def fetch_upstream(timeout=30):
    req = urllib.request.Request(
        UPSTREAM,
        headers={
            "User-Agent": APP_UA,
            "Accept": "application/json",
            "Referer": UPSTREAM_REFERER,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if int(resp.headers.get("Content-Length", "0")) > MAX_FEED_BYTES:
            raise ValueError("Il feed webcam supera il limite di dimensione")
        payload = resp.read(MAX_FEED_BYTES + 1)
        if len(payload) > MAX_FEED_BYTES:
            raise ValueError("Il feed webcam supera il limite di dimensione")
        return json.loads(payload)


def media_url(base, frames, key):
    item = (frames or {}).get(key) or {}
    path = item.get("t_url")
    return base + path if path else None


def first_frame(frames):
    keys = sorted(k for k in (frames or {}) if k.startswith("F_"))
    return media_url(FRAME_BASE, frames, keys[-1]) if keys else None


def normalize(cam):
    frames = cam.get("frames") or {}
    name = cam.get("t_des_pub") or cam.get("t_des") or "Webcam"
    matches = re.findall(r"\b(nord|sud|est|ovest)\b", name.lower())
    direction = matches[-1] if matches else ""

    captured = " ".join(
        part for part in (cam.get("t_day"), cam.get("t_time")) if part
    )

    return {
        "id": cam.get("c_uuid") or cam.get("c_mpr") or name,
        "name": name,
        "road": cam.get("t_des_str") or cam.get("c_str") or "",
        "code": cam.get("c_str") or "",
        "ramo": cam.get("t_des_ram") or cam.get("c_ram") or "",
        "km": cam.get("n_prg_km"),
        "direction": direction,
        "lat": cam.get("n_crd_lat"),
        "lon": cam.get("n_crd_lon"),
        "capturedAt": captured,
        "video": media_url(VIDEO_BASE, frames, "V"),
        "image": first_frame(frames),
        "thumb": media_url(FRAME_BASE, frames, "T"),
    }


def build_payload():
    data = fetch_upstream()
    webcams = data.get("webcams") if isinstance(data, dict) else None
    if not isinstance(webcams, list) or not webcams:
        raise ValueError("Il feed webcam è vuoto o non valido")
    if len(webcams) > MAX_CAMERAS:
        raise ValueError("Il feed supera il numero massimo di webcam")
    cameras = []
    for cam in webcams:
        if not isinstance(cam, dict):
            raise ValueError("Il feed contiene una webcam non valida")
        item = normalize(cam)
        if item["lat"] is None or item["lon"] is None:
            continue
        cameras.append(item)

    if not cameras:
        raise RuntimeError("La risposta di Autostrade non contiene webcam valide")

    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": UPSTREAM,
        "count": len(cameras),
        "cameras": cameras,
    }


def write_atomic(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=".webcams-", suffix=".json", dir=str(path.parent)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default="site/data/webcams.json",
        help="Percorso del file JSON da generare",
    )
    args = parser.parse_args()

    out = Path(args.out).resolve()
    try:
        payload = build_payload()
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"Errore nel download della sorgente: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 - CLI: qualunque errore e' fatale
        print(f"Errore inatteso: {exc}", file=sys.stderr)
        return 1

    write_atomic(out, payload)
    size_kb = out.stat().st_size / 1024
    print(f"Scritte {payload['count']} webcam in {out} ({size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
