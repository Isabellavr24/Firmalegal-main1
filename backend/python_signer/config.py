"""
Configuración centralizada de rutas para Python Signer
Todas las rutas son relativas a la raíz del proyecto
"""

import os
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)

def find_project_root() -> Path:
    """
    Encuentra la raíz del proyecto buscando package.json
    """
    current = Path(__file__).resolve().parent

    # Subir hasta encontrar package.json
    while current != current.parent:
        if (current / 'package.json').exists():
            return current
        current = current.parent

    # Fallback: asumir estructura conocida
    # Estamos en backend/python_signer/config.py
    return Path(__file__).resolve().parent.parent.parent

# Raíz del proyecto
PROJECT_ROOT = Path(os.getenv('PROJECT_ROOT', find_project_root()))

def resolve_from_root(*path_segments) -> Path:
    """
    Resolver ruta desde la raíz del proyecto
    """
    return PROJECT_ROOT.joinpath(*path_segments)

def validate_file_exists(file_path: Path, description: str) -> Path:
    """
    Validar que un archivo existe
    """
    if not file_path.exists():
        raise FileNotFoundError(
            f"❌ {description} no encontrado:\n"
            f"   Ruta esperada: {file_path}\n"
            f"   Por favor verifica tu configuración"
        )
    return file_path

class Paths:
    """
    Rutas del proyecto
    """
    ROOT = PROJECT_ROOT
    BACKEND = resolve_from_root('backend')
    FRONTEND = resolve_from_root('frontend')

    # Certificados
    CERTIFICATES_DIR = resolve_from_root('backend', 'certificates')

    # URL de la aplicación para QR codes
    APP_URL = os.getenv('APP_URL', 'https://firmalegalonline.com')

    @staticmethod
    def get_verification_url(document_id: str) -> str:
        """
        Obtener URL de verificación para QR code
        """
        base_url = Paths.APP_URL.rstrip('/')
        return f"{base_url}/public/Main/verify.html?id={document_id}"

    @staticmethod
    def get_certificate_path(cert_path: Optional[str] = None) -> Path:
        """
        Obtener ruta del certificado desde configuración
        """
        if cert_path is None:
            cert_path = os.getenv('CERT_PATH', 'backend/certificates/PKISERVICES.p12')

        # Si es ruta absoluta, usarla directamente
        if os.path.isabs(cert_path):
            return Path(cert_path)

        # Si es relativa, resolver desde la raíz del proyecto
        # Limpiar prefijos como './' o 'backend/'
        cert_path = cert_path.lstrip('./')
        return resolve_from_root(cert_path)

    # Logo para sellos
    LOGO_PATH = resolve_from_root('frontend', 'img', 'Nuevologo.jpg')

    @staticmethod
    def get_logo_path() -> Optional[Path]:
        """
        Obtener ruta del logo, retornar None si no existe
        """
        logo_path = Paths.LOGO_PATH
        if logo_path.exists():
            return logo_path

        # Buscar en ubicaciones alternativas
        alternatives = [
            resolve_from_root('backend', 'python_signer', 'logo.jpg'),
            resolve_from_root('backend', 'python_signer', 'logo.png'),
        ]

        for alt_path in alternatives:
            if alt_path.exists():
                return alt_path

        return None

def validate_config():
    """
    Validar configuración al iniciar
    """
    logger.info('🔍 Validando configuración de rutas...')
    logger.info(f'📁 Raíz del proyecto: {PROJECT_ROOT}')

    # Validar directorios
    required_dirs = [
        (Paths.BACKEND, 'Backend'),
        (Paths.CERTIFICATES_DIR, 'Directorio de certificados'),
    ]

    for dir_path, name in required_dirs:
        if dir_path.exists():
            logger.info(f'✅ {name}: {dir_path}')
        else:
            logger.warning(f'⚠️  {name} no encontrado: {dir_path}')

    # Validar logo
    logo = Paths.get_logo_path()
    if logo:
        logger.info(f'✅ Logo: {logo}')
    else:
        logger.warning(f'⚠️  Logo no encontrado (se usará fallback)')

    logger.info('✅ Validación de rutas completa\n')

# Exportar para uso simple
PATHS = Paths()
