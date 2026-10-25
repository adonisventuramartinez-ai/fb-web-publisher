-- =====================================================================
-- 006 · OPCIONAL — que Supabase dispare el cron él mismo (adiós cron-job.org)
--
-- Usa dos extensiones de Supabase:  pg_cron (programador) + pg_net (HTTP).
-- Cada minuto llama a  https://fb-web-publisher.vercel.app/api/cron  con el CRON_SECRET.
--
-- ANTES de ejecutar, cambia las dos líneas marcadas con  <<< CAMBIAR
-- (Supabase → Database → Extensions: activa pg_cron y pg_net; el SQL Editor
--  también las crea con los "create extension" de abajo).
--
-- Para ver que corre:   select * from cron.job_run_details order by start_time desc limit 5;
-- Para ver las llamadas: select id, status_code, created from net._http_response order by created desc limit 5;
-- Para apagarlo:        select cron.unschedule('publicador-cron');
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- El secreto se guarda cifrado en Vault (no en texto plano dentro del job)
select vault.create_secret(
  '9aqkGwqJiyyUMDQvEzROD7rqXHYeUX3Ywcj5ehMom2s=',          -- <<< CAMBIAR: el mismo valor que CRON_SECRET en Vercel
  'publicador_cron_secret',
  'Bearer para /api/cron'
)
where not exists (select 1 from vault.secrets where name = 'publicador_cron_secret');

-- Si ya lo habías creado y quieres cambiarlo:
-- select vault.update_secret((select id from vault.secrets where name = 'publicador_cron_secret'), 'NUEVO_VALOR');

-- 1) Publicador: cada minuto
select cron.unschedule('publicador-cron') where exists (select 1 from cron.job where jobname = 'publicador-cron');
select cron.schedule(
  'publicador-cron',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://fb-web-publisher.vercel.app/api/cron',   -- <<< CAMBIAR: tu dominio de Vercel
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publicador_cron_secret')
    ),
    timeout_milliseconds := 58000
  );
  $$
);

-- 2) Mantenimiento diario (03:10 UTC): tablas auxiliares pequeñas
select cron.unschedule('publicador-mantenimiento') where exists (select 1 from cron.job where jobname = 'publicador-mantenimiento');
select cron.schedule(
  'publicador-mantenimiento',
  '10 3 * * *',
  $$
  -- contadores de límite de intentos viejos
  delete from public.rate_limit where ventana_inicio < now() - interval '1 day';
  -- historial de respuestas de pg_net y de ejecuciones de pg_cron (crecen sin parar si no se purgan)
  delete from net._http_response where created < now() - interval '2 days';
  delete from cron.job_run_details where end_time < now() - interval '3 days';
  -- publicaciones terminadas de hace más de 180 días (no afecta a pendientes ni a series activas)
  delete from public.posts_programados
   where estado in ('completado', 'cancelado') and fecha_programada < now() - interval '180 days';
  -- importaciones de TikTok viejas ya usadas o con error
  delete from public.importaciones
   where estado in ('usado', 'error') and creado_en < now() - interval '60 days';
  $$
);
