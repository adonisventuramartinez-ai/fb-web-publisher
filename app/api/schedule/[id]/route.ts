import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/db";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabaseAdmin
    .from("posts_programados")
    .update({ estado: "cancelado" })
    .eq("id", params.id)
    .eq("estado", "pendiente"); // solo se puede cancelar si sigue pendiente

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
