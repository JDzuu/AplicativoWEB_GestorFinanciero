

// Si cambias la dirección del backend  solo tocas la línea base.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const METODOS_MUTANTES = ["POST", "PUT", "DELETE", "PATCH"];

async function pedir(ruta, opciones = {}) {
  const cabeceras = { "Content-Type": "application/json" };
  const metodo = (opciones.method || "GET").toUpperCase();
  if (METODOS_MUTANTES.includes(metodo)) {
    const csrf = csrfToken();
    if (csrf) cabeceras["X-CSRF-Token"] = csrf;
  }

  // Envia/recibe la cookie de sesión (httpOnly)
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    credentials: "include",
    headers: { ...cabeceras, ...(opciones.headers || {}) },
  });

  // Sesión vencida o inválida
  if (respuesta.status === 401 && ruta !== "/login") {
    localStorage.removeItem("usuarioActual");
    window.location.reload();
  }

  if (!respuesta.ok) {
    let detalle = "No se pudo completar la operación.";
    try {
      const datos = await respuesta.json();
      if (typeof datos.detail === "string") {
        detalle = datos.detail;
      } else if (Array.isArray(datos.detail)) {
        // FastAPI (error 422)
        detalle = datos.detail.map((e) => e.msg || "Dato inválido").join(" ");
      } else if (datos.detail && typeof datos.detail === "object") {

        detalle = Object.values(datos.detail).join(" ");
      }
    } catch (_) { }
    throw new Error(detalle);
  }
  return respuesta.json();
}

export const api = {
  // Sesión y usuarios
  login: (usuario, password) => pedir("/login", { method: "POST", body: JSON.stringify({ usuario, password }) }),
  logout: () => pedir("/logout", { method: "POST" }),
  yo: () => pedir("/yo"),
  cambiarPassword: (actual, nueva) => pedir("/cambiar-password", { method: "POST", body: JSON.stringify({ actual, nueva }) }),

  // Guarda la preferencia de tema (claro/oscuro/sistema) ligada al usuario.
  guardarTema: (tema) => pedir("/preferencias/tema", { method: "POST", body: JSON.stringify({ tema }) }),
  listarUsuarios: () => pedir("/usuarios"),
  crearUsuario: (datos) => pedir("/usuarios", { method: "POST", body: JSON.stringify(datos) }),
  editarUsuario: (id, datos) => pedir(`/usuarios/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  restablecerPassword: (id, nueva) => pedir(`/usuarios/${id}/password`, { method: "POST", body: JSON.stringify({ nueva }) }),
  eliminarUsuario: (id) => pedir(`/usuarios/${id}`, { method: "DELETE" }),

  catalogos: () => pedir("/catalogos"),

  listarProyectos: () => pedir("/proyectos"),
  obtenerProyecto: (id) => pedir(`/proyectos/${id}`),
  crearProyecto: (datos) => pedir("/proyectos", { method: "POST", body: JSON.stringify(datos) }),
  editarProyecto: (id, datos) => pedir(`/proyectos/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  cambiarEstado: (id, estado) => pedir(`/proyectos/${id}/estado`, { method: "POST", body: JSON.stringify({ estado }) }),
  finalizar: (id) => pedir(`/proyectos/${id}/finalizar`, { method: "POST" }),
  cancelar: (id) => pedir(`/proyectos/${id}/cancelar`, { method: "POST" }),
  pausar: (id) => pedir(`/proyectos/${id}/pausar`, { method: "POST" }),
  reanudar: (id) => pedir(`/proyectos/${id}/reanudar`, { method: "POST" }),

  // El PDF se descarga con fetch
  descargarPdf: async (id) => {
    const r = await fetch(`${BASE}/proyectos/${id}/pdf`, { credentials: "include" });
    if (r.status === 401) {
      localStorage.removeItem("usuarioActual");
      window.location.reload();
    }
    if (!r.ok) throw new Error("No se pudo generar el PDF.");
    return r.blob();
  },

  agregarEntrada: (id, datos) => pedir(`/proyectos/${id}/entradas`, { method: "POST", body: JSON.stringify(datos) }),
  editarEntrada: (entradaId, datos) => pedir(`/entradas/${entradaId}`, { method: "PUT", body: JSON.stringify(datos) }),
  eliminarEntrada: (entradaId) => pedir(`/entradas/${entradaId}`, { method: "DELETE" }),

  agregarSalida: (id, datos) => pedir(`/proyectos/${id}/salidas`, { method: "POST", body: JSON.stringify(datos) }),
  editarSalida: (salidaId, datos) => pedir(`/salidas/${salidaId}`, { method: "PUT", body: JSON.stringify(datos) }),
  eliminarSalida: (salidaId) => pedir(`/salidas/${salidaId}`, { method: "DELETE" }),

  analisis: (params) => {
    const q = new URLSearchParams(params).toString();
    return pedir(`/analisis?${q}`);
  },

  // Presupuestos 
  listarPresupuestos: () => pedir("/presupuestos"),
  obtenerPresupuesto: (id) => pedir(`/presupuestos/${id}`),
  crearPresupuesto: (datos) => pedir("/presupuestos", { method: "POST", body: JSON.stringify(datos) }),
  editarPresupuesto: (id, datos) => pedir(`/presupuestos/${id}`, { method: "PUT", body: JSON.stringify(datos) }),
  eliminarPresupuesto: (id) => pedir(`/presupuestos/${id}`, { method: "DELETE" }),
  agregarItem: (id, datos) => pedir(`/presupuestos/${id}/items`, { method: "POST", body: JSON.stringify(datos) }),
  eliminarItem: (itemId) => pedir(`/items/${itemId}`, { method: "DELETE" }),
  convertirPresupuesto: (id) => pedir(`/presupuestos/${id}/convertir`, { method: "POST" }),
  comparacionProyecto: (id) => pedir(`/proyectos/${id}/comparacion`),
  descargarPdfCotizacion: async (id) => {
    const r = await fetch(`${BASE}/presupuestos/${id}/pdf`, { credentials: "include" });
    if (r.status === 401) {
      localStorage.removeItem("usuarioActual");
      window.location.reload();
    }
    if (!r.ok) throw new Error("No se pudo generar el PDF.");
    return r.blob();
  },
};
