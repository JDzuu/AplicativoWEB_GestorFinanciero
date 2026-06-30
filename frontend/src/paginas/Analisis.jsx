

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { dinero, fechaLinda } from "../servicios/utiles";

const MESES = [
  ["todos", "Todos los meses"], ["01", "Enero"], ["02", "Febrero"], ["03", "Marzo"],
  ["04", "Abril"], ["05", "Mayo"], ["06", "Junio"], ["07", "Julio"], ["08", "Agosto"],
  ["09", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
];
const TRIMESTRES = [
  ["todos", "Todos"], ["1", "1.º trimestre"], ["2", "2.º trimestre"],
  ["3", "3.º trimestre"], ["4", "4.º trimestre"],
];

export function Analisis() {
  const [periodo, setPeriodo] = useState("mensual"); // mensual | trimestral | anual
  const [anio, setAnio] = useState("todos");
  const [mes, setMes] = useState("todos");
  const [trimestre, setTrimestre] = useState("todos");
  const [datos, setDatos] = useState(null);
  const [anios, setAnios] = useState([]);


  // Orden de la tabla de rentabilidad
  const [orden, setOrden] = useState({ campo: "ganancia", dir: "desc" });

  // Filtro dinámico
  const [seleccion, setSeleccion] = useState([]);

  // Controles del gráfico
  const [buscarGrafico, setBuscarGrafico] = useState("");
  const [ordenGrafico, setOrdenGrafico] = useState("desc");

  // Orden de la lista de cancelados
  const [ordenCancelados, setOrdenCancelados] = useState("desc");

  // Orden de la tabla de rendimiento por tiempo
  const [ordenDuracion, setOrdenDuracion] = useState("asc");

  // Carga los años disponibles una vez (de finalizados y cancelados).
  useEffect(() => {
    api.listarProyectos().then((ps) => {
      const cerrados = ps.filter((p) => (p.estado === "finalizado" || p.estado === "cancelado") && p.fecha_fin);
      const aa = [...new Set(cerrados.map((p) => p.fecha_fin.slice(0, 4)))].sort();
      setAnios(aa);
    }).catch(console.error);
  }, []);

  // Recarga el análisis cuando cambian los filtros
  useEffect(() => {
    const params = { anio };
    if (periodo === "mensual") params.mes = mes;
    if (periodo === "trimestral") params.trimestre = trimestre;
    api.analisis(params).then((d) => { setDatos(d); setSeleccion([]); }).catch(console.error);
  }, [periodo, anio, mes, trimestre]);

  if (!datos) return <div className="vacio">Cargando…</div>;

  const ind = datos.indicadores;                 // finalizados
  const indCan = datos.indicadores_cancelados;   // cancelados
  const cancelados = datos.cancelados || [];
  const hayAlgo = ind || indCan;

  // Cambia el orden de una columna de la tabla de rentabilidad
  function ordenarPor(campo) {
    setOrden((o) => {
      if (o.campo === campo) return { campo, dir: o.dir === "asc" ? "desc" : "asc" };
      return { campo, dir: campo === "nombre" ? "asc" : "desc" };
    });
  }

  // Alterna un proyecto en el filtro dinámico
  function alternarSeleccion(id) {
    setSeleccion((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  // Proyectos del gráfico
  const proyectosGrafico = datos.proyectos
    .filter((p) => p.nombre.toLowerCase().includes(buscarGrafico.toLowerCase().trim()))
    .sort((a, b) => (a.ganancia - b.ganancia) * (ordenGrafico === "asc" ? 1 : -1));

  // Filtro dinámico
  const seleccionados = seleccion.length ? datos.proyectos.filter((p) => seleccion.includes(p.id)) : datos.proyectos;

  // Tabla de rentabilidad
  const rentabilidad = [...seleccionados].sort((a, b) => {
    const factor = orden.dir === "asc" ? 1 : -1;
    if (orden.campo === "nombre") return a.nombre.localeCompare(b.nombre) * factor;
    return (a[orden.campo] - b[orden.campo]) * factor;
  });

  // Tabla de rendimiento por tiempo
  const rendimiento = seleccionados
    .filter((p) => p.duracion !== null)
    .sort((a, b) => (a.duracion - b.duracion) * (ordenDuracion === "asc" ? 1 : -1));

  // Lista de cancelados ordenada por saldo neto
  const canceladosOrdenados = [...cancelados].sort((a, b) => {
    const na = a.total_entradas - a.total_salidas;
    const nb = b.total_entradas - b.total_salidas;
    return (na - nb) * (ordenCancelados === "asc" ? 1 : -1);
  });

  return (
    <div>
      <div className="titulo-seccion">Análisis financiero</div>
      <div className="subtitulo">Proyectos finalizados y cancelados en el período seleccionado.</div>

      <div className="filtros">
        <button className={`chip ${periodo === "mensual" ? "activo" : ""}`} onClick={() => setPeriodo("mensual")}>Mensual</button>
        <button className={`chip ${periodo === "trimestral" ? "activo" : ""}`} onClick={() => setPeriodo("trimestral")}>Trimestral</button>
        <button className={`chip ${periodo === "anual" ? "activo" : ""}`} onClick={() => setPeriodo("anual")}>Anual</button>

        <select value={anio} onChange={(e) => setAnio(e.target.value)} style={{ width: "auto" }}>
          <option value="todos">Todos los años</option>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        {periodo === "mensual" && (
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: "auto" }}>
            {MESES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        )}
        {periodo === "trimestral" && (
          <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} style={{ width: "auto" }}>
            {TRIMESTRES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        )}
      </div>

      {!hayAlgo ? (
        <div className="vacio">No hay proyectos cerrados en este período.</div>
      ) : (
        <>
          {ind && (
            <>
              <h3 className="analisis-grupo">Proyectos finalizados</h3>
              <div className="metricas">
                <div className="metrica"><div className="etq">Ingresos totales</div><div className="val">{dinero(ind.ingresos_totales)}</div></div>
                <div className="metrica"><div className="etq">Gastos totales</div><div className="val">{dinero(ind.gastos_totales)}</div></div>
                <div className="metrica"><div className="etq">Ganancia total</div><div className="val" style={{ color: "var(--verde)" }}>{dinero(ind.ganancia_total)}</div></div>
                <div className="metrica"><div className="etq">Proyectos finalizados</div><div className="val">{ind.cantidad}</div></div>
              </div>
              <div className="resumen-auto">
                <h3>Resumen automático</h3>
                <ResumenFinalizados ind={ind} />
              </div>
            </>
          )}

          {indCan && (
            <>
              <div className="grupo-cabecera">
                <h3 className="analisis-grupo">Proyectos cancelados</h3>
                <OrdenBotones dir={ordenCancelados} onCambiar={setOrdenCancelados} />
              </div>
              <div className="metricas">
                <div className="metrica"><div className="etq">Cancelados</div><div className="val">{indCan.cantidad}</div></div>
                <div className="metrica"><div className="etq">Total cobrado</div><div className="val">{dinero(indCan.total_cobrado)}</div></div>
                <div className="metrica"><div className="etq">Total gastado</div><div className="val">{dinero(indCan.total_gastado)}</div></div>
                <div className="metrica"><div className="etq">Saldo neto</div><div className="val" style={{ color: indCan.neto >= 0 ? "var(--verde)" : "var(--rojo)" }}>{dinero(indCan.neto)}</div></div>
              </div>
              <div className="lista-cancelados">
                {canceladosOrdenados.map((p) => {
                  const neto = p.total_entradas - p.total_salidas;
                  return (
                    <div key={p.id} className="fila-cancelado">
                      <span className="nombre">{p.nombre}</span>
                      <span className="num" style={{ color: neto >= 0 ? "var(--verde)" : "var(--rojo)" }}>{dinero(neto)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {ind && (
            <>
              <div className="grafico">
                <div className="grupo-cabecera">
                  <h3 style={{ margin: 0 }}>Ganancia por proyecto</h3>
                  <div className="grafico-controles">
                    <div className="buscador-mini">
                      <i className="ti ti-search icono" />
                      <input type="text" placeholder="Buscar proyecto…" value={buscarGrafico} onChange={(e) => setBuscarGrafico(e.target.value)} />
                      {buscarGrafico && (
                        <button type="button" className="limpiar-mini" onClick={() => setBuscarGrafico("")} title="Limpiar" aria-label="Limpiar búsqueda">
                          <i className="ti ti-x" />
                        </button>
                      )}
                    </div>
                    <OrdenBotones dir={ordenGrafico} onCambiar={setOrdenGrafico} />
                  </div>
                </div>
                <div className="subtitulo" style={{ marginTop: 6 }}>
                  Haz clic en una barra para filtrar las tablas de abajo.
                  {seleccion.length > 0 && (
                    <> · <button className="enlace-limpiar" onClick={() => setSeleccion([])}>Quitar filtro ({seleccion.length})</button></>
                  )}
                </div>
                <GraficoBarras proyectos={proyectosGrafico} seleccion={seleccion} onClickBarra={alternarSeleccion} />
              </div>

              <h3 style={{ fontSize: 15, marginBottom: 10 }}>
                Rentabilidad por proyecto
                {seleccion.length > 0 && <span className="subtitulo" style={{ marginLeft: 8 }}>· {rentabilidad.length} seleccionado(s)</span>}
              </h3>
              <div className="tabla-scroll">
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <Th campo="nombre" orden={orden} onOrdenar={ordenarPor}>Proyecto</Th>
                      <Th campo="total_entradas" orden={orden} onOrdenar={ordenarPor} num>Ingresos</Th>
                      <Th campo="total_salidas" orden={orden} onOrdenar={ordenarPor} num>Gastos</Th>
                      <Th campo="ganancia" orden={orden} onOrdenar={ordenarPor} num>Ganancia</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentabilidad.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.nombre}</strong></td>
                        <td className="num">{dinero(p.total_entradas)}</td>
                        <td className="num">{dinero(p.total_salidas)}</td>
                        <td className={`num ${p.ganancia >= 0 ? "pos" : "neg"}`}>{dinero(p.ganancia)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tabla de rendimiento por tiempo */}
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>
                Rendimiento por tiempo de ejecución
                {seleccion.length > 0 && <span className="subtitulo" style={{ marginLeft: 8 }}>· {rendimiento.length} seleccionado(s)</span>}
              </h3>
              <div className="tabla-scroll">
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Proyecto</th>
                      <th>Inicio</th>
                      <th>Cierre</th>
                      <th className="num th-ordenable" onClick={() => setOrdenDuracion((d) => (d === "asc" ? "desc" : "asc"))} title="Clic para ordenar">
                        Duración{ordenDuracion === "asc" ? " ▲" : " ▼"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rendimiento.map((p) => (
                      <tr key={p.id}>
                        <td><strong>{p.nombre}</strong></td>
                        <td>{fechaLinda(p.fecha_inicio)}</td>
                        <td>{fechaLinda(p.fecha_fin)}</td>
                        <td className="num">{p.duracion} días</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Monto resaltado
function Monto({ valor }) {
  return <strong style={{ color: valor >= 0 ? "var(--verde)" : "var(--rojo)" }}>{dinero(valor)}</strong>;
}

// Resumen automático con formato
function ResumenFinalizados({ ind }) {
  const mr = ind.mas_rentable;
  const me = ind.menos_rentable;
  const mf = ind.mas_rapido;
  const perdidas = ind.proyectos_perdida;

  // La lista de pérdidas empieza oculta; el usuario la despliega cuando quiere.
  const [verPerdidas, setVerPerdidas] = useState(false);

  return (
    <ul>
      <li>En el período se finalizaron {ind.cantidad} proyecto(s).</li>
      <li>La ganancia total generada fue de <Monto valor={ind.ganancia_total} />.</li>
      {mr && (
        <li>El proyecto con mayor ganancia fue <strong>"{mr.nombre}"</strong> con <Monto valor={mr.ganancia} />.</li>
      )}
      {me && me.id !== (mr && mr.id) && (
        <li>El de menor rentabilidad fue <strong>"{me.nombre}"</strong> con <Monto valor={me.ganancia} />.</li>
      )}
      {perdidas.length > 0 ? (
        <li>
          Proyecto(s) con pérdida ({perdidas.length}){" "}
          <button className="enlace-desplegar" onClick={() => setVerPerdidas((v) => !v)}>
            {verPerdidas ? "▲ Ocultar" : "▼ Mostrar"}
          </button>
          {verPerdidas && (
            <ul className="sublista-perdida">
              {perdidas.map((p) => <li key={p.id}>{p.nombre}</li>)}
            </ul>
          )}
        </li>
      ) : (
        <li>Ningún proyecto registró pérdidas.</li>
      )}
      {mf && mf.duracion != null && (
        <li>El proyecto más rápido de ejecutar fue <strong>"{mf.nombre}"</strong> ({mf.duracion} días).</li>
      )}
    </ul>
  );
}

// Par de botones para ordenar ascendente / descendente (mayor o menor primero).
function OrdenBotones({ dir, onCambiar }) {
  return (
    <div className="orden-mini">
      <button className={dir === "desc" ? "activo" : ""} onClick={() => onCambiar("desc")} title="Mayor a menor">
        <i className="ti ti-arrow-up" /> Mayor
      </button>
      <button className={dir === "asc" ? "activo" : ""} onClick={() => onCambiar("asc")} title="Menor a mayor">
        <i className="ti ti-arrow-down" /> Menor
      </button>
    </div>
  );
}

// Encabezado de columna ordenable
function Th({ campo, orden, onOrdenar, num, children }) {
  const activo = orden.campo === campo;
  const flecha = activo ? (orden.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className={`${num ? "num" : ""} th-ordenable`} onClick={() => onOrdenar(campo)} title="Clic para ordenar">
      {children}{flecha}
    </th>
  );
}

// Botón pequeño para copiar
function BotonCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar(e) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (_) {}
  }

  return (
    <button
      type="button"
      className={`btn-copiar ${copiado ? "copiado" : ""}`}
      onClick={copiar}
      title={copiado ? "¡Copiado!" : "Copiar nombre"}
      aria-label="Copiar nombre del proyecto"
    >
      <i className={`ti ${copiado ? "ti-check" : "ti-copy"}`} />
    </button>
  );
}

// Gráfico de barras horizontal
function GraficoBarras({ proyectos, seleccion, onClickBarra }) {
  if (proyectos.length === 0) return <div className="subtitulo" style={{ margin: 0 }}>Sin resultados.</div>;
  const max = Math.max(...proyectos.map((p) => Math.abs(p.ganancia)), 1);
  return (
    <div className="grafico-scroll">
      {proyectos.map((p) => {
        const ancho = (Math.abs(p.ganancia) / max) * 100;
        const color = p.ganancia >= 0 ? "var(--verde)" : "var(--rojo)";
        const sel = seleccion.includes(p.id);
        return (
          <div
            key={p.id}
            className={`barra-fila clicable ${seleccion.length && !sel ? "atenuada" : ""}`}
            onClick={() => onClickBarra(p.id)}
            title={`${p.nombre} · clic para filtrar`}
          >
            <div className="etiq">
              <span>{p.nombre}</span>
              <BotonCopiar texto={p.nombre} />
            </div>
            <div className="barra-pista">
              <div className="barra-relleno" style={{ width: `${ancho}%`, background: color }}>{dinero(p.ganancia)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
