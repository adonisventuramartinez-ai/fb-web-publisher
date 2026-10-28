# v3.2 — qué se encontró y qué se arregló

## 🔴 Crítico
| Hallazgo | Arreglo |
|---|---|
| El zip traía `.env.local` y `.env.production` con un `FB_APP_SECRET` real (y `next build` los leía). | Eliminados. **Tú debes rotar el App Secret** (README, paso 1). |
| `next build` **fallaba** sin las variables `NEXT_PUBLIC_SUPABASE_*` (cliente creado al importar el módulo). Rompía deploys de preview y el primer deploy. | `lib/supabaseClient.ts` ahora se crea al usarse, con error claro. |
| Rutas `/api/acceso/*` y `lib/adminAuth.ts` seguían en el código aunque el README decía que se habían borrado (aceptaban un `fb_id` sin verificar; el admin usaba comparación no segura). | Eliminados. |
| Rechazar a un usuario **no tenía efecto** hasta 7 días (la cookie firmada seguía valiendo). | `sesionDe()` comprueba en la BD (caché de 60 s) que siga aprobado. |
| Si la función moría a mitad de un post, el rescate **volvía a publicar en las páginas que ya habían salido** (el resultado solo se guardaba al final). | Cada página se guarda en cuanto termina. |
| Las series diarias/semanales **se desplazaban** con cada reintento (5/20/60 min) para siempre. | Columna `fecha_original`; la serie parte de ella. Cubierto por prueba. |

## 🟠 Importante
- **Storage se llenaba sin fin** (videos de posts ya publicados o cancelados, subidas abandonadas) → con 1 GB gratis las subidas acaban fallando. Limpieza automática cada 6 h (`lib/limpieza.ts`).
- **Cron secuencial**: un reel lento retrasaba todo. Ahora 3 posts en paralelo y presupuesto de tiempo.
- **Token de Facebook vencido**: el cron marca la cuenta y el panel muestra "⚠️ Token vencido". Nuevo botón **🔄 Reconectar**: guarda el token nuevo y refresca los tokens de página de todas las publicaciones pendientes, sin borrar la cuenta (antes la única salida era borrarla, lo que cancelaba sus posts).
- Sin freno a la fuerza bruta en `/api/admin/login` ni en `/api/auth/session` → `rl_hit()` en Postgres (8 intentos / 15 min por IP en admin).
- Base de datos **no reproducible**: faltaban las migraciones 001-003. `005` crea todo lo que usa el código, con índices para el cron (`posts_pendientes_idx`…), RLS sin políticas, permisos revocados a `anon`/`authenticated` y bucket **privado**.
- Next 14.2 con 11 avisos de `npm audit` (1 crítico, 7 altos) → Next 15.5 + React 19 (quedan 2, del PostCSS interno de Next, solo en build). Quitadas `tailwindcss/postcss/autoprefixer` (no se usaban).
- Next 15: `params` asíncrono en las 4 rutas dinámicas.
- El diálogo de eliminar cuenta decía que *no* cancelaba posts, pero sí los cancela → texto corregido.

## 🟢 Automatización nueva
- **`006_pg_cron_opcional.sql`**: Supabase dispara el cron cada minuto (adiós cron-job.org) y purga tablas a diario.
- **`/admin → Diagnóstico`**: variables, formato de claves, tablas/columnas, bucket privado, latido del cron, App de Facebook, cuentas con token vencido, GitHub.
- **`/api/health`** público y mínimo para monitores.
- **Worker de TikTok**: además del despacho, corre cada 30 min; un primer paso de segundos comprueba si hay trabajo y, si no, no instala nada.
- **CI** (`.github/workflows/ci.yml`): typecheck + pruebas + build en cada push/PR.
- **27 pruebas** (planificador/reintentos, series, lote, TikTok, sesiones firmadas, cifrado).
- `vercel.json` con cron diario de respaldo (Hobby no permite más).
- Subida de archivos del lote en paralelo (3 a la vez). El botón de Facebook genera el `state` al hacer clic (antes lo hacía en cada render).

## ⚠️ Lo que NO se pudo verificar / queda pendiente
1. **No se probó contra tu Supabase ni Facebook reales.** Verificado: typecheck, 27 pruebas, `next build`, arranque del servidor contra un Supabase simulado (auth, CSRF, cron, diagnóstico), y la migración 005 en un Postgres real (dos ejecuciones seguidas). Después de desplegar, usa `/admin → Diagnóstico` y publica un post de prueba.
2. **"Publicar ahora" con tipo Reel** (`lib/facebook.ts`) usa `/videos?is_reel=true`, que no es la API oficial de Reels (sí lo es el camino del cron, `video_reels`). Si falla o sale como video normal, usa **Programar** para reels (sale en ≤ 1 min). No lo cambié porque no puedo probarlo contra Facebook.
3. El token de usuario de Facebook se guarda en `localStorage` (lo necesita "Publicar ahora" para subir directo desde el navegador). Es el punto más sensible del diseño actual; mover "Publicar ahora" al mismo flujo del cron lo eliminaría.
4. Si la función muere justo entre que Facebook acepta el post y se guarda el resultado, puede haber un duplicado (la ventana es de milisegundos; Graph API no ofrece idempotencia).
5. Sin cabecera `Content-Security-Policy` (Next necesita scripts inline; hay que hacerlo con nonces y probarlo en navegador).
6. 2 avisos de `npm audit` quedan hasta migrar a Next 16.
7. Las variables `NEXT_PUBLIC_*` se fijan al compilar: tras cambiarlas hay que hacer redeploy.

---

# v3.3 — Instagram + descarga sin marca de agua

- **Instagram**: acepta `instagram.com/reel/…`, `/reels/…`, `/p/…`, `/tv/…`, `/share/reel/…` y `/usuario/reel/…` (`lib/tiktok.ts`, con pruebas). Los perfiles de Instagram no se listan (exigen sesión): pega cada reel.
- **Sin marca de agua** (`worker/sin_marca.py`): TikTok → **ssstik.io**; Instagram → **sssinstagram.com** (Chromium sin pantalla vía Playwright). Si el sitio falla, cambia o bloquea la IP de GitHub, el worker **cae solo a yt-dlp** (que en TikTok también suele traer la versión sin marca). `SIN_MARCA=off` (Variables del repo → Actions) lo desactiva.
- Secret opcional `INSTAGRAM_COOKIES` (cookies.txt Netscape) por si Instagram pide iniciar sesión.
- Se eliminaron `.env.local` y `.env.production` del zip (traían `FB_APP_SECRET`: **rótalo**).
- **No verificado contra los sitios reales** (el entorno de desarrollo no puede alcanzarlos): ssstik se probó contra un servidor simulado; sssinstagram usa heurísticas genéricas. Revisa el log de Actions en la primera importación: dirá `descargado sin marca con …` o `sss falló: … se usa yt-dlp`.

## v3.4 — botón "🚀 Publicar ahora" en los videos importados
- Cada video "Listo" (TikTok o Instagram) tiene botón **Publicar ahora**: elige cuenta/páginas, Reel o Video, **título sugerido** (6 opciones) y **hashtags sugeridos** (5 preseleccionados, tocables), con vista previa del texto (`components/PublicarYa.tsx`, `lib/sugerencias.ts`, con pruebas).
- `POST /api/schedule/lote` acepta `ahora: true` (un solo item): crea el post y **dispara `/api/cron` desde el servidor**, así sale en segundos aunque el cron externo esté parado (requiere `CRON_SECRET` en Vercel).
- Las sugerencias salen de la descripción original + etiquetas de alcance; **no consultan tendencias en vivo**.
