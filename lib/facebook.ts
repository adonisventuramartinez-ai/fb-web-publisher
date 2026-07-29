// Todas estas funciones corren en el NAVEGADOR (no en Vercel), así que las
// fotos/videos van directo del cliente a Facebook, sin pasar por el límite
// de tamaño de las funciones serverless.

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
}

export type TipoContenido = "foto" | "video" | "reel";

export interface ValidacionArchivo {
  valido: boolean;
  error?: string;
}

// Límites orientativos de la Graph API (no son un límite duro de FB en todos los casos,
// pero evitan que el usuario intente subir algo que va a fallar del lado de Facebook).
const LIMITES = {
  foto: { maxBytes: 10 * 1024 * 1024, tipos: ["image/jpeg", "image/png", "image/gif", "image/webp"] },
  video: { maxBytes: 1024 * 1024 * 1024 * 4, tipos: ["video/mp4", "video/quicktime", "video/x-msvideo"] },
  reel: { maxBytes: 1024 * 1024 * 1024, tipos: ["video/mp4", "video/quicktime"] },
};

export function validarArchivo(archivo: File, tipo: TipoContenido): ValidacionArchivo {
  const limite = LIMITES[tipo];

  if (!limite.tipos.some((t) => archivo.type === t || archivo.type.startsWith(t.split("/")[0] + "/"))) {
    return {
      valido: false,
      error: `Formato no soportado para ${tipo}. Usa: ${limite.tipos.join(", ")}`,
    };
  }

  if (archivo.size > limite.maxBytes) {
    const maxMb = (limite.maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valido: false,
      error: `El archivo pesa ${(archivo.size / (1024 * 1024)).toFixed(1)}MB, el máximo para ${tipo} es ${maxMb}MB.`,
    };
  }

  return { valido: true };
}

export function getLoginUrl(): string {
  const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://fb-web-publisher.vercel.app"
      : typeof window !== "undefined"
      ? window.location.origin
      : "";
  const redirectUri = `${baseUrl}/api/auth/callback`;
  const scopes = "pages_manage_posts,pages_read_engagement,pages_show_list,pages_read_user_content";
  const state = Math.random().toString(36).slice(2);

  if (typeof window !== "undefined") {
    sessionStorage.setItem("fb_oauth_state", state);
  }

  return (
    `https://www.facebook.com/v19.0/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&response_type=code` +
    `&state=${state}`
  );
}

export async function obtenerPaginas(userToken: string): Promise<FacebookPage[]> {
  const url = `${GRAPH_BASE}/me/accounts?access_token=${userToken}&fields=id,name,access_token,category&limit=100`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Error al obtener páginas");
  return data.data || [];
}

/**
 * Publica contenido en una página, reportando progreso de subida (0-100).
 * Usa XMLHttpRequest en vez de fetch porque fetch no expone progreso de "upload"
 * de forma estándar en todos los navegadores.
 */
export function publicarContenido(
  pagina: FacebookPage,
  archivo: File,
  tipo: TipoContenido,
  titulo: string,
  mensaje: string,
  onProgress?: (porcentaje: number) => void
): Promise<{ success: boolean; message: string }> {
  const textoCompleto = [titulo, mensaje].filter(Boolean).join("\n\n");
  const form = new FormData();
  form.append("access_token", pagina.access_token);

  let endpoint = "";
  if (tipo === "foto") {
    endpoint = `${GRAPH_BASE}/${pagina.id}/photos`;
    form.append("caption", textoCompleto);
    form.append("source", archivo);
  } else {
    endpoint = `${GRAPH_BASE}/${pagina.id}/videos`;
    form.append("description", textoCompleto);
    if (titulo) form.append("title", titulo);
    if (tipo === "reel") form.append("is_reel", "true");
    form.append("source", archivo);
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.error) {
          resolve({ success: false, message: data.error.message || "Error desconocido de Facebook" });
        } else {
          resolve({ success: true, message: `Publicado. ID: ${data.id || data.post_id}` });
        }
      } catch {
        resolve({ success: false, message: "Respuesta inválida de Facebook" });
      }
    };

    xhr.onerror = () => {
      resolve({ success: false, message: "Error de red al subir el archivo" });
    };

    xhr.send(form);
  });
}
