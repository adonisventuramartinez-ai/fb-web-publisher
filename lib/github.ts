// Despierta el worker de GitHub Actions (workflow_dispatch). El worker procesa TODAS
// las importaciones pendientes, así que no hace falta pasarle datos.

export async function despacharWorker(): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "usuario/fb-web-publisher"
  const workflow = process.env.GITHUB_WORKFLOW || "tiktok.yml";
  const ref = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) {
    return { ok: false, error: "Falta GITHUB_TOKEN o GITHUB_REPO en las variables de Vercel" };
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "fb-web-publisher",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 204) return { ok: true };
    const detalle = (await r.text().catch(() => "")).slice(0, 200);
    const pista =
      r.status === 404 ? " (¿existe .github/workflows/tiktok.yml en la rama " + ref + " y el token tiene acceso al repo?)"
      : r.status === 401 || r.status === 403 ? " (revisa el GITHUB_TOKEN: permiso Actions → Read and write)"
      : "";
    return { ok: false, error: `GitHub respondió ${r.status}${pista} ${detalle}`.trim() };
  } catch (e: any) {
    return { ok: false, error: `No se pudo contactar a GitHub: ${e.message}` };
  }
}
