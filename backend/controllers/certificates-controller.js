/**
 * CERTIFICATES CONTROLLER
 *
 * API REST para gestionar certificados digitales P12/PFX
 * ACTUALIZADO: Usa microservicio Python con pyHanko
 *
 * Endpoints:
 * - GET  /api/certificates/status     → Ver estado del certificado
 * - POST /api/certificates/upload     → Subir nuevo certificado
 * - POST /api/certificates/tsa-config → Configurar URL del TSA
 * - GET  /api/certificates/info       → Información detallada del certificado
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const PythonSignerClient = require('../lib/signatures/python-signer-client');
const { PATHS, resolveFromRoot } = require('../config/paths');
require('dotenv').config();

// Configurar multer para subir certificados
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const certDir = PATHS.CERTIFICATES_DIR;

        // Crear directorio si no existe
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
        }

        cb(null, certDir);
    },
    filename: (req, file, cb) => {
        // Mantener extensión original
        const ext = path.extname(file.originalname);
        const timestamp = Date.now();
        cb(null, `certificate-${timestamp}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Solo permitir archivos .p12 y .pfx
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.p12' || ext === '.pfx') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos .p12 o .pfx'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB máximo
    }
});

/**
 * GET /api/certificates/status
 * Verificar si hay un certificado cargado y su estado
 */
router.get('/status', async (req, res) => {
    try {
        const certPath = process.env.CERT_PATH;
        const certPassword = process.env.CERT_PASSWORD;
        const tsaUrl = process.env.TSA_URL;

        // Verificar si existe configuración de certificado
        if (!certPath || !fs.existsSync(certPath)) {
            return res.json({
                certificateAvailable: false,
                tsaUrl: tsaUrl || null,
                message: 'No hay certificado configurado'
            });
        }

        // Verificar servicio Python
        const pythonSigner = new PythonSignerClient();
        const isHealthy = await pythonSigner.healthCheck();

        if (!isHealthy) {
            return res.json({
                certificateAvailable: true,
                certificatePath: certPath,
                tsaUrl: tsaUrl,
                pythonServiceAvailable: false,
                message: 'Certificado configurado pero servicio Python no disponible'
            });
        }

        // Verificar certificado con el servicio Python
        try {
            const certInfo = await pythonSigner.verifyCertificate(certPath, certPassword);

            if (certInfo.success && certInfo.certificate.valid) {
                return res.json({
                    certificateAvailable: true,
                    pythonServiceAvailable: true,
                    certificateInfo: {
                        subject: certInfo.certificate.subject,
                        issuer: certInfo.certificate.issuer,
                        validFrom: certInfo.certificate.not_before,
                        validTo: certInfo.certificate.not_after,
                        serialNumber: certInfo.certificate.serial_number,
                        algorithm: certInfo.certificate.algorithm,
                        isValid: true
                    },
                    tsaUrl: tsaUrl
                });
            } else {
                return res.json({
                    certificateAvailable: false,
                    pythonServiceAvailable: true,
                    message: 'Certificado inválido o expirado',
                    error: certInfo.error
                });
            }
        } catch (error) {
            return res.json({
                certificateAvailable: false,
                pythonServiceAvailable: true,
                message: 'Error al verificar certificado',
                error: error.message
            });
        }

    } catch (error) {
        console.error('Error al verificar estado del certificado:', error);
        res.status(500).json({
            error: 'Error al verificar certificado',
            message: error.message
        });
    }
});

/**
 * POST /api/certificates/upload
 * Subir un nuevo certificado P12/PFX
 */
router.post('/upload', upload.single('certificate'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se recibió ningún archivo'
            });
        }

        const { password } = req.body;

        if (!password) {
            // Eliminar archivo subido
            fs.unlinkSync(req.file.path);

            return res.status(400).json({
                success: false,
                error: 'Se requiere la contraseña del certificado'
            });
        }

        console.log('📄 Certificado recibido:', req.file.filename);

        // Verificar servicio Python
        const pythonSigner = new PythonSignerClient();
        const isHealthy = await pythonSigner.healthCheck();

        if (!isHealthy) {
            // Eliminar archivo
            fs.unlinkSync(req.file.path);

            return res.status(503).json({
                success: false,
                error: 'Servicio de firma Python no disponible',
                details: 'Asegúrate de que el microservicio Python esté ejecutándose'
            });
        }

        // Intentar verificar el certificado con la contraseña proporcionada
        try {
            const certInfo = await pythonSigner.verifyCertificate(req.file.path, password);

            if (!certInfo.success || !certInfo.certificate.valid) {
                // Eliminar archivo
                fs.unlinkSync(req.file.path);

                return res.status(400).json({
                    success: false,
                    error: 'El certificado está expirado o no es válido',
                    details: certInfo.error || 'Certificado inválido'
                });
            }

            // Actualizar .env con la nueva ruta y contraseña
            const envPath = resolveFromRoot('backend', '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');

            // Ruta relativa desde la raíz del proyecto
            const relativePath = path.relative(PATHS.ROOT, req.file.path).replace(/\\/g, '/');

            envContent = envContent
                .replace(/CERT_PATH=.*/, `CERT_PATH=${relativePath}`)
                .replace(/CERT_PASSWORD=.*/, `CERT_PASSWORD=${password}`);

            fs.writeFileSync(envPath, envContent);

            // Recargar variables de entorno
            process.env.CERT_PATH = relativePath;
            process.env.CERT_PASSWORD = password;

            console.log('✅ Certificado cargado y configurado exitosamente');

            res.json({
                success: true,
                message: 'Certificado cargado exitosamente',
                certificateInfo: {
                    subject: certInfo.certificate.subject,
                    issuer: certInfo.certificate.issuer,
                    validFrom: certInfo.certificate.not_before,
                    validTo: certInfo.certificate.not_after,
                    algorithm: certInfo.certificate.algorithm,
                    isValid: true
                }
            });

        } catch (error) {
            // Error al cargar el certificado (probablemente contraseña incorrecta)
            console.error('Error al verificar certificado:', error);

            // Eliminar archivo
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(400).json({
                success: false,
                error: 'No se pudo verificar el certificado. Verifica la contraseña.',
                details: error.message
            });
        }

    } catch (error) {
        console.error('Error al procesar certificado:', error);

        // Limpiar archivo si existe
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Error al procesar el certificado',
            message: error.message
        });
    }
});

/**
 * POST /api/certificates/tsa-config
 * Configurar URL del servidor de timestamp (TSA)
 */
router.post('/tsa-config', async (req, res) => {
    try {
        const { tsaUrl } = req.body;

        if (!tsaUrl) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere la URL del TSA'
            });
        }

        // Validar que sea una URL válida
        try {
            new URL(tsaUrl);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'URL del TSA inválida'
            });
        }

        // Actualizar .env
        const envPath = resolveFromRoot('backend', '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        envContent = envContent.replace(/TSA_URL=.*/, `TSA_URL=${tsaUrl}`);
        fs.writeFileSync(envPath, envContent);

        // Recargar variables de entorno
        process.env.TSA_URL = tsaUrl;

        console.log('✅ URL del TSA configurada:', tsaUrl);

        res.json({
            success: true,
            message: 'URL del TSA configurada exitosamente',
            tsaUrl: tsaUrl
        });

    } catch (error) {
        console.error('Error al configurar TSA:', error);
        res.status(500).json({
            success: false,
            error: 'Error al configurar TSA',
            message: error.message
        });
    }
});

/**
 * GET /api/certificates/info
 * Obtener información detallada del certificado actual
 */
router.get('/info', async (req, res) => {
    try {
        const certPath = process.env.CERT_PATH;
        const certPassword = process.env.CERT_PASSWORD;

        if (!certPath || !fs.existsSync(certPath)) {
            return res.status(404).json({
                error: 'No hay certificado configurado'
            });
        }

        // Verificar servicio Python
        const pythonSigner = new PythonSignerClient();
        const isHealthy = await pythonSigner.healthCheck();

        if (!isHealthy) {
            return res.status(503).json({
                error: 'Servicio de firma Python no disponible'
            });
        }

        // Obtener información del certificado
        const certInfo = await pythonSigner.verifyCertificate(certPath, certPassword);

        if (!certInfo.success) {
            return res.status(400).json({
                error: 'Error al obtener información del certificado',
                details: certInfo.error
            });
        }

        const validTo = new Date(certInfo.certificate.not_after);
        const now = new Date();
        const daysUntilExpiration = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));

        res.json({
            subject: certInfo.certificate.subject,
            issuer: certInfo.certificate.issuer,
            validFrom: certInfo.certificate.not_before,
            validTo: certInfo.certificate.not_after,
            serialNumber: certInfo.certificate.serial_number,
            algorithm: certInfo.certificate.algorithm,
            isValid: certInfo.certificate.valid,
            daysUntilExpiration: daysUntilExpiration
        });

    } catch (error) {
        console.error('Error al obtener información del certificado:', error);
        res.status(500).json({
            error: 'Error al obtener información del certificado',
            message: error.message
        });
    }
});

module.exports = router;
