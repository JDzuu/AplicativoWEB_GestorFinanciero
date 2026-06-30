

# Comunicacion con el frontend
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import Response, JSONResponse
from decimal import Decimal
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from src import database, logica, pdf_export, auth, bd



MODO_PRODUCCION = os.environ.get("ENTORNO", "desarrollo").strip().lower() == "produccion"

# Evitar saturar la memoria
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(1024 * 1024)))

# Límite de peticiones por IP
LIMITE_GENERAL = os.environ.get("RATE_LIMIT_GENERAL", "120/minute")
LIMITE_LOGIN = os.environ.get("RATE_LIMIT_LOGIN", "10/minute")
_storage = os.environ.get("RATE_LIMIT_STORAGE", "memory://")

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[LIMITE_GENERAL],
    storage_uri=_storage,
    headers_enabled=True,
)


# Convierte a un archivo seguro
def _nombre_archivo(nombre):
    base = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("_")
    return base or "documento"



@asynccontextmanager
async def lifespan(app: FastAPI):
    if bd.ES_POSTGRES:
        print("[BD] Usando PostgreSQL ->", bd.URL.split("@")[-1])
    else:
        print("[BD] Usando SQLite (archivo local data/proyectos.db)")
    database.inicializar()
    database.eliminar_sesiones_expiradas()
    auth.asegurar_admin_inicial()
    yield


# Protección global
app = FastAPI(
    title="Gestor de proyectos API",
    dependencies=[Depends(auth.requiere_auth), Depends(auth.verificar_csrf)],
    docs_url=None if MODO_PRODUCCION else "/docs",
    redoc_url=None if MODO_PRODUCCION else "/redoc",
    openapi_url=None if MODO_PRODUCCION else "/openapi.json",
    lifespan=lifespan,
)

# Enganchamos el limiter a la app y respondemos 429
# cuando una IP supera el límite de peticiones.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _limite_excedido(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas peticiones. Espera un momento e inténtalo de nuevo."},
    )


# Red de seguridad
@app.exception_handler(Exception)
async def _error_no_controlado(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    import logging
    logging.getLogger("gestor").exception("Error no controlado en %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})


# En produccion solo se aceptan peticiones cuyo encabezado Host coincida con el dominio real.
if MODO_PRODUCCION:
    _hosts = os.environ.get("HOSTS_PERMITIDOS", "").strip()
    if _hosts:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=[h.strip() for h in _hosts.split(",") if h.strip()],
        )

# Orígenes permitidos (CORS)
_origenes = os.environ.get("ORIGENES_PERMITIDOS", "http://localhost:5173,http://127.0.0.1:5173") # En produccion se define la variable "ORIGENES PERMITIDOS"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origenes.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
    allow_credentials=True,
    max_age=600,
)

# Aplica el límite general a TODAS las rutas por IP.
app.add_middleware(SlowAPIMiddleware)


# Rechaza con 413 los cuerpos grandes antes de procesarlos
@app.middleware("http")
async def limitar_tamano_cuerpo(request: Request, call_next):
    largo = request.headers.get("content-length")
    if largo and largo.isdigit() and int(largo) > MAX_BODY_BYTES:
        return JSONResponse(status_code=413, content={"detail": "La petición es demasiado grande."})
    return await call_next(request)


@app.middleware("http")
async def cabeceras_de_seguridad(request: Request, call_next):
    """Añade cabeceras de seguridad a todas las respuestas. Son instrucciones para el navegador que cierran ataques clásicos:

      - X-Content-Type-Options: nosniff   -> el navegador no "adivina" el tipo de archivo (evita que un texto se ejecute como si fuera un script).
      - X-Frame-Options: DENY             -> nadie puede meter esta API dentro de un <iframe> en otra web (anti clickjacking).
      - Referrer-Policy: no-referrer      -> no se filtra a qué URL se entró.
      - Content-Security-Policy           -> esta API solo devuelve JSON/PDF, así que se bloquea cualquier recurso embebido; refuerza el anti-clickjacking.
      - Permissions-Policy                -> apaga cámara, micrófono y geolocalización.
      - Cross-Origin-* (COOP/CORP)        -> aísla el contexto del navegador.
      - HSTS (solo en producción)         -> obliga al navegador a usar siempre HTTPS para este dominio, nunca HTTP en claro.

    Además se borra la cabecera Server, que delata el servidor y su versión
    """
    respuesta = await call_next(request)
    respuesta.headers["X-Content-Type-Options"] = "nosniff"
    respuesta.headers["X-Frame-Options"] = "DENY"
    respuesta.headers["Referrer-Policy"] = "no-referrer"
    respuesta.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    respuesta.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    respuesta.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    respuesta.headers["Server"] = "servidor"


    # CSP estricta solo en producción
    if MODO_PRODUCCION:
        respuesta.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        respuesta.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return respuesta


# Modelos de entrada

# Evita que envie textos enormes
class ProyectoDatos(BaseModel):
    nombre: str = Field(..., max_length=200)
    cliente: str = Field(..., max_length=200)
    tipo: str = Field(..., max_length=60)
    total: Decimal
    fecha_inicio: str = Field(..., max_length=20)


class EntradaNueva(BaseModel):
    fecha: str = Field(..., max_length=20)
    monto: Decimal
    observacion: Optional[str] = Field(default=None, max_length=500)


class SalidaNueva(BaseModel):
    fecha: str = Field(..., max_length=20)
    proveedor: str = Field(..., max_length=200)
    descripcion: str = Field(..., max_length=500)
    monto: Decimal
    observacion: Optional[str] = Field(default=None, max_length=500)
    categoria: Optional[str] = Field(default=None, max_length=30)
    partida_id: Optional[int] = None


class PresupuestoDatos(BaseModel):
    nombre: str = Field(..., max_length=200)
    cliente: str = Field(..., max_length=200)
    tipo: str = Field(default="Otro", max_length=60)
    utilidad_pct: Decimal = Decimal(0)


class ItemNuevo(BaseModel):
    categoria: str = Field(..., max_length=30)
    concepto: str = Field(..., max_length=200)
    descripcion: Optional[str] = Field(default=None, max_length=500)
    monto: Decimal


class CambioEstado(BaseModel):
    estado: str = Field(..., max_length=30)


class Credenciales(BaseModel):
    usuario: str = Field(..., max_length=50)
    password: str = Field(..., max_length=128)


class CambioPassword(BaseModel):
    actual: str = Field(..., max_length=128)
    nueva: str = Field(..., max_length=128)


class PreferenciaTema(BaseModel):
    tema: str = Field(..., max_length=20)


class UsuarioNuevo(BaseModel):
    usuario: str = Field(..., max_length=50)
    nombre: str = Field(..., max_length=120)
    password: str = Field(..., max_length=128)
    rol: str = Field(default="empleado", max_length=20)


class PasswordReset(BaseModel):
    nueva: str = Field(..., max_length=128)


class UsuarioEditar(BaseModel):
    usuario: str = Field(..., max_length=50)
    nombre: str = Field(..., max_length=120)
    rol: str = Field(..., max_length=20)
    # Opcional: si viene, cambia la contraseña.
    nueva_password: Optional[str] = Field(default=None, max_length=128)


# Autenticación y usuarios

@app.post("/login")
@limiter.limit(LIMITE_LOGIN)
def login(request: Request, datos: Credenciales, response: Response):
    usuario_txt = datos.usuario.strip()
    auth.revisar_bloqueo(usuario_txt)  # corta si está bloqueado por intentos fallidos

    u = database.obtener_usuario_por_nombre(usuario_txt)
    if not u:
        auth.verificar_password_dummy()
        auth.registrar_fallo(usuario_txt)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")
    if not auth.verificar_password(datos.password, u["salt"], u["password_hash"]):
        auth.registrar_fallo(usuario_txt)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    auth.reiniciar_intentos(usuario_txt)  # login correcto: limpiamos el contador

    token = auth.generar_token()
    database.crear_sesion(auth.hash_token(token), u["id"], auth.expiracion())


    auth.poner_cookies_sesion(response, token, auth.generar_token())
    return {"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"],
            "tema": u.get("tema") or "oscuro"}


# Cierra sesion limpiar token
@app.post("/logout")
def logout(request: Request, response: Response):
    tok = auth.token_de_request(request)
    if tok:
        database.eliminar_sesion(auth.hash_token(tok))
    auth.borrar_cookies_sesion(response)
    return {"ok": True}


# Sesion abierta
@app.get("/yo")
def yo(usuario=Depends(auth.usuario_actual)):
    return {"usuario": usuario["usuario"], "nombre": usuario["nombre"], "rol": usuario["rol"],
            "tema": usuario.get("tema") or "oscuro"}


# Preferencias del usuario
@app.post("/preferencias/tema")
def guardar_tema(datos: PreferenciaTema, usuario=Depends(auth.usuario_actual)):
    if datos.tema not in ("claro", "oscuro", "sistema"):
        raise HTTPException(status_code=400, detail="Tema no válido.")
    database.actualizar_tema(usuario["id"], datos.tema)
    return {"ok": True}


# Cambiar contraseña de usuario actual
@app.post("/cambiar-password")
def cambiar_password(request: Request, datos: CambioPassword, usuario=Depends(auth.usuario_actual)):
    if not auth.verificar_password(datos.actual, usuario["salt"], usuario["password_hash"]):
        raise HTTPException(status_code=400, detail="La contraseña actual no es correcta.")
    if len(datos.nueva) < auth.MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"La nueva contraseña debe tener al menos {auth.MIN_PASSWORD} caracteres.")
    salt, h = auth.cifrar_password(datos.nueva)
    database.actualizar_password(usuario["id"], h, salt)

    # Solo deja activa el usuario actual
    tok = auth.token_de_request(request)
    actual = auth.hash_token(tok) if tok else None
    database.eliminar_otras_sesiones(usuario["id"], actual)
    return {"ok": True}


# SOLO ADMIN

# vista de usuarios
@app.get("/usuarios")
def listar_usuarios(admin=Depends(auth.solo_admin)):
    return [
        {"id": u["id"], "usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"],
         "principal": bool(u["principal"])}
        for u in database.listar_usuarios()
    ]
# u.u

# Crearcion de usuarios
@app.post("/usuarios")
def crear_usuario(datos: UsuarioNuevo, admin=Depends(auth.solo_admin)):
    """Crea un usuario nuevo (solo administrador)."""
    if database.obtener_usuario_por_nombre(datos.usuario.strip()):
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe.")
    if len(datos.password) < auth.MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {auth.MIN_PASSWORD} caracteres.")
    if datos.rol not in ("admin", "empleado"):
        raise HTTPException(status_code=400, detail="Rol no válido.")
    salt, h = auth.cifrar_password(datos.password)
    nid = database.crear_usuario(datos.usuario.strip(), datos.nombre.strip(), h, salt, datos.rol)
    return {"id": nid, "usuario": datos.usuario.strip(), "nombre": datos.nombre.strip(), "rol": datos.rol}


# Edicion de usuarios y sus contraseñas
@app.put("/usuarios/{usuario_id}")
def editar_usuario(usuario_id: int, datos: UsuarioEditar, admin=Depends(auth.solo_admin)):
    objetivo = database.obtener_usuario_por_id(usuario_id)
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if objetivo["principal"]:
        raise HTTPException(status_code=403, detail="El administrador principal no se puede editar.")

    nuevo_usuario = datos.usuario.strip()
    nuevo_nombre = datos.nombre.strip()
    if not nuevo_usuario or not nuevo_nombre:
        raise HTTPException(status_code=400, detail="El usuario y el nombre son obligatorios.")
    if datos.rol not in ("admin", "empleado"):
        raise HTTPException(status_code=400, detail="Rol no válido.")
    
    # Usuario unico
    otro = database.obtener_usuario_por_nombre(nuevo_usuario)
    if otro and otro["id"] != usuario_id:
        raise HTTPException(status_code=400, detail="Ese nombre de usuario ya existe.")
    
    # No dejar el sistema sin administradores.
    if objetivo["rol"] == "admin" and datos.rol != "admin":
        admins = [u for u in database.listar_usuarios() if u["rol"] == "admin"]
        if len(admins) <= 1:
            raise HTTPException(status_code=400, detail="Debe quedar al menos un administrador.")
        
    # Validar la contraseña ANTES de tocar nada (si es que la cambia).
    if datos.nueva_password and len(datos.nueva_password) < auth.MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {auth.MIN_PASSWORD} caracteres.")

    database.actualizar_usuario_datos(usuario_id, nuevo_usuario, nuevo_nombre, datos.rol)

    if datos.nueva_password:
        salt, h = auth.cifrar_password(datos.nueva_password)
        database.actualizar_password(usuario_id, h, salt)
        # Si le cambian la contraseña a OTRO, se cierran sus sesiones.
        if usuario_id != admin["id"]:
            database.eliminar_sesiones_de_usuario(usuario_id)

    return {"id": usuario_id, "usuario": nuevo_usuario, "nombre": nuevo_nombre, "rol": datos.rol}


# Asigna contraseña
@app.post("/usuarios/{usuario_id}/password")
def restablecer_password(usuario_id: int, datos: PasswordReset, admin=Depends(auth.solo_admin)):

    objetivo = database.obtener_usuario_por_id(usuario_id)
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    if objetivo["principal"]:
        raise HTTPException(status_code=403, detail="El administrador principal gestiona su propia contraseña.")
    if len(datos.nueva) < auth.MIN_PASSWORD:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {auth.MIN_PASSWORD} caracteres.")
    salt, h = auth.cifrar_password(datos.nueva)
    database.actualizar_password(usuario_id, h, salt)
    database.eliminar_sesiones_de_usuario(usuario_id)  # se cierra su sesión actual
    return {"ok": True}


# Elimar usuarios
@app.delete("/usuarios/{usuario_id}")
def eliminar_usuario(usuario_id: int, admin=Depends(auth.solo_admin)):
    if usuario_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario.")
    
    objetivo = database.obtener_usuario_por_id(usuario_id)
    if not objetivo:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    if objetivo["principal"]:
        raise HTTPException(status_code=403, detail="El administrador principal no se puede eliminar.")
    
    if objetivo["rol"] == "admin":
        admins = [u for u in database.listar_usuarios() if u["rol"] == "admin"]

        if len(admins) <= 1:
            raise HTTPException(status_code=400, detail="Debe quedar al menos un administrador.")
        
    database.eliminar_usuario(usuario_id)
    return {"ok": True}


# Arma el proyecto con todos sus cálculos

def _proyecto_completo(proyecto):
    entradas = database.listar_entradas(proyecto["id"])
    salidas = database.listar_salidas(proyecto["id"])
    pausas = database.listar_pausas(proyecto["id"])
    texto_estado, color = logica.info_estado(proyecto)
    dias_pausa = logica.dias_en_pausa(pausas)
    duracion = logica.duracion_dias(proyecto)
    return {
        **proyecto,
        "entradas": entradas,
        "salidas": salidas,
        "total_entradas": logica.total_entradas(entradas),
        "total_salidas": logica.total_salidas(salidas),
        "saldo": logica.saldo_actual(entradas, salidas),
        "ganancia": logica.ganancia_final(proyecto, entradas, salidas),
        "porcentaje": logica.porcentaje_cobrado(proyecto, entradas),
        "duracion": duracion,
        "dias_pausa": dias_pausa,
        "dias_efectivos": (duracion - dias_pausa) if duracion is not None else None,
        "estado_texto": texto_estado,
        "estado_color": color,
    }


# Version ligera del proyecto completo
def _proyecto_lista(proyecto, total_entradas, total_salidas):
    texto_estado, color = logica.info_estado(proyecto)
    ganancia = total_entradas - total_salidas
    return {
        **proyecto,
        "total_entradas": total_entradas,
        "total_salidas": total_salidas,
        "saldo": ganancia,
        "ganancia": ganancia,
        "porcentaje": logica.porcentaje_cobrado_monto(proyecto["total"], total_entradas),
        "duracion": logica.duracion_dias(proyecto),
        "estado_texto": texto_estado,
        "estado_color": color,
    }


# Presupuestos

def _presupuesto_completo(presupuesto):
    items = database.listar_items(presupuesto["id"])
    return {**presupuesto, "items": items, "resumen": logica.resumen_presupuesto(presupuesto, items)}


@app.get("/presupuestos")
def listar_presupuestos():
    return [_presupuesto_completo(p) for p in database.listar_presupuestos()]


@app.get("/presupuestos/{presupuesto_id}")
def obtener_presupuesto(presupuesto_id: int):
    p = database.obtener_presupuesto(presupuesto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    return _presupuesto_completo(p)


@app.post("/presupuestos")
def crear_presupuesto(datos: PresupuestoDatos):
    if not datos.nombre.strip() or not datos.cliente.strip():
        raise HTTPException(status_code=400, detail="El nombre y el cliente son obligatorios.")
    
    if not datos.tipo.strip():
        raise HTTPException(status_code=400, detail="El tipo de proyecto es obligatorio.")
    
    if datos.utilidad_pct < 0:
        raise HTTPException(status_code=400, detail="La utilidad no puede ser negativa.")
    
    nid = database.crear_presupuesto(datos.nombre.strip(), datos.cliente.strip(), datos.tipo.strip(), datos.utilidad_pct, date.today().isoformat())
    return _presupuesto_completo(database.obtener_presupuesto(nid))


@app.put("/presupuestos/{presupuesto_id}")
def editar_presupuesto(presupuesto_id: int, datos: PresupuestoDatos):
    if not database.obtener_presupuesto(presupuesto_id):
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    
    if not datos.nombre.strip() or not datos.cliente.strip():
        raise HTTPException(status_code=400, detail="El nombre y el cliente son obligatorios.")
    
    if not datos.tipo.strip():
        raise HTTPException(status_code=400, detail="El tipo de proyecto es obligatorio.")
    
    if datos.utilidad_pct < 0:
        raise HTTPException(status_code=400, detail="La utilidad no puede ser negativa.")
    
    database.actualizar_presupuesto(presupuesto_id, datos.nombre.strip(), datos.cliente.strip(), datos.tipo.strip(), datos.utilidad_pct)
    return _presupuesto_completo(database.obtener_presupuesto(presupuesto_id))


@app.delete("/presupuestos/{presupuesto_id}")
def eliminar_presupuesto(presupuesto_id: int):
    p = database.obtener_presupuesto(presupuesto_id)
    if p and p["estado"] == "convertido":
        raise HTTPException(status_code=400,
                            detail="Este presupuesto ya es un proyecto activo; queda guardado como registro y no se puede eliminar.")
    database.eliminar_presupuesto(presupuesto_id)
    return {"ok": True}


@app.post("/presupuestos/{presupuesto_id}/items")
def agregar_item(presupuesto_id: int, datos: ItemNuevo):
    if not database.obtener_presupuesto(presupuesto_id):
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    
    if datos.categoria not in logica.CATEGORIAS_PRESUPUESTO:
        raise HTTPException(status_code=400, detail="Categoría no válida.")
    
    if not datos.concepto.strip():
        raise HTTPException(status_code=400, detail="El concepto es obligatorio.")
    
    if datos.monto is None or datos.monto <= 0:
        raise HTTPException(status_code=400, detail="Ingresa un monto mayor a 0.")
    database.agregar_item(presupuesto_id, datos.categoria, datos.concepto.strip(),
                          (datos.descripcion or "").strip() or None, datos.monto)
    return _presupuesto_completo(database.obtener_presupuesto(presupuesto_id))


@app.delete("/items/{item_id}")
def eliminar_item(item_id: int):
    item = database.obtener_item(item_id)
    database.eliminar_item(item_id)
    if item:
        return _presupuesto_completo(database.obtener_presupuesto(item["presupuesto_id"]))
    return {"ok": True}


# Genera PDF
@app.get("/presupuestos/{presupuesto_id}/pdf")
def descargar_pdf_cotizacion(presupuesto_id: int):
    p = database.obtener_presupuesto(presupuesto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    items = database.listar_items(presupuesto_id)
    resumen = logica.resumen_presupuesto(p, items)
    pdf_bytes = pdf_export.generar_pdf_cotizacion(p, items, resumen)
    nombre = _nombre_archivo(p["nombre"])
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cotizacion_{nombre}.pdf"'},
    )


# Crea proyecto a partir de presupuesto
@app.post("/presupuestos/{presupuesto_id}/convertir")
def convertir_a_proyecto(presupuesto_id: int):
    p = database.obtener_presupuesto(presupuesto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Presupuesto no encontrado")
    
    if p["estado"] == "convertido":
        raise HTTPException(status_code=400, detail="Este presupuesto ya se convirtió en proyecto.")
    
    items = database.listar_items(presupuesto_id)
    resumen = logica.resumen_presupuesto(p, items)
    if resumen["costo_total"] <= 0:
        raise HTTPException(status_code=400, detail="Agrega al menos una partida de costo antes de convertir.")
    
    nuevo_id = database.convertir_presupuesto_a_proyecto(
        presupuesto_id, p["nombre"], p["cliente"], (p.get("tipo") or "Otro"),
        round(resumen["precio_venta"], 2), date.today().isoformat(),
    )
    return _proyecto_completo(database.obtener_proyecto(nuevo_id))


# Compara presupuesto contra gastos
@app.get("/proyectos/{proyecto_id}/comparacion")
def comparacion_proyecto(proyecto_id: int):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    presupuesto = database.obtener_presupuesto_por_proyecto(proyecto_id)
    if not presupuesto:
        return {"tiene_presupuesto": False}
    items = database.listar_items(presupuesto["id"])
    salidas = database.listar_salidas(proyecto_id)
    entradas = database.listar_entradas(proyecto_id)
    resumen = logica.resumen_presupuesto(presupuesto, items)
    ganancia_real = logica.ganancia_final(proyecto, entradas, salidas)
    return {
        "tiene_presupuesto": True,
        "presupuesto_id": presupuesto["id"],
        "items": items,  # las partidas del presupuesto, para cargarlas en las salidas
        "resumen": resumen,
        "comparacion": logica.comparacion_presupuesto_real(resumen, salidas, ganancia_real),
    }


# Catálogos 

@app.get("/catalogos")
def catalogos():
    return {
        "tipos": logica.TIPOS_PROYECTO,
        "estados_activos": logica.ESTADOS_ACTIVOS,
        "categorias_presupuesto": logica.CATEGORIAS_PRESUPUESTO,
        "nombre_categoria": logica.NOMBRE_CATEGORIA,
    }


# Proyectos

@app.get("/proyectos")
def listar_proyectos():
    ent = database.sumas_entradas()
    sal = database.sumas_salidas()
    return [_proyecto_lista(p, ent.get(p["id"], 0), sal.get(p["id"], 0))
            for p in database.listar_proyectos()]


@app.get("/proyectos/{proyecto_id}")
def obtener_proyecto(proyecto_id: int):
    p = database.obtener_proyecto(proyecto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    return _proyecto_completo(p)


@app.post("/proyectos")
def crear_proyecto(datos: ProyectoDatos):
    ok, errores = logica.validar_nuevo_proyecto(
        datos.nombre, datos.cliente, datos.tipo, datos.total, datos.fecha_inicio
    )
    if not ok:
        raise HTTPException(status_code=400, detail=errores)
    nuevo_id = database.crear_proyecto(
        datos.nombre.strip(), datos.cliente.strip(), datos.tipo.strip(),
        datos.total, datos.fecha_inicio,
    )
    return _proyecto_completo(database.obtener_proyecto(nuevo_id))

# u.u
@app.put("/proyectos/{proyecto_id}")
def editar_proyecto(proyecto_id: int, datos: ProyectoDatos):
    if not database.obtener_proyecto(proyecto_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    ok, errores = logica.validar_nuevo_proyecto(
        datos.nombre, datos.cliente, datos.tipo, datos.total, datos.fecha_inicio
    )
    if not ok:
        raise HTTPException(status_code=400, detail=errores)
    database.actualizar_proyecto(
        proyecto_id, datos.nombre.strip(), datos.cliente.strip(),
        datos.tipo.strip(), datos.total, datos.fecha_inicio,
    )
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Cambia el estado manualmente
@app.post("/proyectos/{proyecto_id}/estado")
def cambiar_estado(proyecto_id: int, datos: CambioEstado):
    if datos.estado not in logica.ESTADOS_ACTIVOS:
        raise HTTPException(status_code=400, detail="Estado no válido.")
    database.cambiar_estado_activo(proyecto_id, datos.estado)
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Finalizar proyecto (Solo si tiene 100% cobrado)
@app.post("/proyectos/{proyecto_id}/finalizar")
def finalizar_proyecto(proyecto_id: int):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    entradas = database.listar_entradas(proyecto_id)
    if logica.porcentaje_cobrado(proyecto, entradas) < 100:
        raise HTTPException(status_code=400,
                            detail="Solo se puede finalizar cuando el proyecto está 100% cobrado.")
    database.cambiar_estado(proyecto_id, "finalizado", date.today().isoformat())
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Cancelar proyecto
@app.post("/proyectos/{proyecto_id}/cancelar")
def cancelar_proyecto(proyecto_id: int):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if proyecto["estado"] in ("finalizado", "cancelado"):
        raise HTTPException(status_code=400, detail="El proyecto ya está cerrado.")
        
    # Si estaba en pausa, cerramos el período de pausa abierto.
    if proyecto["estado"] == "pausa":
        database.reanudar_proyecto(proyecto_id, "cancelado", date.today().isoformat())
        database.cambiar_estado(proyecto_id, "cancelado", date.today().isoformat())
    else:
        database.cambiar_estado(proyecto_id, "cancelado", date.today().isoformat())
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Registra fecha desde su estado pausa
@app.post("/proyectos/{proyecto_id}/pausar")
def pausar_proyecto(proyecto_id: int):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if proyecto["estado"] not in logica.ESTADOS_ACTIVOS:
        raise HTTPException(status_code=400, detail="Solo se puede pausar un proyecto activo.")
    database.pausar_proyecto(proyecto_id, proyecto["estado"], date.today().isoformat())
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Reanuda proyecto
@app.post("/proyectos/{proyecto_id}/reanudar")
def reanudar_proyecto(proyecto_id: int):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    if proyecto["estado"] != "pausa":
        raise HTTPException(status_code=400, detail="El proyecto no está en pausa.")
    estado_nuevo = proyecto.get("estado_previo") or "proceso"
    database.reanudar_proyecto(proyecto_id, estado_nuevo, date.today().isoformat())
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


# Entradas

@app.post("/proyectos/{proyecto_id}/entradas")
def agregar_entrada(proyecto_id: int, datos: EntradaNueva):
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    entradas = database.listar_entradas(proyecto_id)
    ok, error = logica.validar_entrada(datos.monto, datos.fecha, proyecto, entradas)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    database.agregar_entrada(proyecto_id, datos.fecha, datos.monto, datos.observacion)
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


@app.put("/entradas/{entrada_id}")
def editar_entrada(entrada_id: int, datos: EntradaNueva):
    entrada = database.obtener_entrada(entrada_id)
    if not entrada:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    proyecto = database.obtener_proyecto(entrada["proyecto_id"])

    # Para validar el tope, sumamos las demás entradas (excluyendo esta misma).
    otras = [e for e in database.listar_entradas(proyecto["id"]) if e["id"] != entrada_id]
    ok, error = logica.validar_entrada(datos.monto, datos.fecha, proyecto, otras)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    database.actualizar_entrada(entrada_id, datos.fecha, datos.monto, datos.observacion)
    return _proyecto_completo(database.obtener_proyecto(proyecto["id"]))


@app.delete("/entradas/{entrada_id}")
def eliminar_entrada(entrada_id: int):
    database.eliminar_entrada(entrada_id)
    return {"ok": True}


#  Salidas

@app.post("/proyectos/{proyecto_id}/salidas")
def agregar_salida(proyecto_id: int, datos: SalidaNueva):
    if not database.obtener_proyecto(proyecto_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    ok, error = logica.validar_salida(datos.proveedor, datos.descripcion, datos.monto, datos.fecha)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    database.agregar_salida(
        proyecto_id, datos.fecha, datos.proveedor.strip(),
        datos.descripcion.strip(), datos.monto, datos.observacion, datos.categoria, datos.partida_id,
    )
    return _proyecto_completo(database.obtener_proyecto(proyecto_id))


@app.put("/salidas/{salida_id}")
def editar_salida(salida_id: int, datos: SalidaNueva):
    salida = database.obtener_salida(salida_id)
    if not salida:
        raise HTTPException(status_code=404, detail="Salida no encontrada")
    ok, error = logica.validar_salida(datos.proveedor, datos.descripcion, datos.monto, datos.fecha)
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    database.actualizar_salida(
        salida_id, datos.fecha, datos.proveedor.strip(),
        datos.descripcion.strip(), datos.monto, datos.observacion, datos.categoria,
    )
    return _proyecto_completo(database.obtener_proyecto(salida["proyecto_id"]))


@app.delete("/salidas/{salida_id}")
def eliminar_salida(salida_id: int):
    database.eliminar_salida(salida_id)
    return {"ok": True}


@app.get("/proyectos/{proyecto_id}/pdf")
def descargar_pdf(proyecto_id: int):
    """Genera y devuelve el PDF de cierre del proyecto."""
    proyecto = database.obtener_proyecto(proyecto_id)
    if not proyecto:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado")
    entradas = database.listar_entradas(proyecto_id)
    salidas = database.listar_salidas(proyecto_id)
    pdf_bytes = pdf_export.generar_pdf_cierre(proyecto, entradas, salidas)
    nombre = _nombre_archivo(proyecto["nombre"])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cierre_{nombre}.pdf"'},
    )


# Análisis

def _resumen_proyecto_analisis(proyecto, total_entradas, total_salidas):
    texto_estado, color = logica.info_estado(proyecto)
    return {
        "id": proyecto["id"], "nombre": proyecto["nombre"], "cliente": proyecto["cliente"],
        "total": proyecto["total"], "ganancia": total_entradas - total_salidas,
        "total_entradas": total_entradas, "total_salidas": total_salidas,
        "duracion": logica.duracion_dias(proyecto), "estado": proyecto["estado"],
        "estado_texto": texto_estado, "estado_color": color,
        "fecha_inicio": proyecto["fecha_inicio"], "fecha_fin": proyecto.get("fecha_fin"),
    }


@app.get("/analisis")
def analisis(anio: Optional[str] = None, mes: Optional[str] = None, trimestre: Optional[str] = None):

    # Separa por finalizado o cancelado
    cerrados = [p for p in database.listar_proyectos()
                if p["estado"] in ("finalizado", "cancelado") and p.get("fecha_fin")]

    # Filtro por año.
    if anio and anio != "todos":
        cerrados = [p for p in cerrados if p["fecha_fin"][:4] == anio]

    # Filtro por mes.
    if mes and mes != "todos":
        cerrados = [p for p in cerrados if p["fecha_fin"][5:7] == mes]

    # Filtro por trimestre (1-4).
    if trimestre and trimestre != "todos":
        meses_tri = {
            "1": ["01", "02", "03"], "2": ["04", "05", "06"],
            "3": ["07", "08", "09"], "4": ["10", "11", "12"],
        }.get(trimestre, [])
        cerrados = [p for p in cerrados if p["fecha_fin"][5:7] in meses_tri]

    ent = database.sumas_entradas()
    sal = database.sumas_salidas()

    def construir(p):
        return _resumen_proyecto_analisis(p, ent.get(p["id"], 0), sal.get(p["id"], 0))

    finalizados = [construir(p) for p in cerrados if p["estado"] == "finalizado"]
    cancelados = [construir(p) for p in cerrados if p["estado"] == "cancelado"]

    return {
        "proyectos": finalizados,                          # solo finalizados (gráfico y tablas)
        "indicadores": logica.analizar(finalizados),
        "cancelados": cancelados,                          # detalle de cada cancelado
        "indicadores_cancelados": logica.analizar_cancelados(cancelados),
    }
