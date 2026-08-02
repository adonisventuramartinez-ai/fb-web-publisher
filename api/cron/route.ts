import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../lib/db";
import { desencriptar } from "../../../lib/crypto";

export async function GET(req: NextRequest) {
  // ============================================================
  // VERIFICACIÓN DE AUTORIZACIÓN DESACTIVADA PARA CRON-JOB.ORG
  // ============================================================
  // La verificación por token ha sido desactivada para permitir
  // que cron-job.org ejecute la función sin necesidad de enviar
  // el header Authorization.
  // ============================================================
  
  console.log("=== CRON INICIADO (sin verificación de token) ===");
  
  // ============================================================
  // OBTENER HORA ACTUAL (UTC)
  // ============================================================
  
  const ahora = new Date();
  const ahoraUTC = ahora.toISOString();
  console.log(`🕐 Hora actual UTC: ${ahoraUTC}`);

  const resultados = [];

  try {
    // ============================================================
    // BUSCAR PUBLICACIONES PENDIENTES
    // ============================================================
    
    console.log(`🔍 Buscando posts con fecha_programada <= ${ahoraUTC}`);
    
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

    // ============================================================
    // PROCESAR CADA PUBLICACIÓN
    // ============================================================

    for (const post of posts) {
      console.log(`🔄 Procesando post ${post.id} (${post.titulo || "sin título"})`);
      console.log(`   Programado para: ${post.fecha_programada}`);
      
      try {
        // 1. Marcar como "publicando"
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "publicando" })
          .eq("id", post.id);
        console.log(`   ✅ Estado cambiado a "publicando"`);

        // 2. Descargar archivo de Supabase Storage
        console.log(`   📥 Descargando archivo: ${post.archivo_url}`);
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(post.archivo_url);
        
        if (downloadError) {
          console.error(`   ❌ Error al descargar:`, downloadError);
          throw new Error(`Error al descargar archivo: ${downloadError.message}`);
        }
        console.log(`   ✅ Archivo descargado (${fileData.size} bytes)`);

        // 3. Publicar en cada página
        for (const pagina of post.paginas) {
          console.log(`   📤 Publicando en página: ${pagina.name} (${pagina.id})`);
          
          try {
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

            console.log(`   📡 Enviando a Facebook...`);
            const fbRes = await fetch(endpoint, { method: "POST", body: form });
            const fbData = await fbRes.json();
            
            if (fbData.error) {
              console.error(`   ❌ Error de Facebook:`, fbData.error);
              throw new Error(fbData.error.message || "Error al publicar en Facebook");
            }
            
            console.log(`   ✅ Publicado en ${pagina.name}: ${fbData.id || fbData.post_id}`);
            
          } catch (err: any) {
            console.error(`   ❌ Error en ${pagina.name}:`, err.message);
            throw new Error(`Error en ${pagina.name}: ${err.message}`);
          }
        }

        // 4. Marcar como completado
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
        
        console.log(`   ✅ POST ${post.id} COMPLETADO EXITOSAMENTE`);

      } catch (err: any) {
        // 5. Si falló, aumentar intentos
        const nuevosIntentos = (post.intentos || 0) + 1;
        const nuevoEstado = nuevosIntentos >= 3 ? "error" : "pendiente";
        
        console.error(`   ❌ POST ${post.id} FALLÓ (intento ${nuevosIntentos}/3):`, err.message);
        
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
Fix: Desactivar verificación de token para cron-job.org
