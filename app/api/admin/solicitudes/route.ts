import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/db";
import { esAdminValido } from "../../../../lib/adminAuth";

export async function GET(req: NextRequest) {
  if (!esAdminValido(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("usuarios_autorizados")
    .select("*")
    .order("solicitado_en", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ solicitudes: data });
}
