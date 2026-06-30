
# Generacion de PDF

import os
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image, KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT

from src import logica


# Constantes globales
EMPRESA = "JDzuu (Zuu)"
MONEDA = "S/ "

# Logo
RUTA_LOGO = os.path.join(os.path.dirname(__file__), "..", "recursos", "logo.png")
ALTO_LOGO_MM = 24


# Paleta de colores
INK     = colors.HexColor("#1a1a1a")
MUTED   = colors.HexColor("#6b6b66")
LINE    = colors.HexColor("#d8d6cf")
HEADBG  = colors.HexColor("#1e3a5f")
GREEN   = colors.HexColor("#2f855a")
GREEN_BG = colors.HexColor("#f0fff4")
RED     = colors.HexColor("#c53030")
RED_BG  = colors.HexColor("#fff5f5")
AZUL    = colors.HexColor("#2b6cb0")
AZUL_BG = colors.HexColor("#ebf8ff")



# Helpers privados

# Si existe la imagen da el logo si no solo texto
def _encabezado_marca(estilo_texto):
    if os.path.exists(RUTA_LOGO):
        try:
            ancho_px, alto_px = ImageReader(RUTA_LOGO).getSize()
            alto = ALTO_LOGO_MM * mm
            ancho = alto * (ancho_px / alto_px)  # mantiene la proporción
            img = Image(RUTA_LOGO, width=ancho, height=alto)
            img.hAlign = "LEFT"
            return img
        except Exception:
            pass
    return Paragraph(EMPRESA, estilo_texto)


# Separador de miles y sin decimales
def _money(v):
    return MONEDA + f"{v:,.0f}".replace(",", " ")


# Converte 'YYYY-MM-DD' a 'DD/MM/YYYY'. Devuelve '-' si falta.
def _fecha_linda(iso):
    if not iso:
        return "-"
    try:
        a, m, d = iso.split("-")
        return f"{d}/{m}/{a}"
    except (ValueError, AttributeError):
        return iso


# Reutilizador de estilos
def _estilos_base():
    styles = getSampleStyleSheet()

    def S(name, **kw):
        base = kw.pop("parent", styles["Normal"])
        return ParagraphStyle(name, parent=base, **kw)

    e = {
        "S":       S,
        "company": S("company", fontName="Helvetica-Bold", fontSize=16, textColor=INK, leading=19),
        "doctype": S("doctype", fontName="Helvetica", fontSize=9, textColor=MUTED, leading=12, alignment=TA_RIGHT),
        "h":       S("h", fontName="Helvetica-Bold", fontSize=11, textColor=INK, spaceBefore=14, spaceAfter=6),
        "label":   S("label", fontName="Helvetica", fontSize=8.5, textColor=MUTED, leading=12),
        "val":     S("val", fontName="Helvetica-Bold", fontSize=10, textColor=INK, leading=13),
        "cell":    S("cell", fontName="Helvetica", fontSize=9, textColor=INK, leading=12),
        "th":      S("th", fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white, leading=11),
        "foot":    S("foot", fontName="Helvetica", fontSize=7.5, textColor=MUTED, alignment=1),
    }
    e["cellr"] = S("cellr", parent=e["cell"], alignment=TA_RIGHT)
    e["thr"]   = S("thr",   parent=e["th"],   alignment=TA_RIGHT)
    return e


# Emcabezado para los PDF
def _encabezado(titulo_html, est, W):
    marca = _encabezado_marca(est["company"])
    alto_logo_pt = ALTO_LOGO_MM * mm if isinstance(marca, Image) else 0

    pad_texto = max(alto_logo_pt - 2 * est["doctype"].leading - 2, 0)

    head = Table(
        [[marca, Paragraph(titulo_html, est["doctype"])]],
        colWidths=[W * 0.40, W * 0.60],
    )
    head.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("ALIGN",         (1, 0), (1,  0),  "RIGHT"),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (1, 0), (1,  0),  pad_texto),
        ("RIGHTPADDING",  (1, 0), (1,  0),  8),
    ]))
    return [head, Spacer(1, 6), HRFlowable(width="100%", thickness=1.2, color=INK), Spacer(1, 10)]


# Linea final del PDF
def _pie(story):
    story.append(Spacer(1, 4))
    gen = datetime.now().strftime("%d/%m/%Y %H:%M")
    story.append(Paragraph(
        f"Documento prototipo generado automáticamente por {EMPRESA} · {gen}",
        ParagraphStyle("foot", fontName="Helvetica", fontSize=7.5, textColor=MUTED, alignment=1),
    ))


# 1 PDF. Acta de cierre


def generar_pdf_cierre(proyecto, entradas, salidas):
    buffer = BytesIO()

    total_ent = logica.total_entradas(entradas)
    total_sal = logica.total_salidas(salidas)
    ganancia  = logica.ganancia_final(proyecto, entradas, salidas)
    duracion  = logica.duracion_dias(proyecto)

    est = _estilos_base()
    S = est["S"]
    st_h, st_label, st_val   = est["h"], est["label"], est["val"]
    st_cell, st_cellr         = est["cell"], est["cellr"]
    st_th, st_thr             = est["th"], est["thr"]

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=18 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    W = A4[0] - 36 * mm
    story = []

    # Encabezado 
    story.extend(_encabezado("ACTA DE CIERRE DE PROYECTO<br/>Reporte financiero final", est, W,))


    # Datos generales
    def field(lbl, value):
        return [Paragraph(lbl, st_label), Paragraph(value, st_val)]

    dur_txt = f"{duracion} días" if duracion is not None else "-"
    info = Table(
        [
            field("PROYECTO: ", proyecto["nombre"])  + field("CLIENTE: ", proyecto["cliente"]),
            field("TIPO: ",     proyecto.get("tipo", "-")) + field("MONTO: ", _money(proyecto["total"])),
            field("INICIO: ",   _fecha_linda(proyecto.get("fecha_inicio")))
                + field("CIERRE: ", _fecha_linda(proyecto.get("fecha_fin"))),
            field("DURACIÓN: ", dur_txt) + field("", ""),
        ],
        colWidths=[W * 0.13, W * 0.42, W * 0.12, W * 0.33],
    )
    info.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ]))
    story.append(info)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))

    # Tabla de entradas
    story.append(Paragraph("Entradas · Pagos del cliente", st_h))
    rows = [[Paragraph("Fecha", st_th), Paragraph("Observación", st_th), Paragraph("Monto", st_thr)]]
    for e in entradas:
        rows.append([
            Paragraph(_fecha_linda(e["fecha"]), st_cell),
            Paragraph(e.get("observacion") or "-", st_cell),
            Paragraph(_money(e["monto"]), st_cellr),
        ])
    rows.append([
        Paragraph("", st_cell),
        Paragraph("Total de entradas", st_val),
        Paragraph(_money(total_ent), S("t1", parent=st_val, alignment=TA_RIGHT)),
    ])
    t = Table(rows, colWidths=[W * 0.2, W * 0.55, W * 0.25])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), HEADBG),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 1), (-1, -2), 0.4, LINE),
        ("BACKGROUND",    (0, -1), (-1, -1), GREEN_BG),
        ("LINEABOVE",     (0, -1), (-1, -1), 0.8, GREEN),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    # Tabla de salidas 
    story.append(Paragraph("Salidas · Gastos del proyecto", st_h))
    rows = [[Paragraph("Fecha", st_th), Paragraph("Proveedor / descripción", st_th), Paragraph("Monto", st_thr)]]
    for s in salidas:
        detalle = f"{s['proveedor']} · {s['descripcion']}"
        if s.get("observacion"):
            detalle += f" ({s['observacion']})"
        rows.append([
            Paragraph(_fecha_linda(s["fecha"]), st_cell),
            Paragraph(detalle, st_cell),
            Paragraph(_money(s["monto"]), st_cellr),
        ])
    rows.append([
        Paragraph("", st_cell),
        Paragraph("Total de salidas", st_val),
        Paragraph(_money(total_sal), S("t2", parent=st_val, alignment=TA_RIGHT)),
    ])
    t = Table(rows, colWidths=[W * 0.2, W * 0.55, W * 0.25])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), HEADBG),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("LINEBELOW",     (0, 1), (-1, -2), 0.4, LINE),
        ("BACKGROUND",    (0, -1), (-1, -1), RED_BG),
        ("LINEABOVE",     (0, -1), (-1, -1), 0.8, RED),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)

    # Resumen final
    # Rojo = Perdida | Verde = Ganancia
    story.append(Paragraph("Resumen final", st_h))
    gan_positiva = ganancia >= 0
    GAN    = GREEN    if gan_positiva else RED
    GAN_BG = GREEN_BG if gan_positiva else RED_BG

    st_sumlbl = S("sumlbl", fontName="Helvetica",      fontSize=9.5, textColor=MUTED)
    st_sumval = S("sumval", fontName="Helvetica-Bold", fontSize=10,  textColor=INK,  alignment=TA_RIGHT)
    st_ganlbl = S("ganlbl", fontName="Helvetica-Bold", fontSize=11,  textColor=GAN)
    st_ganval = S("ganval", fontName="Helvetica-Bold", fontSize=13,  textColor=GAN,  alignment=TA_RIGHT)

    summary = Table([
        [Paragraph("Monto contratado",          st_sumlbl), Paragraph(_money(proyecto["total"]), st_sumval)],
        [Paragraph("Total cobrado (entradas)",  st_sumlbl), Paragraph(_money(total_ent),          st_sumval)],
        [Paragraph("Total de salidas",          st_sumlbl), Paragraph("- " + _money(total_sal),   st_sumval)],
        [Paragraph("Ganancia final",            st_ganlbl), Paragraph(_money(ganancia),            st_ganval)],
    ], colWidths=[W * 0.7, W * 0.3])
    summary.setStyle(TableStyle([
        ("LINEBELOW",     (0, 1), (-1, 1),  0.4, LINE),
        ("LINEBELOW",     (0, 2), (-1, 2),  0.8, INK),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("BACKGROUND",    (0, 3), (-1, 3),  GAN_BG),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(summary)

    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    _pie(story)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
# u.u

# 2 PDF. Cotización

def generar_pdf_cotizacion(presupuesto, items, resumen):
    buffer = BytesIO()

    est = _estilos_base()
    S = est["S"]
    st_h, st_label, st_val = est["h"], est["label"], est["val"]
    st_cell, st_cellr       = est["cell"], est["cellr"]
    st_th, st_thr           = est["th"], est["thr"]

    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=20 * mm, bottomMargin=18 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
    )
    W = A4[0] - 36 * mm
    story = []

    # Encabezado 
    story.extend(_encabezado("COTIZACIÓN<br/>Presupuesto de proyecto", est, W))

    # Datos del cliente / proyecto
    def field(lbl, value):
        return [Paragraph(lbl, st_label), Paragraph(value, st_val)]

    info = Table(
        [
            field("PROYECTO: ", presupuesto["nombre"]) + field("CLIENTE: ", presupuesto["cliente"]),
            field("TIPO: ",     presupuesto.get("tipo") or "-")
                + field("FECHA: ", _fecha_linda(presupuesto.get("fecha_creacion"))),
        ],
        colWidths=[W * 0.13, W * 0.42, W * 0.12, W * 0.33],
    )
    info.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
    ]))
    story.append(info)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))

    # Partidas por categoría
    nombres = {
        "materiales": "Materiales",
        "mano_obra":  "Mano de obra",
        "gastos":     "Gastos adicionales",
    }
    subtot = {
        "materiales": resumen["total_materiales"],
        "mano_obra":  resumen["total_mano_obra"],
        "gastos":     resumen["total_gastos"],
    }
    for cat in ("materiales", "mano_obra", "gastos"):
        partidas = [it for it in items if it["categoria"] == cat]
        if not partidas:
            continue

        story.append(Paragraph(nombres[cat], st_h))
        rows = [[Paragraph("Concepto", st_th), Paragraph("Descripción", st_th), Paragraph("Monto", st_thr)]]
        for it in partidas:
            rows.append([
                Paragraph(it["concepto"], st_cell),
                Paragraph(it.get("descripcion") or "-", st_cell),
                Paragraph(_money(it["monto"]), st_cellr),
            ])
        rows.append([
            Paragraph("", st_cell),
            Paragraph(f"Subtotal {nombres[cat].lower()}", st_val),
            Paragraph(_money(subtot[cat]), S("sub" + cat, parent=st_val, alignment=TA_RIGHT)),
        ])
        t = Table(rows, colWidths=[W * 0.3, W * 0.45, W * 0.25])
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1,  0), HEADBG),
            ("TOPPADDING",    (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("LINEBELOW",     (0, 1), (-1, -2), 0.4, LINE),
            ("LINEABOVE",     (0, -1), (-1, -1), 0.6, LINE),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(t)

    # Total de la cotización
    st_pl   = S("pl",   fontName="Helvetica",      fontSize=9.5,  textColor=MUTED)
    st_pv   = S("pv",   fontName="Helvetica-Bold", fontSize=10,   textColor=INK,  alignment=TA_RIGHT)
    st_totl = S("totl", fontName="Helvetica-Bold", fontSize=12,   textColor=AZUL)
    st_totv = S("totv", fontName="Helvetica-Bold", fontSize=14,   textColor=AZUL, alignment=TA_RIGHT)

    total = Table([
        [Paragraph("Costo estimado",                           st_pl),   Paragraph(_money(resumen["costo_total"]),   st_pv)],
        [Paragraph(f"Utilidad ({resumen['utilidad_pct']:.0f}%)", st_pl), Paragraph(_money(resumen["utilidad_monto"]), st_pv)],
        [Paragraph("PRECIO TOTAL",                             st_totl), Paragraph(_money(resumen["precio_venta"]),  st_totv)],
    ], colWidths=[W * 0.7, W * 0.3])
    total.setStyle(TableStyle([
        ("LINEBELOW",     (0, 1), (-1, 1),  0.8, INK),  # línea antes del precio total
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("BACKGROUND",    (0, 2), (-1, 2),  AZUL_BG),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))

    story.append(KeepTogether([
        Paragraph("Total de la cotización", st_h),
        total,
        Spacer(1, 10),
        Paragraph(
            "El precio total incluye materiales, mano de obra y gestión del proyecto. "
            "Cotización referencial sujeta a confirmación.",
            st_label,
        ),
    ]))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    _pie(story)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
# u.u