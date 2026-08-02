import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, BUCKET } from "../../../lib/db";
import { desencriptar } from "../../../lib/crypto";

export async function GET(req: NextRequest) {
  // 🔒 Verificar autorización
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  
  if (secret && authHeader !== `Bearer ${secret}`) {
    console.error("❌ Intento no autorizado al cron");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ============================================================
  // OBTENER HORA ACTUAL (UTC)
  // ============================================================
  
  const ahora = new Date();
  const ahoraUTC = ahora.toISOString();
  
  // Hora en República Dominicana (UTC-4)
  const ahoraRD = new Date(ahora.getTime());
  ahoraRD.setHours(ahoraRD.getHours() - 4);
  const ahoraRDStr = ahoraRD.toISOString();
  
  console.log(`═══════════════════════════════════════════════`);
  console.log(`🕐 CRON EJECUTADO: ${new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`);
  console.log(`🕐 Hora UTC: ${ahoraUTC}`);
  console.log(`🕐 Hora RD (UTC-4): ${ahoraRDStr}`);
  console.log(`═══════════════════════════════════════════════`);

  const resultados = [];

  try {
    // ============================================================
    // BUSCAR PUBLICACIONES PENDIENTES (COMPARACIÓN DIRECTA UTC)
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
    
    // Mostrar los posts encontrados
    if (posts && posts.length > 0) {
      posts.forEach((p, i) => {
        console.log(`  ${i+1}. ID:${p.id} | Título: ${p.titulo || 'sin título'} | Programado: ${p.fecha_programada}`);
      });
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ 
        mensaje: "No hay publicaciones pendientes", 
        procesados: 0,
        hora_utc: ahoraUTC,
        hora_rd: ahoraRDStr
      });
    }

    // ============================================================
    // PROCESAR CADA PUBLICACIÓN
    // ============================================================

    for (const post of posts) {
      console.log(`\n🔄 PROCESANDO POST ID: ${post.id}`);
      console.log(`   Título: ${post.titulo || "sin título"}`);
      console.log(`   Programado para: ${post.fecha_programada}`);
      console.log(`   Hora actual UTC: ${ahoraUTC}`);
      
      try {
        // Marcar como "publicando"
        await supabaseAdmin
          .from("posts_programados")
          .update({ estado: "publicando" })
          .eq("id", post.id);
        console.log(`   ✅ Estado cambiado a "publicando"`);

        // Descargar archivo
        console.log(`   📥 Descargando archivo: ${post.archivo_url}`);
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(BUCKET)
          .download(post.archivo_url);
        
        if (downloadError) {
          console.error(`   ❌ Error al descargar:`, downloadError);
          throw new Error(`Error al descargar archivo: ${downloadError.message}`);
        }
        console.log(`   ✅ Archivo descargado (${fileData.size} bytes)`);

        // Publicar en cada página
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

        // Marcar como completado
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

    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`✅ PROCESAMIENTO COMPLETADO: ${resultados.length} posts`);
    console.log(`═══════════════════════════════════════════════`);

    return NextResponse.json({ 
      procesados: resultados.length,
      resultados,
      hora_utc: ahoraUTC,
      hora_rd: ahoraRDStr
    });

  } catch (err: any) {
    console.error("❌ Error general en cron:", err);
    return NextResponse.json({ 
      error: err.message || "Error interno del servidor" 
    }, { status: 500 });
  }
}
