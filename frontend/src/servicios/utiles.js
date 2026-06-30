

// Formatea a la moneda
const formateador = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});

export function dinero(valor) {
  return formateador.format(valor || 0);
}

export function hoy() {
  return new Date().toISOString().slice(0, 10);
}

// Convierte "2026-01-10" a "10/01/2026"
export function fechaLinda(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Evita que se escriban años absurdos uwu
export function fechaMaxima() {
  return `${new Date().getFullYear() + 1}-12-31`;
}

// Dispara la descarga de un archivo (Blob) en el navegador
export function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// Bloquea letras y signos (e, E, +, -)
export function soloMontoPositivo(e) {
  if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
}
