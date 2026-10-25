# v3.2.1 — conexiones Supabase ↔ GitHub ↔ Vercel y worker de TikTok

## Qué estaba roto

| # | Problema | Efecto | Arreglo |
|---|---|---|---|
| 1 | **Los dos workflows (`tiktok.yml` y `ci.yml`) eran YAML inválido** (un `:` sin comillas dentro de un `name:`). | GitHub los rechazaba: el worker de TikTok **nunca arrancaba** y el CI no corría. Los enlaces se quedaban en "En cola…" para siempre. | Nombres entre comillas; validado con un parser YAML. |
| 2 | `.env.local` y `.env.production` con el `FB_APP_SECRET` **real** dentro del zip. | Secreto expuesto. | Eliminados. **Rota el App Secret** (abajo). |
| 3 | Archivos que `CAMBIOS.md` dice eliminados seguían en el zip: `app/api/acceso/*` y `lib/adminAuth.ts` (aceptaban un `fb_id` sin verificar / comparación no segura). | Código muerto e inseguro. | Eliminados. |
| 4 | La llave de Supabase se llamaba distinto en cada sitio (`SUPABASE_SECRET_KEY` en Vercel, `SUPABASE_SERVICE_KEY` en GitHub). | Fácil poner una y olvidar la otra. | Worker y workflow aceptan `SUPABASE_SERVICE_KEY`, `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`. |
| 5 | **ffmpeg no está garantizado** en el runner de GitHub y el worker lo necesita. | Cada video fallaba con `No such file: ffprobe`. | El workflow lo instala si falta. |
| 6 | Errores de TikTok mal clasificados: un ID de video que contenía "403"/"404" se mostraba como "video borrado"; un fallo de un **video** decía "no se pudo leer el **perfil**". | Mensajes engañosos. | Se ignoran URLs/IDs al clasificar y el mensaje depende del tipo. |
| 7 | Valores pegados en Vercel/GitHub con espacio o salto de línea final, comillas, `https://…supabase.co/rest/v1/`, o `GITHUB_REPO` como URL completa. | 401/404 inexplicables; login de Facebook con "token de otra app". | `lib/env.ts` limpia todos los valores (Supabase, GitHub, Facebook, `CRON_SECRET`, `ADMIN_PASSWORD`). |
| 8 | Poner la llave **pública** (anon/publishable) donde va la secreta. | Todo falla con `permission denied` (la migración 005 revoca `anon`). | Error claro al arrancar, en el worker y en `/admin → Diagnóstico`. |
| 9 | El diagnóstico marcaba error si usabas `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nombre de la integración Supabase-Vercel). | Falso error. | Acepta ambos nombres. |
| 10 | El worker fallaba con un `KeyError` críptico si faltaba un secret o con la llave equivocada. | Había que adivinar. | Mensajes en rojo en GitHub Actions: llave rechazada, URL mala, tabla inexistente, falta de secrets. |

`/admin → Diagnóstico` ahora también comprueba: llave secreta de Supabase, que las dos URLs de Supabase sean del mismo proyecto, que `FB_APP_ID` = `NEXT_PUBLIC_FB_APP_ID`, que el token de GitHub vea el repo, que `GITHUB_BRANCH` sea la rama real, que el workflow exista en la raíz del repo y esté activo, **cómo terminó la última ejecución del worker** y si hay enlaces esperando demasiado.

## Orden para conectarlo todo

1. **Rota el App Secret de Facebook** (developers.facebook.com → tu app → Configuración → Básica → Restablecer). Si alguna vez subiste `.env.local`/`.env.production` a GitHub: `git rm --cached .env.local .env.production`, commit, y si el repo es público limpia el historial.
2. **Supabase → SQL Editor**: ejecuta `supabase/migrations/005_esquema_completo_y_automatizacion.sql`. En *Project Settings → API Keys* copia la **Project URL** y la llave **secreta** (`sb_secret_…`) y la pública.
3. **Vercel → Settings → Environment Variables** (después **Redeploy**; las `NEXT_PUBLIC_*` se fijan al compilar):
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `FB_APP_ID`, `FB_APP_SECRET` (el nuevo), `NEXT_PUBLIC_FB_APP_ID`, `ENCRYPTION_KEY`, `CRON_SECRET`, `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO`.
4. **GitHub**:
   - `.github/workflows/` debe estar en la **raíz** del repositorio (no dentro de una carpeta `fb-web-publisher-main/`).
   - Settings → Secrets and variables → Actions: `SUPABASE_URL` (igual que en Vercel) y `SUPABASE_SERVICE_KEY` (**el mismo valor** que `SUPABASE_SECRET_KEY` de Vercel).
   - `GITHUB_TOKEN` de Vercel: token *fine-grained* sobre ese único repo con **Actions: Read and write**.
   - La rama por defecto del repo debe coincidir con `GITHUB_BRANCH` (por defecto `main`).
   - Pestaña **Actions**: si aparece el aviso de habilitar workflows, acéptalo.
5. Abre **`/admin` → 🩺 Diagnóstico** y corrige lo que salga en rojo. Después importa un enlace en la pestaña TikTok.

## Límites que conviene saber

- TikTok bloquea con frecuencia las IP de GitHub Actions. Si ves "TikTok bloqueó temporalmente la descarga", reintenta más tarde o crea el secret `TIKTOK_COOKIES` (cookies.txt en formato Netscape de una cuenta tuya). Los perfiles completos fallan más que los enlaces sueltos.
- GitHub desactiva los workflows programados tras 60 días sin actividad en el repo; el diagnóstico lo avisa.
- La migración `006_pg_cron_opcional.sql` trae `TU-APP.vercel.app` y `PEGA_AQUI_TU_CRON_SECRET`: si se ejecuta sin cambiarlos, el cron nunca llega a tu app (el diagnóstico mostrará "Nunca se ha ejecutado").

## Qué se verificó y qué no

Verificado aquí: sintaxis y validez de ambos workflows (YAML + `bash -n` de sus scripts), 31 pruebas de lógica (27 anteriores + 4 nuevas), el worker contra un Supabase simulado (URL con `/rest/v1/` y comillas, llave pública, 401, tabla inexistente, clasificación de errores), y que los cambios de TypeScript no añaden errores de tipos respecto al original.

**No verificado:** `npm install`/`next build` (este entorno no tiene red), ni nada contra tu Supabase, GitHub, Vercel, Facebook o TikTok reales. Tras desplegar, el Diagnóstico y una importación de prueba son la comprobación definitiva.
