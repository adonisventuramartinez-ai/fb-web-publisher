import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/db";
import { desencriptar } from "../../../../../lib/crypto";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: cuenta, error } = await supabaseAdmin
      .from("cuentas_fb")
      .select("token_encriptado")
      .eq("id", params.id)
      .single();

    if (error || !cuenta) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const token = desencriptar(cuenta.token_encriptado);

    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${token}&fields=id,name,category&limit=100`
    );
    const data = await res.json();

    if (data.error) {
      return NextResponse.json(
        { error: "El token de esta cuenta expiró o es inválido: " + data.error.message },
        { status: 400 }
      );
    }

    // No devolvemos access_token de las páginas al cliente - solo id/name.
    // Cuando se programe un post, el servidor vuelve a pedir el token fresco.
    const paginas = (data.data || []).map((p: any) => ({ id: p.id, name: p.name, category: p.category }));

    return NextResponse.json({ paginas });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error al obtener páginas" }, { status: 500 });
  }
}
