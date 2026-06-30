

// componentes/EstadoVisual

const COLORES = {
  naranja: { punto: "#c05621", fondo: "#fffaf0", texto: "#9c4221" },
  azul:    { punto: "#2b6cb0", fondo: "#ebf8ff", texto: "#2c5282" },
  morado:  { punto: "#6b46c1", fondo: "#faf5ff", texto: "#553c9a" },
  verde:   { punto: "#2f855a", fondo: "#f0fff4", texto: "#276749" },
  gris:    { punto: "#718096", fondo: "#f7fafc", texto: "#4a5568" },
  rojo:    { punto: "#c53030", fondo: "#fff5f5", texto: "#9b2c2c" },
};

export function Luz({ color }) {
  const c = COLORES[color] || COLORES.azul;
  return <span className="luz" style={{ background: c.punto }} />;
}

export function Etiqueta({ color, texto }) {
  const c = COLORES[color] || COLORES.azul;
  return <span className="etiqueta" style={{ background: c.fondo, color: c.texto }}>{texto}</span>;
}
