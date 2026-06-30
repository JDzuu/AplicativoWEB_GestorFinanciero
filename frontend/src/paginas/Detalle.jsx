

// Datos generales

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { dinero, fechaLinda, hoy, fechaMaxima, soloMontoPositivo, descargarBlob } from "../servicios/utiles";
import { Etiqueta } from "../componentes/EstadoVisual";
import { useConfirmacion, useAviso } from "../componentes/Confirmacion";

// Categorías para clasificar los gastos reales
const CATEGORIAS_SALIDA = [
  ["", "Sin categoría"],
  ["materiales", "Materiales"],
  ["mano_obra", "Mano de obra"],
  ["gastos", "Gastos adicionales"],
];
const NOMBRE_CAT_SALIDA = { materiales: "Materiales", mano_obra: "Mano de obra", gastos: "Gastos adicionales" };

export function Detalle({ proyectoId, volver }) {
  const [p, setP] = useState(null);
  const [estados, setEstados] = useState([]);
  const [comp, setComp] = useState(null);
  const confirmar = useConfirmacion();
  const avisar = useAviso();

  async function cargar() {
    try {
      setP(await api.obtenerProyecto(proyectoId));
      setComp(await api.comparacionProyecto(proyectoId));
    } catch (e) {
      console.error(e);
    }
  }

  async function exportarPdf() {
    try {
      const blob = await api.descargarPdf(p.id);
      descargarBlob(`cierre_${p.nombre.replace(/ /g, "_")}.pdf`, blob);
    } catch (e) {
      avisar({ titulo: "No se pudo completar", mensaje: e.message });
    }
  }

  async function finalizar() {
    const ok = await confirmar({
      titulo: "Finalizar proyecto",
      mensaje: "¿Finalizar el proyecto? Pasará al historial y dejará de aparecer en el dashboard.",
      textoConfirmar: "Finalizar",
      peligro: false,
    });
    if (!ok) return;
    try {
      await api.finalizar(p.id);
      cargar();
    } catch (e) {
      avisar({ titulo: "No se pudo completar", mensaje: e.message });
    }
  }

  async function pausar() {
    const ok = await confirmar({
      titulo: "Pausar proyecto",
      mensaje: "¿Pausar el proyecto? Se registrarán los días que esté en pausa hasta que lo reanudes.",
      textoConfirmar: "Pausar",
      peligro: false,
    });
    if (!ok) return;
    try {
      await api.pausar(p.id);
      cargar();
    } catch (e) {
      avisar({ titulo: "No se pudo completar", mensaje: e.message });
    }
  }

  async function reanudar() {
    try {
      await api.reanudar(p.id);
      cargar();
    } catch (e) {
      avisar({ titulo: "No se pudo completar", mensaje: e.message });
    }
  }

  async function cancelar() {
    const ok = await confirmar({
      titulo: "Cancelar proyecto",
      mensaje: "¿Cancelar el proyecto? Pasará al historial como «Cancelado». Esta acción no se puede deshacer.",
      textoConfirmar: "Cancelar proyecto",
      textoCancelar: "No, volver",
    });
    if (!ok) return;
    try {
      await api.cancelar(p.id);
      cargar();
    } catch (e) {
      avisar({ titulo: "No se pudo completar", mensaje: e.message });
    }
  }

  useEffect(() => {
    cargar();
    api.catalogos().then((c) => setEstados(c.estados_activos)).catch(console.error);
  }, [proyectoId]);

  if (!p) return <div className="vacio">Cargando…</div>;

  const finalizado = p.estado === "finalizado";
  const cancelado = p.estado === "cancelado";
  const pausado = p.estado === "pausa";
  const cerrado = finalizado || cancelado;
  const puedeFinalizar = p.porcentaje >= 100;

  const NOMBRE_ESTADO = { iniciando: "Iniciando", proceso: "En proceso", acabando: "Acabando" };

  return (
    <div>
      <button className="volver" onClick={volver}>← Volver</button>

      <div className="cabecera-detalle">
        <div>
          <div className="titulo-seccion">{p.nombre}</div>
          <div className="subtitulo" style={{ marginBottom: 0 }}>Tipo: {p.tipo}</div>
        </div>
        <Etiqueta color={p.estado_color} texto={p.estado_texto} />
      </div>

      {/* Datos generales */}
      <div className="datos-generales">
        <div className="grid-datos">
          <div className="dato"><div className="etq">Cliente</div><div className="val">{p.cliente}</div></div>
          <div className="dato"><div className="etq">Monto contratado</div><div className="val">{dinero(p.total)}</div></div>
          <div className="dato"><div className="etq">Fecha de inicio</div><div className="val">{fechaLinda(p.fecha_inicio)}</div></div>
          <div className="dato"><div className="etq">Cobrado</div><div className="val">{p.porcentaje}%</div></div>
          {cerrado && <div className="dato"><div className="etq">{cancelado ? "Fecha de cancelación" : "Fecha de cierre"}</div><div className="val">{fechaLinda(p.fecha_fin)}</div></div>}
          {p.duracion !== null && <div className="dato"><div className="etq">Duración</div><div className="val">{p.duracion} días</div></div>}
          {p.dias_pausa > 0 && <div className="dato"><div className="etq">Días en pausa</div><div className="val">{p.dias_pausa} días</div></div>}
        </div>

        {!cerrado && !pausado && (
          <div className="selector-estado">
            <label>Estado:</label>
            <select value={p.estado} style={{ width: "auto" }} onChange={async (e) => { await api.cambiarEstado(p.id, e.target.value); cargar(); }}>
              {estados.map((s) => <option key={s} value={s}>{NOMBRE_ESTADO[s]}</option>)}
            </select>
          </div>
        )}
        {pausado && <div className="selector-estado" style={{ color: "var(--texto-suave)" }}>⏸ Proyecto en pausa{p.dias_pausa > 0 ? ` · ${p.dias_pausa} día(s) acumulados` : ""}</div>}
      </div>

      <div className="saldo-caja">
        <div><div className="etq">Saldo actual del proyecto (entradas − salidas)</div></div>
        <div className="monto" style={{ color: p.saldo < 0 ? "var(--rojo)" : undefined }}>{dinero(p.saldo)}</div>
      </div>


      <div className="financiero">
        <SeccionEntradas p={p} bloqueado={cerrado || pausado} recargar={cargar} />
        <SeccionSalidas p={p} bloqueado={cerrado || pausado} recargar={cargar} partidas={comp && comp.tiene_presupuesto ? comp.items : []} />
      </div>


      {comp && comp.tiene_presupuesto && <ComparacionPresupuesto comp={comp} />}


      {cerrado ? (
        <div className="bloque-final">
          <h3 style={{ marginBottom: 8 }}>{cancelado ? "Proyecto cancelado" : "Proyecto finalizado"}</h3>
          <div className="subtitulo" style={{ marginBottom: 8 }}>{cancelado ? "Cancelado" : "Cerrado"} el {fechaLinda(p.fecha_fin)}</div>
          {finalizado && <div style={{ fontSize: 15, marginBottom: 14 }}>Ganancia final (total cobrado − total de salidas): <strong style={{ color: p.ganancia >= 0 ? "var(--verde)" : "var(--rojo)", fontSize: 18 }}>{dinero(p.ganancia)}</strong></div>}
          <button className="btn btn-secundario" onClick={exportarPdf}>
            <i className="ti ti-download" /> Exportar PDF
          </button>
        </div>
      ) : (
        <div className="acciones-detalle">
          {pausado ? (
            <button className="btn btn-principal" onClick={reanudar}><i className="ti ti-player-play" /> Reanudar proyecto</button>
          ) : (
            <>
              <button className="btn btn-verde" disabled={!puedeFinalizar}
                title={puedeFinalizar ? "" : "Disponible cuando el proyecto esté 100% cobrado"}
                onClick={finalizar}>Finalizar proyecto</button>
              <button className="btn btn-secundario" onClick={pausar}><i className="ti ti-player-pause" /> Pausar</button>
            </>
          )}
          <button className="btn btn-peligro" onClick={cancelar}>Cancelar proyecto</button>
        </div>
      )}
    </div>
  );
}

// Sección verde: entradas
function SeccionEntradas({ p, bloqueado, recargar }) {
  const [fecha, setFecha] = useState(hoy());
  const [monto, setMonto] = useState("");
  const [obs, setObs] = useState("");
  const [error, setError] = useState("");
  const confirmar = useConfirmacion();

  // Edición en línea de un pago ya registrado.
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ fecha: "", monto: "", obs: "", minFecha: hoy() });
  const [editError, setEditError] = useState("");

  function abrirEdicion(e) {
    setEditId(e.id);
    // Bloque las fechas anteriores
    setEditForm({ fecha: e.fecha, monto: String(e.monto), obs: e.observacion || "", minFecha: e.fecha < hoy() ? e.fecha : hoy() });
    setEditError("");
  }

  async function guardarEdicion() {
    setEditError("");
    if (!editForm.fecha) { setEditError("Faltan datos obligatorios: Fecha."); return; }
    if (!String(editForm.monto).trim()) { setEditError("Faltan datos obligatorios: Monto."); return; }
    if (isNaN(parseFloat(editForm.monto)) || parseFloat(editForm.monto) <= 0) {
      setEditError("Ingresa un monto mayor a 0.");
      return;
    }
    try {
      await api.editarEntrada(editId, {
        fecha: editForm.fecha,
        monto: parseFloat(editForm.monto),
        observacion: editForm.obs.trim() || null,
      });
      setEditId(null);
      recargar();
    } catch (e) {
      setEditError(e.message);
    }
  }

  async function eliminar(id) {
    const ok = await confirmar({
      titulo: "Eliminar pago",
      mensaje: "¿Seguro que quieres eliminar este pago? Esta acción no se puede deshacer.",
      textoConfirmar: "Eliminar pago",
    });
    if (!ok) return;
    await api.eliminarEntrada(id);
    setEditId(null);
    recargar();
  }

  async function agregar() {
    setError("");
    const faltan = [];
    if (!fecha) faltan.push("Fecha");
    if (!String(monto).trim()) faltan.push("Monto");
    if (faltan.length) { setError(`Faltan datos obligatorios: ${faltan.join(", ")}.`); return; }
    if (fecha < hoy()) { setError("La fecha no puede ser anterior a hoy."); return; }
    if (isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) { setError("Ingresa un monto mayor a 0."); return; }
    try {
      await api.agregarEntrada(p.id, {
        fecha,
        monto: parseFloat(monto),
        observacion: obs.trim() || null,
      });
      setMonto("");
      setObs("");
      recargar();
    } catch (e) {
      setError(e.message);
    }
  }

  // Registra el pulsado enter
  function alEnter(e) { if (e.key === "Enter") { e.preventDefault(); agregar(); } }

  function alEnterEd(e) { if (e.key === "Enter") { e.preventDefault(); guardarEdicion(); } }

  return (
    <div className="seccion-fin">
      <div className="cabeza cabeza-verde">Entradas · Pagos del cliente</div>
      <div className="cuerpo-fin">
        {p.entradas.length === 0 && <div className="subtitulo" style={{ margin: 0 }}>Sin pagos registrados.</div>}
        {p.entradas.map((e) => (
          editId === e.id ? (
            <div key={e.id} className="editor-registro">
              <div className="fila-campos">
                <input type="date" max={fechaMaxima()} value={editForm.fecha} onKeyDown={alEnterEd} onChange={(ev) => setEditForm((f) => ({ ...f, fecha: ev.target.value }))} />
                <input type="number" min="0" placeholder="Monto" value={editForm.monto} onKeyDown={(ev) => { soloMontoPositivo(ev); alEnterEd(ev); }} onChange={(ev) => setEditForm((f) => ({ ...f, monto: ev.target.value }))} />
              </div>
              <input type="text" placeholder="Observación (opcional)" value={editForm.obs} onKeyDown={alEnterEd} onChange={(ev) => setEditForm((f) => ({ ...f, obs: ev.target.value }))} />
              {editError && <div className="texto-error">{editError}</div>}
              <div className="acciones-editor">
                <button className="btn btn-verde btn-sm" onClick={guardarEdicion}>Guardar</button>
                <button className="btn btn-secundario btn-sm" onClick={() => setEditId(null)}>Cancelar</button>
                <button className="btn btn-peligro btn-sm" style={{ marginLeft: "auto" }} onClick={() => eliminar(e.id)}>Eliminar</button>
              </div>
            </div>
          ) : (
            <div key={e.id} className="registro">
              <div className="info">
                <div className="princ">{dinero(e.monto)}</div>
                <div className="sec">{fechaLinda(e.fecha)}{e.observacion ? ` · ${e.observacion}` : ""}</div>
              </div>
              {!bloqueado && <div className="monto-lado"><button className="editar" onClick={() => abrirEdicion(e)} title="Editar"><i className="ti ti-pencil" /></button></div>}
            </div>
          )
        ))}

        {!bloqueado && (
          <div className="form-registro">
            <div className="fila-campos">
              <input type="date" min={hoy()} max={fechaMaxima()} value={fecha} onKeyDown={alEnter} onChange={(e) => setFecha(e.target.value)} />
              <input type="number" min="0" placeholder="Monto recibido" value={monto} onKeyDown={(e) => { soloMontoPositivo(e); alEnter(e); }} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <input type="text" placeholder="Observación (opcional)" value={obs} onKeyDown={alEnter} onChange={(e) => setObs(e.target.value)} />
            <button className="btn btn-verde" onClick={agregar}>+ Registrar entrada</button>
            {error && <div className="texto-error">{error}</div>}
          </div>
        )}

        <div className="totales-fin">
          <div className="linea"><span>Total de entradas</span><span className="grande">{dinero(p.total_entradas)}</span></div>
        </div>
      </div>
    </div>
  );
}

// Sección roja: salidas
function SeccionSalidas({ p, bloqueado, recargar, partidas = [] }) {
  const [form, setForm] = useState({ fecha: hoy(), proveedor: "", descripcion: "", monto: "", observacion: "", categoria: "", partida_id: null });
  const [error, setError] = useState("");
  const confirmar = useConfirmacion();

  // Partidas del presupuesto YA registradas como gasto (no se pueden volver a cargar).
  const usados = new Set((p.salidas || []).map((s) => s.partida_id).filter((x) => x != null));

  // Partidas disponibles de la categoría elegida (las que aún no se han registrado).
  const partidasDeCategoria = form.categoria
    ? partidas.filter((it) => it.categoria === form.categoria && !usados.has(it.id))
    : [];

  function cargarPartida(itemId) {
    const it = partidas.find((x) => String(x.id) === String(itemId));
    if (!it) { setForm((f) => ({ ...f, partida_id: null })); return; }
    setForm((f) => ({
      ...f,
      descripcion: it.descripcion ? `${it.concepto} (${it.descripcion})` : it.concepto,
      monto: String(it.monto),
      partida_id: it.id,
    }));
  }

  // Edición en línea de un gasto ya registrado.
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ fecha: "", proveedor: "", descripcion: "", monto: "", observacion: "", categoria: "", minFecha: hoy() });
  const [editError, setEditError] = useState("");

  function set(c, v) { setForm((f) => ({ ...f, [c]: v })); }
  function setEd(c, v) { setEditForm((f) => ({ ...f, [c]: v })); }

  function abrirEdicion(s) {
    setEditId(s.id);
    // No se puede mover la fecha más atrás de la original (ni del día de hoy).
    setEditForm({ fecha: s.fecha, proveedor: s.proveedor, descripcion: s.descripcion, monto: String(s.monto), observacion: s.observacion || "", categoria: s.categoria || "", minFecha: s.fecha < hoy() ? s.fecha : hoy() });
    setEditError("");
  }

  async function guardarEdicion() {
    setEditError("");
    const faltan = [];
    if (!editForm.fecha) faltan.push("Fecha");
    if (!editForm.proveedor.trim()) faltan.push("Proveedor");
    if (!editForm.descripcion.trim()) faltan.push("Descripción");
    if (!String(editForm.monto).trim()) faltan.push("Monto");
    if (faltan.length) { setEditError(`Faltan datos obligatorios: ${faltan.join(", ")}.`); return; }
    if (isNaN(parseFloat(editForm.monto)) || parseFloat(editForm.monto) <= 0) {
      setEditError("Ingresa un monto mayor a 0.");
      return;
    }
    try {
      await api.editarSalida(editId, {
        ...editForm,
        monto: parseFloat(editForm.monto),
        observacion: editForm.observacion.trim() || null,
        categoria: editForm.categoria || null,
      });
      setEditId(null);
      recargar();
    } catch (e) {
      setEditError(e.message);
    }
  }

  async function eliminar(id) {
    const ok = await confirmar({
      titulo: "Eliminar gasto",
      mensaje: "¿Seguro que quieres eliminar este gasto? Esta acción no se puede deshacer.",
      textoConfirmar: "Eliminar gasto",
    });
    if (!ok) return;
    await api.eliminarSalida(id);
    setEditId(null);
    recargar();
  }

  async function agregar() {
    setError("");
    const faltan = [];
    if (!form.proveedor.trim()) faltan.push("Proveedor");
    if (!form.descripcion.trim()) faltan.push("Descripción");
    if (!String(form.monto).trim()) faltan.push("Monto");
    if (faltan.length) { setError(`Faltan datos obligatorios: ${faltan.join(", ")}.`); return; }
    if (isNaN(parseFloat(form.monto)) || parseFloat(form.monto) <= 0) { setError("Ingresa un monto mayor a 0."); return; }
    try {
      // La fecha del gasto es siempre la hora del momento
      await api.agregarSalida(p.id, {
        ...form,
        fecha: hoy(),
        monto: parseFloat(form.monto),
        observacion: form.observacion.trim() || null,
        categoria: form.categoria || null,
        partida_id: form.partida_id || null,
      });
      setForm({ fecha: hoy(), proveedor: "", descripcion: "", monto: "", observacion: "", categoria: "", partida_id: null });
      recargar();
    } catch (e) {
      setError(e.message);
    }
  }

  // Registra enter
  function alEnter(e) { if (e.key === "Enter") { e.preventDefault(); agregar(); } }
  function alEnterEd(e) { if (e.key === "Enter") { e.preventDefault(); guardarEdicion(); } }

  return (
    <div className="seccion-fin">
      <div className="cabeza cabeza-roja">Salidas · Gastos del proyecto</div>
      <div className="cuerpo-fin">
        {p.salidas.length === 0 && <div className="subtitulo" style={{ margin: 0 }}>Sin gastos registrados.</div>}
        {p.salidas.map((s) => (
          editId === s.id ? (
            <div key={s.id} className="editor-registro">
              <div className="fila-campos">
                <input type="text" placeholder="Proveedor" value={editForm.proveedor} onKeyDown={alEnterEd} onChange={(e) => setEd("proveedor", e.target.value)} />
                <input type="date" max={fechaMaxima()} value={editForm.fecha} onKeyDown={alEnterEd} onChange={(e) => setEd("fecha", e.target.value)} />
              </div>
              <input type="text" placeholder="Descripción del gasto" value={editForm.descripcion} onKeyDown={alEnterEd} onChange={(e) => setEd("descripcion", e.target.value)} />
              <input type="number" min="0" placeholder="Monto" value={editForm.monto} onKeyDown={(e) => { soloMontoPositivo(e); alEnterEd(e); }} onChange={(e) => setEd("monto", e.target.value)} />
              <input type="text" placeholder="Observación (opcional)" value={editForm.observacion} onKeyDown={alEnterEd} onChange={(e) => setEd("observacion", e.target.value)} />
              {editError && <div className="texto-error">{editError}</div>}
              <div className="acciones-editor">
                <button className="btn btn-verde btn-sm" onClick={guardarEdicion}>Guardar</button>
                <button className="btn btn-secundario btn-sm" onClick={() => setEditId(null)}>Cancelar</button>
                <button className="btn btn-peligro btn-sm" style={{ marginLeft: "auto" }} onClick={() => eliminar(s.id)}>Eliminar</button>
              </div>
            </div>
          ) : (
            <div key={s.id} className="registro">
              <div className="info">
                <div className="princ">{s.proveedor}</div>
                <div className="sec" style={{ color: "var(--texto)", fontSize: 13 }}>{s.descripcion}</div>
                <div className="sec">{fechaLinda(s.fecha)}{s.categoria ? ` · ${NOMBRE_CAT_SALIDA[s.categoria]}` : ""}{s.observacion ? ` · ${s.observacion}` : ""}</div>
              </div>
              <div className="monto-lado">
                <strong>{dinero(s.monto)}</strong>
                {!bloqueado && <button className="editar" onClick={() => abrirEdicion(s)} title="Editar"><i className="ti ti-pencil" /></button>}
              </div>
            </div>
          )
        ))}

        {!bloqueado && (
          <div className="form-registro">
            <input type="text" placeholder="Proveedor" value={form.proveedor} onKeyDown={alEnter} onChange={(e) => set("proveedor", e.target.value)} />
            <div className="fila-campos">
              <input type="number" min="0" placeholder="Monto" value={form.monto} onKeyDown={(e) => { soloMontoPositivo(e); alEnter(e); }} onChange={(e) => set("monto", e.target.value)} />
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value, partida_id: null, descripcion: "", monto: "" }))} title="Categoría (para comparar con el presupuesto)">
                {CATEGORIAS_SALIDA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            {partidasDeCategoria.length > 0 && (
              <select value="" onChange={(e) => cargarPartida(e.target.value)} title="Cargar una partida del presupuesto">
                <option value="">↧ Cargar partida del presupuesto…</option>
                {partidasDeCategoria.map((it) => (
                  <option key={it.id} value={it.id}>{it.concepto} — {dinero(it.monto)}</option>
                ))}
              </select>
            )}
            <input type="text" placeholder="Descripción del gasto" value={form.descripcion} onKeyDown={alEnter} onChange={(e) => set("descripcion", e.target.value)} />
            <input type="text" placeholder="Observación (opcional)" value={form.observacion} onKeyDown={alEnter} onChange={(e) => set("observacion", e.target.value)} />
            <button className="btn btn-rojo" onClick={agregar}>+ Registrar salida</button>
            {error && <div className="texto-error">{error}</div>}
          </div>
        )}

        <div className="totales-fin">
          <div className="linea"><span>Total de salidas</span><span className="grande">{dinero(p.total_salidas)}</span></div>
        </div>
      </div>
    </div>
  );
}

// Comparación 
function ComparacionPresupuesto({ comp }) {
  const c = comp.comparacion;

  function Fila({ etiqueta, dato, esUtilidad }) {
    const desv = dato.desviacion;
    
    const bueno = esUtilidad ? desv >= 0 : desv <= 0;
    const color = desv === 0 ? "var(--texto-suave)" : bueno ? "var(--verde)" : "var(--rojo)";
    const signo = desv > 0 ? "+" : "";
    return (
      <tr>
        <td>{etiqueta}</td>
        <td className="num">{dinero(dato.estimado)}</td>
        <td className="num">{dinero(dato.real)}</td>
        <td className="num" style={{ color, fontWeight: 600 }}>
          {signo}{dinero(desv)}{dato.desviacion_pct != null ? ` (${signo}${dato.desviacion_pct.toFixed(0)}%)` : ""}
        </td>
      </tr>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>Presupuesto vs. resultado real</h3>
      <div className="subtitulo">Comparación de lo cotizado contra los gastos reales del proyecto.</div>
      <table className="tabla-datos">
        <thead>
          <tr>
            <th>Concepto</th>
            <th className="num">Estimado</th>
            <th className="num">Real</th>
            <th className="num">Desviación</th>
          </tr>
        </thead>
        <tbody>
          <Fila etiqueta="Materiales" dato={c.materiales} />
          <Fila etiqueta="Mano de obra" dato={c.mano_obra} />
          <Fila etiqueta="Gastos adicionales" dato={c.gastos} />
          <Fila etiqueta="Costo total" dato={c.costo_total} />
          <Fila etiqueta="Utilidad" dato={c.utilidad} esUtilidad />
        </tbody>
      </table>
      {c.sin_categoria > 0 && (
        <div className="subtitulo" style={{ marginTop: -8 }}>
          Nota: {dinero(c.sin_categoria)} en gastos sin categoría no se reflejan por categoría (sí cuentan en el costo total).
        </div>
      )}
    </div>
  );
}
