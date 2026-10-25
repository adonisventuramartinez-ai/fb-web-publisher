import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { COOKIE_ADMIN, firmarSesion } from "../../../../lib/session";
import { opcionesCookie } from "../../../../lib/auth";
import { ipDe, permitido } from "../../../../lib/rateLimit";

// ADMIN_PASSWORD vive SOLO en variable de entorno. La cookie lleva una sesión
// firmada con expiración dentro de la firma (8 h), no la contraseña.
function iguales(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function POST(req: NextRequest) {
  // Freno a la fuerza bruta: 8 intentos por IP cada 15 min
  // (sin tope global a propósito: así un atacante no puede dejar al admin fuera)
  if (!(await permitido(`admin:${ipDe(req)}`, 8, 900))) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
  }

  const { password } = await req.json().catch(() => ({ password: "" }));

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_PASSWORD no está configurada en el servidor" }, { status: 500 });
  }

  if (typeof password !== "string" || !iguales(password, process.env.ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800)); // frena la fuerza bruta
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const valor = await firmarSesion({ sub: "admin", nombre: "Administrador", rol: "admin" }, 8 * 3600);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_ADMIN, valor, opcionesCookie(8 * 3600));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_ADMIN, "", opcionesCookie(0));
  return res;
}
