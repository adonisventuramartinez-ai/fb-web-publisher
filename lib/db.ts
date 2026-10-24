import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente admin: usa la llave secreta, SOLO se importa en código de servidor
// (rutas API). Nunca debe llegar al navegador.
// Soporta los nombres de la integración Supabase-Vercel (SUPABASE_URL /
// SUPABASE_SECRET_KEY) y los manuales (SUPABASE_SERVICE_ROLE_KEY).
//
// Se crea de forma perezosa para que `next build` no falle si las variables
// aún no existen en el momento de compilar.
let cliente: SupabaseClient | null = null;

function crear(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secreta) {
    throw new Error(
      "Faltan variables de entorno de Supabase (SUPABASE_URL / SUPABASE_SECRET_KEY). Revisa Vercel → Settings → Environment Variables."
    );
  }
  return createClient(url, secreta, { auth: { persistSession: false } });
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    if (!cliente) cliente = crear();
    const valor = (cliente as any)[prop];
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
});

export const BUCKET = "archivos-programados";

export type EstadoPost = "pendiente" | "publicando" | "completado" | "error" | "cancelado";

export interface PaginaProgramada {
  id: string;
  name: string;
  access_token_encriptado: string;
}

export interface ResultadoPagina {
  ok: boolean;
  id?: string;
  error?: string;
  reintentable?: boolean;
  en: string; // ISO
}

export interface PostProgramado {
  id: number;
  cuenta_id: number | null;
  propietario_fb_id: string;
  paginas: PaginaProgramada[];
  tipo: "foto" | "video" | "reel";
  titulo: string | null;
  mensaje: string | null;
  archivo_url: string; // path dentro del bucket, no URL pública
  archivo_nombre: string | null;
  fecha_programada: string;
  recurrencia: "ninguna" | "diaria" | "semanal";
  estado: EstadoPost;
  intentos: number;
  resultados: Record<string, ResultadoPagina>;
  ultimo_error: string | null;
  bloqueado_en: string | null;
  serie_id: number | null;
  creado_en: string;
}
