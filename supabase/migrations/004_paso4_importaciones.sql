-- Paso 4: importar videos de TikTok. El panel crea filas "pendiente"; un worker en
-- GitHub Actions las procesa (yt-dlp), sube el video a Storage y marca "listo".
create table if not exists public.importaciones (
  id bigint generated always as identity primary key,
  propietario_fb_id text not null,
  tipo text not null check (tipo in ('video', 'perfil')),
  url text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'procesando', 'listo', 'error', 'usado')),
  titulo text,
  descripcion text,
  autor text,
  duracion int,
  bytes bigint,
  archivo_url text,        -- ruta dentro del bucket (misma carpeta del dueño)
  miniatura_path text,
  videos jsonb,            -- solo perfiles: [{url, titulo, duracion}]
  error text,
  creado_en timestamptz not null default now(),
  iniciado_en timestamptz,
  terminado_en timestamptz
);
create index if not exists importaciones_dueno_idx on public.importaciones (propietario_fb_id, id desc);
create index if not exists importaciones_pendientes_idx on public.importaciones (estado) where estado in ('pendiente', 'procesando');
alter table public.importaciones enable row level security;
