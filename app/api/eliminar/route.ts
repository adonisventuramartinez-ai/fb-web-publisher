import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/db";
import { desencriptar } from "../../../lib/crypto";
import { noAutorizado, sesionDe } from "../../../lib/auth";
import { permitido } from "../../../lib/rateLimit";
import { borrar, ErrorGraph, listar, tokenDePagina } from "../../../lib/fbEliminar";
import { esFatal, esLimiteDeRitmo, idValido, tipoValido } from "../../../lib/eliminador";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IDS = 15; // por llamada (el navegador va mandando lotes)
const PRESUPUESTO_MS = 50_000;

async function contexto(sesionSub: string, cuenta: unknown, pagina: unknown) {
  if (!/^\d{1,18}$/.test(String(cuenta)) || !/^\d{5,30}$/.test(String(pagina))) {
    return { error: "Cuenta o página no válida", status: 400 } as const;
  }
  const { data, error } = await supabaseAdmin
    .from("cuentas_fb")
    .select("token_encriptado")
    .eq("id", String(cuenta))
    .eq("propietario_fb_id", sesionSub)
    .single();
  if (error || !data) return { error: "Cuenta no encontrada", status: 404 } as const;
  let t;
  try {
    t = await tokenDePagina(desencriptar(data.token_encriptado), String(pagina));
  } catch (e: any) {
    return { error: "El token de esta cuenta expiró o es inválido: " + e.message + ". Usa 🔄 Reconectar en Cuentas.", status: 400 } as const;
  }
  if (!t) return { error: "Esa cuenta no administra esa página", status: 403 } as const;
  return { token: t.token, nombre: t.nombre } as const;
}

// GET /api/eliminar?cuenta=1&pagina=123&tipo=reels&despues=CURSOR  → una página de contenido
export async function GET(req: NextRequest) {
  const sesion = await sesionDe(req);
  if (!sesion) return noAutorizado();
  const q = req.nextUrl.searchParams;
  const tipo = q.get("tipo");
  if (!tipoValido(tipo)) return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });

  const ctx = await contexto(sesion.sub, q.get("cuenta"), q.get("pagina"));
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    const despues = q.get("despues") || undefined;
    if (despues && !/^[\w=+/\-]{1,500}$/.test(despues)) return NextResponse.json({ error: "Cursor no válido" }, { status: 400 });
    const r = await listar(ctx.token, String(q.get("pagina")), tipo, despues);
    return NextResponse.json({ ...r, pagina: ctx.nombre });
  } catch (e: any) {
    const codigo = e instanceof ErrorGraph ? e.codigo : undefined;
    return NextResponse.json({ error: e.message || "No se pudo leer el contenido", codigo, pausa: esLimiteDeRitmo(codigo) }, { status: 502 });
  }
}

// POST { cuenta, pagina, ids: [...] } → borra hasta 15 objetos. Devuelve el resultado de cada uno.
export async function POST(req: NextRequest) {
  const sesion = await sesionDe(req);
  if (!sesion) return noAutorizado();

  // Tope razonable por hora (150 llamadas × 15 = 2250 borrados/h) por si alguien roba la sesión
  if (!(await permitido(`eliminar:${sesion.sub}`, 150, 3600))) {
    return NextResponse.json({ error: "Límite por hora alcanzado. Espera un rato y sigue." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_IDS || !ids.every(idValido)) {
    return NextResponse.json({ error: `Manda entre 1 y ${MAX_IDS} IDs válidos` }, { status: 400 });
  }
  const unicos = [...new Set(ids as string[])];

  const ctx = await contexto(sesion.sub, body.cuenta, body.pagina);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const inicio = Date.now();
  const resultados: { id: string; ok: boolean; yaNoExistia?: boolean; error?: string; codigo?: number }[] = [];
  let pausa = false;
  let fatal = false;
  let siguiente = 0;

  // 3 en paralelo; se detiene todo ante un error de permisos/token o de límite de ritmo
  async function obrero() {
    while (!pausa && !fatal && Date.now() - inicio < PRESUPUESTO_MS) {
      const i = siguiente++;
      if (i >= unicos.length) return;
      const r = await borrar(ctx.token, unicos[i]);
      resultados.push({ id: unicos[i], ...r });
      if (!r.ok && esLimiteDeRitmo(r.codigo)) pausa = true;
      if (!r.ok && esFatal(r.codigo)) fatal = true;
      await new Promise((ok) => setTimeout(ok, 250));
    }
  }
  await Promise.all([obrero(), obrero(), obrero()]);

  const hechos = new Set(resultados.filter((r) => r.ok || !esLimiteDeRitmo(r.codigo)).map((r) => r.id));
  // Los que dieron error de límite se reintentan: se devuelven como "sin procesar", no como fallo.
  const sinProcesar = unicos.filter((id) => !hechos.has(id));
  return NextResponse.json({
    resultados: resultados.filter((r) => hechos.has(r.id)),
    sinProcesar,
    pausa,
    fatal,
  });
}
