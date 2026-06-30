

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { dinero, fechaLinda, descargarBlob } from "../servicios/utiles";
import { Luz, Etiqueta } from "../componentes/EstadoVisual";
import { useAviso } from "../componentes/Confirmacion";

const MESES = [
  ["todos", "Todos los meses"], ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"],
  ["04", "Abril"], ["05", "Mayo"], ["06", "Junio"], ["07", "Julio"], ["08", "Agosto"],
  ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
];

// Filtros
const ESTADOS_HISTORIAL = [
  { id: "finalizado", texto: "Finalizados", color: "verde" },
  { id: "cancelado", texto: "Cancelados", color: "rojo" },
];


function filasACSV(filas) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return filas.map((fila) => fila.map(esc).join(";")).join("\r\n");
}

// Descarga un texto como archivo. El BOM (﻿) hace que Excel muestre bien los acentos y el símbolo de colón.
function descargarTexto(nombre, contenido) {
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export function Historial({ irADetalle }) {
  const avisar = useAviso();
  const [proyectos, setProyectos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [anio, setAnio] = useState("todos");
  const [mes, setMes] = useState("todos");
  const [filtro, setFiltro] = useState(null);  // finalizado / cancelado

  function alternarFiltro(id) {
    setFiltro((f) => (f === id ? null : id));  // clic en el activo lo quita (muestra todos)
  }

  useEffect(() => {
    api.listarProyectos().then(setProyectos).catch(console.error);
  }, []);

  const esCerrado = (p) => p.estado === "finalizado" || p.estado === "cancelado";

  // Años disponibles según la fecha de cierre de los proyectos cerrados.
  const anios = [...new Set(
    proyectos.filter((p) => esCerrado(p) && p.fecha_fin).map((p) => p.fecha_fin.slice(0, 4))
  )].sort().reverse();

  const cerrados = proyectos
    .filter(esCerrado)
    .filter((p) => !filtro || p.estado === filtro)
    .filter((p) => {
      const t = busqueda.toLowerCase().trim();
      if (!t) return true;
      return p.nombre.toLowerCase().includes(t) || p.cliente.toLowerCase().includes(t);
    })

    // Filtro por mes/año de cierre.
    .filter((p) => {
      if (!p.fecha_fin) return anio === "todos" && mes === "todos";
      const [a, m] = p.fecha_fin.split("-");
      if (anio !== "todos" && a !== anio) return false;
      if (mes !== "todos" && m !== mes) return false;
      return true;
    });

  // Exporta a CSV los proyectos del historial que coinciden con el filtro
  function exportar() {
    const encabezados = [
      "ID", "Proyecto", "Cliente", "Tipo", "Estado", "Monto contratado", "Fecha inicio",
      "Fecha cierre", "Duracion (dias)", "Total entradas", "Total salidas", "Ganancia",
    ];
    const filas = cerrados.map((p) => [
      p.id, p.nombre, p.cliente, p.tipo, p.estado_texto, p.total, p.fecha_inicio, p.fecha_fin,
      p.duracion ?? "", p.total_entradas, p.total_salidas, p.ganancia,
    ]);
    // Totales de la selección.
    const suma = (campo) => cerrados.reduce((acc, p) => acc + (p[campo] || 0), 0);
    filas.push([
      "TOTALES", "", "", "", "", suma("total"), "", "", "",
      suma("total_entradas"), suma("total_salidas"), suma("ganancia"),
    ]);

    const etiquetaMes = MESES.find(([v]) => v === mes)?.[1] || "Todos";
    const sufijo = `${anio === "todos" ? "todos-los-anios" : anio}_${etiquetaMes}`;
    descargarTexto(`historial_${sufijo}.csv`, filasACSV([encabezados, ...filas]));
  }

  async function descargarPdf(p) {
    try {
      const blob = await api.descargarPdf(p.id);
      descargarBlob(`cierre_${p.nombre.replace(/ /g, "_")}.pdf`, blob);
    } catch (e) { avisar({ titulo: "No se pudo exportar", mensaje: e.message }); }
  }

  return (
    <div>
      <div className="titulo-seccion">Historial de proyectos</div>
      <div className="subtitulo">Proyectos cerrados (finalizados y cancelados). Entra a cualquiera para ver todo su registro.</div>

      <div className="barra-busqueda-filtros">
        <div className="buscador">
          <i className="ti ti-search icono" />
          <input type="text" placeholder="Buscar por nombre o cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {busqueda && (
            <button type="button" className="limpiar-busqueda" onClick={() => setBusqueda("")} title="Limpiar" aria-label="Limpiar búsqueda">
              <i className="ti ti-x" />
            </button>
          )}
        </div>
        <div className="filtros-estado">
          {ESTADOS_HISTORIAL.map((e) => (
            <button key={e.id} className={`filtro-estado ${filtro === e.id ? "activo" : ""}`} onClick={() => alternarFiltro(e.id)}>
              <Luz color={e.color} /> {e.texto}
            </button>
          ))}
        </div>
      </div>

      <div className="filtros">
        <span className="subtitulo" style={{ margin: 0 }}>Cerrados en:</span>
        <select value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: "auto" }}>
          <option value="todos">Todos los años</option>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: "auto" }}>
          {MESES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <button className="btn btn-secundario btn-sm" style={{ marginLeft: "auto" }} onClick={exportar} disabled={cerrados.length === 0} title="Descargar en CSV (Excel)">
          <i className="ti ti-file-spreadsheet" /> Exportar CSV
        </button>
      </div>

      {cerrados.length === 0 ? (
        <div className="vacio">{(busqueda || anio !== "todos" || mes !== "todos" || filtro) ? "Ningún proyecto coincide con los filtros." : "Aún no hay proyectos cerrados."}</div>
      ) : (
        <table className="tabla-datos">
          <thead>
            <tr>
              <th className="num">ID</th>
              <th>Proyecto</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Inicio</th>
              <th>Cierre</th>
              <th className="num">Monto</th>
              <th className="num">Ganancia</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cerrados.map((p) => (
              <tr key={p.id}>
                <td className="num" style={{ color: "var(--texto-suave)", fontVariantNumeric: "tabular-nums" }}>{p.id}</td>
                <td style={{ cursor: "pointer" }} onClick={() => irADetalle(p.id)}><strong>{p.nombre}</strong></td>
                <td style={{ cursor: "pointer" }} onClick={() => irADetalle(p.id)}>{p.cliente}</td>
                <td><Etiqueta color={p.estado_color} texto={p.estado_texto} /></td>
                <td>{fechaLinda(p.fecha_inicio)}</td>
                <td>{fechaLinda(p.fecha_fin)}</td>
                <td className="num">{dinero(p.total)}</td>
                <td className={`num ${p.ganancia >= 0 ? "pos" : "neg"}`}>{dinero(p.ganancia)}</td>
                <td className="num">
                  <button className="btn btn-secundario btn-sm" onClick={() => descargarPdf(p)} title="Exportar PDF">
                    <i className="ti ti-download" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
