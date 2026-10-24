import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/db";
import { noAutorizado, sesionDe } from "../../../../lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sesion = await sesionDe(req);
  if (!sesion) return noAutorizado();

  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Al borrar la cuenta, sus publicaciones pendientes se cancelan (llevan el token
  // de las páginas guardado y, si no, seguirían publicando con una cuenta "borrada").
  await supabaseAdmin
    .from("posts_programados")
    .update({ estado: "cancelado" })
    .eq("cuenta_id", id)
    .eq("propietario_fb_id", sesion.sub)
    .in("estado", ["pendiente", "error"]);

  const { data, error } = await supabaseAdmin
    .from("cuentas_fb")
    .delete()
    .eq("id", id)
    .eq("propietario_fb_id", sesion.sub)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
