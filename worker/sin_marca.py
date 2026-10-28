"""Descarga de videos SIN marca de agua usando ssstik.io (TikTok) y sssinstagram.com (Instagram).

Estos sitios no tienen API oficial: se imitan los pasos que hace su propia página web.
Pueden cambiar sin avisar, así que TODO está pensado para fallar "en limpio": cada función
lanza `SinMarcaError` y el worker cae automáticamente a yt-dlp. Nada de aquí rompe una importación.
"""
import html
import os
import re
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

try:  # curl_cffi imita la huella TLS de Chrome (ssstik está detrás de Cloudflare)
    from curl_cffi import requests as http
    IMPERSONAR = {"impersonate": "chrome"}
except Exception:  # pragma: no cover
    import requests as http
    IMPERSONAR = {}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
MIN_BYTES = 20 * 1024  # menos que esto no es un video, es una página de error


class SinMarcaError(Exception):
    pass


def plataforma_de(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if host.endswith("instagram.com") or host == "instagr.am":
        return "instagram"
    return "tiktok"


# ------------------------------------------------------------------ utilidades
def _texto(fragmento: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", fragmento or "")).strip()


def _atributo(tag: str, nombre: str) -> Optional[str]:
    m = re.search(rf"""\b{nombre}\s*=\s*(?:"([^"]*)"|'([^']*)')""", tag, re.I)
    return html.unescape(m.group(1) or m.group(2)) if m else None


def _guardar_video(url: str, destino: Path, referer: str):
    """Descarga `url` a `destino` y comprueba que de verdad es un MP4/MOV (firma 'ftyp')."""
    with http.get(
        url, headers={"User-Agent": UA, "Referer": referer}, stream=True, timeout=120,
        allow_redirects=True, **IMPERSONAR
    ) as r:
        if r.status_code >= 300:
            raise SinMarcaError(f"el enlace de descarga respondió {r.status_code}")
        total = 0
        with open(destino, "wb") as f:
            for trozo in r.iter_content(chunk_size=1 << 20):
                if trozo:
                    f.write(trozo)
                    total += len(trozo)
    if total < MIN_BYTES:
        raise SinMarcaError(f"el archivo descargado es demasiado pequeño ({total} bytes)")
    with open(destino, "rb") as f:
        cabecera = f.read(16)
    if b"ftyp" not in cabecera and b"\x1aE\xdf\xa3" not in cabecera:  # mp4/mov o webm/mkv
        raise SinMarcaError("el archivo descargado no es un video")


# ------------------------------------------------------------------ TikTok · ssstik.io
SSSTIK = "https://ssstik.io"


def ssstik(url: str, carpeta: Path) -> dict:
    """Devuelve {'archivo': Path, 'titulo', 'autor'} con el video de TikTok sin marca de agua."""
    s = http.Session(**IMPERSONAR) if IMPERSONAR else http.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    try:
        pagina = s.get(f"{SSSTIK}/en", timeout=30)
    except Exception as e:
        raise SinMarcaError(f"no se pudo abrir ssstik.io: {e}")
    if pagina.status_code != 200:
        raise SinMarcaError(f"ssstik.io respondió {pagina.status_code} (¿bloquea la IP de GitHub?)")

    # La página trae el token de un solo uso:  include-vals="tt:'XXXX',ts:1700000000"
    cuerpo = pagina.text
    token = re.search(r"""\btt\s*:\s*['"]([^'"]+)['"]""", cuerpo)
    ts = re.search(r"""\bts\s*:\s*['"]?(\d{6,})""", cuerpo)
    ruta = re.search(r"""hx-post\s*=\s*["']([^"']+)["']""", cuerpo)
    if not token:
        raise SinMarcaError("ssstik.io cambió su formulario (no se encontró el token)")

    datos = {"id": url, "locale": "en", "tt": token.group(1)}
    if ts:
        datos["ts"] = ts.group(1)
    post = urljoin(SSSTIK, ruta.group(1) if ruta else "/abc?url=dl")
    try:
        r = s.post(
            post, data=datos, timeout=60,
            headers={
                "HX-Request": "true", "HX-Target": "target", "HX-Current-URL": f"{SSSTIK}/en",
                "Origin": SSSTIK, "Referer": f"{SSSTIK}/en",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
        )
    except Exception as e:
        raise SinMarcaError(f"falló la petición a ssstik.io: {e}")
    if r.status_code != 200:
        raise SinMarcaError(f"ssstik.io respondió {r.status_code} al procesar el enlace")

    cuerpo = r.text
    enlaces = re.findall(r"<a\b[^>]*>", cuerpo, re.I)
    sin_marca = [
        _atributo(t, "href") for t in enlaces
        if "without_watermark" in (_atributo(t, "class") or "") and _atributo(t, "href")
    ]
    if not sin_marca:  # plan B: el primer enlace de descarga que no sea música ni la propia web
        sin_marca = [
            h for h in (_atributo(t, "href") for t in enlaces)
            if h and h.startswith("http") and "ssstik.io" not in h and "music" not in h.lower()
        ]
    if not sin_marca:
        aviso = _texto(re.sub(r"(?is)<script.*?</script>", "", cuerpo))[:160]
        raise SinMarcaError(f"ssstik.io no devolvió enlace de descarga ({aviso or 'respuesta vacía'})")

    m_t = re.search(r"""<p[^>]*class\s*=\s*["'][^"']*maintext[^"']*["'][^>]*>(.*?)</p>""", cuerpo, re.I | re.S)
    m_a = re.search(r"<h2[^>]*>(.*?)</h2>", cuerpo, re.I | re.S)
    destino = carpeta / "sss_tiktok.mp4"
    _guardar_video(sin_marca[0], destino, f"{SSSTIK}/en")
    return {
        "archivo": destino,
        "titulo": _texto(m_t.group(1)) if m_t else "",
        "autor": _texto(m_a.group(1)).lstrip("@") if m_a else "",
    }


# ------------------------------------------------------------------ Instagram · sssinstagram.com
# Se prueban en orden; SSSINSTA_URLS (separadas por coma) permite cambiarlas sin tocar el código.
SSSINSTA_SITIOS = [u.strip() for u in os.environ.get("SSSINSTA_URLS", "https://www.sssgram.com/sssinstagram/,https://sssinstagram.com/es").split(",") if u.strip()]
SSSINSTA = SSSINSTA_SITIOS[0]


def _sssinstagram_sitio(url: str, carpeta: Path, sitio: str) -> dict:
    """Pega el enlace en sssinstagram.com con un Chromium sin pantalla (Playwright) y baja el video.

    Se usa un navegador real porque el sitio firma sus peticiones con JavaScript. Si Playwright
    no está instalado o el sitio cambia, lanza SinMarcaError y el worker usa yt-dlp.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        raise SinMarcaError("Playwright no está instalado en el worker")

    videos: list[str] = []
    enlaces_pagina: list[str] = []
    try:
        with sync_playwright() as p:
            nav = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"])
            ctx = nav.new_context(user_agent=UA, viewport={"width": 1280, "height": 900})
            pag = ctx.new_page()

            def al_responder(resp):  # cualquier respuesta de video (por si el enlace va por XHR)
                try:
                    if "video/" in (resp.headers.get("content-type") or "") and resp.url not in videos:
                        videos.append(resp.url)
                except Exception:
                    pass

            pag.on("response", al_responder)
            pag.goto(sitio, wait_until="domcontentloaded", timeout=45_000)
            pag.wait_for_timeout(4000)  # deja pasar la verificación de Cloudflare si es automática
            for txt in ("Accept", "Agree", "Consent", "Aceptar", "OK"):  # aviso de cookies
                try:
                    pag.get_by_role("button", name=re.compile(rf"^{txt}", re.I)).first.click(timeout=800)
                    break
                except Exception:
                    pass
            caja = pag.locator("input[type=text]:visible, input[type=url]:visible, input[name=url]:visible, input:not([type=hidden]):visible").first
            try:
                caja.wait_for(state="visible", timeout=25_000)
            except Exception:
                titulo = (pag.title() or "")[:60]
                cuerpo = re.sub(r"\s+", " ", pag.inner_text("body") or "")[:140]
                raise SinMarcaError(f"no apareció el formulario; la página mostró: «{titulo}» {cuerpo}")
            caja.fill(url)
            boton = pag.locator("button[type=submit], form button, button:has-text('Download'), button:has-text('Descargar')").first
            boton.click(timeout=10_000)

            limite = time.time() + 40
            while time.time() < limite and not enlaces_pagina:
                pag.wait_for_timeout(1500)
                for a in pag.locator("a[href^='http']").all():
                    try:
                        href = a.get_attribute("href") or ""
                        txt = (a.inner_text() or "").lower()
                    except Exception:
                        continue
                    host_sitio = (urlparse(sitio).hostname or "").replace("www.", "")
                    propio = host_sitio and host_sitio in (urlparse(href).hostname or "")
                    if not propio and ("download" in txt or "descargar" in txt or re.search(r"\.mp4|/v/t\d|cdninstagram|fbcdn|ssscdn", href)):
                        if href not in enlaces_pagina:
                            enlaces_pagina.append(href)
            nav.close()
    except SinMarcaError:
        raise
    except Exception as e:
        raise SinMarcaError(f"falló el navegador en sssinstagram.com: {str(e)[:150]}")

    candidatos = enlaces_pagina + [v for v in videos if v not in enlaces_pagina]
    if not candidatos:
        raise SinMarcaError("sssinstagram.com no devolvió ningún enlace (¿cambió la página o bloqueó la IP?)")

    ultimo: Optional[Exception] = None
    for c in candidatos[:4]:
        destino = carpeta / "sss_instagram.mp4"
        try:
            _guardar_video(c, destino, sitio)
            return {"archivo": destino, "titulo": "", "autor": ""}
        except SinMarcaError as e:  # probablemente era una imagen o un enlace de audio: se prueba el siguiente
            ultimo = e
    raise SinMarcaError(str(ultimo) if ultimo else "ningún enlace era un video")


def sssinstagram(url: str, carpeta: Path) -> dict:
    errores = []
    for sitio in SSSINSTA_SITIOS:
        try:
            return _sssinstagram_sitio(url, carpeta, sitio)
        except SinMarcaError as e:
            errores.append(f"{urlparse(sitio).hostname}: {e}")
    raise SinMarcaError(" | ".join(errores)[:300])


def descargar_sin_marca(url: str, carpeta: Path) -> dict:
    return (sssinstagram if plataforma_de(url) == "instagram" else ssstik)(url, carpeta)
