import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../../lib/db";
import { adminDe, noAutorizado } from "../../../../lib/auth";
import { GRAPH_BASE } from "../../../../lib/graph";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Nivel = "ok" | "aviso" | "error";
interface Chequeo {
  id: string;
  titulo: string;
  nivel: Nivel;
  detalle: string;
}

const hay = (n: string) => !!process.env[n]?.trim();

// Autodiagnóstico: en vez de descubrir un problema de configuración cuando una
// publicación falla a las 3 a. m., aquí se ve todo de un vistazo.
export async function GET(req: NextRequest) {
  if (!(await adminDe(req))) return noAutorizado();

  const c: Chequeo[] = [];
  const add = (id: string, titulo: string, nivel: Nivel, detalle: string) => c.push({ id, titulo, nivel, detalle });

  // ---- Variables de entorno
  const obligatorias = [
    "FB_APP_ID", "FB_APP_SECRET", "NEXT_PUBLIC_FB_APP_ID",
    "SUPABASE_URL", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "ENCRYPTION_KEY", "CRON_SECRET", "ADMIN_PASSWORD",
  ];
  const faltan = obligatorias.filter((n) => !hay(n) && !(n === "SUPABASE_URL" && hay("NEXT_PUBLIC_SUPABASE_URL")) && !(n === "SUPABASE_SECRET_KEY" && hay("SUPABASE_SERVICE_ROLE_KEY")));
  add("env", "Variables de entorno", faltan.length ? "error" : "ok", faltan.length ? `Faltan: ${faltan.join(", ")}` : "Todas las obligatorias están definidas");

  const clave = process.env.ENCRYPTION_KEY || "";
  add("clave", "ENCRYPTION_KEY", /^[0-9a-fA-F]{64}$/.test(clave) ? "ok" : "error",
    /^[0-9a-fA-F]{64}$/.test(clave) ? "Formato correcto (64 hex)" : "Debe ser hex de 64 caracteres (openssl rand -hex 32). Si la cambias, los tokens ya guardados dejan de funcionar.");
  if (!hay("SESSION_SECRET")) add("sesion", "SESSION_SECRET", "aviso", "No definido: las sesiones se firman con ENCRYPTION_KEY. Mejor usar un secreto distinto (openssl rand -hex 32).");
  if (!hay("NEXT_PUBLIC_APP_URL")) add("url", "NEXT_PUBLIC_APP_URL", "aviso", "No definido: se usa el dominio de cada petición. Defínelo con tu dominio final para que el login de Facebook no falle en previews.");

  // ---- Base de datos: tablas y columnas de la migración 005
  const comprobaciones: [string, string, string][] = [
    ["usuarios_autorizados", "fb_id", "Tabla usuarios_autorizados"],
    ["cuentas_fb", "token_invalido_en", "Tabla cuentas_fb (+ token_invalido_en)"],
    ["posts_programados", "fecha_original", "Tabla posts_programados (+ fecha_original)"],
    ["plantillas", "id", "Tabla plantillas"],
    ["importaciones", "id", "Tabla importaciones"],
    ["cron_latido", "ultima_limpieza", "Tabla cron_latido (+ ultima_limpieza)"],
    ["rate_limit", "clave", "Tabla rate_limit"],
  ];
  const faltantesDb: string[] = [];
  for (const [tabla, col, etiqueta] of comprobaciones) {
    try {
      const { error } = await supabaseAdmin.from(tabla).select(col).limit(1);
      if (error) faltantesDb.push(etiqueta);
    } catch {
      faltantesDb.push(etiqueta);
    }
  }
  add("db", "Base de datos", faltantesDb.length ? "error" : "ok",
    faltantesDb.length ? `Falta o falla: ${faltantesDb.join("; ")}. Ejecuta supabase/migrations/005_esquema_completo_y_automatizacion.sql` : "Todas las tablas y columnas existen");

  try {
    const { data, error } = await supabaseAdmin.rpc("rl_hit", { p_clave: "diagnostico", p_max: 1_000_000, p_ventana_seg: 60 });
    add("rl", "Límite de intentos (rl_hit)", !error && data === true ? "ok" : "aviso",
      !error && data === true ? "Función disponible" : "La función rl_hit no existe: el login no tiene freno anti fuerza bruta (migración 005)");
  } catch {
    add("rl", "Límite de intentos (rl_hit)", "aviso", "No se pudo comprobar");
  }

  // ---- Storage
  try {
    const { data, error } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (error || !data) add("bucket", "Bucket de archivos", "error", `No existe el bucket "${BUCKET}" (migración 005 o créalo en Storage)`);
    else add("bucket", "Bucket de archivos", data.public ? "error" : "ok",
      data.public ? "El bucket es PÚBLICO: cualquiera con la URL puede ver tus videos. Ponlo privado (migración 005)." : "Existe y es privado");
  } catch (e: any) {
    add("bucket", "Bucket de archivos", "error", e?.message || "No se pudo comprobar");
  }

  // ---- Cron
  try {
    const { data } = await supabaseAdmin.from("cron_latido").select("ultimo, procesados, ultima_limpieza").eq("id", 1).maybeSingle();
    if (!data?.ultimo) add("cron", "Cron", "error", "Nunca se ha ejecutado. Configura cron-job.org o la migración 006 (pg_cron) apuntando a /api/cron.");
    else {
      const seg = Math.round((Date.now() - new Date(data.ultimo).getTime()) / 1000);
      add("cron", "Cron", seg <= 150 ? "ok" : seg <= 600 ? "aviso" : "error",
        seg <= 150 ? `Última ejecución hace ${seg} s` : `Última ejecución hace ${Math.round(seg / 60)} min: no está corriendo cada minuto`);
    }
    if (process.env.LIMPIEZA_STORAGE === "off") add("limpieza", "Limpieza de Storage", "aviso", "Desactivada (LIMPIEZA_STORAGE=off)");
    else add("limpieza", "Limpieza de Storage", data?.ultima_limpieza ? "ok" : "aviso",
      data?.ultima_limpieza ? `Última limpieza: ${new Date(data.ultima_limpieza).toLocaleString("es")}` : "Aún no ha corrido (se ejecuta sola cada 6 h desde el cron)");
  } catch {
    add("cron", "Cron", "error", "No se pudo leer cron_latido");
  }

  // ---- Facebook: ¿el App ID + Secret son válidos?
  try {
    if (hay("FB_APP_ID") && hay("FB_APP_SECRET")) {
      const r = await fetch(`${GRAPH_BASE}/${process.env.FB_APP_ID}?access_token=${encodeURIComponent(`${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const d = await r.json();
      add("fb", "App de Facebook", d?.id ? "ok" : "error", d?.id ? `App "${d.name || d.id}" responde` : `Facebook rechazó el App ID/Secret: ${d?.error?.message || "sin detalle"}`);
    }
  } catch (e: any) {
    add("fb", "App de Facebook", "aviso", `No se pudo contactar a Facebook: ${e?.message}`);
  }

  // ---- Cuentas con token vencido
  try {
    const { data, error } = await supabaseAdmin.from("cuentas_fb").select("nombre").not("token_invalido_en", "is", null);
    if (!error && data?.length) add("tokens", "Cuentas de Facebook", "aviso", `Necesitan reconectarse (token vencido): ${data.map((x: any) => x.nombre).join(", ")}`);
    else if (!error) add("tokens", "Cuentas de Facebook", "ok", "Ninguna con token vencido");
  } catch {}

  // ---- GitHub (worker de TikTok): opcional
  if (hay("GITHUB_TOKEN") || hay("GITHUB_REPO")) {
    try {
      const wf = process.env.GITHUB_WORKFLOW || "tiktok.yml";
      const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/actions/workflows/${wf}`, {
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "fb-web-publisher" },
        signal: AbortSignal.timeout(10_000),
      });
      add("github", "Worker de TikTok (GitHub)", r.ok ? "ok" : "error",
        r.ok ? "Token y workflow accesibles" : `GitHub respondió ${r.status}: revisa GITHUB_TOKEN (Actions: Read and write) y GITHUB_REPO`);
    } catch (e: any) {
      add("github", "Worker de TikTok (GitHub)", "aviso", `No se pudo contactar a GitHub: ${e?.message}`);
    }
  } else {
    add("github", "Worker de TikTok (GitHub)", "aviso", "No configurado (GITHUB_TOKEN / GITHUB_REPO): la pestaña TikTok no podrá importar. Si no la usas, ignóralo.");
  }

  const resumen: Nivel = c.some((x) => x.nivel === "error") ? "error" : c.some((x) => x.nivel === "aviso") ? "aviso" : "ok";
  return NextResponse.json({ resumen, chequeos: c });
}
