// Versión de la Graph API en UN solo lugar. Para subir de versión basta con
// definir NEXT_PUBLIC_GRAPH_VERSION en Vercel (ej. v24.0), sin tocar código.
// Revisa https://developers.facebook.com/docs/graph-api/changelog cada ~6 meses.
export const GRAPH_VERSION = process.env.NEXT_PUBLIC_GRAPH_VERSION || "v23.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const GRAPH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

// URL pública de la app. Si no se define, se usa el origen de la petición.
export function appUrl(origenPeticion?: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || origenPeticion || "").replace(/\/$/, "");
}
