import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../lib/db";
import { desencriptar } from "../../../lib/crypto";

// ============================================================
// 1. VERIFICACIÓN DE SEGURIDAD (CRON_SECRET)
// ============================================================
// Este endpoint SOLO debe ser llamado por Vercel Cron Jobs.
// Para protegerlo, verificamos un token secreto en el header.
// ============================================================

export async function GET(req: NextRequest) {
  // 🔒 PASO 1: Verificar que la petición viene de Vercel Cron
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  
  // Si CRON_SECRET está configurado, exigimos el token
  if (secret) {
    if (authHeader !== `Bearer ${secret}`) {
      console.error("❌ Intento no autorizado al cron");
      return NextResponse.json({ 
        error: "No autorizado - Token inválido" 
      }, { status: 401 });
    }
    console.log("✅ Autorización exitosa");
  } else {
    console.warn("⚠️ CRON_SECRET no configurado - El cron está EXPUESTO");
    // En producción, deberías tener CRON_SECRET configurado
  }

  // ============================================================
  // 2. OBTENER PUBLICACIONES PENDIENTES
  // ============================================================
  
  const resultados = [];
  const ahora = new Date().toISOString();

  try {
    console.log(`🔍 Buscando publicaciones pendientes para ejecutar (${ahora})...`);

    const { data: posts, error } = await supabaseAdmin
      .from("posts_programados")
      .select("*")
      .eq("estado", "pendiente")
      .lte("fecha_programada", ahora)
      .order("fecha_programada", { ascending: true });

    if (error) {
      console.error("❌ Error al obtener posts:", error);
      throw error;
    }

    console.log(`📋 Encontrados ${posts?.length || 0} posts para procesar`);

    if (!posts || posts.length === 0) {
      return NextResponse.json({ 
        mensaje: "No hay publicaciones pendientes", 
        procesados: 0 
      });
    }

    // ============================================================
    // 3. PROCESAR CADA PUBLICACIÓN
    // ============================================================

    for (const post of posts) {
      console.log(`🔄 Procesando post ${post.id} (${post.titulo || "sin título"})...`);
      
      try {
        // 3.1 Marcar como "publicando"
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "publicando" })
          .eq("id", post.id);

        // 3.2 Descargar archivo de Supabase Storage
        console.log(`📥 Descargando archivo: ${post.archivo_url}`);
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(post.archivo_url);
        
        if (downloadError) {
          console.error(`❌ Error al descargar archivo:`, downloadError);
          throw new Error(`Error al descargar archivo: ${downloadError.message}`);
        }

        // 3.3 Publicar en cada página
        for (const pagina of post.paginas) {
          console.log(`📤 Publicando en página: ${pagina.name} (${pagina.id})`);
          
          try {
            const token = desencriptar(pagina.access_token_encriptado);
            
            // Crear FormData para la subida
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

            // Enviar a Facebook
            const fbRes = await fetch(endpoint, { 
              method: "POST", 
              body: form 
            });
            
            const fbData = await fbRes.json();
            
            if (fbData.error) {
              console.error(`❌ Error de Facebook en ${pagina.name}:`, fbData.error);
              throw new Error(fbData.error.message || "Error al publicar en Facebook");
            }
            
            console.log(`✅ Publicado en ${pagina.name}: ${fbData.id || fbData.post_id}`);
            
          } catch (err: any) {
            console.error(`❌ Error al publicar en ${pagina.name}:`, err.message);
            throw new Error(`Error en ${pagina.name}: ${err.message}`);
          }
        }

        // 3.4 Marcar como completado
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
        
        console.log(`✅ Post ${post.id} completado exitosamente`);

      } catch (err: any) {
        // 3.5 Si falló, aumentar intentos
        const nuevosIntentos = (post.intentos || 0) + 1;
        const nuevoEstado = nuevosIntentos >= 3 ? "error" : "pendiente";
        
        console.error(`❌ Post ${post.id} falló (intento ${nuevosIntentos}/3):`, err.message);
        
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

    // ============================================================
    // 4. RESPUESTA FINAL
    // ============================================================
    
    console.log(`✅ Procesamiento completado. ${resultados.length} posts procesados`);
    
    return NextResponse.json({ 
      procesados: resultados.length,
      resultados,
      timestamp: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("❌ Error general en cron:", err);
    return NextResponse.json({ 
      error: err.message || "Error interno del servidor" 
    }, { status: 500 });
  }
}
