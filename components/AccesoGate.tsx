"use client";

import { useEffect, useState } from "react";

type EstadoAcceso = "cargando" | "pendiente" | "aprobado" | "rechazado" | "sin_login";

interface AccesoGateProps {
  token: string | null;
  children: React.ReactNode;
}

export default function AccesoGate({ token, children }: AccesoGateProps) {
  const [estado, setEstado] = useState<EstadoAcceso>("cargando");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setEstado("sin_login");
      return;
    }
    registrarYVerificar(token);
  }, [token]);

  async function registrarYVerificar(t: string) {
    try {
      // 1) Obtener id y nombre de Facebook del usuario logueado
      const meRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${t}&fields=id,name`);
      const me = await meRes.json();
      if (me.error) {
        setEstado("sin_login");
        return;
      }
      setNombre(me.name);

      // 2) Registrar (o recuperar) la solicitud de acceso
      const solicitudRes = await fetch("/api/acceso/solicitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fb_id: me.id, nombre: me.name }),
      });
      const solicitud = await solicitudRes.json();
      setCodigo(solicitud.codigo_solicitud);
      setEstado(solicitud.estado);

      // 3) Si sigue pendiente, consultar cada 10s por si el admin ya lo aprobó
      if (solicitud.estado === "pendiente") {
        const intervalo = setInterval(async () => {
          const check = await fetch(`/api/acceso/estado?fb_id=${me.id}`);
          const data = await check.json();
          if (data.estado && data.estado !== "pendiente") {
            setEstado(data.estado);
            clearInterval(intervalo);
          }
        }, 10000);
        return () => clearInterval(intervalo);
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (estado === "sin_login") {
    return <>{children}</>; // deja pasar a la pantalla normal de "Conectar con Facebook"
  }

  if (estado === "cargando") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#5f6368" }}>
        Verificando acceso...
      </div>
    );
  }

  if (estado === "pendiente") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", fontFamily: "sans-serif", padding: "16px" }}>
        <div style={{ background: "white", padding: "32px", borderRadius: "8px", maxWidth: "380px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>Hola, {nombre}</h2>
          <p style={{ color: "#5f6368", fontSize: "14px", marginBottom: "16px" }}>
            Tu acceso está pendiente de aprobación. Envía este código al administrador para activarlo:
          </p>
          <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "4px", background: "#f8f9fa", padding: "12px", borderRadius: "8px", marginBottom: "12px" }}>
            {codigo}
          </div>
          <p style={{ fontSize: "12px", color: "#9aa0a6" }}>Esta pantalla se actualiza sola cada 10 segundos.</p>
        </div>
      </div>
    );
  }

  if (estado === "rechazado") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5", fontFamily: "sans-serif", padding: "16px" }}>
        <div style={{ background: "white", padding: "32px", borderRadius: "8px", maxWidth: "380px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚫</div>
          <h2 style={{ margin: "0 0 8px 0", fontSize: "18px" }}>Acceso no autorizado</h2>
          <p style={{ color: "#5f6368", fontSize: "14px" }}>
            El administrador no aprobó tu solicitud. Contáctalo si crees que es un error.
          </p>
        </div>
      </div>
    );
  }

  // aprobado
  return <>{children}</>;
}
