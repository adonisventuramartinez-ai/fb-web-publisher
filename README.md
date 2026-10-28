# Publicador Multi-Página de Facebook · v3.2

Next.js 15 + Supabase + Vercel. Publica fotos, videos y reels en varias páginas, ahora o programado, con
programación en lote, series recurrentes e importación desde TikTok e Instagram.

> **Qué cambió en la v3.2 → lee [`CAMBIOS.md`](./CAMBIOS.md).** Resumen: cron que no duplica ni se atasca,
> limpieza automática de Storage, diagnóstico en `/admin`, sesiones revocables, freno anti fuerza bruta,
> Next 15, CI y pruebas.

## Despliegue / actualización (en este orden)

1. **Rota tus secretos si alguna vez subiste `.env.local` / `.env.production` a GitHub o los compartiste**
   (el zip original traía el `FB_APP_SECRET`). developers.facebook.com → tu app → Configuración → Básica →
   *Restablecer* App Secret. Borra esos archivos del repo (ya están en `.gitignore`) y, si el repo es público,
   de su historial.
2. **Supabase → SQL Editor**: ejecuta `supabase/migrations/005_esquema_completo_y_automatizacion.sql`
   (es idempotente: se puede ejecutar sobre tu base actual sin perder datos). **Hazlo antes del deploy.**
3. **Vercel → Settings → Environment Variables**: ver `.env.example`. Después **Redeploy**.
4. **Cron** (elige uno; si pones los dos no pasa nada, el cron es idempotente):
   - **Recomendado, todo dentro de Supabase:** ejecuta `supabase/migrations/006_pg_cron_opcional.sql`
     (cambia tu dominio y tu `CRON_SECRET`). Dispara `/api/cron` cada minuto y hace mantenimiento diario.
   - **cron-job.org:** job a `https://TU-APP.vercel.app/api/cron` cada minuto con header
     `Authorization: Bearer <CRON_SECRET>`.
   - `vercel.json` ya incluye un cron diario como último recurso (el plan Hobby no permite más).
5. Abre **`/admin` → 🩺 Diagnóstico**: te dice qué falta (variables, tablas, bucket, cron, Facebook, GitHub).
6. Facebook Developers: la *Redirect URI* sigue siendo `https://TU-APP.vercel.app/api/auth/callback`.
7. *(Solo si usas TikTok)* Secrets del repo en GitHub: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (= la misma llave secreta que `SUPABASE_SECRET_KEY` de Vercel), opcional `TIKTOK_COOKIES`. Lee **[`ARREGLOS_CONEXIONES.md`](./ARREGLOS_CONEXIONES.md)** para el orden exacto y qué revisar si algo no conecta.

## Cómo funciona el cron

Cada minuto (`/api/cron`):

1. Rescata posts atascados en "publicando" (> 10 min).
2. Toma los vencidos y los **reclama de forma atómica** (nunca se publica dos veces aunque lleguen dos disparos a la vez).
3. Publica hasta 3 posts en paralelo; cada **página** se guarda en cuanto termina, así un reintento o un rescate solo repite las que faltan.
4. Reintentos con espera 5 → 20 → 60 min; los errores fatales (token vencido, permisos) no se reintentan y marcan la cuenta para reconectar.
5. Series diarias/semanales: la siguiente ocurrencia sale de la **fecha original** (los reintentos ya no la desplazan).
6. Cada 6 h borra de Storage los archivos que nada usa (ver `lib/limpieza.ts`; se apaga con `LIMPIEZA_STORAGE=off`).

## Notas

- Supabase **Free** limita cada archivo a 50 MB y 1 GB en total (por eso existe la limpieza automática).
  Para videos más grandes necesitas plan Pro y subir el límite en Storage → Settings.
- Con Vercel Hobby el cron nativo solo corre 1 vez al día; por eso se usa pg_cron o cron-job.org.
- El proyecto Free de Supabase se **pausa tras 7 días sin actividad**; el cron cada minuto lo mantiene despierto.
- `GET /api/health` (público, mínimo) sirve para un monitor de disponibilidad (UptimeRobot, etc.).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellena los valores
npm run dev
npm test                     # pruebas de la lógica (planificador, lote, sesión, cifrado, TikTok)
npm run typecheck
```
