"use client";

import { useEffect, useState } from "react";
import { obtenerPaginas, publicarContenido, FacebookPage, TipoContenido } from "../lib/facebook";

interface Resultado {
  pagina: string;
  exito: boolean;
  mensaje: string;
}

interface PublicacionHistorial {
  id: string;
  fecha: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  paginas: number;
  exitos: number;
  errores: number;
  resultados: Resultado[];
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
  const [historial, setHistorial] = useState<PublicacionHistorial[]>([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);

  const baseUrl = process.env.NODE_ENV === "production" 
    ? "https://fb-web-publisher.vercel.app" 
    : window.location.origin;

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

  // Cargar historial desde localStorage
  useEffect(() => {
    const guardado = localStorage.getItem("historial_publicaciones");
    if (guardado) {
      try {
        setHistorial(JSON.parse(guardado));
      } catch (e) {
        console.error("Error al cargar historial:", e);
      }
    }
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

  function limpiarHistorial() {
    if (confirm("¿Estás seguro de que quieres eliminar todo el historial?")) {
      setHistorial([]);
      localStorage.removeItem("historial_publicaciones");
    }
  }

  function getLoginUrl() {
    const APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID;
    const redirectUri = `${baseUrl}/api/auth/callback`;
    
    return (
      `https://www.facebook.com/v19.0/dialog/oauth` +
      `?client_id=${APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=pages_manage_posts,pages_read_engagement,pages_show_list,pages_read_user_content` +
      `&response_type=code`
    );
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

    // Guardar en historial
    const publicacion: PublicacionHistorial = {
      id: Date.now().toString(),
      fecha: new Date().toLocaleString(),
      tipo: tipo,
      titulo: titulo || "Sin título",
      mensaje: mensaje || "Sin mensaje",
      paginas: nuevosResultados.length,
      exitos: nuevosResultados.filter(r => r.exito).length,
      errores: nuevosResultados.filter(r => !r.exito).length,
      resultados: nuevosResultados
    };

    const nuevoHistorial = [publicacion, ...historial];
    setHistorial(nuevoHistorial);
    localStorage.setItem("historial_publicaciones", JSON.stringify(nuevoHistorial));

    setPublicando(false);
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "#f0f2f5",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    }}>
      {/* Navbar simple */}
      <nav style={{
        background: "white",
        borderBottom: "1px solid #e0e0e0",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "24px" }}>📱</span>
          <span style={{ fontWeight: "bold", fontSize: "18px", color: "#1a1a1a" }}>
            Publicador Multi-Página
          </span>
          <span style={{
            background: "#e8f0fe",
            color: "#1a73e8",
            fontSize: "10px",
            padding: "2px 8px",
            borderRadius: "12px",
            fontWeight: "600"
          }}>
            Beta
          </span>
        </div>
        {token && (
          <span style={{ fontSize: "14px", color: "#34a853" }}>
            ✅ Conectado
          </span>
        )}
      </nav>

      {/* Contenido */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 16px" }}>
        <div style={{
          background: "white",
          borderRadius: "8px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)",
          padding: "24px"
        }}>
          {/* Header */}
          <div style={{ marginBottom: "24px" }}>
            <h1 style={{ 
              fontSize: "24px", 
              fontWeight: "600", 
              color: "#1a1a1a",
              margin: "0 0 4px 0"
            }}>
              Publica en Múltiples Páginas
            </h1>
            <p style={{ 
              color: "#5f6368", 
              fontSize: "14px", 
              margin: "0"
            }}>
              Selecciona tus páginas y comparte contenido en todas simultáneamente
            </p>
          </div>

          {error && (
            <div style={{
              background: "#fce8e6",
              color: "#c62828",
              padding: "12px 16px",
              borderRadius: "4px",
              marginBottom: "16px",
              fontSize: "14px"
            }}>
              ⚠️ {error}
            </div>
          )}

          {!token ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{
                width: "80px",
                height: "80px",
                background: "#e8f0fe",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px"
              }}>
                <span style={{ fontSize: "40px" }}>🔑</span>
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: "500", color: "#1a1a1a" }}>
                Conéctate con Facebook
              </h2>
              <p style={{ color: "#5f6368", marginBottom: "24px" }}>
                Autoriza la aplicación para empezar a publicar
              </p>
              <a href={getLoginUrl()}>
                <button style={{
                  background: "#1877f2",
                  color: "white",
                  border: "none",
                  padding: "12px 32px",
                  borderRadius: "6px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}>
                  Conectar con Facebook
                </button>
              </a>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "12px",
                marginBottom: "24px"
              }}>
                <div style={{
                  background: "#e6f4ea",
                  padding: "12px 16px",
                  borderRadius: "6px"
                }}>
                  <div style={{ fontSize: "12px", color: "#1e7e34" }}>Estado</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: "#1e7e34" }}>✅ Conectado</div>
                </div>
                <div style={{
                  background: "#e8f0fe",
                  padding: "12px 16px",
                  borderRadius: "6px"
                }}>
                  <div style={{ fontSize: "12px", color: "#1a73e8" }}>Páginas</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: "#1a73e8" }}>{paginas.length}</div>
                </div>
                <div style={{
                  background: "#f3e8fd",
                  padding: "12px 16px",
                  borderRadius: "6px"
                }}>
                  <div style={{ fontSize: "12px", color: "#7c3aed" }}>Seleccionadas</div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: "#7c3aed" }}>{seleccionadas.size}</div>
                </div>
                <button
                  onClick={cerrarSesion}
                  style={{
                    background: "#f1f3f4",
                    border: "none",
                    padding: "12px 16px",
                    borderRadius: "6px",
                    fontSize: "14px",
                    color: "#5f6368",
                    cursor: "pointer"
                  }}
                >
                  🔒 Cerrar sesión
                </button>
              </div>

              {/* Tabs: Publicar | Historial */}
              <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "20px",
                borderBottom: "1px solid #e0e0e0",
                paddingBottom: "12px"
              }}>
                <button
                  onClick={() => setMostrarHistorial(false)}
                  style={{
                    padding: "8px 16px",
                    background: !mostrarHistorial ? "#e8f0fe" : "transparent",
                    border: "none",
                    borderRadius: "4px",
                    color: !mostrarHistorial ? "#1a73e8" : "#5f6368",
                    fontWeight: !mostrarHistorial ? "600" : "400",
                    cursor: "pointer"
                  }}
                >
                  ✏️ Publicar
                </button>
                <button
                  onClick={() => setMostrarHistorial(true)}
                  style={{
                    padding: "8px 16px",
                    background: mostrarHistorial ? "#e8f0fe" : "transparent",
                    border: "none",
                    borderRadius: "4px",
                    color: mostrarHistorial ? "#1a73e8" : "#5f6368",
                    fontWeight: mostrarHistorial ? "600" : "400",
                    cursor: "pointer"
                  }}
                >
                  📜 Historial ({historial.length})
                </button>
              </div>

              {/* Contenido según tab */}
              {!mostrarHistorial ? (
                <>
                  {/* Páginas */}
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px"
                    }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "500", color: "#1a1a1a" }}>
                        📋 Páginas disponibles
                      </h3>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => {
                            const todas = new Set(paginas.map(p => p.id));
                            setSeleccionadas(todas);
                          }}
                          style={{
                            background: "#e8f0fe",
                            border: "none",
                            padding: "4px 12px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "#1a73e8",
                            cursor: "pointer"
                          }}
                        >
                          Seleccionar todas
                        </button>
                        <button
                          onClick={() => setSeleccionadas(new Set())}
                          style={{
                            background: "#f1f3f4",
                            border: "none",
                            padding: "4px 12px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            color: "#5f6368",
                            cursor: "pointer"
                          }}
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>
                    
                    {cargandoPaginas ? (
                      <div style={{ textAlign: "center", padding: "20px" }}>
                        Cargando páginas...
                      </div>
                    ) : (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "8px"
                      }}>
                        {paginas.map((p) => (
                          <label
                            key={p.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "10px 12px",
                              background: seleccionadas.has(p.id) ? "#e8f0fe" : "white",
                              border: seleccionadas.has(p.id) ? "1px solid #1a73e8" : "1px solid #e0e0e0",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={seleccionadas.has(p.id)}
                              onChange={() => toggleSeleccion(p.id)}
                              style={{ marginRight: "8px" }}
                            />
                            <span style={{ fontSize: "14px", color: "#1a1a1a" }}>
                              {p.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Formulario */}
                  <div style={{
                    background: "#f8f9fa",
                    padding: "20px",
                    borderRadius: "6px",
                    border: "1px solid #e0e0e0"
                  }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 16px 0" }}>
                      ✏️ Crear nueva publicación
                    </h3>
                    
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      marginBottom: "12px"
                    }}>
                      <div>
                        <label style={{ fontSize: "13px", color: "#5f6368", display: "block", marginBottom: "4px" }}>
                          Tipo
                        </label>
                        <select
                          value={tipo}
                          onChange={(e) => setTipo(e.target.value as TipoContenido)}
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            border: "1px solid #e0e0e0",
                            borderRadius: "4px",
                            fontSize: "14px",
                            background: "white"
                          }}
                        >
                          <option value="foto">📸 Foto</option>
                          <option value="video">🎬 Video</option>
                          <option value="reel">📹 Reel</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "13px", color: "#5f6368", display: "block", marginBottom: "4px" }}>
                          Archivo
                        </label>
                        <input
                          type="file"
                          accept={tipo === "foto" ? "image/*" : "video/*"}
                          onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                          style={{
                            width: "100%",
                            padding: "6px",
                            border: "1px solid #e0e0e0",
                            borderRadius: "4px",
                            fontSize: "14px",
                            background: "white"
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ fontSize: "13px", color: "#5f6368", display: "block", marginBottom: "4px" }}>
                        Título
                      </label>
                      <input
                        type="text"
                        placeholder="Escribe un título..."
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e0e0e0",
                          borderRadius: "4px",
                          fontSize: "14px"
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ fontSize: "13px", color: "#5f6368", display: "block", marginBottom: "4px" }}>
                        Mensaje
                      </label>
                      <textarea
                        placeholder="Escribe el mensaje..."
                        value={mensaje}
                        onChange={(e) => setMensaje(e.target.value)}
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e0e0e0",
                          borderRadius: "4px",
                          fontSize: "14px",
                          resize: "vertical",
                          fontFamily: "inherit"
                        }}
                      />
                    </div>

                    <button
                      onClick={handlePublicar}
                      disabled={publicando || seleccionadas.size === 0 || !archivo}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: (publicando || seleccionadas.size === 0 || !archivo) ? "#dadce0" : "#1a73e8",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "16px",
                        fontWeight: "600",
                        cursor: (publicando || seleccionadas.size === 0 || !archivo) ? "not-allowed" : "pointer"
                      }}
                    >
                      {publicando ? "Publicando..." : `🚀 Publicar en ${seleccionadas.size} página${seleccionadas.size > 1 ? 's' : ''}`}
                    </button>
                  </div>

                  {/* Resultados */}
                  {resultados.length > 0 && (
                    <div style={{ marginTop: "24px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 12px 0" }}>
                        📊 Resultados
                      </h3>
                      <div style={{ overflow: "auto" }}>
                        <table style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "14px"
                        }}>
                          <thead>
                            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #e0e0e0" }}>
                              <th style={{ padding: "10px", textAlign: "left" }}>Página</th>
                              <th style={{ padding: "10px", textAlign: "left" }}>Estado</th>
                              <th style={{ padding: "10px", textAlign: "left" }}>Mensaje</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resultados.map((r, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #f1f3f4" }}>
                                <td style={{ padding: "10px" }}>{r.pagina}</td>
                                <td style={{ padding: "10px" }}>
                                  <span style={{
                                    background: r.exito ? "#e6f4ea" : "#fce8e6",
                                    color: r.exito ? "#1e7e34" : "#c62828",
                                    padding: "2px 12px",
                                    borderRadius: "12px",
                                    fontSize: "12px"
                                  }}>
                                    {r.exito ? "✅ Éxito" : "❌ Error"}
                                  </span>
                                </td>
                                <td style={{ padding: "10px" }}>{r.mensaje}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // Historial
                <div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px"
                  }}>
                    <h3 style={{ fontSize: "16px", fontWeight: "500", margin: "0" }}>
                      📜 Historial de publicaciones
                    </h3>
                    {historial.length > 0 && (
                      <button
                        onClick={limpiarHistorial}
                        style={{
                          background: "#fce8e6",
                          border: "none",
                          padding: "4px 12px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          color: "#c62828",
                          cursor: "pointer"
                        }}
                      >
                        🗑️ Limpiar historial
                      </button>
                    )}
                  </div>

                  {historial.length === 0 ? (
                    <div style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "#5f6368"
                    }}>
                      <span style={{ fontSize: "48px", display: "block", marginBottom: "12px" }}>
                        📭
                      </span>
                      <p>No hay publicaciones en el historial</p>
                      <p style={{ fontSize: "13px" }}>
                        Tus publicaciones aparecerán aquí después de publicar
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {historial.map((pub) => (
                        <div key={pub.id} style={{
                          border: "1px solid #e0e0e0",
                          borderRadius: "6px",
                          padding: "16px",
                          background: "white"
                        }}>
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            gap: "8px"
                          }}>
                            <div>
                              <div style={{ fontWeight: "600", color: "#1a1a1a" }}>
                                {pub.titulo}
                              </div>
                              <div style={{ fontSize: "13px", color: "#5f6368" }}>
                                {pub.fecha} • {pub.tipo} • {pub.paginas} páginas
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <span style={{
                                background: pub.exitos > 0 ? "#e6f4ea" : "#f1f3f4",
                                color: "#1e7e34",
                                padding: "2px 10px",
                                borderRadius: "12px",
                                fontSize: "12px"
                              }}>
                                ✅ {pub.exitos}
                              </span>
                              {pub.errores > 0 && (
                                <span style={{
                                  background: "#fce8e6",
                                  color: "#c62828",
                                  padding: "2px 10px",
                                  borderRadius: "12px",
                                  fontSize: "12px"
                                }}>
                                  ❌ {pub.errores}
                                </span>
                              )}
                            </div>
                          </div>
                          {pub.mensaje && pub.mensaje !== "Sin mensaje" && (
                            <div style={{
                              fontSize: "13px",
                              color: "#3c4043",
                              marginTop: "8px",
                              padding: "8px",
                              background: "#f8f9fa",
                              borderRadius: "4px"
                            }}>
                              {pub.mensaje}
                            </div>
                          )}
                          {pub.resultados.length > 0 && (
                            <details style={{ marginTop: "8px" }}>
                              <summary style={{
                                fontSize: "13px",
                                color: "#1a73e8",
                                cursor: "pointer"
                              }}>
                                Ver detalles por página
                              </summary>
                              <div style={{
                                marginTop: "8px",
                                padding: "8px",
                                background: "#f8f9fa",
                                borderRadius: "4px",
                                fontSize: "13px"
                              }}>
                                {pub.resultados.map((r, i) => (
                                  <div key={i} style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: "4px 0",
                                    borderBottom: i < pub.resultados.length - 1 ? "1px solid #e0e0e0" : "none"
                                  }}>
                                    <span>{r.pagina}</span>
                                    <span style={{ color: r.exito ? "#1e7e34" : "#c62828" }}>
                                      {r.exito ? "✅" : "❌"} {r.mensaje}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
