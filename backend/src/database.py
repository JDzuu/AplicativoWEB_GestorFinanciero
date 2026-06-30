
# Comunicación con la base de datos (bd.py)

from datetime import datetime

from src import bd

# Iniciar la base de datos
def inicializar():
    bd.crear_tablas()


# Proyectos

def crear_proyecto(nombre, cliente, tipo, total, fecha_inicio):
    return bd.ejecutar(
        "INSERT INTO proyectos (nombre, cliente, tipo, total, fecha_inicio, estado, creado) "
        "VALUES (?, ?, ?, ?, ?, 'iniciando', ?)",
        (nombre, cliente, tipo, total, fecha_inicio, datetime.now().isoformat(timespec="seconds")),
        retornar_id=True,
    )


def listar_proyectos():
    return bd.ejecutar("SELECT * FROM proyectos ORDER BY fecha_inicio DESC", fetch="all")


def obtener_proyecto(proyecto_id):
    return bd.ejecutar("SELECT * FROM proyectos WHERE id = ?", (proyecto_id,), fetch="one")


def actualizar_proyecto(proyecto_id, nombre, cliente, tipo, total, fecha_inicio):
    bd.ejecutar(
        "UPDATE proyectos SET nombre = ?, cliente = ?, tipo = ?, total = ?, fecha_inicio = ? WHERE id = ?",
        (nombre, cliente, tipo, total, fecha_inicio, proyecto_id),
    )


def cambiar_estado(proyecto_id, estado, fecha_fin=None):
    bd.ejecutar(
        "UPDATE proyectos SET estado = ?, fecha_fin = ? WHERE id = ?",
        (estado, fecha_fin, proyecto_id),
    )


def cambiar_estado_activo(proyecto_id, estado):
    bd.ejecutar("UPDATE proyectos SET estado = ? WHERE id = ?", (estado, proyecto_id))


def pausar_proyecto(proyecto_id, estado_previo, fecha):
    with bd.transaccion() as tx:
        tx("UPDATE proyectos SET estado = 'pausa', estado_previo = ? WHERE id = ?",
           (estado_previo, proyecto_id))
        tx("INSERT INTO pausas (proyecto_id, inicio) VALUES (?, ?)", (proyecto_id, fecha))


def reanudar_proyecto(proyecto_id, estado_nuevo, fecha):
    with bd.transaccion() as tx:
        tx("UPDATE pausas SET fin = ? WHERE proyecto_id = ? AND fin IS NULL", (fecha, proyecto_id))
        tx("UPDATE proyectos SET estado = ?, estado_previo = NULL WHERE id = ?", (estado_nuevo, proyecto_id))


def listar_pausas(proyecto_id):
    return bd.ejecutar("SELECT * FROM pausas WHERE proyecto_id = ? ORDER BY id", (proyecto_id,), fetch="all")


# Entradas
def agregar_entrada(proyecto_id, fecha, monto, observacion=None):
    bd.ejecutar(
        "INSERT INTO entradas (proyecto_id, fecha, monto, observacion) VALUES (?, ?, ?, ?)",
        (proyecto_id, fecha, monto, observacion),
    )


def listar_entradas(proyecto_id):
    return bd.ejecutar(
        "SELECT * FROM entradas WHERE proyecto_id = ? ORDER BY fecha", (proyecto_id,), fetch="all"
    )


def obtener_entrada(entrada_id):
    return bd.ejecutar("SELECT * FROM entradas WHERE id = ?", (entrada_id,), fetch="one")


def actualizar_entrada(entrada_id, fecha, monto, observacion=None):
    bd.ejecutar(
        "UPDATE entradas SET fecha = ?, monto = ?, observacion = ? WHERE id = ?",
        (fecha, monto, observacion, entrada_id),
    )


def eliminar_entrada(entrada_id):
    bd.ejecutar("DELETE FROM entradas WHERE id = ?", (entrada_id,))


# Salidas 

def agregar_salida(proyecto_id, fecha, proveedor, descripcion, monto, observacion=None, categoria=None, partida_id=None):
    bd.ejecutar(
        "INSERT INTO salidas (proyecto_id, fecha, proveedor, descripcion, monto, observacion, categoria, partida_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (proyecto_id, fecha, proveedor, descripcion, monto, observacion, categoria, partida_id),
    )


def listar_salidas(proyecto_id):
    return bd.ejecutar(
        "SELECT * FROM salidas WHERE proyecto_id = ? ORDER BY fecha", (proyecto_id,), fetch="all"
    )


def obtener_salida(salida_id):
    return bd.ejecutar("SELECT * FROM salidas WHERE id = ?", (salida_id,), fetch="one")


def actualizar_salida(salida_id, fecha, proveedor, descripcion, monto, observacion=None, categoria=None):
    bd.ejecutar(
        "UPDATE salidas SET fecha = ?, proveedor = ?, descripcion = ?, monto = ?, observacion = ?, categoria = ? WHERE id = ?",
        (fecha, proveedor, descripcion, monto, observacion, categoria, salida_id),
    )


def eliminar_salida(salida_id):
    bd.ejecutar("DELETE FROM salidas WHERE id = ?", (salida_id,))


# Sumas agrupadas 
def sumas_entradas():
    filas = bd.ejecutar(
        "SELECT proyecto_id, COALESCE(SUM(monto), 0) AS total FROM entradas GROUP BY proyecto_id", 
        fetch="all",
    )
    return {f["proyecto_id"]: f["total"] for f in filas}


def sumas_salidas():
    filas = bd.ejecutar(
        "SELECT proyecto_id, COALESCE(SUM(monto), 0) AS total FROM salidas GROUP BY proyecto_id",
        fetch="all",
    )
    return {f["proyecto_id"]: f["total"] for f in filas}


# Usuarios 
def contar_usuarios():
    fila = bd.ejecutar("SELECT COUNT(*) AS n FROM usuarios", fetch="one")
    return fila["n"]


def crear_usuario(usuario, nombre, password_hash, salt, rol, principal=False):
    return bd.ejecutar(
        "INSERT INTO usuarios (usuario, nombre, password_hash, salt, rol, principal, creado) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (usuario, nombre, password_hash, salt, rol, 1 if principal else 0,
         datetime.now().isoformat(timespec="seconds")),
        retornar_id=True,
    )


def listar_usuarios():
    return bd.ejecutar("SELECT * FROM usuarios ORDER BY nombre", fetch="all")


def obtener_usuario_por_nombre(usuario):
    return bd.ejecutar("SELECT * FROM usuarios WHERE usuario = ?", (usuario,), fetch="one")


def obtener_usuario_por_id(usuario_id):
    return bd.ejecutar("SELECT * FROM usuarios WHERE id = ?", (usuario_id,), fetch="one")


def actualizar_password(usuario_id, password_hash, salt):
    bd.ejecutar(
        "UPDATE usuarios SET password_hash = ?, salt = ? WHERE id = ?",
        (password_hash, salt, usuario_id),
    )


def actualizar_usuario_datos(usuario_id, usuario, nombre, rol):
    bd.ejecutar(
        "UPDATE usuarios SET usuario = ?, nombre = ?, rol = ? WHERE id = ?",
        (usuario, nombre, rol, usuario_id),
    )

# Guarda preferencia de tema
def actualizar_tema(usuario_id, tema):
    bd.ejecutar("UPDATE usuarios SET tema = ? WHERE id = ?", (tema, usuario_id))


def eliminar_usuario(usuario_id):
    bd.ejecutar("DELETE FROM usuarios WHERE id = ?", (usuario_id,))


# Sesiones temporales
def crear_sesion(token, usuario_id, expira):
    bd.ejecutar(
        "INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, ?)",
        (token, usuario_id, expira),
    )


def obtener_sesion(token):
    return bd.ejecutar("SELECT * FROM sesiones WHERE token = ?", (token,), fetch="one")


def eliminar_sesion(token):
    bd.ejecutar("DELETE FROM sesiones WHERE token = ?", (token,))


def eliminar_sesiones_de_usuario(usuario_id):
    bd.ejecutar("DELETE FROM sesiones WHERE usuario_id = ?", (usuario_id,))


# Cierra todas las sesiones menos la actual
def eliminar_otras_sesiones(usuario_id, token_actual):
    if token_actual:
        bd.ejecutar("DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?", (usuario_id, token_actual))
    else:
        bd.ejecutar("DELETE FROM sesiones WHERE usuario_id = ?", (usuario_id,))


# Borra sesiones expiradas
def eliminar_sesiones_expiradas():
    bd.ejecutar(
        "DELETE FROM sesiones WHERE expira < ?",
        (datetime.now().isoformat(timespec="seconds"),),
    )


#  Anti fuerza bruta

def obtener_intentos(usuario):
    return bd.ejecutar("SELECT * FROM intentos_login WHERE usuario = ?", (usuario,), fetch="one")


def guardar_intentos(usuario, fallos, bloqueado_hasta):
    bd.ejecutar(
        "INSERT INTO intentos_login (usuario, fallos, bloqueado_hasta) VALUES (?, ?, ?) "
        "ON CONFLICT(usuario) DO UPDATE SET fallos = excluded.fallos, bloqueado_hasta = excluded.bloqueado_hasta",
        (usuario, fallos, bloqueado_hasta),
    )


def borrar_intentos(usuario):
    bd.ejecutar("DELETE FROM intentos_login WHERE usuario = ?", (usuario,))


# Presupuestos 
def crear_presupuesto(nombre, cliente, tipo, utilidad_pct, fecha_creacion):
    return bd.ejecutar(
        "INSERT INTO presupuestos (nombre, cliente, tipo, utilidad_pct, estado, fecha_creacion, creado) "
        "VALUES (?, ?, ?, ?, 'borrador', ?, ?)",
        (nombre, cliente, tipo, utilidad_pct, fecha_creacion, datetime.now().isoformat(timespec="seconds")),
        retornar_id=True,
    )


def listar_presupuestos():
    return bd.ejecutar("SELECT * FROM presupuestos ORDER BY id DESC", fetch="all")


def obtener_presupuesto(presupuesto_id):
    return bd.ejecutar("SELECT * FROM presupuestos WHERE id = ?", (presupuesto_id,), fetch="one")


def obtener_presupuesto_por_proyecto(proyecto_id):
    return bd.ejecutar("SELECT * FROM presupuestos WHERE proyecto_id = ?", (proyecto_id,), fetch="one")


def actualizar_presupuesto(presupuesto_id, nombre, cliente, tipo, utilidad_pct):
    bd.ejecutar(
        "UPDATE presupuestos SET nombre = ?, cliente = ?, tipo = ?, utilidad_pct = ? WHERE id = ?",
        (nombre, cliente, tipo, utilidad_pct, presupuesto_id),
    )


# Conversión de presupuesto a proyecto y evitar que se pueda convertir más de una vez
def convertir_presupuesto_a_proyecto(presupuesto_id, nombre, cliente, tipo, total, fecha_inicio):
    with bd.transaccion() as tx:
        nuevo_id = tx(
            "INSERT INTO proyectos (nombre, cliente, tipo, total, fecha_inicio, estado, creado) "
            "VALUES (?, ?, ?, ?, ?, 'iniciando', ?)",
            (nombre, cliente, tipo, total, fecha_inicio, datetime.now().isoformat(timespec="seconds")),
            retornar_id=True,
        )
        tx(
            "UPDATE presupuestos SET estado = 'convertido', proyecto_id = ? WHERE id = ?",
            (nuevo_id, presupuesto_id),
        )
    return nuevo_id


def eliminar_presupuesto(presupuesto_id):
    bd.ejecutar("DELETE FROM presupuestos WHERE id = ?", (presupuesto_id,))


# Partidas (líneas de costo de un presupuesto)

def agregar_item(presupuesto_id, categoria, concepto, descripcion, monto):
    return bd.ejecutar(
        "INSERT INTO presupuesto_items (presupuesto_id, categoria, concepto, descripcion, monto) "
        "VALUES (?, ?, ?, ?, ?)",
        (presupuesto_id, categoria, concepto, descripcion, monto),
        retornar_id=True,
    )


def listar_items(presupuesto_id):
    return bd.ejecutar(
        "SELECT * FROM presupuesto_items WHERE presupuesto_id = ? ORDER BY id", (presupuesto_id,), fetch="all"
    )


def obtener_item(item_id):
    return bd.ejecutar("SELECT * FROM presupuesto_items WHERE id = ?", (item_id,), fetch="one")


def eliminar_item(item_id):
    bd.ejecutar("DELETE FROM presupuesto_items WHERE id = ?", (item_id,))
