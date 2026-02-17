/**
 * Configuración centralizada de rutas para FirmaLegal
 * Todas las rutas son relativas a la raíz del proyecto
 */

const path = require('path');
const fs = require('fs');

// Detectar la raíz del proyecto (donde está package.json)
const findProjectRoot = () => {
    let currentDir = __dirname;

    // Subir hasta encontrar package.json o llegar a la raíz del sistema
    while (currentDir !== path.parse(currentDir).root) {
        if (fs.existsSync(path.join(currentDir, 'package.json'))) {
            return currentDir;
        }
        currentDir = path.dirname(currentDir);
    }

    // Fallback: asumir que estamos en backend/config
    return path.resolve(__dirname, '..', '..');
};

const PROJECT_ROOT = process.env.PROJECT_ROOT || findProjectRoot();

/**
 * Resolver ruta relativa desde la raíz del proyecto
 */
const resolveFromRoot = (...pathSegments) => {
    return path.resolve(PROJECT_ROOT, ...pathSegments);
};

/**
 * Validar que un archivo existe, lanzar error descriptivo si no
 */
const validateFileExists = (filePath, description) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `❌ ${description} no encontrado:\n` +
            `   Ruta esperada: ${filePath}\n` +
            `   Por favor verifica tu archivo .env y la documentación`
        );
    }
    return filePath;
};

/**
 * Rutas del proyecto
 */
const PATHS = {
    // Raíz del proyecto
    ROOT: PROJECT_ROOT,

    // Directorios principales
    BACKEND: resolveFromRoot('backend'),
    FRONTEND: resolveFromRoot('frontend'),

    // Certificados (desde variable de entorno)
    CERTIFICATES_DIR: resolveFromRoot('backend', 'certificates'),
    getCertificatePath: () => {
        const certPath = process.env.CERT_PATH || 'backend/certificates/PKISERVICES.p12';
        return resolveFromRoot(certPath);
    },

    // Assets para sellos
    LOGO_PATH: resolveFromRoot('frontend', 'img', 'Nuevologo.jpg'),

    // Uploads
    UPLOADS_DIR: resolveFromRoot('uploads'),
    AVATARS_DIR: resolveFromRoot('frontend', 'avatar-pht'),

    // Frontend estático
    FRONTEND_PUBLIC: resolveFromRoot('frontend', 'public'),
};

/**
 * Validar configuración crítica al iniciar
 */
const validatePaths = () => {
    console.log('🔍 Validando configuración de rutas...');
    console.log(`📁 Raíz del proyecto: ${PROJECT_ROOT}`);

    // Validar directorios que deben existir
    const requiredDirs = [
        { path: PATHS.BACKEND, name: 'Backend' },
        { path: PATHS.FRONTEND, name: 'Frontend' },
        { path: PATHS.CERTIFICATES_DIR, name: 'Directorio de certificados' },
    ];

    requiredDirs.forEach(({ path: dirPath, name }) => {
        if (!fs.existsSync(dirPath)) {
            console.warn(`⚠️  ${name} no encontrado: ${dirPath}`);
        } else {
            console.log(`✅ ${name}: ${dirPath}`);
        }
    });

    // Validar certificado si está configurado
    if (process.env.CERT_PATH) {
        try {
            const certPath = PATHS.getCertificatePath();
            validateFileExists(certPath, 'Certificado digital');
            console.log(`✅ Certificado: ${certPath}`);
        } catch (error) {
            console.error(error.message);
            console.log('💡 Configura CERT_PATH en tu archivo .env');
        }
    }

    // Validar logo para sellos
    if (fs.existsSync(PATHS.LOGO_PATH)) {
        console.log(`✅ Logo: ${PATHS.LOGO_PATH}`);
    } else {
        console.warn(`⚠️  Logo no encontrado: ${PATHS.LOGO_PATH} (se usará fallback)`);
    }

    console.log('✅ Validación de rutas completa\n');
};

module.exports = {
    PATHS,
    resolveFromRoot,
    validateFileExists,
    validatePaths,
    PROJECT_ROOT
};
