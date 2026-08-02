"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Cuenta {
  id: number;
  nombre: string;
  creado_en: string;
}

interface Theme {
  cardBg: string;
  formBg: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
  accentBg: string;
}

interface CuentasManagerProps {
  tokenActual: string | null;
  theme: Theme;
}

export default function CuentasManager({ tokenActual, theme }: CuentasManagerProps) {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  async function cargarCuentas() {
    setCargando(true);
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setCuentas(data.cuentas || []);
    } catch {
      toast.error("No se pudieron cargar las cuentas");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarCuentas();
  }, []);

  async function guardarCuentaActual() {
    if (!tokenActual) {
      toast.error("Primero conecta con Facebook arriba");
      return;
    }
    if (!nombreNuevo.trim()) {
      toast.error("Ponle un nombre a la cuenta (ej. 'Cliente A')");
      return;
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreNuevo.trim(), userToken: tokenActual }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al guardar la cuenta");
        return;
      }
      toast.success(`Cuenta "${nombreNuevo}" guardada`);
      setNombreNuevo("");
      cargarCuentas();
    } finally {
      setGuardando(false);
    }
  }

  async function borrarCuenta(id: number, nombre: string) {
    if (!confirm(`¿Eliminar la cuenta "${nombre}"? Esto no cancela publicaciones programadas ya creadas.`)) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Cuenta eliminada");
      cargarCuentas();
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <div>
      <div
        style={{
          background: theme.formBg,
          padding: "16px",
          borderRadius: "8px",
          border: `1px solid ${theme.border}`,
          marginBottom: "20px",
        }}
      >
        <h4 style={{ margin: "0 0 8px 0", fontSize: "14px", color: theme.text }}>
          ➕ Guardar la cuenta con la que iniciaste sesión ahora
        </h4>
        <p style={{ fontSize: "12px", color: theme.subtext, margin: "0 0 12px 0" }}>
          Esto guarda tu sesión actual de Facebook de forma encriptada, para poder programar
          publicaciones en sus páginas incluso con el navegador cerrado.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Nombre para identificarla (ej. Cliente A)"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: `1px solid ${theme.border}`,
              fontSize: "13px",
              background: theme.cardBg,
              color: theme.text,
            }}
          />
          <button
            onClick={guardarCuentaActual}
            disabled={guardando || !tokenActual}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              background: theme.accent,
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              cursor: guardando || !tokenActual ? "not-allowed" : "pointer",
              opacity: !tokenActual ? 0.5 : 1,
            }}
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>

      <h4 style={{ fontSize: "14px", color: theme.text, marginBottom: "8px" }}>
        📇 Cuentas conectadas ({cuentas.length})
      </h4>

      {cargando ? (
        <div style={{ color: theme.subtext, fontSize: "13px" }}>Cargando...</div>
      ) : cuentas.length === 0 ? (
        <div style={{ color: theme.subtext, fontSize: "13px", padding: "12px 0" }}>
          Aún no has guardado ninguna cuenta.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {cuentas.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                background: theme.cardBg,
                border: `1px solid ${theme.border}`,
                borderRadius: "6px",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: theme.text }}>{c.nombre}</div>
                <div style={{ fontSize: "11px", color: theme.subtext }}>
                  Conectada: {new Date(c.creado_en).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => borrarCuenta(c.id, c.nombre)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#c62828",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                🗑️ Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
