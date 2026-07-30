import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Contraseña de admin vive SOLO en variable de entorno (ADMIN_PASSWORD).
// La cookie que se emite no guarda la contraseña, sino un hash firmado
// con ENCRYPTION_KEY, para no tener que guardar sesiones en la base de datos.
function firmar(valor: string): string {
  const key = process.env.ENCRYPTION_KEY || "";
  return crypto.createHmac("sha256", key).update(valor).digest("hex");
}

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "ADMIN_PASSWORD no está configurada en el servidor" }, { status: 500 });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  const valor = "admin_ok";
  const firma = firmar(valor);
  const cookieValue = `${valor}.${firma}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 horas
    path: "/",
  });
  return res;
}
