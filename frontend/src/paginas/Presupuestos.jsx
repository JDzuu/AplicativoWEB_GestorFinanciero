

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { dinero, soloMontoPositivo, descargarBlob } from "../servicios/utiles";
import { useConfirmacion, useAviso } from "../componentes/Confirmacion";

// Estados reales de un presupuesto en el sistema
const FILTROS_ESTADO = [
  { id: "todos", texto: "Todos" },
  { id: "borrador", texto: "Borrador" },
  { id: "convertido", texto: "Convertido" },
];

export function Presupuestos() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState(null);
  const [modal, setModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  async function cargar() {
    setCargando(true);
    try {
      setLista(await api.listarPresupuestos());
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  if (selId) return <DetallePresupuesto id={selId} volver={() => { setSelId(null); cargar(); }} />;

  // Filtro en vivo
  const termino = busqueda.toLowerCase().trim();
  const listaFiltrada = lista.filter((p) => {
    const coincideTexto =
      !termino ||
      p.nombre.toLowerCase().includes(termino) ||
      p.cliente.toLowerCase().includes(termino);
    const coincideEstado = filtroEstado === "todos" || p.estado === filtroEstado;
    return coincideTexto && coincideEstado;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <div className="titulo-seccion">Presupuestos</div>
          <div className="subtitulo" style={{ marginBottom: 0 }}>Cotiza un proyecto antes de firmarlo y conoce tu margen de utilidad.</div>
        </div>
        <button className="btn btn-principal" onClick={() => setModal(true)}>+ Nuevo presupuesto</button>
      </div>

      {lista.length > 0 && (
        <div className="barra-busqueda-filtros">
          <div className="buscador">
            <i className="ti ti-search icono" />
            <input
              type="text"
              placeholder="Buscar por nombre o cliente…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button type="button" className="limpiar-busqueda" onClick={() => setBusqueda("")} title="Limpiar" aria-label="Limpiar búsqueda">
                <i className="ti ti-x" />
              </button>
            )}
          </div>
          <div className="filtros-estado">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.id}
                className={`filtro-estado ${filtroEstado === f.id ? "activo" : ""}`}
                onClick={() => setFiltroEstado(f.id)}
              >
                {f.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {cargando ? (
        <div className="vacio">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="vacio">Aún no hay presupuestos. Crea uno con «Nuevo presupuesto».</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="vacio">Ningún presupuesto coincide con la búsqueda.</div>
      ) : (
        <table className="tabla-datos">
          <thead>
            <tr>
              <th className="num">ID</th><th>Presupuesto</th><th>Cliente</th>
              <th className="num">Costo estimado</th><th className="num">Precio de venta</th>
              <th className="num">Margen</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.map((p) => (
              <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setSelId(p.id)}>
                <td className="num" style={{ color: "var(--texto-suave)", fontVariantNumeric: "tabular-nums" }}>{p.id}</td>
                <td><strong>{p.nombre}</strong></td>
                <td>{p.cliente}</td>
                <td className="num">{dinero(p.resumen.costo_total)}</td>
                <td className="num">{dinero(p.resumen.precio_venta)}</td>
                <td className="num">{p.resumen.margen_pct.toFixed(1)}%</td>
                <td>
                  <span className="etiqueta" style={p.estado === "convertido"
                    ? { background: "var(--verde-fondo)", color: "var(--verde)" }
                    : { background: "var(--naranja-fondo)", color: "var(--naranja)" }}>
                    {p.estado === "convertido" ? "Convertido" : "Borrador"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && <ModalPresupuesto alCerrar={() => setModal(false)} alGuardar={async (id) => { setModal(false); await cargar(); setSelId(id); }} />}
    </div>
  );
}

function ModalPresupuesto({ alCerrar, alGuardar }) {
  const [form, setForm] = useState({ nombre: "", cliente: "", utilidad_pct: "35" });
  const [error, setError] = useState("");
  function set(c, v) { setForm((f) => ({ ...f, [c]: v })); }

  async function guardar() {
    setError("");
    if (!form.nombre.trim() || !form.cliente.trim()) { setError("El nombre y el cliente son obligatorios."); return; }
    const util = parseFloat(form.utilidad_pct);
    if (isNaN(util) || util < 0) { setError("La utilidad debe ser 0 o mayor."); return; }
    try {
      // El tipo de proyecto se elige luego dentro del presupuesto.
      const p = await api.crearPresupuesto({ nombre: form.nombre.trim(), cliente: form.cliente.trim(), utilidad_pct: util });
      alGuardar(p.id);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <h2>Nuevo presupuesto</h2>
        <div className="campo">
          <label>Nombre del proyecto *</label>
          <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Cocina Integral" autoFocus />
        </div>
        <div className="campo">
          <label>Nombre del cliente *</label>
          <input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Ej. Familia Mora" />
        </div>
        <div className="campo">
          <label>Utilidad deseada (%)</label>
          <input type="number" min="0" value={form.utilidad_pct} onKeyDown={soloMontoPositivo} onChange={(e) => set("utilidad_pct", e.target.value)} />
        </div>
        {error && <div className="texto-error">{error}</div>}
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-principal" onClick={guardar}>Crear presupuesto</button>
        </div>
      </div>
    </div>
  );
}

// Detalle de un presupuesto 
function DetallePresupuesto({ id, volver }) {
  const [p, setP] = useState(null);
  const [cats, setCats] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [util, setUtil] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [tipoOtro, setTipoOtro] = useState("");
  const confirmar = useConfirmacion();
  const avisar = useAviso();

  async function cargar() {
    const datos = await api.obtenerPresupuesto(id);
    setP(datos);
    setUtil(String(datos.utilidad_pct));
  }
  useEffect(() => {
    cargar().catch(console.error);
    api.catalogos()
      .then((c) => {
        setCats(c.categorias_presupuesto);
        setTipos(c.tipos);
      })
      .catch(console.error);
  }, [id]);

  // Cuando ya tenemos el presupuesto y la lista de tipos, definimos el selector.
  useEffect(() => {
    if (!p || tipos.length === 0) return;
    const t = p.tipo || "";
    if (tipos.includes(t)) { setTipoSel(t); setTipoOtro(""); }
    else { setTipoSel("Otro"); setTipoOtro(t); }
  }, [p, tipos]);

  if (!p || !cats) return <div className="vacio">Cargando…</div>;

  const convertido = p.estado === "convertido";
  const r = p.resumen;

  // Cálculo en vivo según lo que escribes en la utilidad
  const utilNum = parseFloat(util) || 0;
  const precioVenta = r.costo_total * (1 + utilNum / 100);
  const utilidadMonto = precioVenta - r.costo_total;
  const margen = precioVenta ? (utilidadMonto / precioVenta) * 100 : 0;

  // Guarda tipo + utilidad (la cabecera). Se llama al salir de un campo.
  async function guardarCabecera(tipoOverride) {
    const utilVal = parseFloat(util);
    const tipoFinal = tipoOverride !== undefined ? tipoOverride : (tipoSel === "Otro" ? tipoOtro.trim() : tipoSel);
    if (isNaN(utilVal) || utilVal < 0 || !tipoFinal) return;
    if (utilVal === p.utilidad_pct && tipoFinal === p.tipo) return;
    try {
      setP(await api.editarPresupuesto(id, {
        nombre: p.nombre,
        cliente: p.cliente,
        tipo: tipoFinal,
        utilidad_pct: utilVal,
      }));
    } catch (e) {
      avisar({ titulo: "No se pudo guardar", mensaje: e.message });
    }
  }

  async function agregarItem(datos) { setP(await api.agregarItem(id, datos)); }
  async function eliminarItem(itemId) { setP(await api.eliminarItem(itemId)); }

  async function convertir() {
    const ok = await confirmar({
      titulo: "Convertir en proyecto",
      mensaje: "¿Convertir este presupuesto en un proyecto activo? Se creará el proyecto con el precio de venta como monto contratado.",
      textoConfirmar: "Convertir",
      peligro: false,
    });
    if (!ok) return;
    try {
      const proy = await api.convertirPresupuesto(id);
      await avisar({
        titulo: "Proyecto creado",
        mensaje: `Listo. Se creó el proyecto "${proy.nombre}". Lo encontrarás en la pestaña Proyectos.`,
      });
      volver();
    } catch (e) {
      avisar({ titulo: "No se pudo convertir", mensaje: e.message });
    }
  }

  async function eliminar() {
    const ok = await confirmar({
      titulo: "Eliminar presupuesto",
      mensaje: "¿Eliminar este presupuesto? Esta acción no se puede deshacer.",
      textoConfirmar: "Eliminar presupuesto",
    });
    if (!ok) return;
    try {
      await api.eliminarPresupuesto(id);
      volver();
    } catch (e) {
      avisar({ titulo: "No se pudo eliminar", mensaje: e.message });
    }
  }

  async function exportarCotizacion() {
    try {
      const blob = await api.descargarPdfCotizacion(id);
      descargarBlob(`cotizacion_${p.nombre.replace(/ /g, "_")}.pdf`, blob);
    } catch (e) { avisar({ titulo: "No se pudo exportar", mensaje: e.message }); }
  }

  const SECCIONES = [
    { key: "materiales", titulo: "Materiales", total: r.total_materiales },
    { key: "mano_obra", titulo: "Mano de obra", total: r.total_mano_obra },
    { key: "gastos", titulo: "Gastos adicionales", total: r.total_gastos },
  ];

  return (
    <div>
      <button className="volver" onClick={volver}>← Volver a presupuestos</button>

      <div className="cabecera-detalle">
        <div>
          <div className="titulo-seccion">{p.nombre}</div>
          <div className="subtitulo" style={{ marginBottom: 0 }}>{p.cliente}</div>
        </div>
        <span className="etiqueta" style={convertido
          ? { background: "var(--verde-fondo)", color: "var(--verde)" }
          : { background: "var(--naranja-fondo)", color: "var(--naranja)" }}>
          {convertido ? "Convertido en proyecto" : "Borrador"}
        </span>
      </div>

      <div className="financiero" style={{ gridTemplateColumns: "1fr" }}>
        {SECCIONES.map((s) => (
          <SeccionCategoria
            key={s.key}
            catKey={s.key}
            titulo={s.titulo}
            conceptos={cats[s.key]}
            items={p.items.filter((it) => it.categoria === s.key)}
            total={s.total}
            bloqueado={convertido}
            onAgregar={agregarItem}
            onEliminar={eliminarItem}
          />
        ))}
      </div>
      <div className="datos-generales">
        <div className="grid-datos">
          <div className="dato"><div className="etq">Total materiales</div><div className="val">{dinero(r.total_materiales)}</div></div>
          <div className="dato"><div className="etq">Total mano de obra</div><div className="val">{dinero(r.total_mano_obra)}</div></div>
          <div className="dato"><div className="etq">Total adicionales</div><div className="val">{dinero(r.total_gastos)}</div></div>
          <div className="dato"><div className="etq">Costo total estimado</div><div className="val" style={{ fontSize: 18 }}>{dinero(r.costo_total)}</div></div>
        </div>

        <div className="selector-estado" style={{ marginTop: 18, flexWrap: "wrap" }}>
          <label>Utilidad deseada (%):</label>
          <input type="number" min="0" value={util} style={{ width: 90 }} disabled={convertido}
            onKeyDown={soloMontoPositivo}
            onChange={(e) => setUtil(e.target.value)} onBlur={() => guardarCabecera()} />

          <label style={{ marginLeft: 16 }}>Tipo de proyecto:</label>
          <select value={tipoSel} style={{ width: "auto" }} disabled={convertido}
            onChange={(e) => { const v = e.target.value; setTipoSel(v); if (v !== "Otro") guardarCabecera(v); }}>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {tipoSel === "Otro" && (
            <input value={tipoOtro} style={{ width: 180 }} disabled={convertido} placeholder="Escribe el tipo"
              onChange={(e) => setTipoOtro(e.target.value)} onBlur={() => guardarCabecera()} />
          )}
        </div>

        <div className="grid-datos" style={{ marginTop: 16 }}>
          <div className="dato"><div className="etq">Precio de venta recomendado</div><div className="val" style={{ fontSize: 20, color: "var(--acento)" }}>{dinero(precioVenta)}</div></div>
          <div className="dato"><div className="etq">Utilidad proyectada</div><div className="val" style={{ color: "var(--verde)" }}>{dinero(utilidadMonto)}</div></div>
          <div className="dato"><div className="etq">Margen obtenido</div><div className="val">{margen.toFixed(1)}%</div></div>
        </div>
      </div>

      <div className="acciones-detalle">
        <button className="btn btn-secundario" onClick={exportarCotizacion} disabled={r.costo_total <= 0}>
          <i className="ti ti-download" /> Exportar cotización PDF
        </button>
        {convertido ? (
          <span className="subtitulo" style={{ margin: 0, alignSelf: "center" }}>Ya convertido en proyecto · queda guardado como registro.</span>
        ) : (
          <>
            <button className="btn btn-verde" onClick={convertir} disabled={r.costo_total <= 0}>
              <i className="ti ti-arrow-right" /> Convertir en proyecto
            </button>
            <button className="btn btn-peligro" onClick={eliminar}>Eliminar presupuesto</button>
          </>
        )}
      </div>
    </div>
  );
}

function SeccionCategoria({ catKey, titulo, conceptos, items, total, bloqueado, onAgregar, onEliminar }) {
  const [concepto, setConcepto] = useState(conceptos[0] || "");
  const [conceptoOtro, setConceptoOtro] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");

  const esOtro = concepto.startsWith("Otros");

  async function agregar() {
    setError("");
    const conceptoFinal = esOtro ? conceptoOtro.trim() : concepto;
    if (!conceptoFinal) { setError(esOtro ? "Escribe el concepto." : "Elige un concepto."); return; }
    if (!String(monto).trim() || isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) {
      setError("Ingresa un monto mayor a 0.");
      return;
    }
    try {
      await onAgregar({
        categoria: catKey,
        concepto: conceptoFinal,
        descripcion: descripcion.trim() || null,
        monto: parseFloat(monto),
      });
      setMonto("");
      setDescripcion("");
      setConceptoOtro("");
    } catch (e) {
      setError(e.message);
    }
  }

  // Permite agregar con Enter desde cualquier campo de la partida.
  function alEnter(e) { if (e.key === "Enter") { e.preventDefault(); agregar(); } }

  return (
    <div className="seccion-fin">
      <div className="cabeza" style={{ justifyContent: "space-between", background: "var(--fondo-suave)" }}>
        <span>{titulo}</span><span>{dinero(total)}</span>
      </div>
      <div className="cuerpo-fin">
        {items.length === 0 && <div className="subtitulo" style={{ margin: 0 }}>Sin partidas.</div>}
        {items.map((it) => (
          <div key={it.id} className="registro">
            <div className="info">
              <div className="princ">{it.concepto}</div>
              {it.descripcion && <div className="sec">{it.descripcion}</div>}
            </div>
            <div className="monto-lado">
              <strong>{dinero(it.monto)}</strong>
              {!bloqueado && <button className="borrar" onClick={() => onEliminar(it.id)}>✕</button>}
            </div>
          </div>
        ))}

        {!bloqueado && (
          <div className="form-registro">
            <div className="fila-campos">
              <select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
                {conceptos.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" min="0" placeholder="Monto" value={monto} onKeyDown={(e) => { soloMontoPositivo(e); alEnter(e); }} onChange={(e) => setMonto(e.target.value)} />
            </div>
            {esOtro && (
              <input type="text" placeholder="Especifica el concepto" value={conceptoOtro} onKeyDown={alEnter} onChange={(e) => setConceptoOtro(e.target.value)} autoFocus />
            )}
            <input type="text" placeholder="Descripción (opcional)" value={descripcion} onKeyDown={alEnter} onChange={(e) => setDescripcion(e.target.value)} />
            <button className="btn btn-principal btn-sm" onClick={agregar}>+ Agregar partida</button>
            {error && <div className="texto-error">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
