"""
PDF Signer con pyHanko
Maneja la firma digital PKCS#7 con timestamp RFC 3161
Integrado con sello visual personalizado
"""

from pyhanko.sign import signers, fields
from pyhanko.stamp import TextStampStyle
from pyhanko.sign.signers.pdf_signer import PdfSigner as PyHankoPdfSigner
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign.timestamps import HTTPTimeStamper
from pyhanko.sign.signers import PdfSignatureMetadata
from pyhanko.pdf_utils.reader import PdfFileReader
from io import BytesIO
import logging
import os
import asyncio
import ssl
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

# Zona horaria Colombia (UTC-5)
TZ_COLOMBIA = timezone(timedelta(hours=-5))
from typing import Optional, Dict, List
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as reportlab_canvas
from reportlab.lib.pagesizes import letter
from pathlib import Path
import time
import threading


class LegacyTLSHTTPTimeStamper(HTTPTimeStamper):
    """HTTPTimeStamper con adaptador TLS legacy para compatibilidad con OpenSSL 3.x"""

    def _make_session(self):
        class LegacyTLSAdapter(HTTPAdapter):
            def init_poolmanager(self, *args, **kwargs):
                ctx = create_urllib3_context()
                ctx.set_ciphers('DEFAULT@SECLEVEL=1')
                ctx.minimum_version = ssl.TLSVersion.TLSv1_2
                ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                kwargs['ssl_context'] = ctx
                super().init_poolmanager(*args, **kwargs)

        session = requests.Session()
        session.mount('https://', LegacyTLSAdapter())
        return session

    async def async_request_tsa_response(self, req):
        from asn1crypto import tsp
        from asyncio import to_thread
        from pyhanko.sign.timestamps.common_utils import TimestampRequestError, set_tsp_headers

        def task():
            session = self._make_session()
            try:
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                raw_res = session.post(
                    self.url,
                    req.dump(),
                    headers=set_tsp_headers(self.headers or {}),
                    auth=self.auth,
                    timeout=self.timeout,
                    verify=False,
                )
            except IOError as e:
                raise TimestampRequestError(
                    'Error in communication with timestamp server',
                ) from e

            if raw_res.headers.get('Content-Type') not in (
                'application/timestamp-reply',
                'application/octet-stream',
            ):
                raise TimestampRequestError(
                    'Timestamp server response is malformed.', raw_res
                )
            return tsp.TimeStampResp.load(raw_res.content)

        return await to_thread(task)


class ChainAwareSimpleSigner(signers.SimpleSigner):
    """
    SimpleSigner con soporte para cadena de CA y parche de asn1crypto.
    El certificado PKISERVICES-2YEARS.pfx tiene OID 2.5.4.45 (x500UniqueIdentifier)
    codificado como PrintableString (tag 19) en lugar de BitString (tag 3),
    lo que causa que asn1crypto falle al parsear el subject. Este subclass
    evita ese error usando cryptography para extraer el CN.
    """

    @property
    def subject_name(self):
        if self.signing_cert is None:
            return None
        try:
            # Intentar el método normal primero
            return super().subject_name
        except Exception:
            pass
        # Fallback: usar cryptography para parsear el subject
        try:
            from cryptography.x509 import load_der_x509_certificate
            cry_cert = load_der_x509_certificate(self.signing_cert.dump())
            for attr in cry_cert.subject:
                if attr.oid._name == 'commonName':
                    return attr.value
            # Si no hay CN, retornar organizationName
            for attr in cry_cert.subject:
                if attr.oid._name == 'organizationName':
                    return attr.value
        except Exception:
            pass
        return 'PKI SERVICES SAS'

    @classmethod
    def load_pkcs12_with_chain(cls, pfx_file, passphrase, ca_chain_files=None):
        """Carga P12 con cadena CA y retorna instancia de ChainAwareSimpleSigner."""
        from pyhanko_certvalidator.registry import SimpleCertificateStore
        from pyhanko.keys.internal import (
            translate_pyca_cryptography_key_to_asn1,
            translate_pyca_cryptography_cert_to_asn1,
        )
        from cryptography.hazmat.primitives.serialization import pkcs12 as _pkcs12
        from cryptography.x509 import load_der_x509_certificate

        with open(pfx_file, 'rb') as f:
            pfx_bytes = f.read()
        private_key, cert, other_certs_pkcs12 = _pkcs12.load_key_and_certificates(
            pfx_bytes, passphrase
        )
        kinfo = translate_pyca_cryptography_key_to_asn1(private_key)
        asn1_cert = translate_pyca_cryptography_cert_to_asn1(cert)

        cs = SimpleCertificateStore()
        # Agregar certs del P12 (usualmente vacío para PKISERVICES)
        if other_certs_pkcs12:
            for c in other_certs_pkcs12:
                cs.register(translate_pyca_cryptography_cert_to_asn1(c))
        # Agregar cadena CA desde archivos externos
        if ca_chain_files:
            for ca_file in ca_chain_files:
                if os.path.exists(ca_file):
                    with open(ca_file, 'rb') as f:
                        ca_data = f.read()
                    try:
                        ca_cert = load_der_x509_certificate(ca_data)
                    except Exception:
                        from cryptography.x509 import load_pem_x509_certificate
                        ca_cert = load_pem_x509_certificate(ca_data)
                    cs.register(translate_pyca_cryptography_cert_to_asn1(ca_cert))

        return cls(
            signing_key=kinfo,
            signing_cert=asn1_cert,
            cert_registry=cs,
        )


# Importar funciones de sello visual
from signature_seal import draw_signature_seal, draw_qr_vertical

# Importar configuración centralizada
from config import PATHS, validate_file_exists

logger = logging.getLogger(__name__)

# Thread pool para operaciones síncronas de pyHanko
# ✅ OPTIMIZACIÓN: Aumentado de 4 a 8 workers para envío masivo de pagarés
# Con 8 workers, 100 pagarés se procesan en ~40-50 segundos en lugar de ~5 minutos
executor = ThreadPoolExecutor(max_workers=8)

# =============================================
# OPTIMIZACIÓN: Cache global de timestamps TSA
# =============================================
_timestamp_cache = {}
_timestamp_cache_lock = threading.Lock()
_timestamp_cache_ttl = 180  # 3 minutos (conservador)


class PDFSigner:
    """
    Clase para firmar PDFs con certificados P12 y timestamp TSA
    """

    def __init__(self, cert_path: str, cert_password: str, tsa_url: str):
        """
        Inicializa el firmador

        Args:
            cert_path: Ruta al certificado (relativa o absoluta)
            cert_password: Password del certificado
            tsa_url: URL del servicio TSA
        """
        # Usar módulo de configuración para resolver ruta
        self.cert_path = str(PATHS.get_certificate_path(cert_path))
        self.cert_password = cert_password
        self.tsa_url = tsa_url
        self.last_timestamp_info = None

        # Validar que existe
        validate_file_exists(Path(self.cert_path), "Certificado digital")

        # ✅ OPTIMIZACIÓN: Cache de SimpleSigner para reusar entre firmas
        self._cached_signer = None
        self._cached_cert_data = None

        logger.info(f"✅ Certificado cargado: {self.cert_path}")
        logger.info(f"🚀 Optimizaciones activadas: Cache de timestamps y certificado")

    def _get_or_load_signer(self) -> signers.SimpleSigner:
        """
        Obtiene el SimpleSigner cacheado o lo carga si es la primera vez.
        ✅ OPTIMIZACIÓN: Evita cargar el certificado P12 múltiples veces
        """
        if self._cached_signer is None:
            logger.info("📋 Cargando certificado P12 (primera vez)...")
            # Buscar cadena de CA (Sub CA + Root CA) junto al certificado principal
            import os as _os
            _cert_dir = _os.path.dirname(self.cert_path)
            _sub_ca = _os.path.join(_cert_dir, 'PKIServicesSubCA.crt')
            _root_ca = _os.path.join(_cert_dir, 'PKIServicesRootCA.crt')
            _ca_chain = [f for f in [_sub_ca, _root_ca] if _os.path.exists(f)]
            if _ca_chain:
                logger.info(f"   🔗 Cadena CA encontrada: {[_os.path.basename(f) for f in _ca_chain]}")
            else:
                logger.warning("   ⚠️  No se encontró cadena CA — el sello puede no ser confiable en Adobe")
            self._cached_signer = ChainAwareSimpleSigner.load_pkcs12_with_chain(
                pfx_file=self.cert_path,
                passphrase=self.cert_password.encode('utf-8'),
                ca_chain_files=_ca_chain if _ca_chain else None
            )
            logger.info("   ✅ Certificado cargado y cacheado")
        else:
            logger.info("   ⚡ Usando certificado cacheado (rápido)")
        return self._cached_signer

    def _get_or_extract_cert_data(self, signer: signers.SimpleSigner) -> Dict[str, str]:
        """
        Obtiene los datos del certificado cacheados o los extrae si es la primera vez.
        ✅ OPTIMIZACIÓN: Evita extraer datos del certificado múltiples veces
        """
        if self._cached_cert_data is None:
            logger.info("📋 Extrayendo datos del certificado...")
            self._cached_cert_data = self._extract_cert_data(signer)
            logger.info("   ✅ Datos extraídos y cacheados")
        else:
            logger.info("   ⚡ Usando datos de certificado cacheados (rápido)")
        return self._cached_cert_data

    def _extract_cert_data(self, signer: signers.SimpleSigner) -> Dict[str, str]:
        """
        Extrae información del certificado para el sello visual.

        Args:
            signer: Objeto SimpleSigner con el certificado cargado

        Returns:
            Dict con los datos formateados para draw_signature_seal
        """
        try:
            from cryptography.x509.oid import NameOID
            from cryptography.hazmat.primitives.serialization import pkcs12

            # Cargar certificado directamente con cryptography para mejor compatibilidad
            with open(self.cert_path, 'rb') as f:
                private_key, certificate, chain = pkcs12.load_key_and_certificates(
                    f.read(),
                    self.cert_password.encode('utf-8')
                )

            subject = certificate.subject
            issuer = certificate.issuer

            # Extraer Common Name del subject
            subject_cn = "Desconocido"
            try:
                cn_attrs = subject.get_attributes_for_oid(NameOID.COMMON_NAME)
                if cn_attrs:
                    subject_cn = cn_attrs[0].value
            except:
                pass

            # Extraer Common Name del issuer
            issuer_cn = "Emisor Desconocido"
            try:
                cn_attrs = issuer.get_attributes_for_oid(NameOID.COMMON_NAME)
                if cn_attrs:
                    issuer_cn = cn_attrs[0].value
            except:
                pass

            # Extraer email si existe
            email = ""
            try:
                email_attrs = subject.get_attributes_for_oid(NameOID.EMAIL_ADDRESS)
                if email_attrs:
                    email = email_attrs[0].value
            except:
                pass

            # Extraer país si existe
            country = ""
            try:
                country_attrs = subject.get_attributes_for_oid(NameOID.COUNTRY_NAME)
                if country_attrs:
                    country = country_attrs[0].value
            except:
                pass

            # Timestamp actual en hora Colombia (UTC-5)
            now = datetime.now(TZ_COLOMBIA)
            timestamp_iso = now.strftime("%Y-%m-%dT%H:%M:%S-05:00")
            timestamp_local = now.strftime("%d/%m/%Y %H:%M:%S")

            return {
                'subject_common_name': subject_cn,
                'email': email or 'sin-email@ejemplo.com',
                'issuer_common_name': issuer_cn,
                'country': country if country else 'N/A',
                'timestamp_iso': timestamp_iso,
                'timestamp_local': timestamp_local
            }

        except Exception as e:
            logger.warning(f"Error extrayendo datos del certificado: {e}")
            # Datos por defecto si falla la extracción
            now = datetime.now(TZ_COLOMBIA)
            return {
                'subject_common_name': 'Firmante',
                'email': 'sin-email@ejemplo.com',
                'issuer_common_name': 'Emisor',
                'country': 'N/A',
                'timestamp_iso': now.strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                'timestamp_local': now.strftime("%d/%m/%Y %H:%M:%S")
            }

    def _create_signature_appearance(
        self,
        signer: signers.SimpleSigner,
        width: int = 200,
        height: int = 150
    ) -> bytes:
        """
        Crea la apariencia visual del sello de firma usando el servicio Node.js.

        Args:
            signer: Objeto SimpleSigner con el certificado
            width: Ancho del sello en puntos
            height: Alto del sello en puntos

        Returns:
            bytes del PDF con el sello visual
        """
        try:
            # ✅ OPTIMIZACIÓN: Usar datos de certificado cacheados
            cert_data = self._get_or_extract_cert_data(signer)

            # Llamar al servicio Node.js para generar el sello
            response = requests.post(
                f"{PDF_GENERATOR_URL}/generate-seal",
                json={
                    'cert_data': cert_data,
                    'width': width,
                    'height': height
                },
                timeout=30
            )

            if response.status_code == 200:
                return response.content
            else:
                logger.error(f"Error del servicio PDF Generator: {response.status_code} - {response.text}")
                return None

        except requests.exceptions.RequestException as e:
            logger.error(f"Error conectando al servicio PDF Generator: {e}")
            return None
        except Exception as e:
            logger.error(f"Error creando apariencia del sello: {e}")
            return None

    def _draw_seals_on_pdf(
        self,
        pdf_bytes: bytes,
        seals: List[Dict],
        signer: signers.SimpleSigner,
        verification_token: Optional[str] = None
    ) -> bytes:
        """
        Dibuja sellos PKI en el PDF antes de firmar.

        Args:
            pdf_bytes: PDF original
            seals: Lista de sellos con formato [{page, x, y, width, height}, ...]
            signer: SimpleSigner con el certificado cargado
            verification_token: Token seguro para el QR de verificación

        Returns:
            bytes: PDF con sellos dibujados
        """
        try:
            logger.info(f"📋 Procesando PDF para agregar QR y sellos...")

            # ✅ OPTIMIZACIÓN: Usar datos de certificado cacheados (nombre, email, issuer, país)
            # ✅ FIX: Copiar el dict para no contaminar el caché con timestamp ni token
            cached = self._get_or_extract_cert_data(signer)
            cert_data = dict(cached)

            # ✅ FIX: Timestamp siempre fresco en el momento de firma (no cacheado)
            now = datetime.now(TZ_COLOMBIA)
            cert_data['timestamp_iso'] = now.strftime("%Y-%m-%dT%H:%M:%S-05:00")
            cert_data['timestamp_local'] = now.strftime("%d/%m/%Y %H:%M:%S")
            logger.info(f"   ⏰ Timestamp sello: {cert_data['timestamp_local']}")

            # ✅ Token seguro para el QR (no expone el document_id)
            if verification_token:
                cert_data['verification_token'] = verification_token
                logger.info(f"   🔐 Token de verificación para QR: {verification_token[:8]}...")

            # Leer PDF original
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            pdf_writer = PdfWriter()

            # Agrupar sellos por página para eficiencia
            seals_by_page = {}
            if seals:
                for seal in seals:
                    page_num = seal.get('page', 1) - 1  # Convertir a 0-indexed
                    if page_num not in seals_by_page:
                        seals_by_page[page_num] = []
                    seals_by_page[page_num].append(seal)

            # Procesar cada página
            for page_idx in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_idx]

                # Obtener dimensiones de la página
                page_box = page.mediabox
                page_width = float(page_box.width)
                page_height = float(page_box.height)

                # Crear canvas para dibujar en esta página
                overlay_buffer = BytesIO()
                c = reportlab_canvas.Canvas(overlay_buffer, pagesize=(page_width, page_height))

                # ========================================
                # SIEMPRE: Dibujar QR vertical en todas las páginas
                # Posición: esquina inferior derecha
                # ========================================
                qr_x = page_width - 85  # 85 pts desde el borde derecho
                qr_y = 20  # 20 pts desde el borde inferior
                draw_qr_vertical(c, qr_x, qr_y, cert_data)
                logger.info(f"   📄 Página {page_idx + 1}: QR vertical dibujado")

                # ========================================
                # OPCIONAL: Dibujar sellos PKI si existen para esta página
                # ========================================
                if page_idx in seals_by_page:
                    page_seals = seals_by_page[page_idx]
                    logger.info(f"   📄 Página {page_idx + 1}: {len(page_seals)} sello(s) PKI")

                    for seal in page_seals:
                        x = float(seal.get('x', 0))
                        y = float(seal.get('y', 0))
                        width = float(seal.get('width', 200))
                        height = float(seal.get('height', 80))

                        logger.info(f"      🔐 Sello en ({x}, {y}) - {width}×{height} pts")

                        try:
                            draw_signature_seal(c, x, y, width, height, cert_data)
                            logger.info(f"      ✅ Sello dibujado correctamente")
                        except Exception as e:
                            logger.error(f"Error dibujando sello: {e}")

                # Guardar el canvas y fusionar con la página
                c.save()
                overlay_buffer.seek(0)

                overlay_pdf = PdfReader(overlay_buffer)
                overlay_page = overlay_pdf.pages[0]
                page.merge_page(overlay_page)

                # Agregar página al writer
                pdf_writer.add_page(page)

            # Escribir PDF resultante
            output_buffer = BytesIO()

            try:
                pdf_writer.write_stream(output_buffer)
            except AttributeError:
                pdf_writer.write(output_buffer)

            output_buffer.seek(0)
            result_bytes = output_buffer.getvalue()

            logger.info(f"✅ Sellos dibujados exitosamente")
            logger.info(f"   📄 PDF original: {len(pdf_bytes):,} bytes")
            logger.info(f"   📄 PDF con sellos: {len(result_bytes):,} bytes")
            logger.info(f"   📈 Incremento: {len(result_bytes) - len(pdf_bytes):,} bytes")

            return result_bytes

        except Exception as e:
            logger.error(f"❌ Error dibujando sellos: {e}")
            logger.warning("⚠️  Continuando sin sellos")
            return pdf_bytes

    def _sign_sync(
        self,
        pdf_bytes: bytes,
        reason: str,
        location: str,
        signer_name: str,
        contact_info: str,
        field_name: str,
        visible: bool,
        box: tuple,
        seals: Optional[List[Dict]] = None,
        verification_token: Optional[str] = None
    ) -> bytes:
        """
        Método síncrono que ejecuta la firma con pyHanko
        Se ejecuta en un thread pool para no bloquear el event loop
        """
        try:
            logger.info("=" * 60)
            logger.info("INICIANDO FIRMA DIGITAL CON PYHANKO")
            logger.info("=" * 60)

            # 1. Cargar certificado P12 (cacheado)
            logger.info(f"📋 1. Cargando certificado: {self.cert_path}")

            # ✅ OPTIMIZACIÓN: Usar certificado cacheado en lugar de cargarlo cada vez
            signer = self._get_or_load_signer()
            logger.info("   ✅ Certificado listo")

            # 1.5. Dibujar QR vertical en TODAS las páginas + sellos opcionales
            logger.info(f"📋 1.5. Dibujando QR vertical y sellos PKI...")
            pdf_bytes = self._draw_seals_on_pdf(pdf_bytes, seals, signer, verification_token)
            logger.info("   ✅ QR y sellos dibujados")

            # 2. Configurar timestamper con adaptador TLS legacy (OpenSSL 3.x compat)
            logger.info(f"📋 2. Configurando TSA: {self.tsa_url}")
            timestamper = LegacyTLSHTTPTimeStamper(self.tsa_url, timeout=30)
            logger.info("   ✅ TSA configurado (timeout=30s, TLS legacy)")

            # 3. Preparar PDF
            logger.info(f"📋 3. Preparando PDF ({len(pdf_bytes)} bytes)")
            pdf_in = BytesIO(pdf_bytes)

            # ✅ SOLUCIÓN DEFINITIVA AL ERROR HYBRID XREFS:
            # pyHanko 0.31.0 rechaza PDFs con hybrid xrefs por defecto
            # La única solución es pasar strict=False al crear IncrementalPdfFileWriter
            # PERO primero debemos leer con PdfFileReader que soporte hybrid xrefs

            # Paso 1: Leer el PDF con PdfFileReader (soporta hybrid xrefs automáticamente)
            from pyhanko.pdf_utils.reader import PdfFileReader as PyHankoPdfReader
            from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter

            reader = PyHankoPdfReader(pdf_in)

            # Paso 2: Crear el writer a partir del reader
            # Esto hace que el writer herede la capacidad de manejar hybrid xrefs del reader
            w = IncrementalPdfFileWriter.from_reader(reader)

            # Obtener número total de páginas para colocar firma en la última
            total_pages = len(reader.root['/Pages']['/Kids'])
            last_page_index = total_pages - 1
            logger.info(f"📄 PDF tiene {total_pages} página(s), firma irá en página {last_page_index + 1}")

            # 4. Metadata de firma
            logger.info("📋 4. Configurando metadata de firma")
            meta = PdfSignatureMetadata(
                field_name=field_name,
                reason=reason,
                location=location,
                name=signer_name,
                contact_info=contact_info
            )

            # 5. Campo de firma (visible o invisible)
            sig_field_spec = None
            if visible:
                logger.info(f"📋 5. Creando campo visible en última página ({last_page_index + 1}) en {box}")

                # Calcular dimensiones del sello desde box
                width = box[2] - box[0]
                height = box[3] - box[1]

                # Crear apariencia visual personalizada
                logger.info(f"   📐 Generando sello visual personalizado ({width}×{height} pts)")
                appearance_bytes = self._create_signature_appearance(signer, int(width), int(height))

                if appearance_bytes:
                    logger.info("   ✅ Sello visual generado exitosamente")
                else:
                    logger.warning("   ⚠️  Usando apariencia por defecto de pyHanko")

                sig_field_spec = fields.SigFieldSpec(
                    sig_field_name=field_name,
                    on_page=last_page_index,  # ✅ Firma en la ÚLTIMA página
                    box=box,  # (x1, y1, x2, y2) en puntos
                    empty_field_appearance=True  # ✅ FIX: No mostrar texto UTC por defecto de pyHanko (los sellos visuales ya se dibujan con ReportLab)
                )
            else:
                logger.info("📋 5. Firma invisible (sin campo visual)")

            # 6. Firmar PDF con timestamp (hasta 3 intentos con TSA)
            logger.info("📋 6. Firmando PDF...")
            logger.info("   ⏳ Generando firma PKCS#7...")
            logger.info("   ⏳ Solicitando timestamp TSA...")

            max_tsa_attempts = 3
            last_tsa_error = None
            out = None
            for attempt in range(1, max_tsa_attempts + 1):
                try:
                    if attempt > 1:
                        logger.warning(f"   ⚠️  Reintento TSA {attempt}/{max_tsa_attempts}...")
                        # Recrear writer porque el anterior quedó en estado inconsistente
                        pdf_in_retry = BytesIO(pdf_bytes)
                        reader_retry = PyHankoPdfReader(pdf_in_retry)
                        w = IncrementalPdfFileWriter.from_reader(reader_retry)
                    # Usar hora Colombia en el stamp_text de pyHanko, con logo de fondo
                    now_col = datetime.now(TZ_COLOMBIA)
                    ts_col = now_col.strftime("%Y-%m-%d %H:%M:%S")
                    logo_path = '/app/frontend/img/Nuevologo.jpg'
                    try:
                        from pyhanko.pdf_utils.images import PdfImage
                        bg = PdfImage(logo_path) if os.path.exists(logo_path) else None
                    except Exception:
                        bg = None
                    pdf_signer_obj = PyHankoPdfSigner(
                        meta,
                        signer,
                        timestamper=timestamper,
                        stamp_style=TextStampStyle(
                            stamp_text=f'Digitally signed by PKI Services.\nTimestamp: {ts_col} COT.',
                            timestamp_format='%Y-%m-%d %H:%M:%S',
                            background=bg,
                            background_opacity=0.25,
                        ),
                        new_field_spec=sig_field_spec,
                    )
                    out = pdf_signer_obj.sign_pdf(w, existing_fields_only=False)
                    last_tsa_error = None
                    break
                except Exception as tsa_error:
                    import traceback
                    last_tsa_error = tsa_error
                    logger.warning(f"   ⚠️  Intento {attempt} fallido: {str(tsa_error)}")
                    logger.warning(f"   📋 Traceback: {traceback.format_exc()}")

            if last_tsa_error is not None:
                raise last_tsa_error

            signed_pdf = out.getvalue()

            # 7. Guardar información del timestamp
            self.last_timestamp_info = {
                "time": datetime.now(TZ_COLOMBIA).strftime("%Y-%m-%dT%H:%M:%S-05:00"),
                "source": self.tsa_url,
                "reason": reason,
                "location": location,
                "signer": signer_name
            }

            logger.info("=" * 60)
            logger.info("✅ FIRMA COMPLETADA EXITOSAMENTE")
            logger.info("=" * 60)
            logger.info(f"📄 PDF original: {len(pdf_bytes):,} bytes")
            logger.info(f"📄 PDF firmado: {len(signed_pdf):,} bytes")
            logger.info(f"📈 Incremento: {len(signed_pdf) - len(pdf_bytes):,} bytes")
            logger.info(f"⏰ Timestamp: {self.last_timestamp_info['time']}")
            logger.info("=" * 60)

            return signed_pdf

        except Exception as e:
            logger.error("=" * 60)
            logger.error("❌ ERROR EN FIRMA DIGITAL")
            logger.error("=" * 60)
            logger.error(f"Error: {str(e)}")
            logger.error("=" * 60)
            raise

    async def sign(
        self,
        pdf_bytes: bytes,
        reason: str = "Firma digital",
        location: str = "Colombia",
        signer_name: str = "Firmante",
        contact_info: str = "",
        field_name: str = "Signature1",
        visible: bool = True,
        box: tuple = (10, 10, 210, 60),
        seals: Optional[List[Dict]] = None,
        verification_token: Optional[str] = None
    ) -> bytes:
        """
        Firma un PDF con certificado P12 y timestamp TSA (versión async)

        Args:
            pdf_bytes: Contenido del PDF a firmar
            reason: Razón de la firma
            location: Ubicación del firmante
            signer_name: Nombre del firmante
            contact_info: Información de contacto
            field_name: Nombre del campo de firma
            visible: Si la firma debe ser visible
            box: Posición de la firma (x1, y1, x2, y2)
            seals: Lista opcional de sellos PKI a dibujar [{page, x, y, width, height}, ...]
            verification_token: Token seguro para el QR de verificación

        Returns:
            bytes: PDF firmado con sellos (si se proporcionaron)

        Raises:
            Exception: Si ocurre algún error durante la firma
        """
        # Ejecutar la firma síncrona en un thread pool
        loop = asyncio.get_event_loop()
        signed_pdf = await loop.run_in_executor(
            executor,
            self._sign_sync,
            pdf_bytes,
            reason,
            location,
            signer_name,
            contact_info,
            field_name,
            visible,
            box,
            seals,
            verification_token
        )
        return signed_pdf

    def get_timestamp_info(self) -> Optional[Dict]:
        """
        Retorna información del último timestamp generado

        Returns:
            Dict con información del timestamp o None
        """
        return self.last_timestamp_info

    def verify_certificate(self) -> Dict:
        """
        Verifica y retorna información del certificado P12

        Returns:
            Dict con información del certificado

        Raises:
            Exception: Si el certificado no se puede cargar
        """
        try:
            logger.info(f"Verificando certificado: {self.cert_path}")
            logger.info(f"Archivo existe: {os.path.exists(self.cert_path)}")

            # ✅ OPTIMIZACIÓN: Usar certificado cacheado
            signer = self._get_or_load_signer()

            logger.info("Certificado cargado en SimpleSigner")

            # Extraer información del certificado usando cryptography (evita bug asn1crypto OID 2.5.4.45)
            from cryptography.hazmat.primitives.serialization import pkcs12 as _pkcs12

            def _name_to_str(x509_name):
                parts = []
                for attr in x509_name:
                    try:
                        parts.append(f"{attr.oid._name}: {attr.value}")
                    except Exception:
                        parts.append(f"{attr.oid.dotted_string}: {attr.value}")
                return ", ".join(parts)

            with open(self.cert_path, "rb") as _f:
                _, _crypto_cert, _ = _pkcs12.load_key_and_certificates(
                    _f.read(), self.cert_password.encode("utf-8")
                )

            subject = _name_to_str(_crypto_cert.subject)
            issuer_str = _name_to_str(_crypto_cert.issuer)

            logger.info(f"Certificado válido: {subject}")

            try:
                algorithm = _crypto_cert.signature_algorithm_oid.dotted_string
            except Exception:
                algorithm = "Unknown"

            return {
                "valid": True,
                "subject": subject,
                "issuer": issuer_str,
                "serial_number": str(_crypto_cert.serial_number),
                "not_before": _crypto_cert.not_valid_before_utc.isoformat(),
                "not_after": _crypto_cert.not_valid_after_utc.isoformat(),
                "algorithm": algorithm
            }

        except Exception as e:
            logger.error(f"Error verificando certificado: {str(e)}")
            logger.error(f"Tipo de error: {type(e).__name__}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return {
                "valid": False,
                "error": str(e)
            }
