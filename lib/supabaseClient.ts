import { createClient } from "@supabase/supabase-js";

// Esta llave (anon/publishable) es SEGURA de exponer al navegador -
// es la que Supabase diseñó para esto. Nunca uses aquí la llave secreta.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "";

export const supabaseBrowser = createClient(SUPABASE_URL, SUPABASE_ANON);

export const BUCKET = "archivos-programados";
