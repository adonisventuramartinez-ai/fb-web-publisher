import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../lib/db";
import { desencriptar, encriptar } from "../../../lib/crypto";

// Este endpoint debe ser llamado por un cron (ej: Vercel Cron Jobs)
export async function GET(req: NextRequest) {
  // 🔒 Proteger con token secreto
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultados = [];

  try {
    // Obtener publicaciones pendientes cuya fecha ya pasó
    const { data: posts, error } = await supabaseAdmin
      .from("posts_programados")
      .select("*")
      .eq("estado", "pendiente")
      .lte("fecha_programada", new Date().toISOString())
      .order("fecha_programada", { ascending: true });

    if (error) throw error;

    for (const post of posts || []) {
      try {
        // Actualizar estado a "publicando"
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "publicando" })
          .eq("id", post.id);

        // Publicar en cada página
        for (const pagina of post.paginas) {
          const token = desencriptar(pagina.access_token_encriptado);
          
          // Descargar archivo de Supabase Storage
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .download(post.archivo_url);
          
          if (downloadError) throw downloadError;

          // Subir a Facebook
          const form = new FormData();
          form.append("access_token", token);
          
          let endpoint = "";
          if (post.tipo === "foto") {
            endpoint = `https://graph.facebook.com/v19.0/${pagina.id}/photos`;
            form.append("caption", [post.titulo, post.mensaje].filter(Boolean).join("\n\n"));
            form.append("source", fileData, post.archivo_nombre || "foto.jpg");
          } else {
            endpoint = `https://graph.facebook.com/v19.0/${pagina.id}/videos`;
            form.append("description", [post.titulo, post.mensaje].filter(Boolean).join("\n\n"));
            if (post.titulo) form.append("title", post.titulo);
            if (post.tipo === "reel") form.append("is_reel", "true");
            form.append("source", fileData, post.archivo_nombre || "video.mp4");
          }

          const fbRes = await fetch(endpoint, { method: "POST", body: form });
          const fbData = await fbRes.json();
          
          if (fbData.error) {
            throw new Error(fbData.error.message || "Error al publicar en Facebook");
          }
        }

        // Si llegamos aquí, todo salió bien
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "completado" })
          .eq("id", post.id);

        resultados.push({ id: post.id, status: "completado" });

      } catch (err: any) {
        // Si falló, aumentar intentos
        const nuevosIntentos = (post.intentos || 0) + 1;
        const nuevoEstado = nuevosIntentos >= 3 ? "error" : "pendiente";
        
        await supabaseAdmin
          .from("posts_programados")
          .update({ 
            estado: nuevoEstado,
            intentos: nuevosIntentos
          })
          .eq("id", post.id);

        resultados.push({ 
          id: post.id, 
          status: nuevoEstado, 
          error: err.message,
          intentos: nuevosIntentos 
        });
      }
    }

    return NextResponse.json({ 
      procesados: posts?.length || 0,
      resultados 
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
