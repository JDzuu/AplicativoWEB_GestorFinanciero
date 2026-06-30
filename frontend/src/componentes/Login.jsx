

// Login

import { useState } from "react";
import { api } from "../servicios/api";

export function Login({ alIniciar, empresa, subtitulo }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [verPass, setVerPass] = useState(false);  // mostrar/ocultar la contraseña

  async function entrar(e) {
    e.preventDefault();
    setError("");
    if (!usuario.trim() || !password) {
      setError("Ingresa tu usuario y contraseña.");
      return;
    }
    setCargando(true);
    try {
      const datos = await api.login(usuario.trim(), password);
      alIniciar(datos);
    } catch (err) {
      setError(err.message);
      setCargando(false);
    }
  }

  return (
    <div className="login-fondo">
      <form className="login-caja" onSubmit={entrar}>
        <div className="login-marca">{empresa}<small>{subtitulo}</small></div>
        <h2>Iniciar sesión</h2>

        <div className="campo">
          <label>Usuario</label>
          <div className="input-icono">
            <i className="ti ti-user icono-izq" />
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="Tu usuario" autoFocus autoComplete="username" />
          </div>
        </div>

        <div className="campo">
          <label>Contraseña</label>
          <div className="input-icono">
            <i className="ti ti-lock icono-izq" />
            <input
              className="con-ojo"
              type={verPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="icono-der"
              onClick={() => setVerPass((v) => !v)}
              tabIndex={-1}
              title={verPass ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-label={verPass ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              <i className={`ti ${verPass ? "ti-eye-off" : "ti-eye"}`} />
            </button>
          </div>
        </div>

        {error && <div className="texto-error">{error}</div>}

        <button className="btn btn-principal login-boton" disabled={cargando}>
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
