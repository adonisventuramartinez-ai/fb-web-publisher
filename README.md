# Publicador Multi-Página de Facebook · v3.1 (Paso 1)

Next.js + Supabase + Vercel. Publica fotos, videos y reels en varias páginas, ahora o programado.

## Qué cambió en el Paso 1

**Seguridad**
- Sesión firmada (cookie httpOnly) emitida solo tras verificar el token de Facebook **en el servidor**.
- `middleware.ts` protege todo `/api/*`; cada cuenta y publicación pertenece a su dueño.
- `/api/cron` exige `CRON_SECRET` (si no está configurado, queda cerrado).
- Se eliminaron `/api/acceso/*` (aceptaban un `fb_id` sin verificar).
- Anti-CSRF en el login OAuth (`state` verificado) y por origen en las peticiones que modifican datos.
- `next.config.js` ya no inyecta `FB_APP_SECRET` en el bundle. Cabeceras de seguridad añadidas.
- RLS activado en las tablas (ver SQL).

**Cron confiable**
- Reclamo atómico (no se publica dos veces aunque cron-job.org dispare dos ejecuciones).
- Rescata posts atascados en "publicando" (> 10 min).
- Facebook descarga el archivo desde una URL firmada: no se carga el video en la función.
- Reels con la API oficial (`video_reels`, 3 pasos).
- Resultado **por página**: un reintento solo repite las páginas que fallaron.
- Reintentos con espera (5 → 20 → 60 min); errores fatales (token vencido, permisos) no se reintentan.
- **Recurrencia real** (diaria / semanal), sin duplicados.
- Versión de la Graph API en un solo lugar (`lib/graph.ts`, variable `NEXT_PUBLIC_GRAPH_VERSION`).

## Despliegue del Paso 1 (en este orden)

1. **Regenera tu App Secret** en developers.facebook.com → tu app → Configuración → Básica. (El anterior iba dentro del zip que compartiste: considéralo expuesto.)
2. **Supabase → SQL Editor**: ejecuta `supabase/migrations/001_paso1_seguridad_y_cron.sql`.
   Al final del archivo hay dos líneas comentadas para asignarte como dueño de tus cuentas/posts existentes: descoméntalas con tu `fb_id`.
3. **Vercel → Settings → Environment Variables** (ver `.env.example`). Nuevas: `CRON_SECRET`, y opcionalmente `SESSION_SECRET`.
   Actualiza `FB_APP_SECRET` con el nuevo valor y haz **Redeploy**.
4. **cron-job.org**: edita el job para llamar a `https://TU-APP.vercel.app/api/cron` cada minuto y añade el header
   `Authorization: Bearer <tu CRON_SECRET>`.
5. En Facebook Developers, la Redirect URI sigue siendo `https://TU-APP.vercel.app/api/auth/callback`.
6. Borra el `.env.local` / `.env.production` viejos de tu repositorio de GitHub (y de su historial si el repo es público).

## Notas

- Supabase **Free** limita cada archivo a 50 MB. Para videos más grandes necesitas plan Pro y subir el límite en Storage → Settings.
- Con Vercel Hobby el cron nativo solo corre 1 vez al día; por eso se usa cron-job.org (gratis, cada minuto).
- Las publicaciones creadas antes de este paso no se verán hasta asignarles dueño (punto 2).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena los valores
npm run dev
```
