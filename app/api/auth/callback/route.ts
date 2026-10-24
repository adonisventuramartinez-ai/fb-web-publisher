import { NextRequest, NextResponse } from "next/server";
import { GRAPH_BASE, appUrl } from "../../../../lib/graph";

// Esta función corre en el servidor. Es la ÚNICA que usa el APP_SECRET.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const baseUrl = appUrl(origin);

  const code = searchParams.get("code");
  const error = searchParams.get("error_description") || searchParams.get("error");
  const state = searchParams.get("state");
  const stateEsperado = req.cookies.get("fb_oauth_state")?.value;

  const volver = (ruta: string) => {
    const r = NextResponse.redirect(`${baseUrl}${ruta}`);
    r.cookies.set("fb_oauth_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  if (error) return volver(`/?error=${encodeURIComponent(error)}`);
  if (!code) return volver(`/?error=${encodeURIComponent("No se recibió el código de autorización")}`);

  // Anti-CSRF: el state que mandamos a Facebook tiene que coincidir con el de la cookie
  if (!state || !stateEsperado || state !== stateEsperado) {
    return volver(`/?error=${encodeURIComponent("Sesión de login inválida o expirada. Intenta de nuevo.")}`);
  }

  const APP_ID = process.env.FB_APP_ID!;
  const APP_SECRET = process.env.FB_APP_SECRET!;
  const REDIRECT_URI = `${baseUrl}/api/auth/callback`;

  try {
    // 1) code → token de corta duración
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token` +
        `?client_id=${APP_ID}` +
        `&client_secret=${APP_SECRET}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&code=${encodeURIComponent(code)}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error.message || "Error al obtener el token");

    // 2) → token de larga duración (~60 días)
    const longRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${APP_ID}` +
        `&client_secret=${APP_SECRET}` +
        `&fb_exchange_token=${encodeURIComponent(tokenData.access_token)}`
    );
    const longData = await longRes.json();
    const finalToken = longData.access_token || tokenData.access_token;

    // 3) Se entrega en el fragmento (#) de la URL: no se envía a ningún servidor.
    return volver(`/#token=${finalToken}`);
  } catch (err: any) {
    return volver(`/?error=${encodeURIComponent(err.message)}`);
  }
}
