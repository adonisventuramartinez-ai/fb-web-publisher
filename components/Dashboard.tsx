"use client";

import { useEffect, useState } from "react";

interface PublicacionHistorial {
  id: string;
  fecha: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  paginas: number;
  exitos: number;
  errores: number;
  resultados: any[];
}

interface DashboardProps {
  historial: PublicacionHistorial[];
}

export default function Dashboard({ historial }: DashboardProps) {
  const [totalPublicaciones, setTotalPublicaciones] = useState(0);
  const [totalExitos, setTotalExitos] = useState(0);
  const [totalErrores, setTotalErrores] = useState(0);
  const [tasaExito, setTasaExito] = useState(0);
  const [publicacionesPorDia, setPublicacionesPorDia] = useState<{ dia: string; publicaciones: number }[]>([]);
  const [paginasPopulares, setPaginasPopulares] = useState<{ nombre: string; publicaciones: number }[]>([]);

  useEffect(() => {
    if (historial.length === 0) return;

    // Calcular estadísticas básicas
    const totalPub = historial.length;
    const exitos = historial.reduce((acc, p) => acc + p.exitos, 0);
    const errores = historial.reduce((acc, p) => acc + p.errores, 0);
    const tasa = totalPub > 0 ? (exitos / (exitos + errores)) * 100 : 0;

    setTotalPublicaciones(totalPub);
    setTotalExitos(exitos);
    setTotalErrores(errores);
    setTasaExito(tasa);

    // Agrupar por día (últimos 7 días)
    const dias: { [key: string]: number } = {};
    historial.forEach(p => {
      const fecha = new Date(p.fecha).toLocaleDateString();
      dias[fecha] = (dias[fecha] || 0) + 1;
    });

    const porDia = Object.entries(dias)
      .map(([dia, count]) => ({ dia, publicaciones: count }))
      .sort((a, b) => new Date(a.dia).getTime() - new Date(b.dia).getTime())
      .slice(-7);

    setPublicacionesPorDia(porDia);

    // Páginas más populares
    const paginas: { [key: string]: number } = {};
    historial.forEach(p => {
      p.resultados.forEach((r: any) => {
        paginas[r.pagina] = (paginas[r.pagina] || 0) + 1;
      });
    });

    const populares = Object.entries(paginas)
      .map(([nombre, count]) => ({ nombre, publicaciones: count }))
      .sort((a, b) => b.publicaciones - a.publicaciones)
      .slice(0, 5);

    setPaginasPopulares(populares);

  }, [historial]);

  if (historial.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#5f6368" }}>
        <span style={{ fontSize: "48px", display: "block", marginBottom: "12px" }}>📊</span>
        <p>No hay datos para mostrar</p>
        <p style={{ fontSize: "13px" }}>Publica contenido para ver estadísticas aquí</p>
      </div>
    );
  }

  return (
    <div>
      {/* Tarjetas de estadísticas */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "12px",
        marginBottom: "24px"
      }}>
        <div style={{ background: "white", padding: "16px", borderRadius: "8px", border: "1px solid #e0e0e0", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#5f6368" }}>Total Publicaciones</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1a73e8" }}>{totalPublicaciones}</div>
        </div>
        <div style={{ background: "white", padding: "16px", borderRadius: "8px", border: "1px solid #e0e0e0", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#5f6368" }}>Exitosas</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#1e7e34" }}>{totalExitos}</div>
        </div>
        <div style={{ background: "white", padding: "16px", borderRadius: "8px", border: "1px solid #e0e0e0", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#5f6368" }}>Tasa de Éxito</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#7c3aed" }}>{tasaExito.toFixed(1)}%</div>
        </div>
        <div style={{ background: "white", padding: "16px", borderRadius: "8px", border: "1px solid #e0e0e0", textAlign: "center" }}>
          <div style={{ fontSize: "13px", color: "#5f6368" }}>Fallidas</div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#c62828" }}>{totalErrores}</div>
        </div>
      </div>

      {/* Actividad por día */}
      {publicacionesPorDia.length > 0 && (
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e0e0e0", marginBottom: "24px" }}>
          <h4 style={{ fontSize: "15px", fontWeight: "500", margin: "0 0 16px 0" }}>📊 Actividad Últimos 7 Días</h4>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", minHeight: "100px" }}>
            {publicacionesPorDia.map((item) => {
              const max = Math.max(...publicacionesPorDia.map(d => d.publicaciones), 1);
              const height = (item.publicaciones / max) * 80 + 20;
              return (
                <div key={item.dia} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "100%", height: `${height}px`, background: "#1a73e8", borderRadius: "4px 4px 0 0", minHeight: "10px" }} />
                  <div style={{ fontSize: "11px", color: "#5f6368", textAlign: "center" }}>
                    {item.dia.split('/')[0]}/{item.dia.split('/')[1]}
                    <div style={{ fontSize: "10px", fontWeight: "600", color: "#1a73e8" }}>{item.publicaciones}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Páginas más populares */}
      {paginasPopulares.length > 0 && (
        <div style={{ background: "white", padding: "20px", borderRadius: "8px", border: "1px solid #e0e0e0" }}>
          <h4 style={{ fontSize: "15px", fontWeight: "500", margin: "0 0 16px 0" }}>🔥 Páginas más activas</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {paginasPopulares.map((pagina) => {
              const max = Math.max(...paginasPopulares.map(p => p.publicaciones), 1);
              const width = (pagina.publicaciones / max) * 100;
              return (
                <div key={pagina.nombre}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "2px" }}>
                    <span>{pagina.nombre}</span>
                    <span style={{ fontWeight: "600", color: "#1a73e8" }}>{pagina.publicaciones}</span>
                  </div>
                  <div style={{ background: "#f1f3f4", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
                    <div style={{ width: `${width}%`, height: "100%", background: "#1a73e8", borderRadius: "4px" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
