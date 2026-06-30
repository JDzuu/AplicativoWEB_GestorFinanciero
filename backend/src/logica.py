
# EL CEREBRO recibe datos y devuelve resultados

from datetime import date
from decimal import Decimal, InvalidOperation

# Estados del proyecto
ESTADOS_ACTIVOS = ["iniciando", "proceso", "acabando"]

# Texto y color de cada estado.
ESTADO_INFO = {
    "iniciando":  ("Iniciando", "naranja"),
    "proceso":    ("En proceso", "azul"),
    "acabando":   ("Acabando", "morado"),
    "pausa":      ("En pausa", "gris"),
    "finalizado": ("Finalizado", "verde"),
    "cancelado":  ("Cancelado", "rojo"),
}

# Tipos de proyecto
TIPOS_PROYECTO = ["Construcción", "Remodelación", "Muebles", "Mantenimiento", "Otro"]

# Categorías y subcategorias
NOMBRE_CATEGORIA = {"materiales": "Materiales", "mano_obra": "Mano de obra", "gastos": "Gastos adicionales"}

CATEGORIAS_PRESUPUESTO = {
    "materiales": ["Madera", "Melamina", "Herrajes", "Pinturas", "Cerámica", "Vidrio", "Metal", "Otros materiales"],
    "mano_obra":  ["Carpintería", "Soldadura", "Pintura", "Albañilería", "Electricidad", "Plomería", "Otros servicios"],
    "gastos":     ["Transporte", "Combustible", "Hospedaje", "Alquiler de herramientas", "Permisos", "Imprevistos", "Otros gastos"],
}


# Cálculos de presupuesto 

def resumen_presupuesto(presupuesto, items):
    tot = {"materiales": 0, "mano_obra": 0, "gastos": 0}
    for it in items:
        if it["categoria"] in tot:
            tot[it["categoria"]] += it["monto"]

    costo_total = tot["materiales"] + tot["mano_obra"] + tot["gastos"]
    util_pct = presupuesto.get("utilidad_pct") or 0

    precio_venta = costo_total * (1 + util_pct / 100)
    utilidad_monto = precio_venta - costo_total
    margen_pct = (utilidad_monto / precio_venta * 100) if precio_venta else 0

    return {
        "total_materiales": tot["materiales"],
        "total_mano_obra": tot["mano_obra"],
        "total_gastos": tot["gastos"],
        "costo_total": costo_total,
        "utilidad_pct": util_pct,
        "precio_venta": precio_venta,
        "utilidad_monto": utilidad_monto,
        "margen_pct": margen_pct,
    }


def comparacion_presupuesto_real(resumen, salidas, ganancia_real):
    real = {"materiales": 0, "mano_obra": 0, "gastos": 0, "sin_categoria": 0}
    for s in salidas:
        c = s.get("categoria")
        real[c if c in real else "sin_categoria"] += s["monto"]
    real_total = real["materiales"] + real["mano_obra"] + real["gastos"] + real["sin_categoria"]

    def fila(estimado, real_val):
        desv = real_val - estimado
        return {
            "estimado": estimado,
            "real": real_val,
            "desviacion": desv,
            "desviacion_pct": (desv / estimado * 100) if estimado else None,
        }

    return {
        "materiales": fila(resumen["total_materiales"], real["materiales"]),
        "mano_obra": fila(resumen["total_mano_obra"], real["mano_obra"]),
        "gastos": fila(resumen["total_gastos"], real["gastos"]),
        "costo_total": fila(resumen["costo_total"], real_total),
        "utilidad": {
            "estimado": resumen["utilidad_monto"],
            "real": ganancia_real,
            "desviacion": ganancia_real - resumen["utilidad_monto"],
            "desviacion_pct": ((ganancia_real - resumen["utilidad_monto"]) / resumen["utilidad_monto"] * 100)
            if resumen["utilidad_monto"] else None,
        },
        "sin_categoria": real["sin_categoria"],
    }


# Cálculos financieros 


# Total de entradas y salidas, saldo y ganancia
def total_entradas(entradas):
    return sum(e["monto"] for e in entradas)

def total_salidas(salidas):
    return sum(s["monto"] for s in salidas)

def saldo_actual(entradas, salidas):
    return total_entradas(entradas) - total_salidas(salidas)

def ganancia_final(proyecto, entradas, salidas):
    return total_entradas(entradas) - total_salidas(salidas)


def porcentaje_cobrado(proyecto, entradas):
    return porcentaje_cobrado_monto(proyecto["total"], total_entradas(entradas))

def porcentaje_cobrado_monto(total, cobrado):
    if total <= 0:
        return 0
    return min(100, round(cobrado / total * 100))


# Duración 

def duracion_dias(proyecto):
    try:
        inicio = date.fromisoformat(proyecto["fecha_inicio"])
        fin = date.fromisoformat(proyecto["fecha_fin"]) if proyecto.get("fecha_fin") else date.today()
        return max(0, (fin - inicio).days)
    except (ValueError, TypeError):
        return None


def dias_en_pausa(pausas):
    total = 0
    hoy = date.today()
    for p in pausas:
        try:
            ini = date.fromisoformat(p["inicio"])
            fin = date.fromisoformat(p["fin"]) if p.get("fin") else hoy
            total += max(0, (fin - ini).days)
        except (ValueError, TypeError):
            pass
    return total


# Validaciones

def validar_nuevo_proyecto(nombre, cliente, tipo, total_texto, fecha_inicio):
    errores = {}

    if not nombre or not nombre.strip():
        errores["nombre"] = "El nombre del proyecto es obligatorio."
    if not cliente or not cliente.strip():
        errores["cliente"] = "El cliente es obligatorio."
    if not tipo or not tipo.strip():
        errores["tipo"] = "El tipo de proyecto es obligatorio."
    if not fecha_inicio or not str(fecha_inicio).strip():
        errores["fecha_inicio"] = "La fecha de inicio es obligatoria."

    if total_texto is None or str(total_texto).strip() == "":
        errores["total"] = "El monto contratado es obligatorio."
    else:
        try:
            if Decimal(str(total_texto)) <= 0:
                errores["total"] = "El monto debe ser mayor a 0."
        except (ValueError, TypeError, InvalidOperation):
            errores["total"] = "El monto debe ser un número válido."

    return (len(errores) == 0, errores)

# Entrada del cliente
def validar_entrada(monto, fecha_str, proyecto=None, entradas=None):
    if monto is None or monto <= 0:
        return (False, "Ingresa un monto mayor a 0.")
    if not _fecha_valida(fecha_str):
        return (False, "La fecha no es válida.")

    # El total de pagos nunca puede pasar el monto contratado
    if proyecto is not None and entradas is not None:
        nuevo_total = total_entradas(entradas) + monto
        if nuevo_total > proyecto["total"]:
            restante = proyecto["total"] - total_entradas(entradas)
            return (False,
                    f"El pago supera el monto contratado. Disponible: {restante:,.0f}.")
        
    return (True, None)

# Salida gastos
def validar_salida(proveedor, descripcion, monto, fecha_str):
    if not proveedor or not proveedor.strip():
        return (False, "El proveedor es obligatorio.")
    if not descripcion or not descripcion.strip():
        return (False, "La descripción es obligatoria.")
    if monto is None or monto <= 0:
        return (False, "Ingresa un monto mayor a 0.")
    if not _fecha_valida(fecha_str):
        return (False, "La fecha no es válida.")
    return (True, None)


def _fecha_valida(fecha_str):
    try:
        date.fromisoformat(str(fecha_str))
        return True
    except (ValueError, TypeError):
        return False


# Estado visual
def info_estado(proyecto):
    return ESTADO_INFO.get(proyecto["estado"], ("Desconocido", "azul"))


# Análisis del período 
def analizar(proyectos_finalizados):
    if not proyectos_finalizados:
        return None

    ingresos_totales = sum(p["total_entradas"] for p in proyectos_finalizados)
    gastos_totales = sum(p["total_salidas"] for p in proyectos_finalizados)
    ganancia_total = sum(p["ganancia"] for p in proyectos_finalizados)

    ordenados_ganancia = sorted(proyectos_finalizados, key=lambda p: p["ganancia"], reverse=True)
    mas_rentable = ordenados_ganancia[0]
    menos_rentable = ordenados_ganancia[-1]
    con_perdida = [p for p in proyectos_finalizados if p["ganancia"] < 0]

    # Rendimiento por tiempo
    con_duracion = [p for p in proyectos_finalizados if p.get("duracion") is not None]
    mas_rapido = min(con_duracion, key=lambda p: p["duracion"]) if con_duracion else None

    # Devuelve los datos en crudo
    return {
        "ingresos_totales": ingresos_totales,
        "gastos_totales": gastos_totales,
        "ganancia_total": ganancia_total,
        "cantidad": len(proyectos_finalizados),
        "mas_rentable": mas_rentable,
        "menos_rentable": menos_rentable,
        "proyectos_perdida": con_perdida,
        "mas_rapido": mas_rapido,
    }


# Análisis de proyectos cancelados
def analizar_cancelados(proyectos_cancelados):
    if not proyectos_cancelados:
        return None

    total_cobrado = sum(p["total_entradas"] for p in proyectos_cancelados)
    total_gastado = sum(p["total_salidas"] for p in proyectos_cancelados)
    return {
        "cantidad": len(proyectos_cancelados),
        "total_cobrado": total_cobrado,
        "total_gastado": total_gastado,
        "neto": total_cobrado - total_gastado,   # negativo = pérdida acumulada
    }


