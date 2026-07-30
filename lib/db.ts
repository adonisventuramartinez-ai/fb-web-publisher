import { createClient } from "@supabase/supabase-js";

// Cliente admin: usa la llave secreta, SOLO se importa en código que corre
// en el servidor (API routes). Nunca debe llegar al navegador.
//
// Nombres de variables: la integración oficial Supabase-Vercel (Marketplace)
// crea SUPABASE_URL / SUPABASE_SECRET_KEY. Si conectaste Supabase a mano,
// puede que tengas SUPABASE_SERVICE_ROLE_KEY en su lugar. Soportamos ambos.
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET) {
  throw new Error(
    "Faltan variables de entorno de Supabase (SUPABASE_URL / SUPABASE_SECRET_KEY). Revisa Vercel → Settings → Environment Variables."
  );
}

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false },
});

export const BUCKET = "archivos-programados";

export interface PaginaProgramada {
  id: string;
  name: string;
  access_token_encriptado: string;
}

export interface PostProgramado {
  id: number;
  cuenta_id: number;
  paginas: PaginaProgramada[];
  tipo: "foto" | "video" | "reel";
  titulo: string | null;
  mensaje: string | null;
  archivo_url: string; // path dentro del bucket, no URL pública
  archivo_nombre: string | null;
  fecha_programada: string;
  recurrencia: "ninguna" | "diaria" | "semanal";
  estado: "pendiente" | "publicando" | "completado" | "error" | "cancelado";
  intentos: number;
  creado_en: string;
}
