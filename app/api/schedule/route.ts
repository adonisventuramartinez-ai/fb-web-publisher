import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/db";
import { encriptar } from "../../../lib/crypto";

// POST: crea una publicación programada.
// El cliente NUNCA envía tokens - solo cuenta_id + ids de páginas.
// El servidor vuelve a pedirle a Facebook el token fresco de cada página.
export async function POST(req: NextRequest) {
  try {
    const {
      cuenta_id,
      paginas, // [{id, name}]
      tipo,
      titulo,
      mensaje,
      archivo_url, // path dentro del bucket de Supabase Storage
      archivo_nombre,
      fecha_programada, // ISO string
      recurrencia,
    } = await req.json();

    if (!cuenta_id || !paginas?.length || !tipo || !archivo_url || !fecha_programada) {
      return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
    }

    const { data: cuenta, error: errCuenta } = await supabaseAdmin
      .from("cuentas_fb")
      .select("token_encriptado")
      .eq("id", cuenta_id)
      .single();

    if (errCuenta || !cuenta) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const { desencriptar } = await import("../../../lib/crypto");
    const userToken = desencriptar(cuenta.token_encriptado);

    const paginasRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}&fields=id,name,access_token&limit=200`
    );
    const paginasData = await paginasRes.json();
    if (paginasData.error) {
      return NextResponse.json(
        { error: "No se pudo obtener el token de las páginas: " + paginasData.error.message },
        { status: 400 }
      );
    }

    const idsPedidos = new Set(paginas.map((p: any) => p.id));
    const paginasConToken = (paginasData.data || [])
      .filter((p: any) => idsPedidos.has(p.id))
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        access_token_encriptado: encriptar(p.access_token),
      }));

    if (paginasConToken.length === 0) {
      return NextResponse.json({ error: "Ninguna de las páginas seleccionadas pertenece a esta cuenta" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("posts_programados")
      .insert({
        cuenta_id,
        paginas: paginasConToken,
        tipo,
        titulo: titulo || null,
        mensaje: mensaje || null,
        archivo_url,
        archivo_nombre: archivo_nombre || null,
        fecha_programada,
        recurrencia: recurrencia || "ninguna",
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error al programar la publicación" }, { status: 500 });
  }
}

// GET: lista publicaciones programadas (sin exponer tokens)
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("posts_programados")
    .select("id, cuenta_id, paginas, tipo, titulo, mensaje, archivo_nombre, fecha_programada, recurrencia, estado, intentos, creado_en")
    .order("fecha_programada", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Quitar los tokens encriptados de las páginas antes de mandar al cliente
  const limpio = (data || []).map((post: any) => ({
    ...post,
    paginas: post.paginas.map((p: any) => ({ id: p.id, name: p.name })),
  }));

  return NextResponse.json({ posts: limpio });
}
