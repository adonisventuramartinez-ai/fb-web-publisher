import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../lib/db";

// El navegador nunca sube el archivo a través de esta función serverless
// (evita el límite de tamaño de Vercel) - solo pide "permiso" aquí, y
// después sube el archivo directo a Supabase Storage con ese permiso.
export async function POST(req: NextRequest) {
  try {
    const { nombreArchivo } = await req.json();
    if (!nombreArchivo) {
      return NextResponse.json({ error: "Falta nombreArchivo" }, { status: 400 });
    }

    const extension = nombreArchivo.split(".").pop() || "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error) throw error;

    return NextResponse.json({
      path: data.path,
      token: data.token,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error al preparar la subida" }, { status: 500 });
  }
}
