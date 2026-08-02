import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../lib/db";
import { desencriptar } from "../../lib/crypto";

export async function GET(req: NextRequest) {
  console.log("=== CRON INICIADO (sin verificación) ===");
  
  const ahora = new Date();
  const ahoraUTC = ahora.toISOString();
  console.log(`🕐 Hora actual UTC: ${ahoraUTC}`);

  const resultados = [];

  try {
    const { data: posts, error } = await supabaseAdmin
      .from("posts_programados")
      .select("*")
      .eq("estado", "pendiente")
      .lte("fecha_programada", ahoraUTC)
      .order("fecha_programada", { ascending: true });

    if (error) {
      console.error("❌ Error al obtener posts:", error);
      throw error;
    }

    console.log(`📋 Encontrados ${posts?.length || 0} posts para procesar`);

    if (!posts || posts.length === 0) {
      return NextResponse.json({ 
        mensaje: "No hay publicaciones pendientes", 
        procesados: 0,
        hora_utc: ahoraUTC
      });
    }

    for (const post of posts) {
      console.log(`🔄 Procesando post ${post.id} (${post.titulo || "sin título"})`);
      
      try {
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "publicando" })
          .eq("id", post.id);

        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(post.archivo_url);
        
        if (downloadError) throw new Error(`Error al descargar archivo: ${downloadError.message}`);

        for (const pagina of post.paginas) {
          const token = desencriptar(pagina.access_token_encriptado);
          const form = new FormData();
          form.append("access_token", token);
          
          let endpoint = "";
          const textoCompleto = [post.titulo, post.mensaje].filter(Boolean).join("\n\n");
          
          if (post.tipo === "foto") {
            endpoint = `https://graph.facebook.com/v19.0/${pagina.id}/photos`;
            form.append("caption", textoCompleto || "Foto publicada");
            form.append("source", fileData, post.archivo_nombre || "foto.jpg");
          } else {
            endpoint = `https://graph.facebook.com/v19.0/${pagina.id}/videos`;
            form.append("description", textoCompleto || "Video publicado");
            if (post.titulo) form.append("title", post.titulo);
            if (post.tipo === "reel") form.append("is_reel", "true");
            form.append("source", fileData, post.archivo_nombre || "video.mp4");
          }

          const fbRes = await fetch(endpoint, { method: "POST", body: form });
          const fbData = await fbRes.json();
          
          if (fbData.error) throw new Error(fbData.error.message || "Error al publicar en Facebook");
          console.log(`✅ Publicado en ${pagina.name}: ${fbData.id || fbData.post_id}`);
        }

        await supabaseAdmin
          .from("posts_programados")
          .update({ 
            estado: "completado",
            intentos: post.intentos || 0
          })
          .eq("id", post.id);

        resultados.push({ 
          id: post.id, 
          status: "completado",
          titulo: post.titulo || "sin título"
        });

      } catch (err: any) {
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
      procesados: resultados.length,
      resultados,
      hora_utc: ahoraUTC
    });

  } catch (err: any) {
    console.error("❌ Error general en cron:", err);
    return NextResponse.json({ 
      error: err.message || "Error interno del servidor" 
    }, { status: 500 });
  }
}
