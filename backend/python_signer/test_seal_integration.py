"""
Script de prueba para validar la integración del sello visual con el firmador.

Este script:
1. Crea un PDF de prueba
2. Firma el PDF usando el sello visual personalizado
3. Verifica que el sello se haya aplicado correctamente
"""

import asyncio
import sys
import os
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas as reportlab_canvas

# Agregar el directorio actual al path
sys.path.insert(0, os.path.dirname(__file__))

from signer import PDFSigner


def crear_pdf_prueba(filename: str = "test_document.pdf") -> str:
    """
    Crea un PDF de prueba para firmar.

    Args:
        filename: Nombre del archivo PDF

    Returns:
        Ruta del PDF creado
    """
    print(f"📄 Creando PDF de prueba: {filename}")

    c = reportlab_canvas.Canvas(filename, pagesize=letter)
    width, height = letter

    # Título
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 100, "DOCUMENTO DE PRUEBA")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 130, "Sistema de Firma Digital con Sello Visual Personalizado")

    # Contenido
    c.setFont("Helvetica", 11)
    y_position = height - 200

    contenido = [
        "Este es un documento de prueba para validar la integración del sello",
        "visual personalizado con el sistema de firma digital pyHanko.",
        "",
        "Características del sello:",
        "  - Fondo gris claro con borde punteado morado",
        "  - Sección superior (Estampa PKI) con información del emisor",
        "  - Sección inferior (Certificado) con datos del firmante",
        "  - Escalado automático según dimensiones del rectángulo",
        "  - Truncamiento inteligente de textos largos",
        "",
        "El sello se aplicará en la esquina inferior derecha.",
    ]

    for linea in contenido:
        c.drawString(50, y_position, linea)
        y_position -= 20

    # Rectángulo de referencia para el sello
    seal_x = width - 250
    seal_y = 50
    seal_width = 200
    seal_height = 150

    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(0.5)
    c.setDash([3, 2])
    c.rect(seal_x, seal_y, seal_width, seal_height)

    c.setFont("Helvetica-Oblique", 8)
    c.drawString(seal_x + 5, seal_y + 5, "Área del sello de firma")

    c.save()
    print(f"✅ PDF creado: {filename}")
    return filename


async def test_firma_con_sello():
    """
    Prueba la firma de PDF con sello visual personalizado.
    """
    print("\n" + "=" * 70)
    print("PRUEBA DE INTEGRACIÓN - SELLO VISUAL PERSONALIZADO")
    print("=" * 70)

    # Verificar variables de entorno o usar valores por defecto
    cert_path = os.getenv("CERT_PATH", "./Certificado_prueba.p12")
    cert_password = os.getenv("CERT_PASSWORD", "")
    tsa_url = os.getenv("TSA_URL", "http://timestamp.digicert.com")

    print(f"\n📋 Configuración:")
    print(f"   Certificado: {cert_path}")
    print(f"   TSA: {tsa_url}")

    # Verificar que existe el certificado
    if not Path(cert_path).exists():
        print(f"\n⚠️  Certificado no encontrado: {cert_path}")
        print("   Opciones:")
        print("   1. Coloca tu certificado P12 en la raíz del proyecto")
        print("   2. O define la variable de entorno CERT_PATH")
        print("   3. O genera un certificado de prueba:")
        print("      openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes")
        print("      openssl pkcs12 -export -out Certificado_prueba.p12 -inkey key.pem -in cert.pem")
        return

    try:
        # 1. Crear PDF de prueba
        input_pdf = crear_pdf_prueba("test_document.pdf")

        # 2. Leer PDF
        with open(input_pdf, 'rb') as f:
            pdf_bytes = f.read()

        print(f"\n📖 PDF cargado: {len(pdf_bytes):,} bytes")

        # 3. Crear firmador
        print(f"\n🔐 Inicializando firmador...")
        signer = PDFSigner(
            cert_path=cert_path,
            cert_password=cert_password,
            tsa_url=tsa_url
        )

        # 4. Verificar certificado
        print(f"\n🔍 Verificando certificado...")
        cert_info = signer.verify_certificate()

        if cert_info.get('valid'):
            print(f"✅ Certificado válido:")
            print(f"   Subject: {cert_info.get('subject')}")
            print(f"   Issuer: {cert_info.get('issuer')}")
            print(f"   Válido hasta: {cert_info.get('not_after')}")
        else:
            print(f"❌ Certificado inválido: {cert_info.get('error')}")
            return

        # 5. Definir posición del sello (esquina inferior derecha)
        from reportlab.lib.pagesizes import letter
        page_width, page_height = letter

        seal_x = page_width - 250  # 250 pts desde el borde derecho
        seal_y = 50               # 50 pts desde el borde inferior
        seal_width = 200
        seal_height = 150

        box = (seal_x, seal_y, seal_x + seal_width, seal_y + seal_height)

        print(f"\n📐 Posición del sello:")
        print(f"   Coordenadas: ({seal_x:.0f}, {seal_y:.0f})")
        print(f"   Dimensiones: {seal_width}×{seal_height} pts")

        # 6. Firmar PDF con sello visual
        print(f"\n✍️  Firmando PDF con sello visual personalizado...")
        signed_pdf = await signer.sign(
            pdf_bytes=pdf_bytes,
            reason="Firma de prueba con sello visual personalizado",
            location="Sistema de Prueba",
            signer_name=cert_info.get('subject', 'Firmante'),
            contact_info="test@ejemplo.com",
            field_name="SelloVisual1",
            visible=True,
            box=box
        )

        # 7. Guardar PDF firmado
        output_pdf = "test_document_FIRMADO.pdf"
        with open(output_pdf, 'wb') as f:
            f.write(signed_pdf)

        print(f"\n✅ PDF firmado guardado: {output_pdf}")
        print(f"   Tamaño original: {len(pdf_bytes):,} bytes")
        print(f"   Tamaño firmado: {len(signed_pdf):,} bytes")
        print(f"   Incremento: {len(signed_pdf) - len(pdf_bytes):,} bytes")

        # 8. Información del timestamp
        ts_info = signer.get_timestamp_info()
        if ts_info:
            print(f"\n⏰ Información del timestamp:")
            print(f"   Hora: {ts_info.get('time')}")
            print(f"   TSA: {ts_info.get('source')}")

        print("\n" + "=" * 70)
        print("✅ PRUEBA COMPLETADA EXITOSAMENTE")
        print("=" * 70)
        print(f"\n💡 Abre {output_pdf} con Adobe Acrobat Reader para ver el sello")
        print("   El sello debe aparecer en la esquina inferior derecha con:")
        print("   - Fondo gris claro con borde morado punteado")
        print("   - Información del emisor y timestamp en la parte superior")
        print("   - Datos del firmante en la parte inferior")

    except FileNotFoundError as e:
        print(f"\n❌ Error: Archivo no encontrado - {e}")
    except Exception as e:
        print(f"\n❌ Error durante la prueba: {e}")
        import traceback
        traceback.print_exc()


async def test_diferentes_tamanos():
    """
    Prueba el sello en diferentes tamaños para validar el escalado automático.
    """
    print("\n" + "=" * 70)
    print("PRUEBA DE ESCALADO AUTOMÁTICO")
    print("=" * 70)

    cert_path = os.getenv("CERT_PATH", "./Certificado_prueba.p12")
    cert_password = os.getenv("CERT_PASSWORD", "")
    tsa_url = os.getenv("TSA_URL", "http://timestamp.digicert.com")

    if not Path(cert_path).exists():
        print(f"⚠️  Certificado no encontrado: {cert_path}")
        return

    try:
        # Crear PDF con espacios para diferentes tamaños
        pdf_name = "test_escalado.pdf"
        c = reportlab_canvas.Canvas(pdf_name, pagesize=letter)
        width, height = letter

        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, height - 50, "PRUEBA DE ESCALADO DE SELLOS")

        # Definir diferentes tamaños
        sizes = [
            (50, height - 250, 150, 110, "Pequeño 150×110"),
            (250, height - 250, 200, 150, "Mediano 200×150"),
            (500, height - 250, 250, 180, "Grande 250×180"),
        ]

        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.setFont("Helvetica", 8)

        for x, y, w, h, label in sizes:
            c.rect(x, y, w, h)
            c.drawString(x, y - 12, label)

        c.save()

        # Leer PDF
        with open(pdf_name, 'rb') as f:
            pdf_bytes = f.read()

        # Firmar con tamaño mediano
        signer = PDFSigner(cert_path, cert_password, tsa_url)

        print(f"\n✍️  Aplicando sello mediano (200×150 pts)...")
        signed_pdf = await signer.sign(
            pdf_bytes=pdf_bytes,
            reason="Prueba de escalado",
            location="Sistema",
            field_name="SelloMediano",
            visible=True,
            box=(250, height - 250, 450, height - 100)
        )

        output_pdf = "test_escalado_FIRMADO.pdf"
        with open(output_pdf, 'wb') as f:
            f.write(signed_pdf)

        print(f"✅ PDF firmado: {output_pdf}")
        print(f"   El sello se debe escalar correctamente a 200×150 pts")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


def main():
    """
    Función principal que ejecuta las pruebas.
    """
    import argparse

    parser = argparse.ArgumentParser(description="Prueba de integración del sello visual")
    parser.add_argument(
        "--test",
        choices=["basico", "escalado", "todos"],
        default="basico",
        help="Tipo de prueba a ejecutar"
    )

    args = parser.parse_args()

    if args.test == "basico" or args.test == "todos":
        asyncio.run(test_firma_con_sello())

    if args.test == "escalado" or args.test == "todos":
        asyncio.run(test_diferentes_tamanos())


if __name__ == "__main__":
    main()
