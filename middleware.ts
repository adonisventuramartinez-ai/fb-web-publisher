import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ADMIN, COOKIE_USUARIO, verificarSesion } from "./lib/session";

// Rutas /api que NO exigen sesión de usuario:
//  - /api/auth/*        login con Facebook y creación de sesión
//  - /api/admin/login   login del administrador
//  - /api/cron          se protege con CRON_SECRET dentro de la propia ruta
//  - /api/health        liveness mínimo para monitores de disponibilidad (no revela nada)
const PUBLICAS = [/^\/api\/auth\//, /^\/api\/admin\/login$/, /^\/api\/cron$/, /^\/api\/health$/];

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  if (PUBLICAS.some((r) => r.test(ruta))) return NextResponse.next();

  // Protección extra contra CSRF: una petición que cambia datos debe venir del mismo origen
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origen = req.headers.get("origin");
    if (origen && origen !== req.nextUrl.origin) return json(403, "Origen no permitido");
  }

  const esRutaAdmin = ruta.startsWith("/api/admin/");
  let sesion = null;
  try {
    sesion = await verificarSesion(req.cookies.get(esRutaAdmin ? COOKIE_ADMIN : COOKIE_USUARIO)?.value);
  } catch {
    return json(500, "Configuración de sesión incompleta en el servidor");
  }

  if (!sesion || sesion.rol !== (esRutaAdmin ? "admin" : "usuario")) {
    return json(401, "No autorizado");
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
