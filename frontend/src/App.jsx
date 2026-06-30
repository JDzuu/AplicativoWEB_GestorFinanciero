
// Componente principal: controla la sesión (login)

import { useState } from "react";
import { Dashboard } from "./paginas/Dashboard";
import { Detalle } from "./paginas/Detalle";
import { Historial } from "./paginas/Historial";
import { Analisis } from "./paginas/Analisis";
import { Presupuestos } from "./paginas/Presupuestos";
import { Usuarios } from "./paginas/Usuarios";
import { SelectorTema } from "./componentes/SelectorTema";
import { Login } from "./componentes/Login";
import { MenuUsuario } from "./componentes/MenuUsuario";
import { CambiarPassword } from "./componentes/CambiarPassword";
import { api } from "./servicios/api";
import "./estilos/estilos.css";

const EMPRESA = "Sistema de costeo";
const SUBTITULO = "Proyecto Zuu";

// La sesion real se guarda en una cookie httpOnly y aqui solo datos no sensibles
export default function App() {
  const [sesion, setSesion] = useState(() => {
    const u = localStorage.getItem("usuarioActual");
    return u ? JSON.parse(u) : null;
  });

  const [vista, setVista] = useState("dashboard");
  const [proyectoId, setProyectoId] = useState(null);
  const [origenDetalle, setOrigenDetalle] = useState("dashboard");
  const [cambiarPass, setCambiarPass] = useState(false);

  function irADetalle(id, origen = "dashboard") {
    setProyectoId(id);
    setOrigenDetalle(origen);
    setVista("detalle");
  }

  function alIniciar(datos) {
    // El backend ya dejó la cookie de sesión; aquí solo guardamos lo no sensible.
    const info = { usuario: datos.usuario, nombre: datos.nombre, rol: datos.rol };
    localStorage.setItem("usuarioActual", JSON.stringify(info));

    if (datos.tema) localStorage.setItem("tema", datos.tema);
    setSesion(info);
    setVista("dashboard");
  }

  async function cerrarSesion() {
    try { await api.logout(); } catch (_) { }
    localStorage.removeItem("usuarioActual");
    setSesion(null);
  }

  // Sin sesión solo se muestra la pantalla de login.
  if (!sesion) {
    return <Login alIniciar={alIniciar} empresa={EMPRESA} subtitulo={SUBTITULO} />;
  }

  return (
    <>
      <div className="barra-superior">
        <div className="contenedor">
          <div className="marca">{EMPRESA}<small>{SUBTITULO}</small></div>
          <nav className="nav-tabs">
            <button className={vista === "dashboard" || vista === "detalle" ? "activo" : ""} onClick={() => setVista("dashboard")}>Proyectos</button>
            <button className={vista === "presupuestos" ? "activo" : ""} onClick={() => setVista("presupuestos")}>Presupuestos</button>
            <button className={vista === "historial" ? "activo" : ""} onClick={() => setVista("historial")}>Historial</button>
            <button className={vista === "analisis" ? "activo" : ""} onClick={() => setVista("analisis")}>Análisis</button>
            {sesion.rol === "admin" && (
              <button className={vista === "usuarios" ? "activo" : ""} onClick={() => setVista("usuarios")}>Usuarios</button>
            )}
          </nav>
          <div className="barra-acciones">
            <SelectorTema />
            <MenuUsuario
              sesion={sesion}
              onCambiarPassword={() => setCambiarPass(true)}
              onUsuarios={() => setVista("usuarios")}
              onCerrar={cerrarSesion}
            />
          </div>
        </div>
      </div>

      <div className="contenedor">
        {vista === "dashboard" && <Dashboard irADetalle={(id) => irADetalle(id, "dashboard")} />}
        {vista === "detalle" && <Detalle proyectoId={proyectoId} volver={() => setVista(origenDetalle)} />}
        {vista === "presupuestos" && <Presupuestos />}
        {vista === "historial" && <Historial irADetalle={(id) => irADetalle(id, "historial")} />}
        {vista === "analisis" && <Analisis />}
        {vista === "usuarios" && sesion.rol === "admin" && <Usuarios sesion={sesion} />}
      </div>

      {cambiarPass && <CambiarPassword alCerrar={() => setCambiarPass(false)} />}
    </>
  );
}
