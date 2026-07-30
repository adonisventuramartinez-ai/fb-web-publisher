"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Solicitud {
  fb_id: string;
  nombre: string;
  codigo_solicitud: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  solicitado_en: string;
  aprobado_en: string | null;
}

export default function AdminPage() {
  const [autenticado, setAutenticado] = useState(false);
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [filtro, setFiltro] = useState<"todas" | "pendiente" | "aprobado" | "rechazado">("pendiente");

  async function cargarSolicitudes() {
    const res = await fetch("/api/admin/solicitudes");
    if (res.status === 401) {
      setAutenticado(false);
      return;
    }
    const data = await res.json();
    setSolicitudes(data.solicitudes || []);
  }

  useEffect(() => {
    fetch("/api/admin/solicitudes").then((res) => {
      if (res.ok) {
        setAutenticado(true);
        cargarSolicitudes();
      }
    });
  }, []);

  async function handleLogin() {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al iniciar sesión");
        return;
      }
      setAutenticado(true);
      await cargarSolicitudes();
    } finally {
      setCargando(false);
    }
  }

  async function decidir(fb_id: string, accion: "aprobar" | "rechazar") {
    const res = await fetch("/api/admin/aprobar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fb_id, accion }),
    });
    if (res.ok) {
      toast.success(accion === "aprobar" ? "Usuario aprobado" : "Usuario rechazado");
      cargarSolicitudes();
    } else {
      toast.error("Error al procesar la acción");
    }
  }

  if (!autenticado) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f0f2f5",
          fontFamily: "-apple-system, sans-serif",
        }}
      >
        <div style={{ background: "white", padding: "32px", borderRadius: "8px", width: "320px", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
          <h2 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>🔒 Panel de administrador</h2>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #e0e0e0", marginBottom: "12px", boxSizing: "border-box" }}
          />
          <button
            onClick={handleLogin}
            disabled={cargando || !password}
            style={{
              width: "100%",
              padding: "10px",
              background: "#1a73e8",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {cargando ? "Verificando..." : "Entrar"}
          </button>
        </div>
      </div>
    );
  }

  const solicitudesFiltradas =
    filtro === "todas" ? solicitudes : solicitudes.filter((s) => s.estado === filtro);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f2f5", fontFamily: "-apple-system, sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "22px", marginBottom: "16px" }}>👥 Solicitudes de acceso</h1>

        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {(["pendiente", "aprobado", "rechazado", "todas"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: "6px 14px",
                borderRadius: "16px",
                border: `1px solid ${filtro === f ? "#1a73e8" : "#e0e0e0"}`,
                background: filtro === f ? "#1a73e8" : "white",
                color: filtro === f ? "white" : "#5f6368",
                fontSize: "13px",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {solicitudesFiltradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#5f6368" }}>No hay solicitudes en esta categoría.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {solicitudesFiltradas.map((s) => (
              <div
                key={s.fb_id}
                style={{
                  background: "white",
                  padding: "16px",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{s.nombre}</div>
                  <div style={{ fontSize: "13px", color: "#5f6368" }}>
                    Código: <strong>{s.codigo_solicitud}</strong> · Solicitado: {new Date(s.solicitado_en).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      background: s.estado === "aprobado" ? "#e6f4ea" : s.estado === "rechazado" ? "#fce8e6" : "#fff4e5",
                      color: s.estado === "aprobado" ? "#1e7e34" : s.estado === "rechazado" ? "#c62828" : "#b45309",
                    }}
                  >
                    {s.estado}
                  </span>
                  {s.estado === "pendiente" && (
                    <>
                      <button
                        onClick={() => decidir(s.fb_id, "aprobar")}
                        style={{ background: "#34a853", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={() => decidir(s.fb_id, "rechazar")}
                        style={{ background: "#c62828", color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
  );
}
