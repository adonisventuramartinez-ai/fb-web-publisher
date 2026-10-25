-- =====================================================================
-- 005 · Esquema completo + automatización  (IDEMPOTENTE: se puede ejecutar
--       varias veces y sobre una base que ya tiene los pasos 1-4)
--
-- Ejecútalo en Supabase → SQL Editor ANTES de desplegar esta versión.
-- Qué hace:
--   1. Garantiza que existan todas las tablas que usa el código (en el zip
--      faltaban las migraciones 001-003, así que una base nueva no se podía
--      reproducir).
--   2. Añade las columnas nuevas: fecha_original, token_invalido_en, ultima_limpieza.
--   3. Índices para que el cron (cada minuto) y el panel sigan rápidos.
--   4. RLS activado + permisos revocados a anon/authenticated (la app solo usa la
--      llave secreta desde el servidor; nadie debe poder leer tokens con la llave pública).
--   5. Bucket de Storage PRIVADO.
--   6. Función rl_hit() para limitar intentos de login (fuerza bruta).
-- =====================================================================

-- ---------- 1. Tablas ------------------------------------------------
create table if not exists public.usuarios_autorizados (
  fb_id            text primary key,
  nombre           text not null,
  codigo_solicitud text,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  solicitado_en    timestamptz not null default now(),
  aprobado_en      timestamptz
);

create table if not exists public.cuentas_fb (
  id                 bigint generated always as identity primary key,
  nombre             text not null,
  token_encriptado   text not null,
  propietario_fb_id  text not null,
  creado_en          timestamptz not null default now()
);

create table if not exists public.posts_programados (
  id                 bigint generated always as identity primary key,
  cuenta_id          bigint references public.cuentas_fb (id) on delete set null,
  propietario_fb_id  text not null,
  paginas            jsonb not null default '[]'::jsonb,
  tipo               text not null check (tipo in ('foto', 'video', 'reel')),
  titulo             text,
  mensaje            text,
  archivo_url        text not null,
  archivo_nombre     text,
  fecha_programada   timestamptz not null,
  recurrencia        text not null default 'ninguna' check (recurrencia in ('ninguna', 'diaria', 'semanal')),
  estado             text not null default 'pendiente'
                       check (estado in ('pendiente', 'publicando', 'completado', 'error', 'cancelado')),
  intentos           int not null default 0,
  resultados         jsonb not null default '{}'::jsonb,
  ultimo_error       text,
  bloqueado_en       timestamptz,
  serie_id           bigint,
  creado_en          timestamptz not null default now()
);

create table if not exists public.plantillas (
  id                 bigint generated always as identity primary key,
  propietario_fb_id  text not null,
  nombre             text not null,
  titulo             text,
  mensaje            text,
  creado_en          timestamptz not null default now()
);

create table if not exists public.cron_latido (
  id          int primary key,
  ultimo      timestamptz,
  procesados  int
);
insert into public.cron_latido (id) values (1) on conflict (id) do nothing;

-- importaciones (paso 4) ya tiene su propio archivo; se repite aquí por si faltó
create table if not exists public.importaciones (
  id bigint generated always as identity primary key,
  propietario_fb_id text not null,
  tipo text not null check (tipo in ('video', 'perfil')),
  url text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'listo', 'error', 'usado')),
  titulo text, descripcion text, autor text, duracion int, bytes bigint,
  archivo_url text, miniatura_path text, videos jsonb, error text,
  creado_en timestamptz not null default now(),
  iniciado_en timestamptz, terminado_en timestamptz
);

create table if not exists public.rate_limit (
  clave           text primary key,
  intentos        int not null,
  ventana_inicio  timestamptz not null default now()
);

-- ---------- 2. Columnas nuevas --------------------------------------
-- Fecha "de calendario" de una serie recurrente. Sin ella, cada reintento por fallo
-- (5/20/60 min) desplazaba para siempre la hora de la serie.
alter table public.posts_programados add column if not exists fecha_original timestamptz;
-- El cron la marca cuando Facebook responde "token vencido" (código 190): el panel pide reconectar.
alter table public.cuentas_fb        add column if not exists token_invalido_en timestamptz;
-- Última vez que el cron limpió archivos huérfanos de Storage.
alter table public.cron_latido       add column if not exists ultima_limpieza timestamptz;

-- ---------- 3. Índices ----------------------------------------------
-- Consulta del cron (cada minuto): pendientes vencidos
create index if not exists posts_pendientes_idx on public.posts_programados (fecha_programada) where estado = 'pendiente';
-- Rescate de posts atascados en "publicando"
create index if not exists posts_publicando_idx on public.posts_programados (bloqueado_en) where estado = 'publicando';
-- Panel (cola, calendario, contadores)
create index if not exists posts_dueno_idx on public.posts_programados (propietario_fb_id, fecha_programada);
-- Limpieza de Storage / comprobación de quién usa un archivo
create index if not exists posts_archivo_idx on public.posts_programados (archivo_url);
create index if not exists posts_cuenta_idx on public.posts_programados (cuenta_id);
-- Una serie nunca puede tener dos publicaciones en la misma fecha (evita duplicados del cron)
create unique index if not exists posts_serie_fecha_uq on public.posts_programados (serie_id, fecha_programada) where serie_id is not null;

create index if not exists cuentas_dueno_idx on public.cuentas_fb (propietario_fb_id);
create index if not exists plantillas_dueno_idx on public.plantillas (propietario_fb_id);
create index if not exists importaciones_dueno_idx on public.importaciones (propietario_fb_id, id desc);
create index if not exists importaciones_pendientes_idx on public.importaciones (estado) where estado in ('pendiente', 'procesando');

-- ---------- 4. Seguridad: RLS sin políticas + permisos revocados ----
do $$
declare t text;
begin
  foreach t in array array['usuarios_autorizados','cuentas_fb','posts_programados','plantillas','cron_latido','importaciones','rate_limit']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
-- Sin políticas = ni la llave anon ni "authenticated" pueden leer/escribir nada.
-- La app accede solo desde el servidor con la llave secreta (que se salta RLS).

-- ---------- 5. Storage: bucket privado ------------------------------
insert into storage.buckets (id, name, public)
values ('archivos-programados', 'archivos-programados', false)
on conflict (id) do update set public = false;
-- (Los archivos se suben con URLs firmadas y Facebook los descarga con URLs firmadas: no necesita ser público.)

-- ---------- 6. Límite de intentos (anti fuerza bruta) ---------------
-- Devuelve true si la petición está dentro del límite. Atómica.
create or replace function public.rl_hit(p_clave text, p_max int, p_ventana_seg int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intentos int;
begin
  insert into public.rate_limit as r (clave, intentos, ventana_inicio)
  values (p_clave, 1, now())
  on conflict (clave) do update set
    intentos = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_seg) then 1 else r.intentos + 1 end,
    ventana_inicio = case when r.ventana_inicio < now() - make_interval(secs => p_ventana_seg) then now() else r.ventana_inicio end
  returning intentos into v_intentos;
  return v_intentos <= p_max;
end;
$$;
revoke all on function public.rl_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rl_hit(text, int, int) to service_role;
