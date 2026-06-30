

// Seleccion de tema 
import { useState, useEffect, useRef } from "react";
import { api } from "../servicios/api";

// Aplica tema del sistema
function aplicarTema(preferencia) {
  let efectivo = preferencia;
  if (preferencia === "sistema") {
    const oscuroSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    efectivo = oscuroSistema ? "oscuro" : "claro";
  }
  document.documentElement.setAttribute("data-tema", efectivo);
}

const OPCIONES = [
  { id: "claro", icono: "ti-sun", texto: "Claro" },
  { id: "oscuro", icono: "ti-moon", texto: "Oscuro" },
  { id: "sistema", icono: "ti-device-desktop", texto: "Sistema" },
];

// Preferencias guardadas
export function SelectorTema() {
  const [pref, setPref] = useState(() => localStorage.getItem("tema") || "oscuro");
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    aplicarTema(pref);
    localStorage.setItem("tema", pref);

    // Reacciona al cambio del sistema
    if (pref === "sistema") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => aplicarTema("sistema");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [pref]);

  // Guarda preferencia en el backend
  function elegir(id) {
    setPref(id);
    setAbierto(false);
    api.guardarTema(id).catch(console.error);  // si falla, queda igual en local
  }

  // Click fuera = lo cierra
  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, [abierto]);

  const actual = OPCIONES.find((o) => o.id === pref) || OPCIONES[2];

  return (
    <div className="tema-selector" ref={contenedorRef}>
      <button className="tema-disparador" onClick={() => setAbierto((v) => !v)} title={`Tema: ${actual.texto}`} aria-label="Cambiar tema">
        <i className={`ti ${actual.icono}`} />
      </button>

      {abierto && (
        <div className="tema-menu">
          {OPCIONES.map((o) => (
            <button
              key={o.id}
              className={pref === o.id ? "activo" : ""}
              onClick={() => elegir(o.id)}
            >
              <i className={`ti ${o.icono}`} /> {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
