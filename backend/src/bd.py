
import os
import sqlite3
from contextlib import contextmanager
from decimal import Decimal

URL = os.environ.get("DATABASE_URL", "").strip()
ES_POSTGRES = URL.startswith("postgres://") or URL.startswith("postgresql://")

RUTA_SQLITE = os.path.join(os.path.dirname(__file__), "..", "data", "proyectos.db")

# psycopg solo se importa si de verdad vamos a usar PostgreSQL, así no hace
# falta instalarlo para trabajar con SQLite.
if ES_POSTGRES:
    import psycopg
    from psycopg.rows import dict_row

# Pool de conexiones (solo PostgreSQL)
_pool_pg = None


def _pool():
    global _pool_pg
    if _pool_pg is None:
        from psycopg_pool import ConnectionPool
        _pool_pg = ConnectionPool(
            URL,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )
    return _pool_pg


@contextmanager 
def _conexion():
    if ES_POSTGRES:
        with _pool().connection() as con:
            yield con
    else:
        con = sqlite3.connect(RUTA_SQLITE)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        try:
            yield con
        finally:
            con.close()

# SQLite = ? | PostgreSQL = %s
def _adaptar(sql):
    """SQLite usa '?' como marcador de parámetro; PostgreSQL usa '%s'."""
    return sql.replace("?", "%s") if ES_POSTGRES else sql


def _normalizar(fila):
    d = dict(fila)
    for clave, valor in d.items():
        if isinstance(valor, float):
            d[clave] = Decimal(str(valor))
    return d


def _correr(cur, sql, params, fetch, retornar_id):

    consulta = _adaptar(sql)

    # En PostgreSQL el id nuevo se obtiene con RETURNING | en SQLite con lastrowid.
    if retornar_id and ES_POSTGRES:
        consulta = consulta.rstrip().rstrip(";") + " RETURNING id"
    cur.execute(consulta, params)
    if fetch == "one":
        fila = cur.fetchone()
        return _normalizar(fila) if fila else None
    if fetch == "all":
        return [_normalizar(f) for f in cur.fetchall()]
    if retornar_id:
        return cur.fetchone()["id"] if ES_POSTGRES else cur.lastrowid
    return None


def ejecutar(sql, params=(), fetch=None, retornar_id=False):

    with _conexion() as con:
        cur = con.cursor()
        try:
            resultado = _correr(cur, sql, params, fetch, retornar_id)
            con.commit()
            return resultado
        except Exception:
            con.rollback()
            raise



@contextmanager
def transaccion():
    with _conexion() as con:
        cur = con.cursor()

        def tx(sql, params=(), fetch=None, retornar_id=False):
            return _correr(cur, sql, params, fetch, retornar_id)

        try:
            yield tx
            con.commit()
        except Exception:
            con.rollback()
            raise


# Revisa el motor seleccionado y crea la BD
def _ddl(motor):
    if motor == "postgres":
        PK = "BIGINT  GENERATED ALWAYS AS IDENTITY PRIMARY KEY"
        INT = "BIGINT"
        DINERO = "NUMERIC(14,2)"
        PCT = "NUMERIC(6,2)"
    else:
        PK = "INTEGER PRIMARY KEY AUTOINCREMENT"
        INT = "INTEGER"
        DINERO = "REAL"
        PCT = "REAL"

    return [
        f"""CREATE TABLE IF NOT EXISTS proyectos (
            id            {PK},
            nombre        TEXT    NOT NULL,
            cliente       TEXT    NOT NULL,
            tipo          TEXT    NOT NULL,
            total         {DINERO} NOT NULL CHECK (total > 0),
            fecha_inicio  TEXT    NOT NULL,
            estado        TEXT    NOT NULL DEFAULT 'iniciando'
                          CHECK (estado IN ('iniciando','proceso','acabando','pausa','finalizado','cancelado')),
            estado_previo TEXT,
            fecha_fin     TEXT,
            creado        TEXT    NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS presupuestos (
            id             {PK},
            nombre         TEXT    NOT NULL,
            cliente        TEXT    NOT NULL,
            tipo           TEXT,
            utilidad_pct   {PCT} NOT NULL DEFAULT 0 CHECK (utilidad_pct >= 0),
            estado         TEXT    NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador','convertido')),
            proyecto_id    {INT}  REFERENCES proyectos(id) ON DELETE SET NULL,
            fecha_creacion TEXT    NOT NULL,
            creado         TEXT    NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS presupuesto_items (
            id             {PK},
            presupuesto_id {INT}  NOT NULL REFERENCES presupuestos(id) ON DELETE CASCADE,
            categoria      TEXT    NOT NULL CHECK (categoria IN ('materiales','mano_obra','gastos')),
            concepto       TEXT    NOT NULL,
            descripcion    TEXT,
            monto          {DINERO} NOT NULL CHECK (monto > 0)
        )""",
        f"""CREATE TABLE IF NOT EXISTS pausas (
            id          {PK},
            proyecto_id {INT}  NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            inicio      TEXT    NOT NULL,
            fin         TEXT
        )""",
        f"""CREATE TABLE IF NOT EXISTS entradas (
            id          {PK},
            proyecto_id {INT}  NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            fecha       TEXT    NOT NULL,
            monto       {DINERO} NOT NULL CHECK (monto > 0),
            observacion TEXT
        )""",
        f"""CREATE TABLE IF NOT EXISTS salidas (
            id          {PK},
            proyecto_id {INT}  NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            fecha       TEXT    NOT NULL,
            proveedor   TEXT    NOT NULL,
            descripcion TEXT    NOT NULL,
            monto       {DINERO} NOT NULL CHECK (monto > 0),
            observacion TEXT,
            categoria   TEXT,
            partida_id  {INT}  REFERENCES presupuesto_items(id) ON DELETE SET NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS usuarios (
            id            {PK},
            usuario       TEXT    UNIQUE NOT NULL,
            nombre        TEXT    NOT NULL,
            password_hash TEXT    NOT NULL,
            salt          TEXT    NOT NULL,
            rol           TEXT    NOT NULL DEFAULT 'empleado' CHECK (rol IN ('admin','empleado')),
            principal     INTEGER NOT NULL DEFAULT 0,
            tema          TEXT    NOT NULL DEFAULT 'oscuro',
            creado        TEXT    NOT NULL
        )""",
        f"""CREATE TABLE IF NOT EXISTS sesiones (
            token      TEXT    PRIMARY KEY,
            usuario_id {INT}  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            expira     TEXT    NOT NULL
        )""",
        """CREATE TABLE IF NOT EXISTS intentos_login (
            usuario         TEXT    PRIMARY KEY,
            fallos          INTEGER NOT NULL DEFAULT 0,
            bloqueado_hasta TEXT
        )""",
    ]


# Indices | INDEX
def _indices():
    return [
        "CREATE INDEX IF NOT EXISTS idx_entradas_proyecto   ON entradas(proyecto_id)",
        "CREATE INDEX IF NOT EXISTS idx_salidas_proyecto    ON salidas(proyecto_id)",
        "CREATE INDEX IF NOT EXISTS idx_salidas_partida     ON salidas(partida_id)",
        "CREATE INDEX IF NOT EXISTS idx_pausas_proyecto     ON pausas(proyecto_id)",
        "CREATE INDEX IF NOT EXISTS idx_items_presupuesto   ON presupuesto_items(presupuesto_id)",
        "CREATE INDEX IF NOT EXISTS idx_presupuestos_proyecto ON presupuestos(proyecto_id)",
        "CREATE INDEX IF NOT EXISTS idx_sesiones_usuario    ON sesiones(usuario_id)",
        "CREATE INDEX IF NOT EXISTS idx_sesiones_expira     ON sesiones(expira)",
    ]


def crear_tablas():
    sentencias = _ddl("postgres" if ES_POSTGRES else "sqlite")
    with _conexion() as con:
        cur = con.cursor()
        for sentencia in sentencias:
            cur.execute(sentencia)
        # Acelera la busquedad
        for indice in _indices():
            cur.execute(indice)
        con.commit()
    # Migraciones suaves: columnas que se agregaron después, sin perder datos.
    _asegurar_columna("salidas", "categoria", "TEXT")                         # módulo de presupuestos
    _asegurar_columna("proyectos", "estado_previo", "TEXT")                   # modo pausa
    _asegurar_columna("usuarios", "principal", "INTEGER NOT NULL DEFAULT 0")  # admin protegido
    _asegurar_columna("presupuestos", "tipo", "TEXT")                         # tipo de proyecto
    _asegurar_columna("salidas", "partida_id", "INTEGER")                     # gasto cargado del presupuesto
    _asegurar_columna("usuarios", "tema", "TEXT NOT NULL DEFAULT 'oscuro'")   # preferencia de tema por usuario



def _columnas(tabla):
    if ES_POSTGRES:
        filas = ejecutar(
            "SELECT column_name AS name FROM information_schema.columns "
            "WHERE table_name = ? AND table_schema = current_schema()",
            (tabla,), fetch="all",
        )
        return {f["name"] for f in filas}
    with _conexion() as con:
        filas = con.execute(f"PRAGMA table_info({tabla})").fetchall()
        return {dict(f)["name"] for f in filas}


def _asegurar_columna(tabla, columna, definicion):
    if columna not in _columnas(tabla):
        with _conexion() as con:
            con.cursor().execute(f"ALTER TABLE {tabla} ADD COLUMN {columna} {definicion}")
            con.commit()
