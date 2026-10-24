import { NextRequest, NextResponse } from "next/server";
import { COOKIE_ADMIN, COOKIE_USUARIO, Sesion, verificarSesion } from "./session";

// El middleware ya bloquea las rutas protegidas; estas funciones se usan
// además dentro de cada ruta para saber QUIÉN es el dueño (defensa en profundidad).

export async function sesionDe(req: NextRequest): Promise<Sesion | null> {
  const s = await verificarSesion(req.cookies.get(COOKIE_USUARIO)?.value);
  return s && s.rol === "usuario" ? s : null;
}

export async function adminDe(req: NextRequest): Promise<Sesion | null> {
  const s = await verificarSesion(req.cookies.get(COOKIE_ADMIN)?.value);
  return s && s.rol === "admin" ? s : null;
}

export function noAutorizado() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export function opcionesCookie(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSegundos,
    path: "/",
  };
}
