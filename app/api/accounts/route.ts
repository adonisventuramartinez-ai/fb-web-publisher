import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/db";
import { encriptar } from "../../../lib/crypto";

// POST: guarda una cuenta nueva (recibe el token de usuario ya obtenido por OAuth
// en el navegador, lo valida contra Facebook, lo encripta y lo guarda).
export async function POST(req: NextRequest) {
  try {
    const { nombre, userToken } = await req.json();
    if (!nombre || !userToken) {
      return NextResponse.json({ error: "Faltan datos (nombre, userToken)" }, { status: 400 });
    }

    // Validar que el token realmente funciona antes de guardarlo
    const check = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${userToken}`);
    const checkData = await check.json();
    if (checkData.error) {
      return NextResponse.json({ error: "Token de Facebook inválido: " + checkData.error.message }, { status: 400 });
    }

    const tokenEncriptado = encriptar(userToken);

    const { data, error } = await supabaseAdmin
      .from("cuentas_fb")
      .insert({ nombre, token_encriptado: tokenEncriptado })
      .select("id, nombre, creado_en")
      .single();

    if (error) throw error;

    return NextResponse.json({ cuenta: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error al guardar la cuenta" }, { status: 500 });
  }
}

// GET: lista las cuentas guardadas (sin exponer los tokens)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("cuentas_fb")
    .select("id, nombre, creado_en")
    .order("creado_en", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuentas: data });
}
