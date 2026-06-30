// Punto de arranque

// Iconos Tabler desde node_modules (no CDN)
import "@tabler/icons-webfont/dist/tabler-icons.min.css";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ConfirmacionProvider } from "./componentes/Confirmacion.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfirmacionProvider>
      <App />
    </ConfirmacionProvider>
  </React.StrictMode>
);
