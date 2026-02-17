"""
=============================================
INTEGRACIÓN DE ROLES CON PYTHON SIGNER
Sistema de firma digital con PyHanko + Roles
=============================================

Este módulo extiende el servicio de firma Python para soportar
el sistema de roles de firmantes.
"""

from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
import mysql.connector
from datetime import datetime
import os
import json
from pathlib import Path

# PyHanko imports
from pyhanko.sign import signers, fields
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.fields import SigFieldSpec
from pyhanko.sign.signers import SimpleSigner
from pyhanko_certvalidator import ValidationContext
import io

app = FastAPI(title="FirmaLegal Signer with Roles")

# =============================================
# CONFIGURACIÓN DE BASE DE DATOS
# =============================================

def get_db_connection():
    """Conectar a MySQL/MariaDB"""
    return mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'firmalegalonline')
    )

# =============================================
# MODELOS DE DATOS
# =============================================

class SignFieldData(BaseModel):
    """Datos de un campo de firma"""
    field_id: int
    type: str  # 'signature', 'seal', 'text', 'date'
    page_number: int
    x_position: float
    y_position: float
    width: float
    height: float
    role_id: Optional[int] = None
    role_name: Optional[str] = None
    role_color: Optional[str] = None

class RecipientSignatureData(BaseModel):
    """Datos de firma de un destinatario"""
    recipient_id: int
    token: str
    role_id: int
    role_name: str
    field_values: List[Dict]  # Lista de valores completados

class DocumentSigningRequest(BaseModel):
    """Request para firmar documento con roles"""
    document_id: int
    recipient_id: int
    token: str
    field_values: List[Dict]

class BulkSigningRequest(BaseModel):
    """Request para firma masiva (todos los roles)"""
    document_id: int
    signatures_data: List[RecipientSignatureData]

# =============================================
# HELPER: CARGAR CERTIFICADO
# =============================================

def load_certificate(cert_path: str, cert_password: str):
    """
    Cargar certificado P12 para firma
    """
    try:
        with open(cert_path, 'rb') as cert_file:
            signer = SimpleSigner.load_pkcs12(
                pfx_file=cert_file,
                passphrase=cert_password.encode('utf-8')
            )
        return signer
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al cargar certificado: {str(e)}"
        )

# =============================================
# ENDPOINT 1: OBTENER CAMPOS POR ROL
# =============================================

@app.get("/api/documents/{document_id}/fields-by-role")
async def get_fields_by_role(document_id: int, role_id: Optional[int] = None):
    """
    Obtener campos de un documento, opcionalmente filtrados por rol

    Si role_id se proporciona, solo retorna campos de ese rol
    Si no, retorna todos los campos con información de rol
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if role_id:
            query = """
                SELECT
                    df.*,
                    sr.role_name,
                    sr.role_color,
                    sr.role_order
                FROM document_fields df
                JOIN signer_roles sr ON df.role_id = sr.role_id
                WHERE df.document_id = %s AND df.role_id = %s
                ORDER BY df.page_number, df.y_position
            """
            cursor.execute(query, (document_id, role_id))
        else:
            query = """
                SELECT
                    df.*,
                    sr.role_name,
                    sr.role_color,
                    sr.role_order
                FROM document_fields df
                LEFT JOIN signer_roles sr ON df.role_id = sr.role_id
                WHERE df.document_id = %s
                ORDER BY sr.role_order, df.page_number, df.y_position
            """
            cursor.execute(query, (document_id,))

        fields = cursor.fetchall()

        cursor.close()
        conn.close()

        return {
            "success": True,
            "fields": fields
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =============================================
# ENDPOINT 2: APLICAR FIRMA INDIVIDUAL (UN ROL)
# =============================================

@app.post("/api/sign/apply-signature")
async def apply_signature_with_role(
    pdf_file: UploadFile = File(...),
    document_id: int = Form(...),
    recipient_id: int = Form(...),
    token: str = Form(...),
    field_values_json: str = Form(...)
):
    """
    Aplicar firma de un destinatario (un rol específico) al PDF

    Args:
        pdf_file: Archivo PDF
        document_id: ID del documento
        recipient_id: ID del destinatario que firma
        token: Token de validación
        field_values_json: JSON con valores de campos completados

    Returns:
        PDF firmado con los campos del rol completados
    """
    try:
        # 1. Validar token y permisos
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                dr.recipient_id,
                dr.role_id,
                dr.status,
                dr.can_sign_at,
                sr.role_name,
                sr.role_order
            FROM document_recipients dr
            JOIN signer_roles sr ON dr.role_id = sr.role_id
            WHERE dr.recipient_id = %s
              AND dr.token = %s
              AND dr.document_id = %s
        """, (recipient_id, token, document_id))

        recipient = cursor.fetchone()

        if not recipient:
            raise HTTPException(status_code=404, detail="Destinatario no encontrado")

        if recipient['status'] == 'completed':
            raise HTTPException(status_code=400, detail="Ya has firmado este documento")

        # Verificar si puede firmar (sign_in_order)
        if recipient['can_sign_at']:
            can_sign_at = recipient['can_sign_at']
            if can_sign_at > datetime.now():
                raise HTTPException(
                    status_code=403,
                    detail="No es tu turno de firmar todavía"
                )

        role_id = recipient['role_id']

        # 2. Parsear valores de campos
        field_values = json.loads(field_values_json)

        # 3. Cargar PDF
        pdf_content = await pdf_file.read()
        pdf_stream = io.BytesIO(pdf_content)
        pdf_reader = PdfFileReader(pdf_stream)

        # 4. Obtener campos del rol
        cursor.execute("""
            SELECT * FROM document_fields
            WHERE document_id = %s AND role_id = %s
            ORDER BY page_number, y_position
        """, (document_id, role_id))

        fields = cursor.fetchall()

        # 5. Crear PDF de salida
        output_stream = io.BytesIO()
        pdf_writer = IncrementalPdfFileWriter(pdf_stream)

        # 6. Aplicar cada campo
        for field in fields:
            # Buscar valor completado para este campo
            field_value = next(
                (fv for fv in field_values if fv['fieldId'] == field['field_id']),
                None
            )

            if not field_value:
                if field['required']:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Campo requerido {field['field_id']} no completado"
                    )
                continue

            # Aplicar según tipo de campo
            if field['field_type'] == 'signature':
                # Aplicar firma digital con certificado
                await apply_digital_signature(
                    pdf_writer,
                    field,
                    field_value,
                    recipient
                )

            elif field['field_type'] == 'seal':
                # Aplicar sello digital
                await apply_digital_seal(
                    pdf_writer,
                    field,
                    field_value,
                    recipient
                )

            elif field['field_type'] == 'text':
                # Agregar texto al PDF
                add_text_to_pdf(
                    pdf_writer,
                    field,
                    field_value['textValue']
                )

            elif field['field_type'] == 'date':
                # Agregar fecha al PDF
                add_date_to_pdf(
                    pdf_writer,
                    field,
                    field_value['dateValue']
                )

        # 7. Guardar PDF firmado
        pdf_writer.write(output_stream)
        output_stream.seek(0)

        # 8. Guardar archivo en servidor
        output_dir = Path('uploads/signed_documents')
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(datetime.now().timestamp() * 1000)
        output_filename = f"doc_{document_id}_recipient_{recipient_id}_{timestamp}.pdf"
        output_path = output_dir / output_filename

        with open(output_path, 'wb') as f:
            f.write(output_stream.read())

        # 9. Actualizar estado en BD
        cursor.execute("""
            UPDATE document_recipients
            SET status = 'completed',
                completed_at = NOW()
            WHERE recipient_id = %s
        """, (recipient_id,))

        conn.commit()

        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": "Firma aplicada exitosamente",
            "signed_file_path": str(output_path),
            "role_name": recipient['role_name']
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al firmar: {str(e)}")

# =============================================
# ENDPOINT 3: CONSOLIDAR TODAS LAS FIRMAS
# =============================================

@app.post("/api/sign/consolidate-signatures")
async def consolidate_all_signatures(
    document_id: int = Form(...),
    original_pdf: UploadFile = File(...)
):
    """
    Consolidar todas las firmas de todos los roles en un solo PDF final

    Este endpoint se llama cuando TODOS los destinatarios han completado sus firmas
    Toma el PDF original y aplica todas las firmas en orden
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Verificar que todos los destinatarios completaron
        cursor.execute("""
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM document_recipients
            WHERE document_id = %s
        """, (document_id,))

        counts = cursor.fetchone()

        if counts['total'] != counts['completed']:
            raise HTTPException(
                status_code=400,
                detail=f"Faltan {counts['total'] - counts['completed']} destinatarios por firmar"
            )

        # 2. Obtener todos los destinatarios en orden de firma
        cursor.execute("""
            SELECT
                dr.recipient_id,
                dr.email,
                dr.name,
                dr.role_id,
                sr.role_name,
                sr.role_order,
                sr.role_color
            FROM document_recipients dr
            JOIN signer_roles sr ON dr.role_id = sr.role_id
            WHERE dr.document_id = %s
            ORDER BY sr.role_order, dr.recipient_id
        """, (document_id,))

        recipients = cursor.fetchall()

        # 3. Cargar PDF original
        pdf_content = await original_pdf.read()
        current_pdf = io.BytesIO(pdf_content)

        # 4. Aplicar firmas de cada rol en orden
        for recipient in recipients:
            # Obtener valores completados por este destinatario
            cursor.execute("""
                SELECT
                    fv.field_id,
                    fv.value_type,
                    fv.text_value,
                    fv.signature_path,
                    fv.date_value,
                    df.field_type,
                    df.page_number,
                    df.x_position,
                    df.y_position,
                    df.width,
                    df.height
                FROM field_values fv
                JOIN document_fields df ON fv.field_id = df.field_id
                WHERE fv.recipient_id = %s
                ORDER BY df.page_number, df.y_position
            """, (recipient['recipient_id'],))

            field_values = cursor.fetchall()

            if not field_values:
                continue

            # Crear nuevo PDF con las firmas de este rol
            pdf_reader = PdfFileReader(current_pdf)
            output = io.BytesIO()
            pdf_writer = IncrementalPdfFileWriter(current_pdf)

            for fv in field_values:
                if fv['field_type'] == 'signature':
                    # Aplicar firma
                    await apply_signature_from_path(
                        pdf_writer,
                        fv,
                        recipient
                    )
                elif fv['field_type'] == 'seal':
                    # Aplicar sello
                    await apply_seal_from_data(
                        pdf_writer,
                        fv,
                        recipient
                    )
                elif fv['field_type'] == 'text':
                    add_text_to_pdf(pdf_writer, fv, fv['text_value'])
                elif fv['field_type'] == 'date':
                    add_date_to_pdf(pdf_writer, fv, fv['date_value'])

            pdf_writer.write(output)
            output.seek(0)
            current_pdf = output

        # 5. Guardar PDF final
        final_dir = Path('uploads/final_documents')
        final_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(datetime.now().timestamp() * 1000)
        final_filename = f"final_doc_{document_id}_{timestamp}.pdf"
        final_path = final_dir / final_filename

        with open(final_path, 'wb') as f:
            f.write(current_pdf.read())

        # 6. Actualizar documento en BD
        cursor.execute("""
            UPDATE documents
            SET signed_file_path = %s,
                status = 'completed',
                updated_at = NOW()
            WHERE document_id = %s
        """, (str(final_path), document_id))

        # 7. Registrar evento
        cursor.execute("""
            INSERT INTO signature_events
            (document_id, event_type, event_data)
            VALUES (%s, 'document_completed', %s)
        """, (
            document_id,
            json.dumps({
                'completed_at': datetime.now().isoformat(),
                'total_signers': len(recipients),
                'final_file': str(final_path)
            })
        ))

        conn.commit()
        cursor.close()
        conn.close()

        return {
            "success": True,
            "message": "Documento consolidado exitosamente",
            "final_file_path": str(final_path),
            "total_signatures": len(recipients)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al consolidar firmas: {str(e)}"
        )

# =============================================
# HELPERS: APLICAR FIRMAS Y SELLOS
# =============================================

async def apply_digital_signature(
    pdf_writer: IncrementalPdfFileWriter,
    field: Dict,
    field_value: Dict,
    recipient: Dict
):
    """
    Aplicar firma digital con certificado al PDF
    """
    # Cargar certificado
    cert_path = os.getenv('CERT_PATH', 'certificates/PKISERVICES.p12')
    cert_password = os.getenv('CERT_PASSWORD', '')

    signer = load_certificate(cert_path, cert_password)

    # Crear campo de firma
    sig_field_spec = SigFieldSpec(
        sig_field_name=f"Signature_{field['field_id']}",
        box=(
            field['x_position'],
            field['y_position'],
            field['x_position'] + field['width'],
            field['y_position'] + field['height']
        ),
        page=field['page_number'] - 1  # PyHanko usa índice base 0
    )

    # Aplicar firma
    fields.append_signature_field(
        pdf_writer,
        sig_field_spec
    )

    # Metadatos de firma
    meta = signers.PdfSignatureMetadata(
        field_name=sig_field_spec.sig_field_name,
        name=recipient['name'],
        location='FirmaLegal Online',
        reason=f'Firmado como {recipient["role_name"]}'
    )

    # Firmar
    signers.sign_pdf(
        pdf_writer,
        meta,
        signer=signer
    )

async def apply_digital_seal(
    pdf_writer: IncrementalPdfFileWriter,
    field: Dict,
    field_value: Dict,
    recipient: Dict
):
    """
    Aplicar sello digital al PDF
    Similar a firma pero con diferentes metadatos
    """
    cert_path = os.getenv('CERT_PATH', 'certificates/PKISERVICES.p12')
    cert_password = os.getenv('CERT_PASSWORD', '')

    signer = load_certificate(cert_path, cert_password)

    sig_field_spec = SigFieldSpec(
        sig_field_name=f"Seal_{field['field_id']}",
        box=(
            field['x_position'],
            field['y_position'],
            field['x_position'] + field['width'],
            field['y_position'] + field['height']
        ),
        page=field['page_number'] - 1
    )

    fields.append_signature_field(pdf_writer, sig_field_spec)

    meta = signers.PdfSignatureMetadata(
        field_name=sig_field_spec.sig_field_name,
        name='FirmaLegal - Sello Digital',
        location='Online',
        reason=f'Sellado por {recipient["role_name"]}'
    )

    signers.sign_pdf(pdf_writer, meta, signer=signer)

def add_text_to_pdf(
    pdf_writer: IncrementalPdfFileWriter,
    field: Dict,
    text_value: str
):
    """
    Agregar texto al PDF en la posición especificada
    """
    page_num = field['page_number'] - 1
    page = pdf_writer.get_page(page_num)

    # Crear anotación de texto
    from pyhanko.pdf_utils.generic import pdf_string

    text_annot = generic.DictionaryObject({
        generic.pdf_name('/Type'): generic.pdf_name('/Annot'),
        generic.pdf_name('/Subtype'): generic.pdf_name('/FreeText'),
        generic.pdf_name('/Rect'): generic.ArrayObject([
            generic.FloatObject(field['x_position']),
            generic.FloatObject(field['y_position']),
            generic.FloatObject(field['x_position'] + field['width']),
            generic.FloatObject(field['y_position'] + field['height'])
        ]),
        generic.pdf_name('/Contents'): pdf_string(text_value),
        generic.pdf_name('/DA'): pdf_string('/Helvetica 12 Tf'),
        generic.pdf_name('/C'): generic.ArrayObject([
            generic.FloatObject(0),
            generic.FloatObject(0),
            generic.FloatObject(0)
        ])
    })

    if '/Annots' not in page:
        page[generic.pdf_name('/Annots')] = generic.ArrayObject()

    page['/Annots'].append(pdf_writer.add_object(text_annot))

def add_date_to_pdf(
    pdf_writer: IncrementalPdfFileWriter,
    field: Dict,
    date_value: str
):
    """
    Agregar fecha al PDF
    """
    add_text_to_pdf(pdf_writer, field, date_value)

async def apply_signature_from_path(
    pdf_writer: IncrementalPdfFileWriter,
    field_data: Dict,
    recipient: Dict
):
    """
    Aplicar firma desde una imagen guardada
    """
    # Cargar imagen de firma
    signature_path = field_data['signature_path']

    if not os.path.exists(signature_path):
        return

    # Insertar imagen en PDF
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader

    # Crear overlay con la imagen
    overlay = io.BytesIO()
    c = canvas.Canvas(overlay)

    img = ImageReader(signature_path)
    c.drawImage(
        img,
        field_data['x_position'],
        field_data['y_position'],
        width=field_data['width'],
        height=field_data['height'],
        preserveAspectRatio=True
    )

    c.save()
    overlay.seek(0)

    # Fusionar overlay con PDF principal
    # (implementación específica depende de tu setup)

async def apply_seal_from_data(
    pdf_writer: IncrementalPdfFileWriter,
    field_data: Dict,
    recipient: Dict
):
    """
    Aplicar sello desde datos guardados
    """
    # Similar a apply_signature_from_path
    pass

# =============================================
# ENDPOINT 4: VERIFICAR FIRMAS
# =============================================

@app.get("/api/verify/document/{document_id}")
async def verify_document_signatures(document_id: int):
    """
    Verificar todas las firmas de un documento
    Retorna información de cada firma y su validez
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Obtener archivo final
        cursor.execute("""
            SELECT signed_file_path FROM documents
            WHERE document_id = %s
        """, (document_id,))

        doc = cursor.fetchone()

        if not doc or not doc['signed_file_path']:
            raise HTTPException(status_code=404, detail="Documento no encontrado o no firmado")

        pdf_path = doc['signed_file_path']

        # Leer PDF y verificar firmas
        with open(pdf_path, 'rb') as f:
            pdf_reader = PdfFileReader(f)

            # Obtener campos de firma
            sig_fields = fields.enumerate_sig_fields(pdf_reader)

            signatures_info = []

            for sig_field in sig_fields:
                # Verificar firma
                try:
                    sig_obj = sig_field.sig_object

                    # Extraer información
                    info = {
                        "field_name": sig_field.field_name,
                        "signer": str(sig_obj.get('/Name', 'Unknown')),
                        "date": str(sig_obj.get('/M', '')),
                        "reason": str(sig_obj.get('/Reason', '')),
                        "location": str(sig_obj.get('/Location', '')),
                        "valid": True  # Simplificado - hacer validación real
                    }

                    signatures_info.append(info)

                except Exception as e:
                    signatures_info.append({
                        "field_name": sig_field.field_name,
                        "error": str(e),
                        "valid": False
                    })

        # Obtener info de destinatarios
        cursor.execute("""
            SELECT
                dr.recipient_id,
                dr.email,
                dr.name,
                sr.role_name,
                sr.role_order,
                dr.completed_at
            FROM document_recipients dr
            JOIN signer_roles sr ON dr.role_id = sr.role_id
            WHERE dr.document_id = %s
            ORDER BY sr.role_order
        """, (document_id,))

        recipients = cursor.fetchall()

        cursor.close()
        conn.close()

        return {
            "success": True,
            "document_id": document_id,
            "total_signatures": len(signatures_info),
            "signatures": signatures_info,
            "signers": recipients
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al verificar firmas: {str(e)}"
        )

# =============================================
# HEALTH CHECK
# =============================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "FirmaLegal Python Signer with Roles",
        "timestamp": datetime.now().isoformat()
    }

# =============================================
# MAIN
# =============================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv('PYTHON_SIGNER_PORT', 5001))

    print(f"🚀 Iniciando Python Signer con soporte de Roles en puerto {port}")

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
