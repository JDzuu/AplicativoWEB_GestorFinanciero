
// Confirmacion

import { createContext, useContext, useState, useCallback } from "react";

const ContextoDialogos = createContext(null);


export function ConfirmacionProvider({ children }) {
  const [estado, setEstado] = useState(null);

  // Permite pasar solo un texto o un objeto de opciones.
  const normalizar = (opciones) =>
    typeof opciones === "string" ? { mensaje: opciones } : (opciones || {});

  const confirmar = useCallback((opciones) => {
    const op = normalizar(opciones);
    return new Promise((resolver) => setEstado({ ...op, resolver }));
  }, []);

  const avisar = useCallback((opciones) => {
    const op = normalizar(opciones);
    return new Promise((resolver) => setEstado({ ...op, aviso: true, resolver }));
  }, []);

  function cerrar(resultado) {
    if (estado && estado.resolver) estado.resolver(resultado);
    setEstado(null);
  }

  const esAviso = estado && estado.aviso;

  return (
    <ContextoDialogos.Provider value={{ confirmar, avisar }}>
      {children}
      {estado && (
        <div className="modal-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) cerrar(esAviso ? true : false); }}>
          <div className="modal modal-confirmacion" style={{ maxWidth: 420 }}>
            <h2>{estado.titulo || (esAviso ? "Aviso" : "Confirmar acción")}</h2>
            <p className="confirmacion-mensaje">{estado.mensaje}</p>
            <div className="modal-acciones">
              {esAviso ? (
                <button className="btn btn-principal" onClick={() => cerrar(true)} autoFocus>
                  {estado.textoConfirmar || "Entendido"}
                </button>
              ) : (
                <>
                  <button className="btn btn-secundario" onClick={() => cerrar(false)} autoFocus>
                    {estado.textoCancelar || "Cancelar"}
                  </button>
                  <button
                    className={`btn ${estado.peligro === false ? "btn-principal" : "btn-rojo"}`}
                    onClick={() => cerrar(true)}
                  >
                    {estado.textoConfirmar || "Eliminar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ContextoDialogos.Provider>
  );
}

// Hook para pedir CONFIRMACIÓN (dos botones: cancelar / aceptar).
export function useConfirmacion() {
  const ctx = useContext(ContextoDialogos);
  if (!ctx) throw new Error("useConfirmacion debe usarse dentro de <ConfirmacionProvider>.");
  return ctx.confirmar;
}

// Hook para mostrar un AVISO informativo (un solo botón).
export function useAviso() {
  const ctx = useContext(ContextoDialogos);
  if (!ctx) throw new Error("useAviso debe usarse dentro de <ConfirmacionProvider>.");
  return ctx.avisar;
}
