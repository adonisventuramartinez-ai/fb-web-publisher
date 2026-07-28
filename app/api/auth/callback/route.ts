import { NextRequest, NextResponse } from "next/server";

// Esta función corre en el servidor (Vercel Serverless Function).
// Es la ÚNICA parte que necesita el APP_SECRET, así que nunca se expone al navegador.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error_description") || searchParams.get("error");

  // 🔧 FIX: Forzar el dominio correcto (tu URL de Vercel)
  const allowedDomain = "https://fb-web-publisher.vercel.app";
  
  // Usar el dominio permitido en producción, o el origin en desarrollo
  const baseUrl = process.env.NODE_ENV === "production" 
    ? allowedDomain 
    : origin;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?error=No se recibió el código de autorización`);
  }

  const APP_ID = process.env.FB_APP_ID!;
  const APP_SECRET = process.env.FB_APP_SECRET!;
  const REDIRECT_URI = `${baseUrl}/api/auth/callback`;

  try {
    // 1) Intercambia el "code" por un access_token de corta duración
    const tokenUrl =
      `https://graph.facebook.com/v19.0/oauth/access_token` +
      `?client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message || "Error al obtener el token");
    }

    // 2) Lo cambia por un token de larga duración (~60 días)
    const longUrl =
      `https://graph.facebook.com/v19.0/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&fb_exchange_token=${tokenData.access_token}`;

    const longRes = await fetch(longUrl);
    const longData = await longRes.json();

    const finalToken = longData.access_token || tokenData.access_token;

    // 3) Manda el token de vuelta al navegador en el fragmento (#) de la URL,
    //    que NO se envía a ningún servidor - solo lo lee el JavaScript del cliente.
    return NextResponse.redirect(`${baseUrl}/#token=${finalToken}`);
  } catch (err: any) {
    return NextResponse.redirect(`${baseUrl}/?error=${encodeURIComponent(err.message)}`);
  }
}
