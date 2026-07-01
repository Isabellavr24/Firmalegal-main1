"""
Microservicio de Firma Digital PDF
FastAPI REST API para firma PKCS#7 con timestamp RFC 3161
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import base64
import logging
from typing import Optional
from datetime import datetime
import os

from signer import PDFSigner
from config import validate_config

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Validar configuración al iniciar
validate_config()

# Crear app FastAPI
app = FastAPI(
    title="PDF Digital Signature Service",
    description="Microservicio para firma digital de PDFs con timestamp TSA usando pyHanko",
    version="1.0.0"
)

# CORS - permitir acceso desde Node.js backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción, especificar dominios
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Modelos de datos
class SignRequest(BaseModel):
    """Request para firmar un PDF"""
    pdf_base64: str = Field(..., description="PDF codificado en base64")
    cert_path: str = Field(..., description="Ruta al archivo P12/PFX")
    cert_password: str = Field(..., description="Password del certificado")
    tsa_url: str = Field(..., description="URL del servicio TSA (RFC 3161)")
    reason: str = Field(default="Firma digital", description="Razón de la firma")
    location: str = Field(default="Colombia", description="Ubicación")
    signer_name: str = Field(default="Firmante", description="Nombre del firmante")
    contact_info: str = Field(default="", description="Información de contacto")
    field_name: str = Field(default="Signature1", description="Nombre del campo de firma")
    visible: bool = Field(default=True, description="Firma visible o invisible")
    box: Optional[tuple] = Field(default=(10, 40, 210, 90), description="Posición de firma (x1,y1,x2,y2)")
    seals: Optional[list] = Field(default=None, description="Lista de sellos PKI a dibujar [{page, x, y, width, height}, ...]")
    verification_token: Optional[str] = Field(default=None, description="Token seguro de verificación para el QR")
    signing_time: Optional[str] = Field(default=None, description="Fecha/hora real de firma ISO8601 (para sellos en descarga)")


class SignResponse(BaseModel):
    """Response de firma exitosa"""
    success: bool
    signed_pdf_base64: str
    timestamp: dict
    size_original: int
    size_signed: int
    processing_time_ms: float


class CertificateInfoRequest(BaseModel):
    """Request para verificar certificado"""
    cert_path: str
    cert_password: str


class ErrorResponse(BaseModel):
    """Response de error"""
    success: bool = False
    error: str
    detail: Optional[str] = None


# Endpoints
@app.get("/", tags=["Info"])
async def root():
    """Información del servicio"""
    return {
        "service": "PDF Digital Signature Service",
        "version": "1.0.0",
        "status": "running",
        "library": "pyHanko 0.31.0",
        "endpoints": {
            "POST /api/sign": "Firmar PDF con timestamp",
            "POST /api/verify-cert": "Verificar certificado P12",
            "GET /health": "Health check"
        }
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "pdf-signer",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@app.post("/api/sign", response_model=SignResponse, tags=["Signing"])
async def sign_pdf(request: SignRequest):
    """
    Firma un PDF con certificado P12 y timestamp TSA

    Args:
        request: Datos de firma (PDF, certificado, configuración)

    Returns:
        SignResponse con PDF firmado en base64

    Raises:
        HTTPException: Si ocurre algún error durante la firma
    """
    start_time = datetime.utcnow()

    try:
        logger.info("=" * 70)
        logger.info("NUEVA SOLICITUD DE FIRMA")
        logger.info("=" * 70)
        logger.info(f"Firmante: {request.signer_name}")
        logger.info(f"Razón: {request.reason}")
        logger.info(f"Ubicación: {request.location}")

        # 1. Decodificar PDF
        try:
            pdf_bytes = base64.b64decode(request.pdf_base64)
            logger.info(f"✅ PDF decodificado: {len(pdf_bytes):,} bytes")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error decodificando PDF base64: {str(e)}"
            )

        # 2. Crear firmador
        try:
            signer = PDFSigner(
                cert_path=request.cert_path,
                cert_password=request.cert_password,
                tsa_url=request.tsa_url
            )
            logger.info("✅ Firmador creado")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creando firmador: {str(e)}"
            )

        # 3. Firmar PDF (con sellos opcionales y verification_token)
        try:
            signed_pdf = await signer.sign(
                pdf_bytes=pdf_bytes,
                reason=request.reason,
                location=request.location,
                signer_name=request.signer_name,
                contact_info=request.contact_info,
                field_name=request.field_name,
                visible=request.visible,
                box=request.box if request.box else (10, 10, 210, 60),
                seals=request.seals,  # ✅ Pasar sellos al firmador
                verification_token=request.verification_token,  # ✅ Token seguro para el QR
                signing_time=request.signing_time  # ✅ Fecha real de firma
            )
            logger.info(f"✅ PDF firmado: {len(signed_pdf):,} bytes")
            if request.seals:
                logger.info(f"🔐 {len(request.seals)} sello(s) PKI dibujado(s)")
        except Exception as e:
            logger.error(f"❌ Error firmando: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error durante la firma: {str(e)}"
            )

        # 4. Codificar resultado
        signed_pdf_base64 = base64.b64encode(signed_pdf).decode('utf-8')

        # 5. Calcular tiempo de procesamiento
        end_time = datetime.utcnow()
        processing_time = (end_time - start_time).total_seconds() * 1000  # ms

        # 6. Preparar respuesta
        response = SignResponse(
            success=True,
            signed_pdf_base64=signed_pdf_base64,
            timestamp=signer.get_timestamp_info(),
            size_original=len(pdf_bytes),
            size_signed=len(signed_pdf),
            processing_time_ms=round(processing_time, 2)
        )

        logger.info("=" * 70)
        logger.info("✅ FIRMA COMPLETADA EXITOSAMENTE")
        logger.info("=" * 70)
        logger.info(f"⏱️  Tiempo: {processing_time:.2f} ms")
        logger.info(f"📊 Original: {len(pdf_bytes):,} bytes")
        logger.info(f"📊 Firmado: {len(signed_pdf):,} bytes")
        logger.info(f"📊 Incremento: {len(signed_pdf) - len(pdf_bytes):,} bytes")
        logger.info("=" * 70)

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error inesperado: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error inesperado: {str(e)}"
        )


@app.post("/api/verify-cert", tags=["Certificate"])
async def verify_certificate(request: CertificateInfoRequest):
    """
    Verifica y retorna información de un certificado P12

    Args:
        request: Ruta y password del certificado

    Returns:
        Información del certificado o error

    Raises:
        HTTPException: Si el certificado no es válido
    """
    try:
        logger.info(f"Verificando certificado: {request.cert_path}")

        signer = PDFSigner(
            cert_path=request.cert_path,
            cert_password=request.cert_password,
            tsa_url=""  # No necesario para verificación
        )

        cert_info = signer.verify_certificate()

        if not cert_info.get("valid"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Certificado inválido: {cert_info.get('error')}"
            )

        logger.info(f"✅ Certificado válido: {cert_info.get('subject')}")

        return {
            "success": True,
            "certificate": cert_info
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error verificando certificado: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verificando certificado: {str(e)}"
        )


class StripTrazaRequest(BaseModel):
    pdf_base64: str


@app.post("/api/strip-traza", tags=["Signing"])
async def strip_traza(request: StripTrazaRequest):
    """
    Recibe un PDF en base64, extrae solo las páginas del documento
    (sin trazas VI), re-sella con PKI y devuelve el PDF en base64.
    """
    import base64, io, re
    from pypdf import PdfReader, PdfWriter
    from signer import ChainAwareSimpleSigner, LegacyTLSHTTPTimeStamper
    from pyhanko.sign import signers
    from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
    from pyhanko.sign.signers import PdfSignatureMetadata
    import os

    try:
        pdf_bytes = base64.b64decode(request.pdf_base64)

        # Detectar páginas sin traza VI
        VI_PATTERNS = [
            'DETALLE DE LA TRAZABILIDAD',
            'INFORMACION DE LA SOLICITUD',
            'EVIDENCIA FOTOGRAFICA DEL FIRMANTE',
            'EVIDENCIA FOTOGRAFICA',
            'Datos extraidos por OCR',
        ]
        VAL_REGEX = re.compile(r'VAL-[A-Z0-9]+-[A-Z0-9]+')

        reader = PdfReader(io.BytesIO(pdf_bytes))
        writer = PdfWriter()
        doc_page_count = 0
        for page in reader.pages:
            text = page.extract_text() or ''
            is_traza = bool(VAL_REGEX.search(text)) or any(p in text for p in VI_PATTERNS)
            if not is_traza:
                writer.add_page(page)
                doc_page_count += 1

        if doc_page_count == 0:
            raise HTTPException(status_code=400, detail="No se encontraron páginas de documento (todas son traza VI)")

        # Guardar PDF sin trazas en buffer
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        stripped_bytes = buf.read()

        # Re-sellar con PKI
        cert_path = os.environ.get('CERT_PATH', '/app/backend/certificates/PKISERVICES-2YEARS.pfx')
        cert_password = os.environ.get('CERT_PASSWORD', '901301044')
        tsa_url = os.environ.get('TSA_URL', 'https://ca.pkiservices.co/tsa/get.aspx?u=pkiservices&p=901301044')

        cert_dir = os.path.dirname(cert_path)
        ca_chain = [f for f in [
            os.path.join(cert_dir, 'PKIServicesSubCA.crt'),
            os.path.join(cert_dir, 'PKIServicesRootCA.crt'),
        ] if os.path.exists(f)]

        signer_obj = ChainAwareSimpleSigner.load_pkcs12_with_chain(
            pfx_file=cert_path,
            passphrase=cert_password.encode('utf-8'),
            ca_chain_files=ca_chain if ca_chain else None
        )
        tsa = LegacyTLSHTTPTimeStamper(tsa_url)

        w = IncrementalPdfFileWriter(io.BytesIO(stripped_bytes))
        meta = PdfSignatureMetadata(
            field_name='Sello_PKI',
            reason='Sello digital PKI Services - FirmaLegal',
            location='Colombia',
            contact_info='firmalegalonline@pkiservices.co'
        )
        out_buf = io.BytesIO()
        await signers.async_sign_pdf(w, meta, signer=signer_obj, timestamper=tsa, output=out_buf)
        out_buf.seek(0)
        out_bytes = out_buf.read()

        logger.info(f"✅ DOC. SELLADO generado: {doc_page_count} págs, {len(out_bytes)} bytes")
        return {
            "success": True,
            "pdf_base64": base64.b64encode(out_bytes).decode('utf-8'),
            "pages": doc_page_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error en strip-traza: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handler global de excepciones"""
    logger.error(f"❌ Excepción no manejada: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error": "Internal server error",
            "detail": str(exc)
        }
    )


# Ejecutar servidor
if __name__ == "__main__":
    import uvicorn

    logger.info("=" * 70)
    logger.info("🚀 INICIANDO PDF SIGNATURE SERVICE")
    logger.info("=" * 70)
    logger.info("📦 Framework: FastAPI")
    logger.info("📦 Library: pyHanko 0.31.0")
    logger.info("🌐 Host: 127.0.0.1")
    logger.info("🔌 Port: 5001")
    logger.info("=" * 70)

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=5001,
        log_level="info",
        http="h11"  # ✅ Forzar h11 en lugar de httptools
    )
