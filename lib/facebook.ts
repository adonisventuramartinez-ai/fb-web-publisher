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

export function getLoginUrl(): string {
  const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = `${origin}/api/auth/callback`;
  const scopes = "pages_manage_posts,pages_read_engagement,pages_show_list,pages_read_user_content";
  const state = Math.random().toString(36).slice(2);

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

export type TipoContenido = "foto" | "video" | "reel";

export async function publicarContenido(
  pagina: FacebookPage,
  archivo: File,
  tipo: TipoContenido,
  titulo: string,
  mensaje: string
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

  try {
    const res = await fetch(endpoint, { method: "POST", body: form });
    const data = await res.json();

    if (data.error) {
      return { success: false, message: data.error.message || "Error desconocido de Facebook" };
    }

    return { success: true, message: `Publicado. ID: ${data.id || data.post_id}` };
  } catch (err: any) {
    return { success: false, message: err.message || "Error de red al subir el archivo" };
  }
}
