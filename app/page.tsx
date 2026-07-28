"use client";

import { useEffect, useState } from "react";
import { getLoginUrl, obtenerPaginas, publicarContenido, FacebookPage, TipoContenido } from "../lib/facebook";

interface Resultado {
  pagina: string;
  exito: boolean;
  mensaje: string;
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [paginas, setPaginas] = useState<FacebookPage[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [tipo, setTipo] = useState<TipoContenido>("foto");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargandoPaginas, setCargandoPaginas] = useState(false);

  // Al cargar: revisa si venimos de /api/auth/callback con un token en el fragmento (#)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#token=")) {
      const t = hash.replace("#token=", "");
      setToken(t);
      localStorage.setItem("fb_token", t);
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      const guardado = localStorage.getItem("fb_token");
      if (guardado) setToken(guardado);
    }

    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setError(err);
  }, []);

  useEffect(() => {
    if (token) cargarPaginas(token);
  }, [token]);

  async function cargarPaginas(t: string) {
    setCargandoPaginas(true);
    setError(null);
    try {
      const lista = await obtenerPaginas(t);
      setPaginas(lista);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargandoPaginas(false);
    }
  }

  function toggleSeleccion(id: string) {
    const nueva = new Set(seleccionadas);
    if (nueva.has(id)) nueva.delete(id);
    else nueva.add(id);
    setSeleccionadas(nueva);
  }

  function cerrarSesion() {
    localStorage.removeItem("fb_token");
    setToken(null);
    setPaginas([]);
    setSeleccionadas(new Set());
  }

  async function handlePublicar() {
    if (seleccionadas.size === 0) {
      alert("Selecciona al menos una página.");
      return;
    }
    if (!archivo) {
      alert("Selecciona un archivo.");
      return;
    }

    setPublicando(true);
    setResultados([]);
    const nuevosResultados: Resultado[] = [];

    for (const pagina of paginas.filter((p) => seleccionadas.has(p.id))) {
      const r = await publicarContenido(pagina, archivo, tipo, titulo, mensaje);
      nuevosResultados.push({ pagina: pagina.name, exito: r.success, mensaje: r.message });
      setResultados([...nuevosResultados]);
    }

    setPublicando(false);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ color: "#1877F2" }}>🚀 Publicador Multi-Página de Facebook</h1>

      {error && (
        <div style={{ background: "#fdecea", color: "#611a15", padding: 12, borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {!token ? (
        <a href={getLoginUrl()}>
          <button style={btnPrimario}>🔑 Conectar con Facebook</button>
        </a>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <span style={{ color: "green", fontWeight: "bold" }}>✅ Conectado</span>{" "}
          <button onClick={cerrarSesion} style={btnSecundario}>Cerrar sesión</button>
        </div>
      )}

      {cargandoPaginas && <p>Cargando páginas...</p>}

      {paginas.length > 0 && (
        <>
          <h3>Selecciona las páginas:</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {paginas.map((p) => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={seleccionadas.has(p.id)}
                  onChange={() => toggleSeleccion(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoContenido)} style={input}>
              <option value="foto">📸 Foto</option>
              <option value="video">🎬 Video</option>
              <option value="reel">📹 Reel</option>
            </select>

            <input
              type="file"
              accept={tipo === "foto" ? "image/*" : "video/*"}
              onChange={(e) => setArchivo(e.target.files?.[0] || null)}
            />
          </div>

          <input
            type="text"
            placeholder="Título"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            style={{ ...input, width: "100%", marginBottom: 10 }}
          />

          <textarea
            placeholder="Mensaje"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            style={{ ...input, width: "100%", height: 90, marginBottom: 16 }}
          />

          <button onClick={handlePublicar} disabled={publicando} style={btnPublicar}>
            {publicando ? "Publicando..." : "🚀 Publicar en páginas seleccionadas"}
          </button>

          {resultados.length > 0 && (
            <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Página</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.pagina}</td>
                    <td style={{ ...td, color: r.exito ? "green" : "red" }}>{r.exito ? "✅ Éxito" : "❌ Error"}</td>
                    <td style={td}>{r.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}

const btnPrimario: React.CSSProperties = {
  background: "#1877F2", color: "white", border: "none", padding: "12px 24px",
  borderRadius: 8, fontSize: 16, cursor: "pointer"
};
const btnSecundario: React.CSSProperties = {
  background: "#e4e6eb", border: "none", padding: "8px 14px", borderRadius: 6, cursor: "pointer"
};
const btnPublicar: React.CSSProperties = {
  background: "#42B72A", color: "white", border: "none", padding: "14px 28px",
  borderRadius: 8, fontSize: 16, cursor: "pointer", fontWeight: "bold"
};
const input: React.CSSProperties = {
  padding: 10, borderRadius: 6, border: "1px solid #ccc", fontSize: 14
};
const th: React.CSSProperties = { textAlign: "left", borderBottom: "2px solid #ddd", padding: 8 };
const td: React.CSSProperties = { borderBottom: "1px solid #eee", padding: 8 };
