"use client";

import { useEffect, useState } from "react";

interface DashboardStats {
  totalPublicaciones: number;
  totalExitos: number;
  totalErrores: number;
  tasaExito: number;
  publicacionesPorDia: { dia: string; publicaciones: number }[];
  paginasPopulares: { nombre: string; publicaciones: number }[];
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
  resultados: any[];
}

interface DashboardProps {
  historial: PublicacionHistorial[];
}

export default function Dashboard({ historial }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalPublicaciones: 0,
    totalExitos: 0,
    totalErrores: 0,
    tasaExito: 0,
    publicacionesPorDia: [],
    paginasPopulares: []
  });

  useEffect(() => {
    if (historial.length === 0) return;

    // Calcular estadísticas
    const totalPub = historial.length;
    const totalExitos = historial.reduce((acc, p) => acc + p.exitos, 0);
    const totalErrores = historial.reduce((acc, p) => acc + p.errores, 0);
    const tasaExito = totalPub > 0 ? (totalExitos / (totalExitos + totalErrores)) * 100 : 0;

    // Agrupar por día
    const dias: { [key: string]: number } = {};
    historial.forEach(p => {
      const fecha = new Date(p.fecha).toLocaleDateString();
      dias[fecha] = (dias[fecha] || 0) + 1;
    });

    const publicacionesPorDia = Object.entries(dias)
      .map(([dia, publicaciones]) => ({ dia, publicaciones }))
      .sort((a, b) => new Date(a.dia).getTime() - new Date(b.dia).getTime())
      .slice(-7); // Últimos 7 días

    // Contar páginas populares
    const paginas: { [key: string]: number } = {};
    historial.forEach(p => {
      p.resultados.forEach((r: any) => {
        paginas[r.pagina] = (paginas[r.pagina] || 0) + 1;
      });
    });

    const paginasPopulares = Object.entries(paginas)
      .map(([nombre, publicaciones]) => ({ nombre, publicaciones }))
      .sort((a, b) => b.publicaciones - a.publicaciones)
      .slice(0, 5);

    setStats({
      totalPublicaciones: totalPub,
      totalExitos,
      totalErrores,
      tasaExito,
      publicacionesPorDia,
      paginasPopulares
    });

  }, [historial]);

  return (
    <div>
      {/* Tarjetas de estadísticas */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "24px"
      }}>
        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "14px", color: "#5f6368" }}>Total Publicaciones</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#1a73e8" }}>
            {stats.totalPublicaciones}
          </div>
        </div>

        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "14px", color: "#5f6368" }}>Publicaciones Exitosas</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#1e7e34" }}>
            {stats.totalExitos}
          </div>
        </div>

        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "14px", color: "#5f6368" }}>Tasa de Éxito</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#7c3aed" }}>
            {stats.tasaExito.toFixed(1)}%
          </div>
        </div>

        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          textAlign: "center"
        }}>
          <div style={{ fontSize: "14px", color: "#5f6368" }}>Publicaciones Fallidas</div>
          <div style={{ fontSize: "32px", fontWeight: "700", color: "#c62828" }}>
            {stats.totalErrores}
          </div>
        </div>
      </div>

      {/* Actividad por día */}
      {stats.publicacionesPorDia.length > 0 && (
        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0",
          marginBottom: "24px"
        }}>
          <h4 style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 16px 0" }}>
            📊 Actividad Últimos 7 Días
          </h4>
          <div style={{
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            minHeight: "120px"
          }}>
            {stats.publicacionesPorDia.map((item) => {
              const max = Math.max(...stats.publicacionesPorDia.map(d => d.publicaciones), 1);
              const height = (item.publicaciones / max) * 100;
              return (
                <div key={item.dia} style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px"
                }}>
                  <div style={{
                    width: "100%",
                    height: `${Math.max(height, 10)}px`,
                    background: "#1a73e8",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.5s ease"
                  }} />
                  <div style={{ fontSize: "11px", color: "#5f6368", textAlign: "center" }}>
                    {item.dia.split('/')[0]}/{item.dia.split('/')[1]}
                    <div style={{ fontSize: "10px", fontWeight: "600", color: "#1a73e8" }}>
                      {item.publicaciones}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Páginas más populares */}
      {stats.paginasPopulares.length > 0 && (
        <div style={{
          background: "white",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #e0e0e0"
        }}>
          <h4 style={{ fontSize: "16px", fontWeight: "500", margin: "0 0 16px 0" }}>
            🔥 Páginas más activas
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {stats.paginasPopulares.map((pagina) => {
              const max = Math.max(...stats.paginasPopulares.map(p => p.publicaciones), 1);
              const width = (pagina.publicaciones / max) * 100;
              return (
                <div key={pagina.nombre}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "13px",
                    marginBottom: "2px"
                  }}>
                    <span>{pagina.nombre}</span>
                    <span style={{ fontWeight: "600", color: "#1a73e8" }}>
                      {pagina.publicaciones}
                    </span>
                  </div>
                  <div style={{
                    background: "#f1f3f4",
                    borderRadius: "4px",
                    height: "8px",
                    overflow: "hidden"
                  }}>
                    <div style={{
                      width: `${width}%`,
                      height: "100%",
                      background: "#1a73e8",
                      borderRadius: "4px",
                      transition: "width 0.5s ease"
                    }} />
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
