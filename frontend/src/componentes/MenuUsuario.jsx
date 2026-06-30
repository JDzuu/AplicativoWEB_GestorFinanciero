

// Menu del icono de la barra superior

import { useState, useRef, useEffect } from "react";

export function MenuUsuario({ sesion, onCambiarPassword, onUsuarios, onCerrar }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const inicial = (sesion.nombre || sesion.usuario || "?").charAt(0).toUpperCase();

  return (
    <div className="usuario-menu" ref={ref}>
      <button className="usuario-disparador" onClick={() => setAbierto((v) => !v)} title={sesion.nombre}>
        <span className="usuario-avatar">{inicial}</span>
      </button>

      {abierto && (
        <div className="usuario-panel">
          <div className="usuario-info">
            <div className="usuario-nombre">{sesion.nombre}</div>
            <div className="usuario-rol">{sesion.rol === "admin" ? "Administrador" : "Empleado"}</div>
          </div>
          <button onClick={() => { setAbierto(false); onCambiarPassword(); }}><i className="ti ti-key" /> Cambiar contraseña</button>
          {sesion.rol === "admin" && (
            <button onClick={() => { setAbierto(false); onUsuarios(); }}><i className="ti ti-users" /> Gestionar usuarios</button>
          )}
          <button className="salir" onClick={() => { setAbierto(false); onCerrar(); }}><i className="ti ti-logout" /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
