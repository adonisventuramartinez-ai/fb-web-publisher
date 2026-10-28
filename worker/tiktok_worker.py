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
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from yt_dlp import YoutubeDL

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sin_marca import SinMarcaError, descargar_sin_marca, plataforma_de  # noqa: E402


def _env(*nombres: str) -> str:
    """Primer valor definido entre varios nombres posibles, sin espacios ni comillas de más."""
    for n in nombres:
        v = os.environ.get(n, "").strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1].strip()
        if v:
            return v
    return ""


def _fallo_config(msg: str):
    print(f"::error::{msg}")  # aparece en rojo en la pestaña Actions de GitHub
    sys.exit(1)


# El mismo valor que SUPABASE_SECRET_KEY de Vercel. Se aceptan los tres nombres habituales
# para que el secret del repo no tenga que llamarse de una forma exacta.
SUPA = re.sub(r"/(rest|storage|auth)/v1/?$", "", _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/"), flags=re.I).rstrip("/")
KEY = _env("SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")
if not SUPA or not KEY:
    _fallo_config(
        "Faltan los secrets SUPABASE_URL y SUPABASE_SERVICE_KEY en GitHub "
        "(repo → Settings → Secrets and variables → Actions). SUPABASE_SERVICE_KEY = la misma llave "
        "SECRETA (sb_secret_… o service_role) que SUPABASE_SECRET_KEY en Vercel."
    )
if KEY.startswith("sb_publishable_"):
    _fallo_config("SUPABASE_SERVICE_KEY es la llave PÚBLICA (sb_publishable_…). Usa la SECRETA (sb_secret_…) de Supabase → Project Settings → API Keys.")
BUCKET = os.environ.get("BUCKET", "archivos-programados")
MAX_BYTES = int(os.environ.get("MAX_BYTES", str(50 * 1024 * 1024)))  # límite del plan gratuito
PERFIL_MAX = int(os.environ.get("PERFIL_MAX", "30"))
RESCATE_MIN = 20

# Solo TikTok e Instagram, también aquí (defensa en profundidad: la API ya lo valida)
URL_OK = re.compile(r"^https://((www\.|m\.|vm\.|vt\.)?tiktok\.com|(www\.|m\.)?instagram\.com|instagr\.am)/", re.I)
# Los perfiles solo se listan en TikTok (Instagram exige iniciar sesión)
URL_TIKTOK = re.compile(r"^https://(www\.|m\.|vm\.|vt\.)?tiktok\.com/", re.I)
# SIN_MARCA=off desactiva ssstik/sssinstagram y usa solo yt-dlp
USAR_SSS = os.environ.get("SIN_MARCA", "on").strip().lower() not in ("off", "0", "no", "false")

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


def error_amigable(exc: Exception, tipo: str = "video") -> str:
    m = limpiar(exc)
    bajo = m.lower()
    # Se quitan las URLs y los números largos (IDs de video) antes de buscar códigos HTTP:
    # antes un ID como 7234403... contenía "403"/"404" y el error se clasificaba mal.
    sin_ids = re.sub(r"https?://\S+|\d{6,}", " ", bajo)

    if "no such file" in bajo and ("ffprobe" in bajo or "ffmpeg" in bajo):
        return "Falta ffmpeg en el worker (el workflow debería instalarlo). Revisa el log en GitHub → Actions."
    if re.search(r"\bprivate\b", sin_ids):
        return "El video es privado." if tipo == "video" else "El perfil es privado."
    if any(x in sin_ids for x in ("unavailable", "removed", "deleted", "not found", "does not exist")) or re.search(r"\b404\b", sin_ids):
        return "El video ya no está disponible (borrado o con restricción de región)." if tipo == "video" else "No se encontró ese perfil."
    if any(x in sin_ids for x in ("captcha", "blocked", "too many requests", "rate limit", "forbidden")) or re.search(r"\b(403|429)\b", sin_ids):
        return "TikTok bloqueó temporalmente la descarga (suele pasar con las IP de GitHub). Reintenta en unos minutos o configura TIKTOK_COOKIES."
    if any(x in sin_ids for x in ("login required", "log in", "empty media response", "rate-limit", "cookies")) and "instagram" in bajo:
        return "Instagram pide iniciar sesión o bloqueó la IP del worker. Reintenta más tarde o crea el secret INSTAGRAM_COOKIES (cookies.txt de tu cuenta)."
    if any(x in sin_ids for x in ("unable to extract", "secondary user", "sigi_state", "user id")):
        if tipo == "perfil":
            return "No se pudo leer el perfil (TikTok lo bloquea a veces). Pega enlaces de videos sueltos o configura TIKTOK_COOKIES."
        return "No se pudo leer el video (TikTok cambió su web o bloqueó la petición). Reintenta; si sigue, actualiza yt-dlp o configura TIKTOK_COOKIES."
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
def opciones_base(carpeta: Path, url: str = "") -> dict:
    o = {
        "quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True,
        "socket_timeout": 30, "retries": 3, "fragment_retries": 3, "restrictfilenames": True,
        "outtmpl": str(carpeta / "%(id)s.%(ext)s"),
        "format": "b[vcodec^=h264]/b[vcodec^=avc]/b/bv*+ba",
        "merge_output_format": "mp4",
    }
    cookies = os.environ.get("INSTAGRAM_COOKIES" if plataforma_de(url) == "instagram" else "TIKTOK_COOKIES", "").strip()
    if cookies:
        f = carpeta / "cookies.txt"
        f.write_text(cookies, encoding="utf-8")
        o["cookiefile"] = str(f)
    return o


def procesar_perfil(job: dict):
    with tempfile.TemporaryDirectory() as t:
        o = opciones_base(Path(t), job["url"])
        o.update({"extract_flat": "in_playlist", "playlistend": PERFIL_MAX, "skip_download": True, "noplaylist": False})
        info = YoutubeDL(o).extract_info(job["url"], download=False) or {}
    videos = []
    for e in info.get("entries") or []:
        if not e:
            continue
        u = e.get("url") or e.get("webpage_url")
        if (not u or not URL_TIKTOK.match(u)) and e.get("id") and (e.get("uploader") or info.get("uploader")):
            u = f"https://www.tiktok.com/@{e.get('uploader') or info.get('uploader')}/video/{e['id']}"
        if u and URL_TIKTOK.match(u):
            titulo = limpiar(e.get("title") or e.get("description") or "")[:150]
            videos.append({"url": u, "titulo": titulo, "duracion": int(e.get("duration") or 0) or None})
    if not videos:
        raise RuntimeError("No se encontraron videos en ese perfil (¿es privado o TikTok lo bloqueó?).")
    actualizar(job["id"], {
        "estado": "listo", "videos": videos, "autor": info.get("uploader") or info.get("title"),
        "terminado_en": ahora(), "error": None,
    })


DETALLE_SSS: dict = {}  # id de importación -> por qué falló ssstik/sssinstagram (se muestra en el panel)


def obtener_video(job: dict, carpeta: Path):
    """Devuelve (archivo, info). Primero ssstik/sssinstagram (sin marca de agua); si fallan, yt-dlp."""
    # Instagram no lleva marca de agua: con cookies se va directo a yt-dlp (lo más fiable).
    if plataforma_de(job["url"]) == "instagram" and os.environ.get("INSTAGRAM_COOKIES", "").strip():
        usar_sss = False
    else:
        usar_sss = USAR_SSS
    if usar_sss:
        try:
            r = descargar_sin_marca(job["url"], carpeta)
            print(f"  descargado sin marca con {'sssinstagram' if plataforma_de(job['url']) == 'instagram' else 'ssstik'}")
            return r["archivo"], {"title": r.get("titulo"), "description": r.get("titulo"), "uploader": r.get("autor")}
        except SinMarcaError as e:
            print(f"  (sss falló: {limpiar(e)[:200]}; se usa yt-dlp)")
            DETALLE_SSS[job["id"]] = limpiar(e)[:160]
        except Exception as e:  # cualquier cosa rara de red/parseo: no debe tumbar la importación
            print(f"  (sss error inesperado: {limpiar(e)[:200]}; se usa yt-dlp)")
            DETALLE_SSS[job["id"]] = limpiar(e)[:160]

    for resto in carpeta.glob("sss_*"):  # restos de un intento fallido de sss
        resto.unlink(missing_ok=True)
    with YoutubeDL(opciones_base(carpeta, job["url"])) as ydl:
        info = ydl.extract_info(job["url"], download=True) or {}
    candidatos = [p for p in carpeta.iterdir() if p.suffix.lower() in (".mp4", ".mov", ".webm", ".mkv")]
    if not candidatos:
        raise RuntimeError("yt-dlp no produjo ningún archivo de video.")
    return max(candidatos, key=lambda p: p.stat().st_size), info


def procesar_video(job: dict):
    with tempfile.TemporaryDirectory() as t:
        carpeta = Path(t)
        bruto, info = obtener_video(job, carpeta)

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
            raise RuntimeError("Enlace no permitido (solo tiktok.com e instagram.com).")
        if job["tipo"] == "perfil" and not URL_TIKTOK.match(job["url"]):
            raise RuntimeError("Los perfiles solo se pueden listar en TikTok. En Instagram pega el enlace de cada reel.")
        (procesar_perfil if job["tipo"] == "perfil" else procesar_video)(job)
        print(f"[{job['id']}] listo")
    except Exception as e:
        print(f"[{job['id']}] ERROR: {limpiar(e)[:300]}")
        try:
            msg = error_amigable(e, job.get("tipo", "video"))
            if job["id"] in DETALLE_SSS:
                nombre = "sssinstagram" if plataforma_de(job["url"]) == "instagram" else "ssstik"
                msg += f" [Detalle {nombre}: {DETALLE_SSS[job['id']]}]"
            actualizar(job["id"], {"estado": "error", "error": msg[:500], "terminado_en": ahora()})
        except Exception as e2:
            print(f"[{job['id']}] no se pudo guardar el error: {e2}")


def comprobar_conexion():
    """Falla ya, con un mensaje claro, si la URL/llave de Supabase no sirven o falta la tabla."""
    try:
        r = requests.get(f"{SUPA}/rest/v1/importaciones", headers=HEADERS, params={"select": "id", "limit": "1"}, timeout=30)
    except requests.RequestException as e:
        _fallo_config(f"No se pudo conectar a Supabase ({SUPA}): {e}. Revisa el secret SUPABASE_URL.")
    if r.status_code in (401, 403):
        _fallo_config(
            f"Supabase rechazó la llave (HTTP {r.status_code}). SUPABASE_SERVICE_KEY debe ser la llave SECRETA "
            "(sb_secret_… o service_role), del MISMO proyecto que SUPABASE_URL. " + r.text[:150]
        )
    if r.status_code == 404 or (r.status_code >= 400 and "importaciones" in r.text):
        _fallo_config("La tabla `importaciones` no existe: ejecuta supabase/migrations/005_esquema_completo_y_automatizacion.sql en Supabase → SQL Editor.")
    if r.status_code >= 300:
        _fallo_config(f"Supabase respondió {r.status_code}: {r.text[:200]}")


def main():
    comprobar_conexion()
    rescatar()
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        print("::warning::ffmpeg/ffprobe no está instalado: los videos fallarán (los perfiles sí funcionan).")
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
