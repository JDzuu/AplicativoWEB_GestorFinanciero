
// Cambiar contraseña del usuario actual

import { useState } from "react";
import { api } from "../servicios/api";

export function CambiarPassword({ alCerrar }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  async function guardar() {
    setError("");
    if (!actual || !nueva) { setError("Completa todos los campos."); return; }
    if (nueva.length < 8) { setError("La nueva contraseña debe tener al menos 8 caracteres."); return; }
    if (nueva !== repetir) { setError("Las contraseñas nuevas no coinciden."); return; }
    try {
      await api.cambiarPassword(actual, nueva);
      setListo(true);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <h2>Cambiar contraseña</h2>
        {listo ? (
          <>
            <div className="texto-ok">Contraseña actualizada correctamente.</div>
            <div className="modal-acciones"><button className="btn btn-principal" onClick={alCerrar}>Listo</button></div>
          </>
        ) : (
          <>
            <div className="campo"><label>Contraseña actual</label><input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus /></div>
            <div className="campo"><label>Nueva contraseña</label><input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></div>
            <div className="campo"><label>Repetir nueva contraseña</label><input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></div>
            {error && <div className="texto-error">{error}</div>}
            <div className="modal-acciones">
              <button className="btn btn-secundario" onClick={alCerrar}>Cancelar</button>
              <button className="btn btn-principal" onClick={guardar}>Guardar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
