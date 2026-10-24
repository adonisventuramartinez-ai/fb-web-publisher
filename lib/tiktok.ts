// Clasifica lo que el usuario pega: enlace de video, enlace corto o perfil (@usuario).
// Solo se aceptan dominios de TikTok (evita que se use la app para descargar de cualquier sitio).

export interface EntradaTikTok {
  tipo: "video" | "perfil";
  url: string;
}

const HOST_OK = /^(www\.|m\.|vm\.|vt\.)?tiktok\.com$/i;
const USUARIO = /^@[A-Za-z0-9_.]{2,24}$/;

export function clasificarEntrada(crudo: string): EntradaTikTok | null {
  const texto = (crudo || "").trim();
  if (!texto || texto.length > 300) return null;

  if (USUARIO.test(texto)) return { tipo: "perfil", url: `https://www.tiktok.com/${texto}` };

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOST_OK.test(u.hostname)) return null;

  const host = u.hostname.toLowerCase();
  const partes = u.pathname.split("/").filter(Boolean);

  // Enlaces cortos: vm.tiktok.com/XXXX, vt.tiktok.com/XXXX, tiktok.com/t/XXXX
  if (host.startsWith("vm.") || host.startsWith("vt.") || partes[0] === "t") {
    if (!partes.length) return null;
    return { tipo: "video", url: `https://${host}${u.pathname}` };
  }

  // https://www.tiktok.com/@usuario/video/123456789
  if (partes.length >= 3 && USUARIO.test(partes[0]) && partes[1] === "video" && /^\d{8,25}$/.test(partes[2])) {
    return { tipo: "video", url: `https://www.tiktok.com/${partes[0]}/video/${partes[2]}` };
  }

  // https://www.tiktok.com/@usuario
  if (partes.length === 1 && USUARIO.test(partes[0])) {
    return { tipo: "perfil", url: `https://www.tiktok.com/${partes[0]}` };
  }
  return null;
}
