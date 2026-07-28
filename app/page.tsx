"use client";

import { useEffect, useState } from "react";
import { obtenerPaginas, publicarContenido, FacebookPage, TipoContenido } from "../lib/facebook";

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

  // 🔧 Forzar el dominio correcto
  const baseUrl = process.env.NODE_ENV === "production" 
    ? "https://fb-web-publisher.vercel.app" 
    : window.location.origin;

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

    setPublicando(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Navbar */}
      <nav className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl mr-2">🚀</span>
              <span className="text-xl font-bold text-gray-800">Publicador Multi-Página</span>
              <span className="ml-3 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Beta</span>
            </div>
            <div className="flex items-center gap-4">
              {token && (
                <span className="text-sm text-gray-600 hidden sm:block">
                  ✅ Conectado
                </span>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Contenido principal */}
      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Publica en Múltiples Páginas
            </h1>
            <p className="text-gray-500 mt-1">
              Selecciona tus páginas y comparte contenido en todas simultáneamente
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!token ? (
            <div className="text-center py-12">
              <div className="mb-6">
                <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-12 h-12 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                Conéctate con Facebook
              </h2>
              <p className="text-gray-500 mb-6">
                Para empezar a publicar, necesitas autorizar la aplicación
              </p>
              <a href={getLoginUrl()}>
                <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all transform hover:scale-105 shadow-md">
                  🔑 Conectar con Facebook
                </button>
              </a>
            </div>
          ) : (
            <>
              {/* Panel de control */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <p className="text-sm text-green-600 font-medium">Estado</p>
                  <p className="text-lg font-semibold text-green-800">✅ Conectado</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <p className="text-sm text-blue-600 font-medium">Páginas</p>
                  <p className="text-lg font-semibold text-blue-800">{paginas.length}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                  <p className="text-sm text-purple-600 font-medium">Seleccionadas</p>
                  <p className="text-lg font-semibold text-purple-800">{seleccionadas.size}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center justify-center">
                  <button 
                    onClick={cerrarSesion}
                    className="text-sm text-gray-600 hover:text-red-600 font-medium transition-colors"
                  >
                    🔒 Cerrar sesión
                  </button>
                </div>
              </div>

              {/* Selector de páginas */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">
                    📋 Páginas disponibles
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const todas = new Set(paginas.map(p => p.id));
                        setSeleccionadas(todas);
                      }}
                      className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-lg transition-colors"
                    >
                      Seleccionar todas
                    </button>
                    <button
                      onClick={() => setSeleccionadas(new Set())}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-lg transition-colors"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
                
                {cargandoPaginas ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {paginas.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          seleccionadas.has(p.id)
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(p.id)}
                          onChange={() => toggleSeleccion(p.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="ml-3 text-sm font-medium text-gray-700">
                          {p.name}
                        </span>
                        {p.access_token && (
                          <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            ✅
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Formulario de publicación */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  ✏️ Crear nueva publicación
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de contenido
                    </label>
                    <select
                      value={tipo}
                      onChange={(e) => setTipo(e.target.value as TipoContenido)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="foto">📸 Foto</option>
                      <option value="video">🎬 Video</option>
                      <option value="reel">📹 Reel</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Archivo
                    </label>
                    <input
                      type="file"
                      accept={tipo === "foto" ? "image/*" : "video/*"}
                      onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título
                  </label>
                  <input
                    type="text"
                    placeholder="Escribe un título atractivo..."
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje
                  </label>
                  <textarea
                    placeholder="Escribe el mensaje de tu publicación..."
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <button
                  onClick={handlePublicar}
                  disabled={publicando || seleccionadas.size === 0 || !archivo}
                  className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
                    publicando || seleccionadas.size === 0 || !archivo
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 hover:scale-[1.02] shadow-md'
                  }`}
                >
                  {publicando ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Publicando...
                    </span>
                  ) : (
                    `🚀 Publicar en ${seleccionadas.size} página${seleccionadas.size > 1 ? 's' : ''}`
                  )}
                </button>
              </div>

              {/* Resultados */}
              {resultados.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    📊 Resultados de publicación
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full bg-white rounded-lg overflow-hidden shadow">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Página</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Estado</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Mensaje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {resultados.map((r, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-sm text-gray-700">{r.pagina}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                r.exito ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {r.exito ? '✅ Éxito' : '❌ Error'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{r.mensaje}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
