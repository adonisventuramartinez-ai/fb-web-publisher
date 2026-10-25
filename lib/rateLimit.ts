import { NextRequest } from "next/server";
import { supabaseAdmin } from "./db";

// Límite de peticiones respaldado por Postgres (función rl_hit, migración 005).
// En serverless no sirve un contador en memoria: cada petición puede caer en una
// instancia distinta. Aquí el contador es atómico y compartido.
//
// Si la función aún no existe o la BD falla, se PERMITE la petición (fail-open):
// un límite de ritmo nunca debe dejar a todos fuera de su propia app.

export function ipDe(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "desconocida";
}

export async function permitido(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("rl_hit", {
      p_clave: clave,
      p_max: maximo,
      p_ventana_seg: ventanaSegundos,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
