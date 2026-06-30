
// Pagina principal de proyectos 

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { dinero, fechaLinda, hoy, fechaMaxima, soloMontoPositivo } from "../servicios/utiles";
import { Luz, Etiqueta } from "../componentes/EstadoVisual";

// Los estados activos, con su color
const ESTADOS_FILTRO = [
  { id: "iniciando", texto: "Iniciando", color: "naranja" },
  { id: "proceso", texto: "En proceso", color: "azul" },
  { id: "acabando", texto: "Acabando", color: "morado" },
  { id: "pausa", texto: "En pausa", color: "gris" },
];

export function Dashboard({ irADetalle }) {
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState([]);  // vacío = todos; permite varios a la vez

  function alternarFiltro(id) {
    setFiltros((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  async function cargar() {
    setCargando(true);
    try {
      setProyectos(await api.listarProyectos());
    } catch (e) {
      console.error(e);
    }
    setCargando(false);
  }

  useEffect(() => { cargar(); }, []);

  // Solo activos
  const activos = proyectos
    .filter((p) => p.estado !== "finalizado" && p.estado !== "cancelado")
    .filter((p) => filtros.length === 0 || filtros.includes(p.estado))
    .filter((p) => {
      const t = busqueda.toLowerCase().trim();
      if (!t) return true;
      return p.nombre.toLowerCase().includes(t) || p.cliente.toLowerCase().includes(t);
    });

  return (
    <div>
      <div className="cabecera-seccion" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="titulo-seccion">Proyectos activos</div>
          <div className="subtitulo">Proyectos en curso. Los finalizados pasan al historial.</div>
        </div>
        <button className="btn btn-principal" onClick={() => setModal(true)}>+ Nuevo proyecto</button>
      </div>

      <div className="barra-busqueda-filtros">
        <div className="buscador">
          <i className="ti ti-search icono" />
          <input type="text" placeholder="Buscar por nombre o cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="filtros-estado">
          {ESTADOS_FILTRO.map((e) => (
            <button
              key={e.id}
              className={`filtro-estado ${filtros.includes(e.id) ? "activo" : ""}`}
              onClick={() => alternarFiltro(e.id)}
            >
              <Luz color={e.color} /> {e.texto}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="vacio">Cargando…</div>
      ) : activos.length === 0 ? (
        <div className="vacio">
          {(busqueda || filtros.length)
            ? "Ningún proyecto coincide con los filtros."
            : "No hay proyectos activos. Crea uno con «Nuevo proyecto»."
          }
        </div>
      ) : (
        <div className="tabla-proyectos">
          <div className="encabezado-tabla">
            <div>Proyecto</div>
            <div className="col-ocultable">Tipo</div>
            <div className="col-ocultable">Inicio</div>
            <div>Monto</div>
            <div>Estado</div>
          </div>
          {activos.map((p) => (
            <div key={p.id} className="fila-proyecto" onClick={() => irADetalle(p.id)}>
              <div>
                <div className="proy-nombre"><Luz color={p.estado_color} /> {p.nombre}</div>
                <div className="proy-cliente">{p.cliente}</div>
              </div>
              <div className="proy-tipo col-ocultable">{p.tipo}</div>
              <div className="proy-tipo col-ocultable">{fechaLinda(p.fecha_inicio)}</div>
              <div className="proy-monto">{dinero(p.total)}</div>
              <div><Etiqueta color={p.estado_color} texto={p.estado_texto} /></div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ModalProyecto
          alCerrar={() => setModal(false)}
          alGuardar={async () => { setModal(false); await cargar(); }}
        />
      )}
    </div>
  );
}

// Formulario de nuevo proyecto.
function ModalProyecto({ alCerrar, alGuardar }) {
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({ nombre: "", cliente: "", tipo: "", total: "", fecha_inicio: hoy() });
  const [tipoOtro, setTipoOtro] = useState(""); 
  const [errores, setErrores] = useState({});

  useEffect(() => {
    api.catalogos().then((c) => {
      setTipos(c.tipos);
      setForm((f) => ({ ...f, tipo: c.tipos[0] || "" }));
    }).catch(console.error);
  }, []);

  function set(campo, valor) { setForm((f) => ({ ...f, [campo]: valor })); }

  const [presionEnFondo, setPresionEnFondo] = useState(false);

  const esOtro = form.tipo === "Otro";

  async function guardar() {
    // Si eligió "Otro", el tipo real es lo que escribió en el campo extra.
    const tipoFinal = esOtro ? tipoOtro.trim() : form.tipo;

    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "El nombre del proyecto es obligatorio.";
    if (!form.cliente.trim()) errs.cliente = "El cliente es obligatorio.";
    if (!tipoFinal) errs.tipo = esOtro ? "Escribe el tipo de proyecto." : "El tipo es obligatorio.";
    if (!form.fecha_inicio) errs.fecha_inicio = "La fecha de inicio es obligatoria.";
    else if (form.fecha_inicio < hoy()) errs.fecha_inicio = "La fecha de inicio no puede ser anterior a hoy.";
    else if (form.fecha_inicio > fechaMaxima()) errs.fecha_inicio = `La fecha no puede ser posterior al año ${new Date().getFullYear() + 1}.`;
    if (!String(form.total).trim()) errs.total = "El monto contratado es obligatorio.";
    else if (isNaN(parseFloat(form.total)) || parseFloat(form.total) <= 0) errs.total = "Ingresa un monto mayor a 0.";
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      await api.crearProyecto({ ...form, tipo: tipoFinal, total: parseFloat(form.total) });
      alGuardar();
    } catch (e) {
      setErrores({ general: e.message });
    }
  }

  return (
    <div
      className="modal-fondo"
      onMouseDown={(e) => setPresionEnFondo(e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (presionEnFondo && e.target === e.currentTarget) alCerrar();
        setPresionEnFondo(false);
      }}
    >
      <div className="modal">
        <h2>Nuevo proyecto</h2>

        <div className="campo">
          <label>Nombre del proyecto *</label>
          <input className={errores.nombre ? "campo-error" : ""} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Casa Los Robles" />
          {errores.nombre && <div className="texto-error">{errores.nombre}</div>}
        </div>

        <div className="campo">
          <label>Nombre del cliente *</label>
          <input className={errores.cliente ? "campo-error" : ""} value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Ej. Familia Mora" />
          {errores.cliente && <div className="texto-error">{errores.cliente}</div>}
        </div>

        <div className="campo">
          <label>Tipo de proyecto *</label>
          <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {esOtro && (
            <input
              style={{ marginTop: 8 }}
              className={errores.tipo ? "campo-error" : ""}
              value={tipoOtro}
              onChange={(e) => setTipoOtro(e.target.value)}
              placeholder="Escribe el tipo de proyecto"
            />
          )}
          {errores.tipo && <div className="texto-error">{errores.tipo}</div>}
        </div>

        <div className="campo">
          <label>Monto total contratado *</label>
          <input type="number" min="0" className={errores.total ? "campo-error" : ""} value={form.total} onKeyDown={soloMontoPositivo} onChange={(e) => set("total", e.target.value)} placeholder="15000000" />
          {errores.total && <div className="texto-error">{errores.total}</div>}
        </div>

        <div className="campo">
          <label>Fecha de inicio *</label>
          <input type="date" min={hoy()} max={fechaMaxima()} className={errores.fecha_inicio ? "campo-error" : ""} value={form.fecha_inicio} onChange={(e) => set("fecha_inicio", e.target.value)} />
          {errores.fecha_inicio && <div className="texto-error">{errores.fecha_inicio}</div>}
        </div>

        {errores.general && <div className="texto-error">{errores.general}</div>}

        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-principal" onClick={guardar}>Crear proyecto</button>
        </div>
      </div>
    </div>
  );
}
