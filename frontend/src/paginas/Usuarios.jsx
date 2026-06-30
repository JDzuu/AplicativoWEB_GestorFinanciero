
// Usuarios solo visible para el admin 

import { useState, useEffect } from "react";
import { api } from "../servicios/api";
import { useConfirmacion, useAviso } from "../componentes/Confirmacion";

export function Usuarios({ sesion }) {
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);  // usuario que se está editando
  const confirmar = useConfirmacion();
  const avisar = useAviso();

  async function cargar() {
    try {
      setUsuarios(await api.listarUsuarios());
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => { cargar(); }, []);

  async function eliminar(u) {
    const ok = await confirmar({
      titulo: "Eliminar usuario",
      mensaje: `¿Eliminar al usuario "${u.usuario}"? Esta acción no se puede deshacer.`,
      textoConfirmar: "Eliminar usuario",
    });
    if (!ok) return;
    try {
      await api.eliminarUsuario(u.id);
      cargar();
    } catch (e) {
      avisar({ titulo: "No se pudo eliminar", mensaje: e.message });
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <div className="titulo-seccion">Usuarios</div>
          <div className="subtitulo" style={{ marginBottom: 0 }}>Personas con acceso al sistema.</div>
        </div>
        <button className="btn btn-principal" onClick={() => setModal(true)}>+ Nuevo usuario</button>
      </div>

      <table className="tabla-datos">
        <thead>
          <tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th className="num">Acciones</th></tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>
                <strong>{u.nombre}</strong>
                {u.usuario === sesion.usuario && <span className="etiqueta-yo"> (tú)</span>}
                {u.principal && <span className="etiqueta" style={{ marginLeft: 8, background: "var(--azul-fondo)", color: "var(--acento)" }}>Principal</span>}
              </td>
              <td>{u.usuario}</td>
              <td>{u.rol === "admin" ? "Administrador" : "Empleado"}</td>
              <td className="num">
                {u.principal ? (
                  <span className="subtitulo" style={{ margin: 0 }} title="El administrador principal no se puede editar ni eliminar"><i className="ti ti-lock" /> Protegido</span>
                ) : (
                  <>
                    <button className="btn btn-secundario btn-sm" onClick={() => setEditando(u)} title="Editar usuario"><i className="ti ti-pencil" /></button>
                    <button className="btn btn-peligro btn-sm" style={{ marginLeft: 6 }} onClick={() => eliminar(u)} title="Eliminar usuario"><i className="ti ti-trash" /></button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && <ModalUsuario alCerrar={() => setModal(false)} alGuardar={async () => { setModal(false); await cargar(); }} />}
      {editando && <ModalEditarUsuario usuario={editando} alCerrar={() => setEditando(null)} alGuardar={async () => { setEditando(null); await cargar(); }} />}
    </div>
  );
}

// Editar un usuario existente y contraseña directa sin pedir la anterior
function ModalEditarUsuario({ usuario, alCerrar, alGuardar }) {
  const [form, setForm] = useState({ nombre: usuario.nombre, usuario: usuario.usuario, rol: usuario.rol, nueva_password: "" });
  const [error, setError] = useState("");
  function set(c, v) { setForm((f) => ({ ...f, [c]: v })); }

  async function guardar() {
    setError("");
    if (!form.nombre.trim() || !form.usuario.trim()) { setError("El nombre y el usuario son obligatorios."); return; }
    if (form.nueva_password && form.nueva_password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    try {
      await api.editarUsuario(usuario.id, {
        nombre: form.nombre.trim(),
        usuario: form.usuario.trim(),
        rol: form.rol,
        nueva_password: form.nueva_password || null,
      });
      alGuardar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <h2>Editar usuario</h2>
        <div className="campo">
          <label>Nombre completo</label>
          <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} autoFocus />
        </div>
        <div className="campo">
          <label>Usuario (para entrar)</label>
          <input value={form.usuario} onChange={(e) => set("usuario", e.target.value)} />
        </div>
        <div className="campo">
          <label>Rol</label>
          <select value={form.rol} onChange={(e) => set("rol", e.target.value)}>
            <option value="empleado">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="campo">
          <label>Nueva contraseña <span style={{ color: "var(--texto-suave)", fontWeight: 400 }}>(opcional — déjala vacía para no cambiarla)</span></label>
          <input type="password" value={form.nueva_password} onChange={(e) => set("nueva_password", e.target.value)} placeholder="••••••" />
        </div>
        {error && <div className="texto-error">{error}</div>}
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-principal" onClick={guardar}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function ModalUsuario({ alCerrar, alGuardar }) {
  const [form, setForm] = useState({ nombre: "", usuario: "", password: "", rol: "empleado" });
  const [error, setError] = useState("");
  function set(c, v) { setForm((f) => ({ ...f, [c]: v })); }

  async function guardar() {
    setError("");
    if (!form.nombre.trim() || !form.usuario.trim() || !form.password) { setError("Completa todos los campos."); return; }
    if (form.password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return; }
    try {
      await api.crearUsuario({ ...form, nombre: form.nombre.trim(), usuario: form.usuario.trim() });
      alGuardar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <h2>Nuevo usuario</h2>
        <div className="campo">
          <label>Nombre completo</label>
          <input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Juan Pérez" autoFocus />
        </div>
        <div className="campo">
          <label>Usuario (para entrar)</label>
          <input value={form.usuario} onChange={(e) => set("usuario", e.target.value)} placeholder="Ej. jperez" />
        </div>
        <div className="campo">
          <label>Contraseña</label>
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div className="campo">
          <label>Rol</label>
          <select value={form.rol} onChange={(e) => set("rol", e.target.value)}>
            <option value="empleado">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        {error && <div className="texto-error">{error}</div>}
        <div className="modal-acciones">
          <button className="btn btn-secundario" onClick={alCerrar}>Cancelar</button>
          <button className="btn btn-principal" onClick={guardar}>Crear usuario</button>
        </div>
      </div>
    </div>
  );
}
