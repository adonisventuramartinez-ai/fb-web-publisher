import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin, BUCKET, PostProgramado, ResultadoPagina } from "../../../lib/db";
import { desencriptar } from "../../../lib/crypto";
import { publicarEnPagina } from "../../../lib/fbServer";
import { decidir, siguienteOcurrencia } from "../../../lib/planificador";

// Sin esto Next.js puede cachear el GET como estático y el cron recibiría
// siempre la misma respuesta congelada.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PRESUPUESTO_MS = 45_000; // dejamos margen antes del límite de la función
const POSTS_POR_EJECUCION = 10;
const MINUTOS_PARA_RESCATAR = 10; // un "publicando" más viejo que esto se considera atascado

function secretoValido(req: NextRequest): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false; // sin CRON_SECRET configurado la ruta queda cerrada
  const recibido = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = crypto.createHash("sha256").update(recibido).digest();
  const b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado en el servidor" }, { status: 500 });
  }
  if (!secretoValido(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  const ahoraISO = new Date(inicio).toISOString();
  const salida: any[] = [];

  try {
    // 1) Rescatar posts atascados en "publicando" (la función murió a mitad)
    const limite = new Date(inicio - MINUTOS_PARA_RESCATAR * 60_000).toISOString();
    const { data: rescatados } = await supabaseAdmin
      .from("posts_programados")
      .update({ estado: "pendiente", bloqueado_en: null })
      .eq("estado", "publicando")
      .lt("bloqueado_en", limite)
      .select("id");

    // 2) Buscar vencidos
    const { data: posts, error } = await supabaseAdmin
      .from("posts_programados")
      .select("*")
      .eq("estado", "pendiente")
      .lte("fecha_programada", ahoraISO)
      .order("fecha_programada", { ascending: true })
      .limit(POSTS_POR_EJECUCION);
    if (error) throw error;

    for (const candidato of (posts || []) as PostProgramado[]) {
      if (Date.now() - inicio > PRESUPUESTO_MS) break; // el resto se procesa en la próxima corrida

      // 3) Reclamo atómico: solo UNA ejecución consigue pasar de pendiente → publicando
      const { data: reclamado } = await supabaseAdmin
        .from("posts_programados")
        .update({ estado: "publicando", bloqueado_en: new Date().toISOString() })
        .eq("id", candidato.id)
        .eq("estado", "pendiente")
        .select("*");
      if (!reclamado?.length) continue; // otra ejecución se lo llevó
      const post = reclamado[0] as PostProgramado;

      salida.push(await procesar(post));
    }

    // Latido: el panel lo usa para saber si el cron sigue corriendo (los errores se ignoran)
    await supabaseAdmin
      .from("cron_latido")
      .upsert({ id: 1, ultimo: new Date().toISOString(), procesados: salida.length })
      .then(() => {}, () => {});

    return NextResponse.json({
      ok: true,
      procesados: salida.length,
      rescatados: rescatados?.length ?? 0,
      ms: Date.now() - inicio,
      resultados: salida,
    });
  } catch (err: any) {
    console.error("[cron] error general:", err);
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 });
  }
}

async function procesar(post: PostProgramado) {
  const resultados: Record<string, ResultadoPagina> = { ...(post.resultados || {}) };

  try {
    // URL firmada para que Facebook descargue el archivo él mismo (6 h de vigencia)
    const { data: firmada, error: errFirma } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(post.archivo_url, 6 * 3600);
    if (errFirma || !firmada?.signedUrl) throw new Error(`No se pudo firmar el archivo: ${errFirma?.message}`);

    // Solo las páginas que AÚN no salieron (así un reintento no duplica)
    const pendientes = post.paginas.filter((p) => !resultados[p.id]?.ok);

    await Promise.all(
      pendientes.map(async (pagina) => {
        let token: string;
        try {
          token = desencriptar(pagina.access_token_encriptado);
        } catch {
          resultados[pagina.id] = {
            ok: false,
            error: "No se pudo desencriptar el token de la página (¿cambió ENCRYPTION_KEY?)",
            reintentable: false,
            en: new Date().toISOString(),
          };
          return;
        }
        const r = await publicarEnPagina({
          paginaId: pagina.id,
          token,
          tipo: post.tipo,
          urlArchivo: firmada.signedUrl,
          titulo: post.titulo,
          mensaje: post.mensaje,
        });
        resultados[pagina.id] = { ...r, en: new Date().toISOString() };
      })
    );
  } catch (e: any) {
    // Fallo antes de poder publicar en ninguna página (archivo borrado, etc.)
    for (const p of post.paginas) {
      if (!resultados[p.id]?.ok) {
        resultados[p.id] = { ok: false, error: e.message, reintentable: true, en: new Date().toISOString() };
      }
    }
  }

  const ahora = Date.now();
  const decision = decidir(
    post.paginas.map((p) => p.id),
    resultados,
    post.intentos || 0,
    ahora
  );

  // Si la serie debe continuar, clonamos la siguiente ocurrencia cuando este post
  // llega a un estado final (completado o error): una falla no corta la serie.
  if (decision.estado === "completado" || decision.estado === "error") {
    await programarSiguiente(post, ahora);
  }

  const cambios: Record<string, unknown> = {
    estado: decision.estado,
    intentos: decision.intentos,
    resultados,
    ultimo_error: decision.ultimoError,
    bloqueado_en: null,
  };
  if (decision.proximaFecha) cambios.fecha_programada = decision.proximaFecha;

  const { error } = await supabaseAdmin.from("posts_programados").update(cambios).eq("id", post.id);
  if (error) console.error(`[cron] no se pudo guardar el resultado del post ${post.id}:`, error);

  return {
    id: post.id,
    estado: decision.estado,
    intentos: decision.intentos,
    ok: Object.values(resultados).filter((r) => r.ok).length,
    total: post.paginas.length,
    error: decision.ultimoError,
  };
}

async function programarSiguiente(post: PostProgramado, ahoraMs: number) {
  const proxima = siguienteOcurrencia(post.fecha_programada, post.recurrencia, ahoraMs);
  if (!proxima) return;

  const serie = post.serie_id ?? post.id;
  if (!post.serie_id) {
    await supabaseAdmin.from("posts_programados").update({ serie_id: serie }).eq("id", post.id);
  }

  const { error } = await supabaseAdmin.from("posts_programados").insert({
    cuenta_id: post.cuenta_id,
    propietario_fb_id: post.propietario_fb_id,
    paginas: post.paginas,
    tipo: post.tipo,
    titulo: post.titulo,
    mensaje: post.mensaje,
    archivo_url: post.archivo_url,
    archivo_nombre: post.archivo_nombre,
    fecha_programada: proxima,
    recurrencia: post.recurrencia,
    estado: "pendiente",
    intentos: 0,
    resultados: {},
    serie_id: serie,
  });
  // 23505 = el índice único (serie_id, fecha_programada) evitó un duplicado: correcto
  if (error && error.code !== "23505") console.error(`[cron] no se pudo crear la siguiente ocurrencia de ${post.id}:`, error);
}
