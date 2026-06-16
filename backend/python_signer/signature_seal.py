"""
Módulo para dibujar sellos de firma digital estilo PKI Services en PDFs.
Compatible con ReportLab Canvas.

Diseño:
- Logo PKI Services a la izquierda
- Información del certificado a la derecha
- Borde negro sólido, fondo blanco
- Formato horizontal tipo estampa oficial
"""

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.pdfgen import canvas as reportlab_canvas
from reportlab.lib.utils import ImageReader
from typing import Dict
import os
from io import BytesIO
import qrcode

# Importar configuración centralizada
from config import PATHS


def _truncate_text(canvas, text: str, max_width: float, font_name: str, font_size: float) -> str:
    """
    Trunca un texto si excede el ancho máximo, agregando '...' al final.

    Args:
        canvas: Canvas de ReportLab
        text: Texto a truncar
        max_width: Ancho máximo en puntos
        font_name: Nombre de la fuente
        font_size: Tamaño de la fuente

    Returns:
        Texto truncado si es necesario
    """
    if not text:
        return ""

    # Obtener ancho del texto completo
    text_width = canvas.stringWidth(text, font_name, font_size)

    if text_width <= max_width:
        return text

    # Si es demasiado largo, truncar y agregar '...'
    ellipsis = "..."
    ellipsis_width = canvas.stringWidth(ellipsis, font_name, font_size)
    available_width = max_width - ellipsis_width

    # Ir quitando caracteres hasta que quepa
    truncated = text
    while len(truncated) > 0:
        test_width = canvas.stringWidth(truncated, font_name, font_size)
        if test_width <= available_width:
            return truncated + ellipsis
        truncated = truncated[:-1]

    return ellipsis


def _get_logo_path():
    """
    Obtiene la ruta al logo usando configuración centralizada
    """
    logo_path = PATHS.get_logo_path()
    return str(logo_path) if logo_path else None


def _generate_qr_code(data: str) -> BytesIO:
    """
    Genera un código QR con los datos proporcionados.

    Args:
        data: Texto a codificar en el QR

    Returns:
        BytesIO con la imagen del QR en formato PNG
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(data)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    return buffer


def _draw_qr_code(canvas, x: float, y: float, size: float, qr_data: str):
    """
    Dibuja un código QR en el canvas.

    Args:
        canvas: Canvas de ReportLab
        x: Coordenada X del centro del QR
        y: Coordenada Y del centro del QR
        size: Tamaño del QR (ancho y alto)
        qr_data: Datos a codificar en el QR
    """
    try:
        qr_buffer = _generate_qr_code(qr_data)
        qr_image = ImageReader(qr_buffer)

        # Dibujar el QR centrado en las coordenadas dadas
        draw_x = x - size / 2
        draw_y = y - size / 2

        canvas.drawImage(qr_image, draw_x, draw_y, size, size,
                        preserveAspectRatio=True, mask='auto')
    except Exception as e:
        # Si falla la generación del QR, dibujar un placeholder
        canvas.setStrokeColor(black)
        canvas.setLineWidth(0.5)
        canvas.rect(x - size/2, y - size/2, size, size, fill=0, stroke=1)
        canvas.setFont("Helvetica", 6)
        canvas.drawCentredString(x, y, "QR")


def _draw_pki_logo(canvas, x: float, y: float, size: float):
    """
    Dibuja el logo de PKI Services desde imagen o como fallback dibujado.

    Args:
        canvas: Canvas de ReportLab
        x: Coordenada X del centro del logo
        y: Coordenada Y del centro del logo
        size: Tamaño del logo (altura total)
    """
    # Intentar cargar imagen del logo
    logo_path = _get_logo_path()

    if logo_path and os.path.exists(logo_path):
        try:
            # Cargar y dibujar la imagen del logo
            logo_img = ImageReader(logo_path)
            img_width, img_height = logo_img.getSize()

            # Calcular escala para que quepa en el área
            scale = min(size / img_height, size / img_width) * 0.9
            draw_width = img_width * scale
            draw_height = img_height * scale

            # Centrar la imagen
            draw_x = x - draw_width / 2
            draw_y = y - draw_height / 2

            canvas.drawImage(logo_img, draw_x, draw_y, draw_width, draw_height,
                           preserveAspectRatio=True, mask='auto')
            return
        except Exception as e:
            # Si falla, usar el logo dibujado como fallback
            pass

    # Fallback: dibujar logo programáticamente
    cube_size = size * 0.6
    cube_x = x - cube_size / 2
    cube_y = y - cube_size / 4

    # Colores PKI Services (morado/rosa)
    color_dark = HexColor('#8B4789')   # Morado oscuro
    color_light = HexColor('#D4A5D4')  # Rosa claro

    # Cara frontal (morado oscuro)
    canvas.setFillColor(color_dark)
    canvas.rect(cube_x, cube_y, cube_size, cube_size * 0.6, fill=1, stroke=0)

    # Cara superior (rosa claro)
    canvas.setFillColor(color_light)
    path = canvas.beginPath()
    path.moveTo(cube_x, cube_y + cube_size * 0.6)
    path.lineTo(cube_x + cube_size / 2, cube_y + cube_size * 0.85)
    path.lineTo(cube_x + cube_size, cube_y + cube_size * 0.6)
    path.lineTo(cube_x + cube_size, cube_y + cube_size * 0.6)
    path.close()
    canvas.drawPath(path, fill=1, stroke=0)

    # Cara lateral (tono medio)
    canvas.setFillColor(HexColor('#A87FA8'))
    path2 = canvas.beginPath()
    path2.moveTo(cube_x + cube_size, cube_y)
    path2.lineTo(cube_x + cube_size, cube_y + cube_size * 0.6)
    path2.lineTo(cube_x + cube_size * 1.15, cube_y + cube_size * 0.45)
    path2.lineTo(cube_x + cube_size * 1.15, cube_y - cube_size * 0.15)
    path2.close()
    canvas.drawPath(path2, fill=1, stroke=0)

    # Texto "PKI" debajo del cubo
    canvas.setFillColor(color_dark)
    canvas.setFont("Helvetica-Bold", size * 0.25)
    pki_text = "PKI"
    text_width = canvas.stringWidth(pki_text, "Helvetica-Bold", size * 0.25)
    canvas.drawString(x - text_width / 2, cube_y - size * 0.25, pki_text)

    # Texto "SERVICES" debajo
    canvas.setFont("Helvetica", size * 0.15)
    services_text = "SERVICES"
    text_width2 = canvas.stringWidth(services_text, "Helvetica", size * 0.15)
    canvas.drawString(x - text_width2 / 2, cube_y - size * 0.42, services_text)


def draw_signature_seal(
    canvas: reportlab_canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    cert_data: Dict[str, str]
) -> None:
    """
    Dibuja un sello de firma digital estilo PKI Services.

    Diseño horizontal con:
    - Logo PKI a la izquierda (25%)
    - Información del certificado a la derecha (75%)

    Args:
        canvas: Objeto Canvas de ReportLab donde se dibujará el sello
        x: Coordenada X de la esquina inferior izquierda
        y: Coordenada Y de la esquina inferior izquierda
        width: Ancho del rectángulo en puntos
        height: Alto del rectángulo en puntos
        cert_data: Diccionario con los datos del certificado
    """
    # ========================================================================
    # PASO 1: CONFIGURACIÓN DE DIMENSIONES
    # ========================================================================

    # Factor de escala basado en dimensiones
    scale_factor = min(width / 300, height / 80)
    scale_factor = max(0.5, min(scale_factor, 2.0))

    # Márgenes y padding
    border_width = 1.5 * scale_factor
    padding = 4.0 * scale_factor

    # Distribución horizontal: 25% logo, 75% info
    logo_width = width * 0.25
    info_width = width * 0.75

    # ========================================================================
    # PASO 2: DIBUJAR FONDO Y BORDE
    # ========================================================================

    # Fondo blanco
    canvas.setFillColor(white)
    canvas.rect(x, y, width, height, fill=1, stroke=0)

    # Borde negro sólido
    canvas.setStrokeColor(black)
    canvas.setLineWidth(border_width)
    canvas.rect(x, y, width, height, fill=0, stroke=1)

    # ========================================================================
    # PASO 3: EXTRAER DATOS DEL CERTIFICADO
    # ========================================================================

    # Usar subject_common_name como título (nombre del certificado)
    cert_name = cert_data.get('subject_common_name', cert_data.get('issuer_common_name', 'PKI Services S.A.S.'))
    timestamp_local = cert_data.get('timestamp_local', cert_data.get('timestamp_iso', ''))
    country = cert_data.get('country', 'COLOMBIA').upper()

    # Formatear fecha y hora
    if 'T' in timestamp_local:
        timestamp_display = timestamp_local.replace('T', ' ').split('.')[0]
    else:
        timestamp_display = timestamp_local

    # ========================================================================
    # PASO 4: LOGO PKI (IZQUIERDA)
    # ========================================================================

    logo_center_x = x + logo_width / 2
    logo_center_y = y + height / 2
    logo_size = min(logo_width * 0.8, height * 0.8)

    _draw_pki_logo(canvas, logo_center_x, logo_center_y, logo_size)

    # ========================================================================
    # PASO 5: INFORMACIÓN DEL CERTIFICADO (DERECHA)
    # ========================================================================

    info_x = x + logo_width + padding
    info_available_width = info_width - (2 * padding)

    # Tamaños de fuente
    font_size_title = max(8.0 * scale_factor, 6.0)
    font_size_normal = max(7.0 * scale_factor, 5.5)
    font_size_small = max(6.0 * scale_factor, 5.0)

    canvas.setFillColor(black)
    current_y = y + height - padding - font_size_title

    # Línea 1: Nombre del certificado
    canvas.setFont("Helvetica-Bold", font_size_title)
    cert_text = _truncate_text(canvas, cert_name, info_available_width, "Helvetica-Bold", font_size_title)
    canvas.drawString(info_x, current_y, cert_text)
    current_y -= (font_size_title + 2 * scale_factor)

    # Línea 2: Fecha y hora
    canvas.setFont("Helvetica", font_size_normal)
    canvas.drawString(info_x, current_y, timestamp_display[:19])
    current_y -= (font_size_normal + 3 * scale_factor)

    # Línea 3+: Texto de acreditación ONAC partido en múltiples líneas
    acreditacion_texto = (
        "PKI SERVICES firma digitalmente este documento como tercero de absoluta confianza "
        "(sentencia C-622 de 2000) y con acreditacion 20-ECD-004 dada por el Organismo Nacional "
        "de acreditacion de Colombia ONAC, certificando autenticidad, integridad y no repudio del mismo."
    )

    # Word-wrap manual: partir en líneas que quepan en info_available_width
    canvas.setFont("Helvetica", font_size_small)
    words = acreditacion_texto.split(' ')
    lines = []
    current_line = ''
    for word in words:
        test_line = (current_line + ' ' + word).strip()
        if canvas.stringWidth(test_line, "Helvetica", font_size_small) <= info_available_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)

    line_gap = font_size_small + 1.5 * scale_factor
    for line in lines:
        if current_y < y + padding:
            break
        canvas.drawString(info_x, current_y, line)
        current_y -= line_gap

    # ========================================================================
    # PASO 6: LÍNEA DIVISORIA VERTICAL
    # ========================================================================

    canvas.setStrokeColor(HexColor('#CCCCCC'))
    canvas.setLineWidth(0.5 * scale_factor)

    # Línea entre logo e info
    canvas.line(
        x + logo_width,
        y + padding,
        x + logo_width,
        y + height - padding
    )

    # Restaurar color
    canvas.setStrokeColor(black)


def draw_qr_vertical(
    canvas: reportlab_canvas.Canvas,
    x: float,
    y: float,
    cert_data: Dict[str, str]
) -> None:
    """
    Dibuja un QR vertical con texto como en la imagen de referencia.

    Diseño:
    - QR a la izquierda
    - Texto vertical "Firmado Electrónicamente" + ID a la derecha

    Args:
        canvas: Canvas de ReportLab
        x: Coordenada X de la esquina inferior izquierda
        y: Coordenada Y de la esquina inferior izquierda
        cert_data: Datos del certificado
    """
    import hashlib

    # Extraer datos
    subject_name = cert_data.get('subject_common_name', 'Firmante')
    email = cert_data.get('email', '')
    issuer = cert_data.get('issuer_common_name', 'PKI Services S.A.S.')
    timestamp_local = cert_data.get('timestamp_local', cert_data.get('timestamp_iso', ''))

    # Obtener token de verificación seguro desde cert_data
    verification_token = cert_data.get('verification_token', '')
    if not verification_token:
        # Fallback: generar hash si no hay token (no debería pasar en producción)
        hash_input = f"{subject_name}{email}{timestamp_local}{issuer}"
        verification_token = hashlib.sha256(hash_input.encode()).hexdigest()[:32]

    # Dimensiones fijas para el QR vertical
    qr_size = 50
    total_width = 80
    total_height = qr_size + 10

    # URL de verificación para el QR - usa token seguro (no expone el ID)
    qr_content = PATHS.get_verification_url(verification_token)

    qr_center_x = x + qr_size / 2
    qr_center_y = y + qr_size / 2
    _draw_qr_code(canvas, qr_center_x, qr_center_y, qr_size, qr_content)

    # Texto vertical al lado del QR
    font_size = 5
    canvas.saveState()
    canvas.setFillColor(black)
    canvas.setFont("Helvetica", font_size)

    # Posición del texto vertical (a la derecha del QR)
    text_x = x + qr_size + font_size + 2

    # Rotar 90 grados
    canvas.translate(text_x, y)
    canvas.rotate(90)

    # Dibujar textos
    line_spacing = font_size + 1
    canvas.drawString(0, 0, "Firmado Electrónicamente")
    canvas.setFont("Helvetica", font_size * 0.85)
    canvas.drawString(0, -line_spacing, "Token de verificación:")
    canvas.setFont("Helvetica", font_size * 0.75)
    # Mostrar solo los primeros 16 caracteres del token para legibilidad
    canvas.drawString(0, -line_spacing * 2, verification_token[:16].upper())

    canvas.restoreState()


# ========================================================================
# FUNCIÓN AUXILIAR: CREAR TOOLTIP (solo metadata PDF, no visual)
# ========================================================================

def add_tooltip_to_seal(
    canvas: reportlab_canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    tooltip_text: str = "Documento certificado por PKI Services S.A.S."
):
    """
    Agrega un tooltip invisible al área del sello (solo metadata).

    NOTA: Los tooltips en PDF tienen soporte limitado. Esta función agrega
    una anotación invisible que algunos lectores PDF pueden mostrar al pasar
    el mouse. No todos los lectores soportan esto.

    Args:
        canvas: Canvas de ReportLab
        x, y, width, height: Coordenadas del área del sello
        tooltip_text: Texto del tooltip
    """
    # ReportLab no tiene soporte directo para tooltips interactivos
    # Se puede agregar como anotación de texto invisible
    # Esto requeriría manipulación directa del PDF con PyPDF2 o pypdf
    # Por ahora, dejamos esta función como placeholder
    pass
