#!/usr/bin/env python3
"""Worker de importación de TikTok (corre en GitHub Actions).

Lee las filas "pendiente" de la tabla `importaciones` en Supabase y:
  - tipo "perfil": lista los últimos videos del perfil y los guarda en `videos`.
  - tipo "video":  descarga con yt-dlp, asegura H.264/MP4, sube el archivo (y una
                   miniatura) a Supabase Storage y marca la fila como "listo".
Los errores quedan escritos en la fila para que el panel los muestre.
"""
import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from yt_dlp import YoutubeDL

SUPA = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
BUCKET = os.environ.get("BUCKET", "archivos-programados")
MAX_BYTES = int(os.environ.get("MAX_BYTES", str(50 * 1024 * 1024)))  # límite del plan gratuito
PERFIL_MAX = int(os.environ.get("PERFIL_MAX", "30"))
RESCATE_MIN = 20

# Solo TikTok, también aquí (defensa en profundidad: la API ya lo valida)
URL_OK = re.compile(r"^https://(www\.|m\.|vm\.|vt\.)?tiktok\.com/", re.I)

HEADERS = {"apikey": KEY} if KEY.startswith("sb_") else {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


# ---------------------------------------------------------------- Supabase REST
def ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def rest(metodo: str, ruta: str, **kw):
    r = requests.request(metodo, f"{SUPA}/rest/v1/{ruta}", headers={**HEADERS, **kw.pop("headers", {})}, timeout=30, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase {r.status_code}: {r.text[:200]}")
    return r.json() if r.text else None


def rescatar():
    limite = (datetime.now(timezone.utc) - timedelta(minutes=RESCATE_MIN)).isoformat()
    rest("PATCH", "importaciones", params={"estado": "eq.procesando", "iniciado_en": f"lt.{limite}"}, json={"estado": "pendiente"})


def pendientes():
    return rest("GET", "importaciones", params={"estado": "eq.pendiente", "order": "id.asc", "limit": "25", "select": "*"}) or []


def reclamar(id_: int) -> bool:
    filas = rest(
        "PATCH", "importaciones",
        params={"id": f"eq.{id_}", "estado": "eq.pendiente"},
        json={"estado": "procesando", "iniciado_en": ahora()},
        headers={"Prefer": "return=representation"},
    )
    return bool(filas)


def actualizar(id_: int, datos: dict):
    rest("PATCH", "importaciones", params={"id": f"eq.{id_}"}, json=datos)


def subir(local: Path, ruta: str, mime: str):
    with open(local, "rb") as f:
        r = requests.post(
            f"{SUPA}/storage/v1/object/{BUCKET}/{ruta}",
            headers={**HEADERS, "Content-Type": mime, "x-upsert": "true"},
            data=f, timeout=600,
        )
    if r.status_code >= 300:
        raise RuntimeError(f"Storage {r.status_code}: {r.text[:200]}")


# ---------------------------------------------------------------- errores legibles
def limpiar(msg: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", str(msg)).strip()


def error_amigable(exc: Exception) -> str:
    m = limpiar(exc)
    bajo = m.lower()
    if "private" in bajo:
        return "El video es privado."
    if any(x in bajo for x in ("unavailable", "removed", "deleted", "not found", "404")):
        return "El video ya no está disponible (borrado o con restricción de región)."
    if any(x in bajo for x in ("403", "429", "captcha", "blocked", "too many requests")):
        return "TikTok bloqueó temporalmente la descarga. Reintenta en unos minutos."
    if any(x in bajo for x in ("unable to extract", "secondary user", "sigi_state", "user id")):
        return "No se pudo leer el perfil (TikTok lo bloquea a veces). Pega enlaces de videos sueltos o configura TIKTOK_COOKIES."
    return m[:300] or "Error desconocido"


# ---------------------------------------------------------------- ffmpeg
def sonda(ruta: Path):
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=codec_name:format=duration", "-of", "json", str(ruta)],
        capture_output=True, text=True, timeout=60,
    )
    d = json.loads(p.stdout or "{}")
    codec = ((d.get("streams") or [{}])[0]).get("codec_name")
    dur = float((d.get("format") or {}).get("duration") or 0)
    return codec, dur


def ffmpeg(*args: str):
    p = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], capture_output=True, text=True, timeout=900)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg falló: {p.stderr[-200:]}")


def a_mp4_h264(origen: Path, destino: Path, crf: int = 23, ancho_max: int = 0):
    """Deja un MP4 H.264/AAC con 'faststart'. Si ya es H.264 y no hay que reducir, solo remux."""
    codec, _ = sonda(origen)
    if codec == "h264" and not ancho_max:
        ffmpeg("-i", str(origen), "-c", "copy", "-movflags", "+faststart", str(destino))
        return
    args = ["-i", str(origen), "-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    if ancho_max:
        args += ["-vf", f"scale='min({ancho_max},iw)':-2"]
    args += ["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(destino)]
    ffmpeg(*args)


# ---------------------------------------------------------------- yt-dlp
def opciones_base(carpeta: Path) -> dict:
    o = {
        "quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
        "socket_timeout": 30, "retries": 3, "fragment_retries": 3, "restrictfilenames": True,
        "outtmpl": str(carpeta / "%(id)s.%(ext)s"),
        "format": "b[vcodec^=h264]/b[vcodec^=avc]/b/bv*+ba",
        "merge_output_format": "mp4",
    }
    cookies = os.environ.get("TIKTOK_COOKIES", "").strip()
    if cookies:
        f = carpeta / "cookies.txt"
        f.write_text(cookies, encoding="utf-8")
        o["cookiefile"] = str(f)
    return o


def procesar_perfil(job: dict):
    with tempfile.TemporaryDirectory() as t:
        o = opciones_base(Path(t))
        o.update({"extract_flat": "in_playlist", "playlistend": PERFIL_MAX, "skip_download": True, "noplaylist": False})
        info = YoutubeDL(o).extract_info(job["url"], download=False) or {}
    videos = []
    for e in info.get("entries") or []:
        if not e:
            continue
        u = e.get("url") or e.get("webpage_url")
        if (not u or not URL_OK.match(u)) and e.get("id") and (e.get("uploader") or info.get("uploader")):
            u = f"https://www.tiktok.com/@{e.get('uploader') or info.get('uploader')}/video/{e['id']}"
        if u and URL_OK.match(u):
            titulo = limpiar(e.get("title") or e.get("description") or "")[:150]
            videos.append({"url": u, "titulo": titulo, "duracion": int(e.get("duration") or 0) or None})
    if not videos:
        raise RuntimeError("No se encontraron videos en ese perfil (¿es privado o TikTok lo bloqueó?).")
    actualizar(job["id"], {
        "estado": "listo", "videos": videos, "autor": info.get("uploader") or info.get("title"),
        "terminado_en": ahora(), "error": None,
    })


def procesar_video(job: dict):
    with tempfile.TemporaryDirectory() as t:
        carpeta = Path(t)
        with YoutubeDL(opciones_base(carpeta)) as ydl:
            info = ydl.extract_info(job["url"], download=True) or {}

        candidatos = [p for p in carpeta.iterdir() if p.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv")]
        if not candidatos:
            raise RuntimeError("yt-dlp no produjo ningún archivo de video.")
        bruto = max(candidatos, key=lambda p: p.stat().st_size)

        final = carpeta / "final.mp4"
        a_mp4_h264(bruto, final)
        if final.stat().st_size > MAX_BYTES:
            comprimido = carpeta / "comprimido.mp4"
            a_mp4_h264(final, comprimido, crf=28, ancho_max=720)
            final = comprimido
        if final.stat().st_size > MAX_BYTES:
            mb = final.stat().st_size / 1048576
            raise RuntimeError(f"El video pesa {mb:.0f} MB y el límite de Supabase es {MAX_BYTES // 1048576} MB (sube el límite en Storage → Settings o usa el plan Pro).")

        _, dur = sonda(final)
        dueno = job["propietario_fb_id"]
        base = f"{dueno}/{int(time.time() * 1000)}-{secrets.token_hex(6)}"
        ruta_video = f"{base}.mp4"
        subir(final, ruta_video, "video/mp4")

        ruta_mini = None
        try:
            mini = carpeta / "mini.jpg"
            ffmpeg("-ss", "1" if dur > 2 else "0", "-i", str(final), "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "5", str(mini))
            ruta_mini = f"{base}-mini.jpg"
            subir(mini, ruta_mini, "image/jpeg")
        except Exception as e:  # la miniatura es opcional
            print(f"  (sin miniatura: {limpiar(e)[:120]})")
            ruta_mini = None

        texto = limpiar(info.get("description") or info.get("title") or "")
        actualizar(job["id"], {
            "estado": "listo",
            "titulo": (texto.splitlines()[0] if texto else "")[:120] or None,
            "descripcion": texto[:2000] or None,
            "autor": limpiar(info.get("uploader") or info.get("creator") or "")[:80] or None,
            "duracion": int(dur) or None,
            "bytes": final.stat().st_size,
            "archivo_url": ruta_video,
            "miniatura_path": ruta_mini,
            "terminado_en": ahora(),
            "error": None,
        })


def procesar(job: dict):
    print(f"[{job['id']}] {job['tipo']} {job['url']}")
    try:
        if not URL_OK.match(job.get("url", "")):
            raise RuntimeError("Enlace no permitido (solo tiktok.com).")
        (procesar_perfil if job["tipo"] == "perfil" else procesar_video)(job)
        print(f"[{job['id']}] listo")
    except Exception as e:
        print(f"[{job['id']}] ERROR: {limpiar(e)[:300]}")
        try:
            actualizar(job["id"], {"estado": "error", "error": error_amigable(e), "terminado_en": ahora()})
        except Exception as e2:
            print(f"[{job['id']}] no se pudo guardar el error: {e2}")


def main():
    rescatar()
    total = 0
    for _ in range(8):  # varias rondas por si llegaron trabajos mientras se procesaba
        lista = pendientes()
        if not lista:
            break
        for job in lista:
            if reclamar(job["id"]):
                procesar(job)
                total += 1
    print(f"Terminado: {total} trabajo(s).")


if __name__ == "__main__":
    sys.exit(main())
