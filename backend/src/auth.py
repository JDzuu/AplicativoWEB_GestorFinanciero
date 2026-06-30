

# Capa de seguridad

import os
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, Response
from pwdlib import PasswordHash

from src import database

# Algoritmo para contraseñas nuevas.
_hasher = PasswordHash.recommended()

# Hash "señuelo" de una contraseña cualquiera.
_HASH_SENUELO = _hasher.hash("contrasena_que_nunca_coincide")

DURACION_SESION_HORAS = 8        # Sesion cada 8h
MAX_INTENTOS = 5                 # Intetos fallidos
BLOQUEO_MINUTOS = 15             # Duraccion de bloqueo
MIN_PASSWORD = 8                 # Min caracteres contraseña

# Rutas que se pueden usar SIN haber iniciado sesión.
RUTAS_ABIERTAS = {"/login", "/docs", "/openapi.json", "/redoc"}

# El token de sesión viaja en una cookie httpOnly 
NOMBRE_COOKIE_SESION = "sesion"
NOMBRE_COOKIE_CSRF = "csrftoken"

# Métodos que no cambian estado: no necesitan comprobación CSRF.
METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS", "TRACE"}

# La marca Secure (cookie solo por HTTPS) se activa en producción.
COOKIES_SEGURAS = os.environ.get("ENTORNO", "desarrollo").strip().lower() == "produccion"


# Contraseñas

# Argon2
def cifrar_password(password: str):
    return "", _hasher.hash(password)


def verificar_password(password: str, salt: str, hash_guardado: str) -> bool:
    return _hasher.verify(password, hash_guardado)


# Defensa contra enumeración de usuarios por timing
def verificar_password_dummy() -> None:
    try:
        _hasher.verify("contrasena_incorrecta", _HASH_SENUELO)
    except Exception:
        pass


# Tokens de sesión

def generar_token() -> str:
    return secrets.token_urlsafe(32)



def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def expiracion() -> str:
    return (datetime.now() + timedelta(hours=DURACION_SESION_HORAS)).isoformat(timespec="seconds")


# Anti fuerza bruta

# Bloquea al usuario mas no la IP
def revisar_bloqueo(usuario: str):
    fila = database.obtener_intentos(usuario)
    if fila and fila["bloqueado_hasta"] and fila["bloqueado_hasta"] > datetime.now().isoformat(timespec="seconds"):
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.",
        )


def registrar_fallo(usuario: str):
    fila = database.obtener_intentos(usuario)
    fallos = (fila["fallos"] if fila else 0) + 1
    bloqueado = None
    if fallos >= MAX_INTENTOS:
        bloqueado = (datetime.now() + timedelta(minutes=BLOQUEO_MINUTOS)).isoformat(timespec="seconds")
        fallos = 0  # reiniciamos el conteo; el bloqueo ya está puesto
    database.guardar_intentos(usuario, fallos, bloqueado)


def reiniciar_intentos(usuario: str):
    database.borrar_intentos(usuario)


# Cookies de sesión

# Entrega de las dos cookies
def poner_cookies_sesion(response: Response, token: str, csrf: str):
    comun = {
        "max_age": DURACION_SESION_HORAS * 3600,
        "secure": COOKIES_SEGURAS,
        "samesite": "strict",
        "path": "/",
    }
    response.set_cookie(NOMBRE_COOKIE_SESION, token, httponly=True, **comun)
    response.set_cookie(NOMBRE_COOKIE_CSRF, csrf, httponly=False, **comun)


def borrar_cookies_sesion(response: Response):
    """Quita las cookies de sesión (al cerrar sesión)."""
    response.delete_cookie(NOMBRE_COOKIE_SESION, path="/")
    response.delete_cookie(NOMBRE_COOKIE_CSRF, path="/")


# Identificación del usuario en cada pedido 

def token_de_request(request: Request):
    cookie = request.cookies.get(NOMBRE_COOKIE_SESION)
    if cookie:
        return cookie
    cab = request.headers.get("authorization")
    if cab and cab.startswith("Bearer "):
        return cab[7:]
    return None


# Devuelve el usuario dueño del token
def _usuario_desde_request(request: Request):
    tok = token_de_request(request)
    if not tok:
        return None
    sesion = database.obtener_sesion(hash_token(tok))
    if not sesion:
        return None
    if sesion["expira"] < datetime.now().isoformat(timespec="seconds"):
        database.eliminar_sesion(sesion["token"])  # limpia la sesión vencida
        return None
    return database.obtener_usuario_por_id(sesion["usuario_id"])


# Dependencia GLOBAL anti-CSRF
def verificar_csrf(request: Request):
    if request.method in METODOS_SEGUROS:
        return
    if request.url.path in RUTAS_ABIERTAS:
        return
    if not request.cookies.get(NOMBRE_COOKIE_SESION):
        return
    enviado = request.headers.get("X-CSRF-Token")
    cookie_csrf = request.cookies.get(NOMBRE_COOKIE_CSRF)
    if not enviado or not cookie_csrf or not secrets.compare_digest(enviado, cookie_csrf):
        raise HTTPException(status_code=403, detail="Token CSRF inválido o ausente.")


# Protege rutas si no hay sesion valida
def requiere_auth(request: Request):
    if request.url.path in RUTAS_ABIERTAS:
        return
    if not _usuario_desde_request(request):
        raise HTTPException(status_code=401, detail="Debes iniciar sesión.")


def usuario_actual(request: Request):
    usuario = _usuario_desde_request(request)
    if not usuario:
        raise HTTPException(status_code=401, detail="Debes iniciar sesión.")
    return usuario


def solo_admin(usuario=Depends(usuario_actual)):
    if usuario["rol"] != "admin":
        raise HTTPException(status_code=403, detail="Solo un administrador puede hacer esto.")
    return usuario


# Solo al iniciar crea el admin
def asegurar_admin_inicial():
    if database.contar_usuarios() > 0:
        return

    usuario = os.environ.get("ADMIN_USUARIO", "admin").strip() or "admin"
    nombre = os.environ.get("ADMIN_NOMBRE", "Administrador").strip() or "Administrador"
    password = os.environ.get("ADMIN_PASSWORD", "").strip() # Ingresar contraseña si no se generara una aleatoria

    generada = not password
    if generada:
        password = secrets.token_urlsafe(12)

    salt, h = cifrar_password(password)
    database.crear_usuario(usuario, nombre, h, salt, "admin", principal=True)

    print("\n[SEGURIDAD] Usuario administrador inicial creado.")
    print(f"[SEGURIDAD] Usuario: '{usuario}'")
    if generada:
        print(f"[SEGURIDAD] Contraseña generada (anótala, NO se volverá a mostrar): {password}") # 
    else:
        print("[SEGURIDAD] Contraseña: la definida en la variable ADMIN_PASSWORD.")
    print("[SEGURIDAD] Inicia sesión y cámbiala cuanto antes.\n")
