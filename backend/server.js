const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

// =============================================
// CONFIGURACIÓN CENTRALIZADA DE RUTAS
// =============================================
const { PATHS, validatePaths } = require('./config/paths');

// Validar configuración al iniciar
validatePaths();

// =============================================
// IMPORTAR NUEVOS CONTROLADORES Y MIDDLEWARE
// =============================================
const foldersController = require('./controllers/folders-controller');
const documentsController = require('./controllers/documents-controller');
const signaturesController = require('./controllers/signatures-controller');
const certificatesController = require('./controllers/certificates-controller');
const { requestLogger } = require('./middleware/auth');
const { embedValuesInPdf } = require('./lib/pdf/embed-values');
const PythonSignerClient = require('./lib/signatures/python-signer-client');

// =============================================
// NUEVOS CONTROLADORES PARA ACROFORM
// =============================================
const templatesController = require('./controllers/templates-controller');
const bulkSendEnhanced = require('./controllers/bulk-send-controller-enhanced');
const teamsController = require('./controllers/teams-controller');
const tenantsController = require('./controllers/tenants-controller');

const app = express();
const port = 3000;

// Configurar multer para subir avatares
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = PATHS.AVATARS_DIR;
        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único: userId_timestamp.extension
        const userId = req.body.userId || 'temp';
        const ext = path.extname(file.originalname);
        cb(null, `avatar_${userId}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB máximo
    fileFilter: function (req, file, cb) {
        // Solo permitir imágenes
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// =============================================
// CONFIGURAR MULTER PARA PLANTILLAS PDF
// =============================================
const templateStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(PATHS.UPLOADS_DIR, 'templates');
        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `template-${uniqueSuffix}-${file.originalname}`);
    }
});

const uploadTemplate = multer({
    storage: templateStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    }
});

// =============================================
// MIDDLEWARES DE AUTENTICACIÓN Y SESIONES
// =============================================
// Aumentar límite de tamaño de payload para archivos grandes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());  // IMPORTANTE: Para leer cookies JWT

// CORS con credenciales habilitadas para JWT en cookies
app.use(cors({
    credentials: true,  // Permitir envío de cookies
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000']  // Tu dominio frontend
}));

// Servir carpeta frontend completa para acceder a script.js e img
// JS y HTML con no-cache para que los cambios lleguen de inmediato
app.use(express.static(PATHS.FRONTEND, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));
// Servir carpeta de uploads para acceder a documentos y firmas
app.use('/uploads', express.static(PATHS.UPLOADS_DIR));

// Redireccion permanente para QR codes generados con URL antigua /Main/verify.html
app.get('/Main/verify.html', (req, res) => {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    res.redirect(301, `/public/Main/verify.html${qs}`);
});

// =============================================
// RUTAS DE FIRMAS
// =============================================
app.use('/api/signatures', signaturesController);

// =============================================
// RUTAS DE ENVÍO MASIVO (Original)
// =============================================
const bulkSendController = require('./controllers/bulk-send-controller');
console.log('📊 Registrando rutas de envío masivo...');
app.use('/api/signatures', bulkSendController);
console.log('✅ Rutas de envío masivo registradas');

// =============================================
// RUTAS DE TEMPLATES (AcroForm)
// =============================================
const { requireAuth } = require('./middleware/auth');

// Upload plantilla PDF con campos
app.post('/api/templates/upload',
    requireAuth,
    uploadTemplate.single('template'),
    templatesController.uploadTemplate
);

// Listar plantillas (SIN AUTH para pruebas)
app.get('/api/templates',
    templatesController.getTemplates
);

// Obtener detalles de una plantilla (SIN AUTH para pruebas)
app.get('/api/templates/:id',
    templatesController.getTemplateById
);

// Extraer etiquetas de campos del PDF
app.get('/api/templates/:id/extract-labels',
    templatesController.extractFieldLabels
);

// Obtener solo campos de una plantilla (SIN AUTH para pruebas)
app.get('/api/templates/:id/fields',
    templatesController.getTemplateFields
);

// Guardar campos visuales desde el editor (SIN AUTH para pruebas)
app.post('/api/templates/:id/fields',
    templatesController.saveVisualFields
);

// Actualizar campo
app.put('/api/templates/fields/:fieldId',
    requireAuth,
    templatesController.updateTemplateField
);

// Eliminar plantilla
app.delete('/api/templates/:id',
    requireAuth,
    templatesController.deleteTemplate
);

// Rellenar plantilla con datos dinámicos
app.post('/api/documents/fill-template',
    requireAuth,
    templatesController.fillTemplate
);

// =============================================
// RUTAS DE BULK SEND ENHANCED (con mapeo)
// =============================================
app.use('/api/bulk', requireAuth, bulkSendEnhanced);

console.log('✅ Rutas de templates y bulk enhanced registradas');

// Rutas para las páginas HTML
const { resolveFromRoot } = require('./config/paths');

app.get('/', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'login.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'index.html'));
});

app.get('/config.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'config.html'));
});

app.get('/sign.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'sign.html'));
});

// Health check endpoint para Docker
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        service: 'FirmaLegal Online'
    });
});

app.get('/folder.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'folder.html'));
});

app.get('/tracking.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'tracking.html'));
});

app.get('/public-sign.html', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'public-sign.html'));
});

app.get('/bulk-send.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'bulk-send.html'));
});

app.get('/verify.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'verify.html'));
});

app.get('/baul-equipo.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'baul-equipo.html'));
});

// ✅ Pool de conexiones MySQL con reconexión automática
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'firmalegalonline',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

// Verificar conexión inicial
db.getConnection((err, connection) => {
    if (err) {
        console.error('🔴 Error al conectar a MySQL:', err);
        return;
    }
    console.log("🟢 Conectado a MariaDB (Pool de conexiones)");
    connection.release(); // Devolver conexión al pool
});

// =============================================
// COMPARTIR CONEXIÓN DB CON CONTROLADORES
// =============================================
app.locals.db = db;

// =============================================
// ✅ FUNCIONES AUXILIARES PARA PAGARÉS
// =============================================
const mailerDynamic = require('./lib/email/mailer-dynamic');

/**
 * Verificar si un viewer group de pagaré está completado
 * Si todos los recipients completaron, verificar si todos los viewer groups completaron
 * Si todos completaron, notificar al firmante definitivo
 */
async function checkPagareCompletion(viewerGroupId, documentId) {
    try {
        console.log(`\n📋 Verificando completado de viewer_group ${viewerGroupId}`);

        // 1. Verificar si todos los recipients del viewer_group completaron
        const [recipients] = await db.promise().query(
            `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
             FROM document_recipients
             WHERE viewer_group_id = ?`,
            [viewerGroupId]
        );

        // Convertir a números para evitar problemas de tipos (MySQL puede devolver strings)
        const total = Number(recipients[0].total);
        const completed = Number(recipients[0].completed);
        console.log(`   Recipients: ${completed}/${total} completados`);

        if (completed === total && total > 0) {
            // Todos los recipients del viewer_group completaron
            console.log(`   ✅ Viewer group ${viewerGroupId} COMPLETADO - Actualizando estado...`);

            // Actualizar estado del viewer_group
            const [updateResult] = await db.promise().query(
                `UPDATE pagare_viewer_groups SET status = 'completed', completed_at = NOW() WHERE viewer_group_id = ?`,
                [viewerGroupId]
            );
            console.log(`   🔍 [DEBUG] UPDATE result:`, updateResult);
            console.log(`   🔍 [DEBUG] Affected rows: ${updateResult.affectedRows}`);

            // Opcional: Crear evento de log (si la tabla existe)
            try {
                await db.promise().query(
                    `INSERT INTO pagare_events (viewer_group_id, event_type, event_data)
                     VALUES (?, 'viewer_group_completed', ?)`,
                    [viewerGroupId, `Viewer group completado - ${total} firmante(s) finalizaron`]
                );
            } catch (eventError) {
                console.log('   ℹ️ No se pudo crear evento (tabla pagare_events no disponible)');
            }

            // 2. Verificar si TODOS los viewer_groups del documento completaron
            const [viewerGroups] = await db.promise().query(
                `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                 FROM pagare_viewer_groups
                 WHERE document_id = ?`,
                [documentId]
            );

            // Convertir a números para evitar problemas de tipos
            const totalGroups = Number(viewerGroups[0].total);
            const completedGroups = Number(viewerGroups[0].completed);
            console.log(`\n   📊 Viewer groups del documento: ${completedGroups}/${totalGroups} completados`);

            if (completedGroups === totalGroups && totalGroups > 0) {
                // TODOS los viewer_groups completaron
                console.log(`   🎉 TODOS LOS PAGARÉS COMPLETADOS - Notificando al firmante definitivo`);

                await notifyFinalSigner(documentId);
            }
        }

    } catch (error) {
        console.error('❌ Error en checkPagareCompletion:', error);
    }
}

/**
 * Notificar al firmante definitivo que todos los pagarés están completados
 */
async function notifyFinalSigner(documentId) {
    try {
        console.log(`\n⚖️ Notificando al firmante definitivo - Documento ${documentId}`);

        // Obtener información del documento
        const [docs] = await db.promise().query(
            `SELECT d.title as name, d.owner_id as user_id, d.document_type
             FROM documents d
             WHERE d.document_id = ?`,
            [documentId]
        );

        if (docs.length === 0) {
            console.error('❌ Documento no encontrado');
            return;
        }

        const document = docs[0];

        // Obtener todos los viewer_groups completados
        const [viewerGroups] = await db.promise().query(
            `SELECT vg.viewer_group_id, vg.viewer_id, vg.completed_at
             FROM pagare_viewer_groups vg
             WHERE vg.document_id = ? AND vg.status = 'completed'
             ORDER BY vg.viewer_id`,
            [documentId]
        );

        // Obtener información del firmante definitivo (desde metadata del documento)
        const [metadata] = await db.promise().query(
            `SELECT final_signer_email, final_signer_name, final_signer_token
             FROM pagare_metadata
             WHERE document_id = ?`,
            [documentId]
        );

        if (metadata.length === 0 || !metadata[0].final_signer_email) {
            console.error('❌ No se encontró metadata del firmante definitivo');
            return;
        }

        const finalSignerEmail = metadata[0].final_signer_email;
        const finalSignerName = metadata[0].final_signer_name;
        const finalSignerToken = metadata[0].final_signer_token;

        // 🔐 VERIFICAR SI EL OWNER ESTÁ VINCULADO A VI
        let ownerVinculadoVI = false;
        try {
            const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
            const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
            const checkUrl = new URL(`${VI_URL}/validacion/api/firmalegal/check-vinculacion/${document.user_id}`);
            const transport = checkUrl.protocol === 'https:' ? require('https') : require('http');
            const checkResult = await new Promise((resolve) => {
                const r = transport.request({ hostname: checkUrl.hostname, port: checkUrl.port || 80, path: checkUrl.pathname, method: 'GET', headers: { 'X-Internal-Api-Key': VI_API_KEY } }, (resp) => {
                    let d = '';
                    resp.on('data', c => d += c);
                    resp.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
                });
                r.on('error', () => resolve({}));
                r.setTimeout(4000, () => { r.destroy(); resolve({}); });
                r.end();
            });
            ownerVinculadoVI = checkResult.vinculado === true;
        } catch (_) {}
        console.log(`   🔐 [notifyFinalSigner] Owner vinculado a VI: ${ownerVinculadoVI}`);

        // Si el owner está vinculado a VI, verificar si el firmante definitivo ya está validado
        let finalSignerViVerified = false;
        if (ownerVinculadoVI) {
            try {
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const [viRows] = await db.promise().query(
                    `SELECT vi_validated_at FROM vi_verified_emails
                     WHERE email = ? AND vi_validated_at >= ?`,
                    [finalSignerEmail.toLowerCase(), oneYearAgo]
                );
                if (viRows.length > 0) {
                    finalSignerViVerified = true;
                } else {
                    const [viRowsDR] = await db.promise().query(
                        `SELECT MAX(vi_validated_at) as vi_validated_at FROM document_recipients
                         WHERE email = ? AND vi_validated_at IS NOT NULL AND vi_validated_at >= ?`,
                        [finalSignerEmail.toLowerCase(), oneYearAgo]
                    );
                    finalSignerViVerified = !!(viRowsDR[0]?.vi_validated_at);
                }
            } catch (_) {}
            console.log(`   🔐 [notifyFinalSigner] Firmante definitivo VI verificado: ${finalSignerViVerified}`);
        }

        // 🔥 CREAR document_recipient para el firmante definitivo (si no existe)
        const [existingRecipient] = await db.promise().query(
            `SELECT recipient_id, status FROM document_recipients
             WHERE document_id = ? AND is_final_signer = 1 AND email = ?`,
            [documentId, finalSignerEmail]
        );

        let recipientId;
        if (existingRecipient.length === 0) {
            // Determinar status: 'pending' si owner vinculado a VI y firmante no verificado
            const initialStatus = (ownerVinculadoVI && !finalSignerViVerified) ? 'pending' : 'sent';
            // Crear nuevo recipient para firmante definitivo (sin columnas role y viewer_group_id)
            const [result] = await db.promise().query(
                `INSERT INTO document_recipients
                 (document_id, email, name, token, status, is_final_signer)
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [documentId, finalSignerEmail, finalSignerName, finalSignerToken, initialStatus]
            );
            recipientId = result.insertId;
            console.log(`   ✅ Recipient creado para firmante definitivo (ID: ${recipientId}, status: ${initialStatus})`);

            // Si queda pendiente de VI, no enviar email — el vi-callback lo activará al completar
            if (initialStatus === 'pending') {
                console.log(`   ⏳ Firmante definitivo requiere VI — email diferido hasta que complete validación`);
                return;
            }
        } else {
            recipientId = existingRecipient[0].recipient_id;
            const existingStatus = existingRecipient[0].status;
            console.log(`   ℹ️ Recipient ya existe para firmante definitivo (ID: ${recipientId}, status: ${existingStatus})`);

            // Si estaba pendiente y ahora está 'sent' (actualizado por vi-callback), proceder a enviar email
            // Si sigue pendiente (no debería llegar aquí sin VI verificado), salir
            if (existingStatus === 'pending') {
                console.log(`   ⏳ Firmante definitivo aún pendiente de VI — omitiendo envío`);
                return;
            }
        }

        // 🔥 GENERAR PDF CENSURADO PARA FIRMANTE DEFINITIVO
        // ⚠️ SOLO para pagarés con envío masivo (múltiples viewer_groups)
        console.log(`\n📄 Generando PDF censurado para firmante definitivo...`);

        try {
            const fs = require('fs');
            const path = require('path');
            const { PDFDocument, rgb } = require('pdf-lib');

            // Verificar que sea un pagaré con múltiples viewer_groups (envío masivo)
            const [docInfo] = await db.promise().query(
                `SELECT d.file_path, d.document_type,
                        (SELECT COUNT(*) FROM pagare_viewer_groups WHERE document_id = d.document_id) as viewer_count
                 FROM documents d
                 WHERE d.document_id = ?`,
                [documentId]
            );

            if (docInfo.length === 0 || !docInfo[0].file_path) {
                throw new Error('file_path no encontrado');
            }

            // ✅ VALIDACIÓN: Solo censurar si es pagaré con envío masivo
            if (docInfo[0].document_type !== 'pagare') {
                console.log(`   ℹ️  No es pagaré, saltando censura`);
                throw new Error('SKIP_CENSURA');
            }

            if (docInfo[0].viewer_count <= 1) {
                console.log(`   ℹ️  Pagaré con ${docInfo[0].viewer_count} viewer(s), no es envío masivo, saltando censura`);
                throw new Error('SKIP_CENSURA');
            }

            console.log(`   ✅ Pagaré con envío masivo (${docInfo[0].viewer_count} viewer_groups) - Procediendo con censura`);

            const pdfPath = docInfo[0].file_path;
            const cleanPath = pdfPath.startsWith('/') ? pdfPath.substring(1) : pdfPath;
            const fullPdfPath = resolveFromRoot(cleanPath);

            if (!fs.existsSync(fullPdfPath)) {
                throw new Error(`PDF no encontrado: ${fullPdfPath}`);
            }

            console.log(`   ✅ PDF base: ${fullPdfPath}`);

            // Cargar el PDF
            const pdfBytes = fs.readFileSync(fullPdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);

            // Obtener campos sensibles (text y signature regulares)
            const [textFields] = await db.promise().query(
                `SELECT field_type, page_number, x_position, y_position, width, height
                 FROM document_fields
                 WHERE document_id = ? AND field_type IN ('text', 'signature')`,
                [documentId]
            );

            console.log(`   🔒 Censurando ${textFields.length} campos...`);

            // Censurar cada campo
            for (const field of textFields) {
                const pageNum = field.page_number - 1;
                if (pageNum >= 0 && pageNum < pdfDoc.getPageCount()) {
                    const page = pdfDoc.getPage(pageNum);
                    const { height: pageHeight } = page.getSize();

                    const x = parseFloat(field.x_position);
                    const y = pageHeight - parseFloat(field.y_position) - parseFloat(field.height);
                    const width = parseFloat(field.width);
                    const height = parseFloat(field.height);

                    // Rectángulo blanco
                    page.drawRectangle({
                        x, y, width, height,
                        color: rgb(1, 1, 1),
                        borderColor: rgb(0.8, 0.8, 0.8),
                        borderWidth: 1
                    });

                    // Texto censurado (sin emojis para compatibilidad WinAnsi)
                    page.drawText('*** PROTEGIDO ***', {
                        x: x + 5,
                        y: y + (height / 2) - 5,
                        size: 9,
                        color: rgb(0.5, 0.5, 0.5)
                    });
                }
            }

            // Guardar PDF censurado
            const censoredPdfBytes = await pdfDoc.save();
            const censoredFilename = `final_signer_${documentId}_${Date.now()}.pdf`;
            const intermediatePdfDir = resolveFromRoot('uploads', 'signed');

            if (!fs.existsSync(intermediatePdfDir)) {
                fs.mkdirSync(intermediatePdfDir, { recursive: true });
            }

            const censoredPdfPath = path.join(intermediatePdfDir, censoredFilename);
            fs.writeFileSync(censoredPdfPath, censoredPdfBytes);

            const relativeCensoredPath = path.join('uploads', 'signed', censoredFilename);

            // Actualizar custom_pdf_path
            await db.promise().query(
                `UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?`,
                [relativeCensoredPath, recipientId]
            );

            console.log(`   ✅ PDF censurado: ${relativeCensoredPath}`);
            console.log(`   ✅ ${textFields.length} campos censurados`);

        } catch (pdfError) {
            if (pdfError.message !== 'SKIP_CENSURA') {
                console.error(`   ⚠️ Error:`, pdfError.message);
            }
        }

        // Obtener configuración de email del usuario
        const [emailConfigs] = await db.promise().query(
            `SELECT * FROM email_config WHERE user_id = ? LIMIT 1`,
            [document.user_id]
        );

        if (emailConfigs.length === 0) {
            console.warn('⚠️ Usuario no tiene configuración de email');
            return;
        }

        const userConfig = emailConfigs[0];
        const APP_URL = process.env.APP_URL || 'http://localhost:3000';

        // Construir lista de pagarés completados con nombres de destinatarios
        const pagaresListPromises = viewerGroups.map(async (vg) => {
            const completedDate = new Date(vg.completed_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });

            // Obtener nombres de los destinatarios de este viewer_group
            const [recipients] = await db.promise().query(
                `SELECT name FROM document_recipients
                 WHERE document_id = ? AND viewer_group_id = ? AND is_final_signer = 0
                 ORDER BY name`,
                [documentId, vg.viewer_group_id]
            );

            const recipientNames = recipients.map(r => r.name).join(', ') || 'Sin destinatarios';

            return `<li style="padding: 16px; margin-bottom: 12px; background: #f8fffe; border-left: 4px solid #10b981; border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <strong style="color: #065f46; font-size: 15px;">Pagaré #${vg.viewer_id}</strong>
                    <span style="background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">COMPLETADO</span>
                </div>
                <div style="font-size: 13px; color: #374151; margin-bottom: 4px;">
                    <strong>Destinatarios:</strong> ${recipientNames}
                </div>
                <div style="font-size: 12px; color: #6b7280;">
                    <strong>Fecha de firma:</strong> ${completedDate}
                </div>
            </li>`;
        });

        const pagaresListArray = await Promise.all(pagaresListPromises);
        const pagaresList = pagaresListArray.join('');

        const subject = `Firma Definitiva Requerida: ${viewerGroups.length} Pagare(s) Completado(s)`;

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background-color: #f3f4f6;
            padding: 20px;
        }
        .container {
            max-width: 640px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07), 0 10px 15px rgba(0, 0, 0, 0.05);
        }
        .header {
            background: linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header-icon {
            font-size: 48px;
            margin-bottom: 12px;
            display: block;
        }
        .header h1 {
            margin: 0;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
        }
        .header p {
            margin: 8px 0 0;
            font-size: 14px;
            opacity: 0.95;
            font-weight: 400;
        }
        .content {
            background: white;
            padding: 40px 30px;
        }
        .greeting {
            font-size: 16px;
            color: #374151;
            margin-bottom: 20px;
        }
        .document-info {
            background: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 16px 20px;
            margin: 24px 0;
            border-radius: 6px;
        }
        .document-info p {
            margin: 4px 0;
            font-size: 14px;
            color: #065f46;
        }
        .stats-badge {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 6px 16px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            margin: 16px 0;
        }
        .pagares-list {
            background: #fafafa;
            border-radius: 10px;
            padding: 24px 20px;
            margin: 28px 0;
            border: 1px solid #e5e7eb;
        }
        .pagares-list h3 {
            margin: 0 0 20px 0;
            color: #065f46;
            font-size: 16px;
            font-weight: 700;
        }
        .pagares-list ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .cta-section {
            text-align: center;
            margin: 32px 0 24px;
            padding: 24px 0;
        }
        .cta-text {
            font-size: 15px;
            color: #374151;
            margin-bottom: 20px;
            font-weight: 500;
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: #ffffff !important;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 700;
            font-size: 16px;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            transition: all 0.3s ease;
            letter-spacing: 0.3px;
        }
        .button:hover {
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
            box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        .note {
            background: #fffbeb;
            border-left: 3px solid #f59e0b;
            padding: 14px 18px;
            margin: 24px 0;
            border-radius: 6px;
            font-size: 13px;
            color: #92400e;
        }
        .note strong {
            color: #78350f;
        }
        .footer {
            text-align: center;
            padding: 24px 30px;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
        }
        .footer p {
            margin: 4px 0;
        }
        .footer-logo {
            font-weight: 700;
            color: #059669;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="header-icon">⚖️</span>
            <h1>Firma Definitiva Requerida</h1>
            <p>Todos los pagarés han sido completados y requieren tu autorización</p>
        </div>

        <div class="content">
            <p class="greeting">Estimado/a <strong>${finalSignerName || 'Firmante Definitivo'}</strong>,</p>

            <div class="document-info">
                <p><strong>📄 Documento:</strong> ${document.name}</p>
                <p><strong>✅ Estado:</strong> Todas las firmas completadas</p>
            </div>

            <div style="text-align: center;">
                <span class="stats-badge">${viewerGroups.length} Pagaré${viewerGroups.length > 1 ? 's' : ''} Completado${viewerGroups.length > 1 ? 's' : ''}</span>
            </div>

            <div class="pagares-list">
                <h3>📋 Pagarés listos para firma definitiva:</h3>
                <ul>
                    ${pagaresList}
                </ul>
            </div>

            <div class="cta-section">
                <p class="cta-text">Haz clic en el siguiente botón para acceder al sistema y aplicar tu firma definitiva:</p>
                <a href="${APP_URL}/public-sign.html?token=${finalSignerToken}" class="button" style="color: #ffffff !important;">
                    Firmar Definitivamente
                </a>
            </div>

            <div class="note">
                <strong>⚠️ Importante:</strong> Tu firma sellará de forma definitiva los ${viewerGroups.length} pagaré${viewerGroups.length > 1 ? 's' : ''} completado${viewerGroups.length > 1 ? 's' : ''}, finalizando todo el proceso de firma electrónica.
            </div>

            <div style="background: #f8f9fa; padding: 25px; margin: 30px 0; border-radius: 8px; border-top: 3px solid #059669;">
                <h4 style="color: #065f46; font-size: 15px; margin: 0 0 12px; font-weight: 700;">LA FIRMA ELECTRÓNICA</h4>
                <p style="font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6;">
                    Deberá entenderse como un acuerdo de voluntades contenidas en un documento electrónico o mensaje de datos, y aceptación previa de verificación que deberá hacerse con una contraseña, código o dato biométrico que permita la validación de identidad del firmante.
                    <em>"Artículo 3° Cumplimiento del Requisito de Firma. Cuando se exija la firma de una persona, ese requisito quedará cumplido en relación con un mensaje de datos si se utiliza una firma electrónica que, a la luz de todas las circunstancias del caso, incluido cualquier acuerdo aplicable, sea tan confiable como apropiada para los fines con los cuales se generó o comunicó ese mensaje."</em>
                </p>

                <h4 style="color: #065f46; font-size: 15px; margin: 20px 0 12px; font-weight: 700;">📜 MARCO LEGAL</h4>
                <p style="font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6;">
                    El Decreto 2364 de 2012, que reglamenta el artículo 7 de la Ley 527 de 1999, define la firma electrónica como aquel método implementado para identificar a una persona y su voluntad para un fin específico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un contrato, documento o mensaje electrónico. Para que la firma electrónica genere efectos legales, deberá cumplir los mismos requisitos que tiene cualquier contrato físico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen idénticos efectos.
                </p>

                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong>⚖️ CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE</strong><br>
                    PKI SERVICES S.A.S. debe dar cumplimiento al artículo 83 de la constitución política colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades públicas deberán ceñirse a los postulados de buena fe, la cual se presumirá en todas las gestiones que aquéllos adelanten ante éstas."
                </p>
                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong>⚠️ FALSEDAD EN DOCUMENTO PRIVADO</strong><br>
                    Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, por la cual se expide el Código Penal. Artículo 289. Falsedad en documento privado: "El que falsifique documento privado que pueda servir de prueba, incurrirá, si lo usa, en prisión de uno (1) a seis (6) años."
                </p>
                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong>© DERECHOS DE AUTOR</strong><br>
                    Todo el contenido de los correos, comunicaciones y funcionalidad de las plataformas ofrecidas por PKI SERVICES, son de su propiedad de ésta, de conformidad a lo dispuesto en el artículo 539 del Código de Comercio, así como en el artículo 20 y concordantes de la Ley 23 de 1982.
                </p>
                <p style="font-size: 12px; color: #6c757d; margin: 20px 0 10px; line-height: 1.6;">
                    <strong>🏛️ ACREDITACIÓN ONAC</strong><br>
                    PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACIÓN DE COLOMBIA (ONAC).
                </p>
                <p style="font-size: 12px; color: #6c757d; margin: 10px 0; line-height: 1.6;">
                    Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atención al cliente en:<br>
                    <a href="https://pkiservices.co/soporte/?wpsc-section=ticket-list" style="color: #059669; font-weight: 600;">🔗 Soporte PKI Services</a>
                </p>
            </div>
        </div>

        <div class="footer">
            <p class="footer-logo">FirmaLegal Online</p>
            <p>Plataforma de Firma Electrónica Segura</p>
            <p style="margin-top: 12px; font-size: 11px; opacity: 0.8;">
                Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener información confidencial sometida a secreto profesional. No está permitida su reproducción o distribución sin la autorización expresa. Si usted no es el destinatario final por favor elimínelo e infórmenos por este mismo medio.
            </p>
            <p style="margin-top: 8px; font-size: 11px; opacity: 0.8;">
                De acuerdo con la Ley Estatutaria 1581 de 2012 de Protección de Datos y normas concordantes, le informamos que nuestra entidad cuenta con política para el tratamiento de los datos personales almacenados en sus bases de datos.
            </p>
            <p style="margin-top: 10px; font-size: 11px; opacity: 0.7;">© ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados</p>
        </div>
    </div>
</body>
</html>
        `.trim();

        // Construir lista de pagarés para texto plano
        const pagaresTextList = await Promise.all(viewerGroups.map(async (vg) => {
            const [recipients] = await db.promise().query(
                `SELECT name FROM document_recipients
                 WHERE document_id = ? AND viewer_group_id = ? AND is_final_signer = 0
                 ORDER BY name`,
                [documentId, vg.viewer_group_id]
            );
            const recipientNames = recipients.map(r => r.name).join(', ') || 'Sin destinatarios';
            const completedDate = new Date(vg.completed_at).toLocaleDateString('es-ES');
            return `  - Pagaré #${vg.viewer_id}\n    Destinatarios: ${recipientNames}\n    Completado: ${completedDate}`;
        }));

        const text = `
FIRMA DEFINITIVA REQUERIDA
================================

Estimado/a ${finalSignerName || 'Firmante Definitivo'},

Todos los firmantes han completado sus firmas en el documento: ${document.name}

RESUMEN
----------
Total de pagares completados: ${viewerGroups.length}

PAGARES LISTOS PARA FIRMA DEFINITIVA
----------------------------------------
${pagaresTextList.join('\n\n')}

ACCION REQUERIDA
-------------------
Por favor, accede al sistema para aplicar tu firma definitiva y sellar todos los documentos:

${APP_URL}/public-sign.html?token=${finalSignerToken}

IMPORTANTE
-------------
Tu firma sellara de forma definitiva los ${viewerGroups.length} pagare${viewerGroups.length > 1 ? 's' : ''} completado${viewerGroups.length > 1 ? 's' : ''}, finalizando todo el proceso de firma electronica.

═══════════════════════════════════════════════════════════

MARCO LEGAL

Ley 527 de 1999 y Decreto 2364 de 2012:
El Decreto 2364 de 2012, que reglamenta el artículo 7 de la Ley 527 de 1999, define la firma electrónica como aquel método implementado para identificar a una persona y su voluntad para un fin específico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.

Para que la firma electrónica genere efectos legales, deberá cumplir los mismos requisitos que tiene cualquier documento físico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen idénticos efectos.

CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE

PKI SERVICES S.A.S. debe dar cumplimiento al artículo 83 de la constitución política colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades públicas deberán ceñirse a los postulados de buena fe, la cual se presumirá en todas las gestiones que aquéllos adelanten ante éstas."

FALSEDAD EN DOCUMENTO PRIVADO

Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Artículo 289: "El que falsifique documento privado que pueda servir de prueba, incurrirá, si lo usa, en prisión de uno (1) a seis (6) años."

ACREDITACIÓN ONAC

PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACIÓN DE COLOMBIA (ONAC).

Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atención al cliente en:
Soporte PKI Services: https://pkiservices.co/soporte/?wpsc-section=ticket-list

═══════════════════════════════════════════════════════════

PKI SERVICES S.A.S.
Plataforma de Firma Electrónica Certificada

Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener información confidencial sometida a secreto profesional. No está permitida su reproducción o distribución sin la autorización expresa. Si usted no es el destinatario final por favor elimínelo e infórmenos por este mismo medio.

De acuerdo con la Ley Estatutaria 1581 de 2012 de Protección de Datos y normas concordantes, le informamos que nuestra entidad cuenta con política para el tratamiento de los datos personales almacenados en sus bases de datos.

© ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
        `.trim();

        const result = await mailerDynamic.sendEmailWithUserConfig(userConfig, {
            to: finalSignerEmail,
            subject,
            text,
            html
        });

        if (result.success) {
            console.log(`   ✅ Email de firma definitiva enviado a ${finalSignerEmail}`);

            // Opcional: Crear evento global (si la tabla existe)
            try {
                await db.promise().query(
                    `INSERT INTO pagare_events (viewer_group_id, event_type, event_data)
                     VALUES (?, 'final_signer_notified', ?)`,
                    [viewerGroups[0].viewer_group_id, `Firmante definitivo notificado: ${finalSignerEmail}`]
                );
            } catch (eventError) {
                console.log('   ℹ️ No se pudo crear evento (tabla pagare_events no disponible)');
            }
        } else {
            console.error(`   ❌ Error enviando email al firmante definitivo:`, result.error);
        }

    } catch (error) {
        console.error('❌ Error en notifyFinalSigner:', error);
    }
}


// =============================================
// MIDDLEWARE GLOBAL DE LOGGING
// =============================================
app.use(requestLogger);

// =============================================
// RUTAS DE ROLES DE FIRMANTES (ANTES DE DOCUMENTOS)
// Importante: NO registrar con '/api' porque causaría conflictos
// Las rutas se manejarán directamente desde el documentsController
// =============================================
// const rolesRoutes = require('./routes/roles-routes');
// console.log('🎭 Registrando rutas de roles de firmantes...');
// app.use('/api', rolesRoutes);
// console.log('✅ Rutas de roles registradas');

// =============================================
// NUEVAS RUTAS DE CARPETAS Y DOCUMENTOS
// =============================================
console.log('📁 Registrando rutas de carpetas y documentos...');
app.use('/api/folders', foldersController);
app.use('/api/documents', documentsController);
app.use('/api/templates', documentsController); // Alias para compatibilidad
app.use('/api/teams', teamsController);
app.use('/api/tenants', tenantsController);
console.log('✅ Rutas registradas exitosamente');

// =============================================
// RUTAS DE CONFIGURACIÓN DE EMAIL POR USUARIO
// =============================================
const emailConfigController = require('./controllers/email-config-controller');
console.log('📧 Registrando rutas de configuración de email...');
app.use('/api/email-config', emailConfigController);
console.log('✅ Rutas de email registradas');

// =============================================
// RUTAS DE CERTIFICADOS DIGITALES
// =============================================
console.log('🔐 Registrando rutas de certificados digitales...');
app.use('/api/certificates', certificatesController);
console.log('✅ Rutas de certificados registradas');
console.log('✅ Rutas de configuración de email registradas');

// =============================================
// RUTAS DE EMAIL (SENDGRID)
// =============================================
const mailer = require('./lib/email/mailer');

// =============================================
// ENDPOINT TEMPORAL PARA FORZAR VERIFICACIÓN
// =============================================
app.post('/api/debug/force-check-completion/:documentId', async (req, res) => {
    const { documentId } = req.params;
    console.log(`\n🔧 DEBUG: Forzando verificación de completado para documento ${documentId}`);

    try {
        // Obtener todos los viewer_groups del documento
        const [viewerGroups] = await db.promise().query(
            `SELECT viewer_group_id FROM pagare_viewer_groups WHERE document_id = ?`,
            [documentId]
        );

        console.log(`   📋 Viewer groups encontrados: ${viewerGroups.length}`);

        // Verificar cada uno
        for (const vg of viewerGroups) {
            await checkPagareCompletion(vg.viewer_group_id, documentId);
        }

        res.json({ success: true, message: 'Verificación completada', viewerGroupsChecked: viewerGroups.length });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint para verificar estado de configuración de email
app.get('/api/email/status', (req, res) => {
    console.log('\n📧 [EMAIL] GET /api/email/status');
    const status = mailer.getStatus();
    res.json({
        success: true,
        data: status
    });
});

// Endpoint para enviar email de prueba
app.post('/api/email/test', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/test');
    const { to } = req.body;

    if (!to) {
        return res.status(400).json({
            success: false,
            error: 'El campo "to" (email destino) es requerido'
        });
    }

    try {
        const result = await mailer.sendTestEmail(to);

        if (result.success) {
            res.json({
                success: true,
                message: `Email de prueba enviado exitosamente a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar email de prueba',
                details: result.error
            });
        }
    } catch (error) {
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

// Endpoint para enviar solicitud de firma
app.post('/api/email/signature-request', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/signature-request');
    const { to, recipientName, documentTitle, senderName, documentId } = req.body;

    // Validaciones
    if (!to || !recipientName || !documentTitle || !senderName || !documentId) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos',
            required: ['to', 'recipientName', 'documentTitle', 'senderName', 'documentId']
        });
    }

    try {
        const result = await mailer.sendSignatureRequest({
            to,
            recipientName,
            documentTitle,
            senderName,
            documentId
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Solicitud de firma enviada a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar solicitud de firma',
                details: result.error
            });
        }
    } catch (error) {
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

// Endpoint para notificar firma completada
app.post('/api/email/signature-completed', async (req, res) => {
    console.log('\n📧 [EMAIL] POST /api/email/signature-completed');
    const { to, recipientName, documentTitle, signerName, documentId } = req.body;

    // Validaciones
    if (!to || !recipientName || !documentTitle || !signerName || !documentId) {
        return res.status(400).json({
            success: false,
            error: 'Faltan campos requeridos',
            required: ['to', 'recipientName', 'documentTitle', 'signerName', 'documentId']
        });
    }

    try {
        const result = await mailer.sendSignatureCompleted({
            to,
            recipientName,
            documentTitle,
            signerName,
            documentId
        });

        if (result.success) {
            res.json({
                success: true,
                message: `Notificación de firma completada enviada a ${to}`,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error al enviar notificación',
                details: result.error
            });
        }
    } catch (error) {
        console.error('❌ [EMAIL] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al enviar email',
            message: error.message
        });
    }
});

console.log('✅ Rutas de email registradas exitosamente');

// =============================================
// INTEGRACIÓN CON VALIDACIÓN DE IDENTIDAD
// =============================================

// Endpoint Fase 2: inicia el flujo de validación de identidad para un firmante
// Verifica si el owner está vinculado a VI y devuelve la URL de validación
app.post('/api/integration/vi-iniciar', async (req, res) => {
    console.log('\n🔐 [INTEGRATION] POST /api/integration/vi-iniciar');

    const jwt = require('jsonwebtoken');
    let jwtUser;
    try {
        jwtUser = jwt.verify(req.cookies?.auth_token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ success: false, message: 'Sesión no encontrada' });
    }

    const { signer_email, signer_name, document_title, firma_token } = req.body;
    if (!signer_email || !firma_token) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
    const owner_firmalegal_user_id = jwtUser.userId || jwtUser.id || jwtUser.user_id;

    try {
        const viUrlParsed = new URL(`${VI_URL}/validacion/api/firmalegal/iniciar-validacion`);
        const transport = viUrlParsed.protocol === 'https:' ? require('https') : require('http');
        const body = JSON.stringify({ owner_firmalegal_user_id, signer_email, signer_name, document_title, firma_token });

        const viResp = await new Promise((resolve) => {
            const r = transport.request({
                hostname: viUrlParsed.hostname,
                port: viUrlParsed.port || 80,
                path: viUrlParsed.pathname,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': VI_API_KEY, 'Content-Length': Buffer.byteLength(body) }
            }, (resp) => {
                let data = '';
                resp.on('data', d => data += d);
                resp.on('end', () => { try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: resp.statusCode, body: {} }); } });
            });
            r.on('error', () => resolve({ status: 500, body: {} }));
            r.write(body);
            r.end();
        });

        if (viResp.status === 409) {
            return res.json({ success: false, needsVinculacion: true, message: viResp.body.message });
        }
        if (!viResp.body.success) {
            return res.status(400).json({ success: false, message: viResp.body.message || 'Error al iniciar validación' });
        }

        console.log('✅ [VI-INICIAR] URL de validación generada para:', signer_email);
        return res.json({ success: true, validacion_url: viResp.body.validacion_url });

    } catch (error) {
        console.error('❌ [VI-INICIAR] Error:', error);
        return res.status(500).json({ success: false, message: 'Error interno al iniciar validación' });
    }
});

// POST /api/integration/vi-skip
// El operador omite la validación VI: envía el email de firma y pone status='sent'.
// vi_validated_at queda NULL — la identidad NO queda verificada.
app.post('/api/integration/vi-skip', async (req, res) => {
    console.log('\n⏭️ [VI-SKIP] Omitir validación VI — enviar correo sin verificar identidad');
    const jwt = require('jsonwebtoken');
    let jwtUser;
    try {
        jwtUser = jwt.verify(req.cookies?.auth_token, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ success: false, message: 'Sesión no encontrada' });
    }

    const { recipient_token } = req.body;
    if (!recipient_token) return res.status(400).json({ success: false, message: 'Falta recipient_token' });

    try {
        // Obtener datos completos del recipient y documento
        const rows = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dr.recipient_id, dr.email, dr.name, dr.token,
                        d.title,
                        u.first_name, u.last_name, u.email as owner_email,
                        ec.email_from as sender_email, ec.email_from_name as sender_name,
                        ec.sendgrid_api_key
                 FROM document_recipients dr
                 INNER JOIN documents d ON dr.document_id = d.document_id
                 INNER JOIN users u ON d.owner_id = u.user_id
                 LEFT JOIN email_config ec ON u.user_id = ec.user_id
                 WHERE dr.token = ? AND d.owner_id = ?`,
                [recipient_token, jwtUser.userId || jwtUser.id],
                (err, results) => { if (err) reject(err); else resolve(results); }
            );
        });

        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Destinatario no encontrado' });
        }

        const r = rows[0];
        if (!r.sendgrid_api_key) {
            return res.status(400).json({ success: false, message: 'Configura SendGrid antes de enviar' });
        }

        // Enviar el email de firma (sin validación VI)
        const sendgrid = require('./lib/email/sendgrid');
        const signatureRequestTemplate = require('./lib/email/templates/signature-request-bulk');
        sendgrid.configureSendGrid(r.sendgrid_api_key);

        const signatureUrl = `${req.protocol}://${req.get('host')}/public-sign.html?token=${r.token}`;
        const appUrl = `${req.protocol}://${req.get('host')}`;
        const senderName = r.sender_name || `${r.first_name} ${r.last_name}`;
        const fromEmail = r.sender_email || r.owner_email;

        const htmlContent = signatureRequestTemplate({
            recipientName: r.name || r.email,
            documentTitle: r.title || 'Documento sin título',
            senderName,
            signatureUrl,
            appUrl
        });

        const sendResult = await sendgrid.sendBatchEmails([{
            to: r.email,
            from: fromEmail,
            fromName: `${senderName} (FirmaLegal)`,
            replyTo: fromEmail,
            subject: `Firma electronica requerida - ${r.title || 'Documento'}`,
            html: htmlContent,
            text: `Firma tu documento aqui: ${signatureUrl}`
        }]);

        if (!sendResult.success) {
            return res.status(500).json({ success: false, message: 'Error al enviar el email' });
        }

        // Actualizar status a 'sent' y sent_at. vi_validated_at queda NULL (identidad NO verificada)
        await new Promise((resolve, reject) => {
            db.query(
                `UPDATE document_recipients SET status = 'sent', sent_at = NOW() WHERE recipient_id = ?`,
                [r.recipient_id],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        console.log(`✅ [VI-SKIP] Correo enviado a ${r.email} — status=sent, vi_validated_at=NULL (identidad no verificada)`);
        res.json({ success: true });

    } catch (error) {
        console.error('❌ [VI-SKIP] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// GET /api/integration/vi-link-status
// Consulta si el usuario autenticado está vinculado a VI y devuelve el email de la cuenta VI vinculada
app.get('/api/integration/vi-link-status', requireAuth, async (req, res) => {
    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
    try {
        const checkUrl = new URL(`${VI_URL}/validacion/api/firmalegal/check-vinculacion/${req.userId}`);
        const transport = checkUrl.protocol === 'https:' ? require('https') : require('http');
        const result = await new Promise((resolve) => {
            const r = transport.request({
                hostname: checkUrl.hostname,
                port: checkUrl.port || 80,
                path: checkUrl.pathname,
                method: 'GET',
                headers: { 'X-Internal-Api-Key': VI_API_KEY }
            }, (resp) => {
                let data = '';
                resp.on('data', d => data += d);
                resp.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
            });
            r.on('error', () => resolve({}));
            r.end();
        });
        return res.json({
            vinculado: result.vinculado === true,
            validacion_user_id: result.validacion_user_id || null
        });
    } catch (err) {
        return res.json({ vinculado: false, validacion_user_id: null });
    }
});

// Endpoint para que un usuario solicite vinculación con Validación de Identidad
// Envía un email a firmalegalonline@pkiservices.co para que el admin gestione la vinculación
app.post('/api/integration/request-link', async (req, res) => {
    console.log('\n🔗 [INTEGRATION] POST /api/integration/request-link');

    // Verificar JWT desde cookie
    const jwt = require('jsonwebtoken');
    const token = req.cookies?.auth_token;
    if (!token) {
        return res.status(401).json({ success: false, message: 'No autenticado' });
    }
    try {
        jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Sesión expirada' });
    }

    const { userId, fullName, email } = req.body;

    if (!userId || !fullName || !email) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const adminEmail = 'firmalegalonline@pkiservices.co';
    const subject = `Nueva solicitud de vinculación — ${fullName}`;

    const text = `
Buenas,

El usuario ${fullName} ha solicitado que su cuenta de FirmaLegal Online sea vinculada con el sistema de Validación de Identidad.

Datos del usuario:
- Nombre: ${fullName}
- Correo electrónico: ${email}

Para completar la vinculación, ingresa al panel de administración de Validación de Identidad, busca al usuario por su nombre o correo electrónico y aprueba la vinculación.

Una vez aprobada, el usuario podrá usar su identidad verificada al momento de firmar documentos.

Solicitud generada automáticamente desde FirmaLegal Online.
    `.trim();

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 30px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: #2b0e31; color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px; color: #333; font-size: 15px; line-height: 1.6; }
        .info-card { background: #f8f9fa; border-left: 4px solid #2b0e31; padding: 20px; border-radius: 6px; margin: 24px 0; }
        .info-card p { margin: 6px 0; font-size: 14px; }
        .info-card strong { color: #2b0e31; }
        .action-box { background: #fef9ec; border-left: 4px solid #f0a500; padding: 20px; border-radius: 6px; margin: 24px 0; font-size: 14px; }
        .action-box p { margin: 6px 0; }
        .footer { background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Nueva solicitud de vinculaci&#243;n</h1>
        </div>
        <div class="content">
            <p>Buenas,</p>
            <p>El siguiente usuario ha solicitado que su cuenta de <strong>FirmaLegal Online</strong> sea vinculada con el sistema de Validaci&#243;n de Identidad:</p>

            <div class="info-card">
                <p><strong>Nombre:</strong> ${fullName}</p>
                <p><strong>Correo electr&#243;nico:</strong> ${email}</p>
            </div>

            <div class="action-box">
                <p><strong>&#128221; ¿Qu&#233; hacer?</strong></p>
                <p>Ingresa al panel de administraci&#243;n de Validaci&#243;n de Identidad, busca a este usuario por su nombre o correo y aprueba la vinculaci&#243;n.</p>
                <p>Una vez aprobada, el usuario podr&#225; usar su identidad verificada al momento de firmar documentos.</p>
            </div>

            <p style="color: #666; font-size: 13px; margin-top: 30px;">Este mensaje fue generado autom&#225;ticamente por FirmaLegal Online.</p>
        </div>
        <div class="footer">
            <p>&#169; ${new Date().getFullYear()} PKI Services S.A.S. — FirmaLegal Online</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    try {
        // 1. Registrar solicitud directamente en Validación de Identidad
        const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
        const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
        let viRegistered = false;
        let viError = null;

        try {
            const viBody = JSON.stringify({
                firmalegal_user_id: userId,
                firmalegal_email: email,
                firmalegal_nombre: fullName
            });
            const viUrlParsed = new URL(`${VI_URL}/validacion/api/firmalegal/solicitar`);
            const transport = viUrlParsed.protocol === 'https:' ? require('https') : require('http');

            await new Promise((resolve) => {
                const viReq = transport.request({
                    hostname: viUrlParsed.hostname,
                    port: viUrlParsed.port || (viUrlParsed.protocol === 'https:' ? 443 : 80),
                    path: viUrlParsed.pathname,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Internal-Api-Key': VI_API_KEY,
                        'Content-Length': Buffer.byteLength(viBody)
                    }
                }, (r) => {
                    let d = '';
                    r.on('data', c => d += c);
                    r.on('end', () => {
                        if (r.statusCode === 201 || r.statusCode === 200) {
                            viRegistered = true;
                            console.log(`✅ [INTEGRATION] Solicitud registrada en VI para userId=${userId}`);
                        } else {
                            viError = `VI respondió ${r.statusCode}: ${d}`;
                            console.warn(`⚠️ [INTEGRATION] ${viError}`);
                        }
                        resolve();
                    });
                });
                viReq.on('error', (e) => { viError = e.message; resolve(); });
                viReq.setTimeout(5000, () => { viError = 'timeout'; viReq.destroy(); resolve(); });
                viReq.write(viBody);
                viReq.end();
            });
        } catch (e) {
            viError = e.message;
            console.warn(`⚠️ [INTEGRATION] Error llamando a VI: ${e.message}`);
        }

        // 2. Enviar email de notificación al admin (en paralelo, no bloquea)
        const emailResult = await mailer.sendEmail({ to: adminEmail, subject, text, html });
        if (emailResult.success) {
            console.log(`✅ [INTEGRATION] Email de notificación enviado para userId=${userId}`);
        } else {
            console.warn(`⚠️ [INTEGRATION] Email no enviado: ${emailResult.error}`);
        }

        // 3. Responder al usuario — éxito si al menos VI o email funcionó
        if (viRegistered || emailResult.success) {
            res.json({ success: true, message: 'Solicitud enviada correctamente. El equipo de FirmaLegal procesará tu vinculación pronto.' });
        } else {
            console.error(`❌ [INTEGRATION] Ni VI ni email funcionaron. VI: ${viError}`);
            res.status(500).json({ success: false, message: 'Error al enviar la solicitud. Intenta de nuevo más tarde.' });
        }
    } catch (error) {
        console.error('❌ [INTEGRATION] Error:', error);
        res.status(500).json({ success: false, message: 'Error interno al procesar la solicitud.' });
    }
});

// =========================================
// MIDDLEWARE DE PERMISOS
// =========================================

// Función helper para verificar permisos basados en rol
function canManageUsers(roleName) {
    return roleName === 'Superadministrador';
}

function canEditUsers(roleName) {
    return roleName === 'Superadministrador';
}

function canAccessConfig(roleName) {
    return ['Superadministrador', 'Tenant Admin', 'Admin'].includes(roleName);
}

// =========================================
// RUTAS DE API
// =========================================

// Endpoint para obtener todos los roles
app.get('/api/roles', (req, res) => {
    console.log('📋 Solicitando roles disponibles');
    
    db.query('SELECT role_id, role_name, role_description FROM roles ORDER BY role_id ASC', (err, results) => {
        if (err) {
            console.error('❌ Error al obtener roles:', err);
            return res.status(500).json({
                success: false,
                message: 'Error al obtener roles'
            });
        }
        
        console.log(`✅ Roles obtenidos: ${results.length}`);
        
        res.json({
            success: true,
            roles: results
        });
    });
});

// Endpoint para autenticación (login)
// =============================================
// ENDPOINT: LOGIN CON JWT EN COOKIES
// =============================================
app.post('/api/login', async (req, res) => {
    console.log('\n🔐 [AUTH] POST /api/login');
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email y contraseña son requeridos'
        });
    }

    try {
        // Buscar usuario en la base de datos
        const users = await new Promise((resolve, reject) => {
            db.query(
                `SELECT u.user_id, u.first_name, u.last_name, u.email, u.password_hash,
                        u.is_active, u.role_id, u.avatar_url, r.role_name, r.role_description
                 FROM users u
                 INNER JOIN roles r ON u.role_id = r.role_id
                 WHERE u.email = ?`,
                [email],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (users.length === 0) {
            console.log('❌ Usuario no encontrado:', email);
            return res.status(401).json({
                success: false,
                error: 'Credenciales inválidas'
            });
        }

        const user = users[0];

        // Verificar si el usuario está activo
        if (!user.is_active) {
            console.log('⚠️ Usuario desactivado');
            return res.status(403).json({
                success: false,
                error: 'Usuario desactivado. Contacta al administrador.'
            });
        }

        // Verificar contraseña
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            console.log('❌ Contraseña incorrecta para:', email);
            return res.status(401).json({
                success: false,
                error: 'Credenciales inválidas'
            });
        }

        console.log('✅ Usuario autenticado:', email);

        // Generar JWT
        const token = jwt.sign(
            {
                userId: user.user_id,
                email: user.email
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Guardar JWT en cookie HttpOnly
        res.cookie('auth_token', token, {
            httpOnly: true,  // No accesible desde JavaScript (protección XSS)
            secure: false,  // Temporalmente false hasta configurar HTTPS/SSL con dominio
            sameSite: 'lax',  // Protección CSRF
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 días en milisegundos
            path: '/'  // Disponible en todo el sitio
        });

        console.log('🍪 Cookie JWT creada y enviada');

        // Actualizar último login
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?',
                [user.user_id],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Registrar login en activity_log
        await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO activity_log (user_id, action, ip_address, user_agent)
                 VALUES (?, 'login', ?, ?)`,
                [user.user_id, req.ip, req.get('user-agent')],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });

        // Devolver datos del usuario (sin el password)
        res.json({
            success: true,
            message: 'Login exitoso',
            user: {
                user_id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role_id: user.role_id,
                role_name: user.role_name,
                role_description: user.role_description,
                avatar_url: user.avatar_url
            }
        });

    } catch (error) {
        console.error('❌ [AUTH] Error en login:', error);
        res.status(500).json({
            success: false,
            error: 'Error en el servidor'
        });
    }
});

// =============================================
// ENDPOINT: LOGOUT
// =============================================
app.post('/api/logout', (req, res) => {
    console.log('\n🚪 [AUTH] POST /api/logout');

    // Eliminar cookie JWT
    res.clearCookie('auth_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });

    console.log('✅ Cookie JWT eliminada');

    res.json({
        success: true,
        message: 'Logout exitoso'
    });
});

// =============================================
// API DE USUARIOS
// =============================================

// Obtener todos los usuarios
app.get('/api/users', (req, res) => {
    console.log('📋 Solicitando lista de usuarios');
    console.log('🔍 Base de datos actual:', db.config.database);
    console.log('🔍 Host:', db.config.host);
    console.log('🔍 Puerto:', db.config.port);
    
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email,
               u.is_active, u.last_login, u.created_at,
               r.role_name, r.role_description,
               DATABASE() as current_db,
               t.team_name, t.team_id AS user_team_id, t.team_color
        FROM users u
        INNER JOIN roles r ON u.role_id = r.role_id
        LEFT JOIN team_members tm ON tm.user_id = u.user_id
        LEFT JOIN teams t ON t.team_id = tm.team_id AND t.is_active = TRUE
        ORDER BY FIELD(r.role_name, 'Superadministrador') DESC, u.created_at DESC
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error al obtener usuarios:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al obtener usuarios' 
            });
        }

        console.log(`✅ ${results.length} usuarios encontrados`);
        if (results.length > 0) {
            console.log('📊 Base de datos real:', results[0].current_db);
            console.log('👥 Usuarios:', results.map(u => `${u.first_name} ${u.last_name} (${u.email})`));
        }
        
        res.json({
            success: true,
            users: results
        });
    });
});

// Obtener roles disponibles
app.get('/api/roles', (req, res) => {
    console.log('📋 Solicitando lista de roles');
    
    const query = 'SELECT role_id, role_name, role_description FROM roles ORDER BY role_id';

    db.query(query, (err, results) => {
        if (err) {
            console.error('❌ Error al obtener roles:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Error al obtener roles' 
            });
        }

        console.log(`✅ ${results.length} roles encontrados`);
        
        res.json({
            success: true,
            roles: results
        });
    });
});

// Generar contraseña segura aleatoria
function generateSecurePassword(length = 12) {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '@#$%&!';
    const all = uppercase + lowercase + digits + symbols;
    // Garantizar al menos 1 de cada tipo
    let pwd = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        digits[Math.floor(Math.random() * digits.length)],
        symbols[Math.floor(Math.random() * symbols.length)]
    ];
    for (let i = 4; i < length; i++) {
        pwd.push(all[Math.floor(Math.random() * all.length)]);
    }
    // Mezclar array
    for (let i = pwd.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
    }
    return pwd.join('');
}

// Crear nuevo usuario
app.post('/api/users', async (req, res) => {
    console.log('➕ Creando nuevo usuario');
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));

    const { firstName, lastName, email, roleId, requestingUserId, requestingUserRole } = req.body;

    // VERIFICAR PERMISOS: Solo Superadministrador puede crear usuarios
    if (!requestingUserRole || !canManageUsers(requestingUserRole)) {
        console.warn('⛔ Intento de crear usuario sin permisos:', requestingUserRole);
        return res.status(403).json({
            success: false,
            message: 'No tienes permisos para crear usuarios'
        });
    }

    // Validaciones (sin contraseña — se genera automáticamente)
    if (!firstName || !lastName || !email || !roleId) {
        return res.status(400).json({
            success: false,
            message: 'Todos los campos son requeridos'
        });
    }

    try {
        // Verificar si el email ya existe
        const [existing] = await new Promise((resolve, reject) => {
            db.query('SELECT email FROM users WHERE email = ?', [email], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }

        // Verificar que el rol existe y obtener su nombre
        const [roleResult] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id, role_name FROM roles WHERE role_id = ?', [roleId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (roleResult.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Rol no válido'
            });
        }

        // Generar contraseña automática segura
        const plainPassword = generateSecurePassword(12);
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        // Insertar usuario
        await new Promise((resolve, reject) => {
            db.query(
                'INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                [firstName, lastName, email, passwordHash, roleId, true],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Usuario creado exitosamente');

        // Enviar email de bienvenida usando config dinámica del admin (email_config en DB)
        try {
            const welcomeTemplate = require('./lib/email/templates/welcome-user');
            const APP_URL = process.env.APP_URL || 'http://localhost:3000';
            const loginUrl = `${APP_URL}/login.html`;
            const emailHtml = welcomeTemplate({
                firstName, lastName, email,
                password: plainPassword,
                roleName: roleResult[0].role_name,
                loginUrl, appUrl: APP_URL
            });
            const emailText = `Hola ${firstName},\n\nTu cuenta en FirmaLegal Online ha sido creada.\n\nCorreo: ${email}\nContraseña: ${plainPassword}\nRol: ${roleResult[0].role_name}\n\nInicia sesión en: ${loginUrl}\n\nTe recomendamos cambiar tu contraseña en el primer inicio de sesión.\n\nFirmaLegal Online`;

            // Buscar config de email del usuario que crea (requestingUserId)
            const emailConfig = await mailerDynamic.getUserEmailConfig(db, requestingUserId);

            let result;
            if (emailConfig) {
                result = await mailerDynamic.sendEmailWithUserConfig(emailConfig, {
                    to: email,
                    subject: 'Bienvenido/a a FirmaLegal Online — Tus credenciales de acceso',
                    text: emailText,
                    html: emailHtml
                });
            } else {
                result = await mailer.sendEmail({
                    to: email,
                    subject: 'Bienvenido/a a FirmaLegal Online — Tus credenciales de acceso',
                    text: emailText,
                    html: emailHtml
                });
            }

            if (result && result.success) {
                console.log(`📧 Email de bienvenida enviado a ${email}`);
            } else {
                console.warn('⚠️ Email de bienvenida no pudo enviarse:', result?.error);
            }
        } catch (emailErr) {
            console.warn('⚠️ Usuario creado pero no se pudo enviar el email de bienvenida:', emailErr.message);
        }

        res.json({ success: true, message: 'Usuario creado. Se ha enviado un correo con las credenciales.' });

    } catch (error) {
        console.error('❌ Error al crear usuario:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear usuario'
        });
    }
});

// =============================================
// BÚSQUEDA DE USUARIOS (Integración interna con Validación de Identidad)
// Protegido por X-Internal-Api-Key
// =============================================
app.get('/api/users/search', (req, res) => {
    const apiKey = req.headers['x-internal-api-key'];
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
        console.warn('⚠️ [users/search] Acceso denegado — API key inválida');
        return res.status(401).json({ success: false, message: 'No autorizado' });
    }

    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
        return res.status(400).json({ success: false, message: 'El parámetro q debe tener al menos 2 caracteres' });
    }

    const like = `%${q}%`;
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email, u.is_active
        FROM users u
        WHERE u.is_active = 1
          AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)
        ORDER BY u.first_name, u.last_name
        LIMIT 20
    `;

    db.query(query, [like, like, like], (err, results) => {
        if (err) {
            console.error('❌ [users/search] Error:', err);
            return res.status(500).json({ success: false, message: 'Error al buscar usuarios' });
        }
        console.log(`🔍 [users/search] "${q}" → ${results.length} resultados`);
        res.json({ success: true, users: results });
    });
});

// Confirmar cambio de correo electrónico via token (debe ir ANTES de /api/users/:id)
app.get('/api/users/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send('<h2>Enlace inválido o caducado.</h2>');
    }

    try {
        const [rows] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT user_id, pending_email FROM users WHERE email_verification_token = ?',
                [token],
                (err, results) => { if (err) reject(err); else resolve([results]); }
            );
        });

        if (!rows || rows.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
                <title>Enlace inválido - FirmaLegal Online</title>
                <style>body{font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f5f5f5;}
                .box{max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
                h2{color:#c41e56;}p{color:#555;}a{color:#c41e56;}</style>
                </head><body><div class="box">
                <h2>Enlace inválido o caducado</h2>
                <p>Este enlace de verificación no es válido o ya fue utilizado.</p>
                <p><a href="/">Volver a FirmaLegal Online</a></p>
                </div></body></html>
            `);
        }

        const { user_id, pending_email } = rows[0];

        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET email = ?, pending_email = NULL, email_verification_token = NULL WHERE user_id = ?',
                [pending_email, user_id],
                (err, results) => { if (err) reject(err); else resolve(results); }
            );
        });

        console.log(`✅ Email verificado y actualizado para user_id=${user_id}: ${pending_email}`);

        return res.send(`
            <!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
            <title>Correo confirmado - FirmaLegal Online</title>
            <style>body{font-family:Arial,sans-serif;text-align:center;padding:60px 20px;background:#f5f5f5;}
            .box{max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:40px;box-shadow:0 4px 12px rgba(0,0,0,0.1);}
            h2{color:#2b0e31;}p{color:#555;}a{display:inline-block;margin-top:20px;background:#c41e56;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;}</style>
            </head><body><div class="box">
            <h2>&#10003; Correo electrónico confirmado</h2>
            <p>Tu nuevo correo electrónico <strong>${pending_email}</strong> ha sido confirmado correctamente.</p>
            <p>Ya puedes iniciar sesión con tu nueva dirección.</p>
            <a href="/">Ir a FirmaLegal Online</a>
            </div></body></html>
        `);

    } catch (error) {
        console.error('❌ Error al verificar email:', error);
        return res.status(500).send('<h2>Error interno. Inténtalo de nuevo más tarde.</h2>');
    }
});

// Obtener perfil de un usuario específico
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    console.log('👤 Obteniendo perfil del usuario:', userId);

    if (!userId || userId === 'undefined') {
        console.error('❌ ID de usuario inválido:', userId);
        return res.status(400).json({ 
            success: false, 
            message: 'ID de usuario inválido' 
        });
    }

    try {
        const query = `
            SELECT u.user_id, u.first_name, u.last_name, u.email, 
                   u.is_active, u.last_login, u.created_at, u.avatar_url,
                   r.role_id, r.role_name, r.role_description
            FROM users u
            INNER JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = ?
        `;

        db.query(query, [userId], (err, results) => {
            if (err) {
                console.error('❌ Error al obtener perfil:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Error al obtener perfil' 
                });
            }

            if (results.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Usuario no encontrado' 
                });
            }

            console.log('✅ Perfil obtenido:', results[0].email);
            res.json({
                success: true,
                user: results[0]
            });
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener perfil' 
        });
    }
});

// Editar usuario existente
app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    console.log('✏️ Editando usuario:', userId);
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const { firstName, lastName, email, password, roleId, requestingUserId, requestingUserRole } = req.body;

    // VERIFICAR PERMISOS
    const isSuperAdmin = canEditUsers(requestingUserRole);
    const isOwnProfile = parseInt(requestingUserId) === parseInt(userId);
    const canEditOwnProfile = ['Admin', 'Tenant Admin'].includes(requestingUserRole) && isOwnProfile;

    if (!isSuperAdmin && !canEditOwnProfile) {
        console.warn('⛔ Intento de editar usuario sin permisos:', { requestingUserRole, userId, requestingUserId });
        return res.status(403).json({ 
            success: false, 
            message: 'No tienes permisos para editar este usuario' 
        });
    }

    // Admin y Tenant Admin solo pueden editar ciertos campos de su propio perfil
    if (canEditOwnProfile && !isSuperAdmin) {
        // No pueden cambiar su propio rol
        const [currentUser] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (currentUser.length > 0 && currentUser[0].role_id !== parseInt(roleId)) {
            return res.status(403).json({ 
                success: false, 
                message: 'No puedes cambiar tu propio rol' 
            });
        }
    }

    // Validaciones
    if (!firstName || !lastName || !email || !roleId) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre, apellido, email y rol son requeridos' 
        });
    }

    try {
        // Verificar si el usuario existe
        const [userCheck] = await new Promise((resolve, reject) => {
            db.query('SELECT user_id FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (userCheck.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Usuario no encontrado' 
            });
        }

        // Obtener datos actuales del usuario (email actual + nombre)
        const [currentUserData] = await new Promise((resolve, reject) => {
            db.query('SELECT email, first_name, last_name FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });
        const currentEmail = currentUserData[0]?.email;
        const emailChanged = currentEmail && email.toLowerCase() !== currentEmail.toLowerCase();

        // Si el email cambió, verificar que no esté en uso por otro usuario
        if (emailChanged) {
            const [existing] = await new Promise((resolve, reject) => {
                db.query('SELECT email FROM users WHERE email = ? AND user_id != ?', [email, userId], (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                });
            });
            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'El email ya está registrado por otro usuario'
                });
            }
        }

        // Verificar que el rol existe
        const [roleResult] = await new Promise((resolve, reject) => {
            db.query('SELECT role_id FROM roles WHERE role_id = ?', [roleId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (roleResult.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Rol no válido'
            });
        }

        // Actualizar usuario (sin cambiar email todavía si cambió)
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, password_hash = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, passwordHash, roleId, userId],
                    (err, results) => { if (err) reject(err); else resolve(results); }
                );
            });
        } else {
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, roleId, userId],
                    (err, results) => { if (err) reject(err); else resolve(results); }
                );
            });
        }

        // Si el email cambió, guardar pending_email y enviar verificación
        if (emailChanged) {
            const crypto = require('crypto');
            const token = crypto.randomBytes(48).toString('hex');
            const APP_URL = process.env.APP_URL || 'https://firmalegalonline.com';
            const verificationUrl = `${APP_URL}/api/users/verify-email?token=${token}`;

            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET pending_email = ?, email_verification_token = ? WHERE user_id = ?',
                    [email, token, userId],
                    (err, results) => { if (err) reject(err); else resolve(results); }
                );
            });

            const mailer = require('./lib/email/mailer');
            const recipientName = `${firstName} ${lastName}`.trim();
            const emailVerificationTemplate = require('./lib/email/templates/email-verification');
            await mailer.sendEmail({
                to: email,
                subject: 'Confirma tu nuevo correo electrónico — FirmaLegal Online',
                text: `Hola ${recipientName},\n\nHemos recibido una solicitud para cambiar tu correo a ${email}.\n\nConfirma el cambio entrando a este enlace (válido 24 horas):\n${verificationUrl}\n\nSi no solicitaste este cambio, ignora este mensaje.\n\nFirmaLegal Online`,
                html: emailVerificationTemplate({ recipientName, newEmail: email, verificationUrl, appUrl: APP_URL })
            });

            console.log('✅ Usuario actualizado. Email de verificación enviado a:', email);
            return res.json({
                success: true,
                message: 'Perfil actualizado. Te enviamos un correo a la nueva dirección para confirmar el cambio de email.',
                emailPending: true
            });
        }

        console.log('✅ Usuario actualizado exitosamente');
        res.json({ success: true, message: 'Usuario actualizado exitosamente' });

    } catch (error) {
        console.error('❌ Error al actualizar usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al actualizar usuario' 
        });
    }
});

// =============================================
// API DE AVATARES
// =============================================

// Subir avatar de usuario
app.post('/api/users/:id/avatar', upload.single('avatar'), async (req, res) => {
    const userId = req.params.id;
    console.log('📤 Subiendo avatar para usuario:', userId);

    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: 'No se proporcionó ningún archivo'
        });
    }

    try {
        // Obtener avatar anterior para eliminarlo
        const [oldUser] = await new Promise((resolve, reject) => {
            db.query('SELECT avatar_url FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Eliminar avatar anterior si existe
        if (oldUser.length > 0 && oldUser[0].avatar_url) {
            const oldAvatarPath = resolveFromRoot('frontend', oldUser[0].avatar_url);
            if (fs.existsSync(oldAvatarPath)) {
                fs.unlinkSync(oldAvatarPath);
                console.log('🗑️ Avatar anterior eliminado');
            }
        }

        // Guardar ruta relativa del nuevo avatar en la BD
        const avatarUrl = `/avatar-pht/${req.file.filename}`;
        
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET avatar_url = ? WHERE user_id = ?',
                [avatarUrl, userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Avatar subido:', avatarUrl);

        res.json({
            success: true,
            message: 'Avatar subido exitosamente',
            avatarUrl: avatarUrl
        });

    } catch (error) {
        console.error('❌ Error al subir avatar:', error);
        
        // Eliminar archivo subido si hubo error
        if (req.file) {
            const filePath = resolveFromRoot('frontend', 'avatar-pht', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al subir avatar'
        });
    }
});

// Eliminar avatar de usuario
app.delete('/api/users/:id/avatar', async (req, res) => {
    const userId = req.params.id;
    console.log('🗑️ Eliminando avatar del usuario:', userId);

    try {
        // Obtener avatar actual
        const [user] = await new Promise((resolve, reject) => {
            db.query('SELECT avatar_url FROM users WHERE user_id = ?', [userId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado'
            });
        }

        // Eliminar archivo físico si existe
        if (user[0].avatar_url) {
            const avatarPath = resolveFromRoot('frontend', user[0].avatar_url);
            if (fs.existsSync(avatarPath)) {
                fs.unlinkSync(avatarPath);
                console.log('✅ Archivo de avatar eliminado');
            }
        }

        // Actualizar BD
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE users SET avatar_url = NULL WHERE user_id = ?',
                [userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Avatar eliminado de la BD');

        res.json({
            success: true,
            message: 'Avatar eliminado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error al eliminar avatar:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar avatar'
        });
    }
});

// =============================================
// ENDPOINTS PÚBLICOS PARA FIRMA DE DOCUMENTOS
// =============================================

// ── INTEGRACIÓN VALIDACIÓN DE IDENTIDAD ─────────────────────────────────────

// GET /api/public/vi-status/:token
// Consulta si el firmante (identificado por su token de firma) ya fue validado
// en VI, y si el dueño del documento está vinculado a VI.
app.get('/api/public/vi-status/:token', async (req, res) => {
    const { token } = req.params;
    try {
        // 1. Obtener datos del firmante y del dueño del documento
        const [rows] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dr.recipient_id, dr.email, dr.vi_validated_at, d.owner_id
                 FROM document_recipients dr
                 INNER JOIN documents d ON dr.document_id = d.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => { if (err) reject(err); else resolve([results]); }
            );
        });

        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Token no encontrado' });
        }

        const { email, vi_validated_at, owner_id } = rows[0];

        // 2. Verificar si el dueño está vinculado a VI
        const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
        const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
        let ownerVinculado = false;

        try {
            const checkUrl = new URL(`${VI_URL}/validacion/api/firmalegal/check-vinculacion/${owner_id}`);
            const transport = checkUrl.protocol === 'https:' ? require('https') : require('http');
            const checkResult = await new Promise((resolve) => {
                const r = transport.request({
                    hostname: checkUrl.hostname,
                    port: checkUrl.port || 80,
                    path: checkUrl.pathname,
                    method: 'GET',
                    headers: { 'X-Internal-Api-Key': VI_API_KEY }
                }, (resp) => {
                    let data = '';
                    resp.on('data', d => data += d);
                    resp.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch { resolve({}); }
                    });
                });
                r.on('error', () => resolve({}));
                r.end();
            });
            ownerVinculado = checkResult.vinculado === true;
        } catch (_) { ownerVinculado = false; }

        return res.json({
            success: true,
            validated: !!vi_validated_at,
            vi_validated_at: vi_validated_at || null,
            ownerVinculado,
            email
        });

    } catch (error) {
        console.error('❌ [VI-STATUS] Error:', error);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// POST /api/public/vi-callback
// Llamado server-to-server por VI cuando la validación es exitosa (fire-and-forget).
// Marca vi_validated_at y descarga + inserta la trazabilidad al PDF del documento.
app.post('/api/public/vi-callback', async (req, res) => {
    const { token } = req.query;
    const { vi_ok, validacion_id } = req.body || {};
    console.log(`📩 [VI-CALLBACK POST] token=${token ? token.substring(0,16)+'...' : 'NONE'} vi_ok=${vi_ok} validacion_id=${validacion_id}`);
    if (!token) return res.status(400).json({ ok: false });

    // Responder inmediatamente a VI (fire-and-forget — no bloquear)
    res.json({ ok: true });

    if (!vi_ok) return;

    try {
        // 1. Obtener datos del recipient y documento
        const rows = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dr.recipient_id, dr.document_id, dr.vi_validated_at,
                        dr.custom_pdf_path, dr.personal_pdf_path, dr.email,
                        dr.viewer_group_id, dr.is_final_signer, dr.status,
                        dr.vi_traza_path,
                        d.file_path, d.title, d.document_type
                 FROM document_recipients dr
                 INNER JOIN documents d ON dr.document_id = d.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => { if (err) reject(err); else resolve(results); }
            );
        });

        if (!rows || rows.length === 0) {
            console.warn(`⚠️ [VI-CALLBACK] Token no encontrado: ${token.substring(0, 8)}...`);
            return;
        }

        const recipient = rows[0];

        // 2. Marcar vi_validated_at
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE document_recipients SET vi_validated_at = NOW() WHERE token = ?',
                [token],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });
        console.log(`✅ [VI-CALLBACK] vi_validated_at marcado para token=${token.substring(0, 8)}...`);

        // 3. Guardar trazabilidad VI
        // IDEMPOTENCIA: Si ya existe vi_traza_path para este recipient, el callback llegó duplicado.
        // Esto ocurre cuando un intento es exitoso automáticamente (callback 1) Y el operador
        // también aprueba manualmente (callback 2) con el mismo validacion_id.
        // En ese caso saltamos toda la generación para evitar adjuntar la trazabilidad dos veces.
        if (recipient.vi_traza_path) {
            console.log(`⚠️ [VI-CALLBACK] Trazabilidad ya existe para ${recipient.email} — callback duplicado, ignorando (vi_traza_path: ${recipient.vi_traza_path})`);
        } else if (validacion_id) {
            const fs = require('fs');
            const path = require('path');
            const { resolveFromRoot } = require('./config/paths');

            try {
                // El firmante definitivo (is_final_signer) también trata la traza como pagaré:
                // solo guarda vi_traza_path, NO genera vi_personal (lo hace notifyFinalSigner después).
                const isPagare = !!recipient.viewer_group_id || recipient.is_final_signer === 1;

                // Descargar trazabilidad pura de VI
                // El endpoint traza-pdf acepta el CÓDIGO (VAL-XXXX), no el UUID.
                // Primero resolvemos el código consultando VI por ID.
                const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
                const VI_API_KEY = process.env.INTERNAL_API_KEY || '';

                // Resolver código desde ID
                let trazaCodigo = validacion_id; // fallback: intentar con el id directo
                try {
                    const codigoBytes = await new Promise((resolve, reject) => {
                        const chunks = [];
                        const codigoUrl = new URL(`${VI_URL}/validacion/api/validaciones/by-id/${validacion_id}`);
                        const t = codigoUrl.protocol === 'https:' ? require('https') : require('http');
                        const r = t.request({
                            hostname: codigoUrl.hostname,
                            port: codigoUrl.port || 80,
                            path: codigoUrl.pathname,
                            method: 'GET',
                            headers: { 'X-Internal-Api-Key': VI_API_KEY }
                        }, (resp) => {
                            resp.on('data', d => chunks.push(d));
                            resp.on('end', () => resolve(Buffer.concat(chunks)));
                        });
                        r.on('error', reject);
                        r.end();
                    });
                    const codigoData = JSON.parse(codigoBytes.toString());
                    if (codigoData.codigo) trazaCodigo = codigoData.codigo;
                } catch (_) {}

                const trazaUrl = new URL(`${VI_URL}/validacion/api/validaciones/${trazaCodigo}/traza-pdf`);
                const transport = trazaUrl.protocol === 'https:' ? require('https') : require('http');

                const trazaBytes = await new Promise((resolve, reject) => {
                    const chunks = [];
                    const r = transport.request({
                        hostname: trazaUrl.hostname,
                        port: trazaUrl.port || 80,
                        path: trazaUrl.pathname,
                        method: 'GET',
                        headers: { 'X-Internal-Api-Key': VI_API_KEY }
                    }, (resp) => {
                        if (resp.statusCode !== 200) { reject(new Error(`VI traza HTTP ${resp.statusCode}`)); return; }
                        resp.on('data', d => chunks.push(d));
                        resp.on('end', () => resolve(Buffer.concat(chunks)));
                    });
                    r.on('error', reject);
                    r.end();
                });

                const trazaDir = resolveFromRoot('uploads/vi_traza');
                if (!fs.existsSync(trazaDir)) fs.mkdirSync(trazaDir, { recursive: true });

                // Guardar trazabilidad pura (se reutiliza al generar interim y sellado final)
                const trazaFilename = `vi_traza_${recipient.recipient_id}_${Date.now()}.pdf`;
                const trazaAbsPath = path.join(trazaDir, trazaFilename);
                const trazaRelPath = `uploads/vi_traza/${trazaFilename}`;
                fs.writeFileSync(trazaAbsPath, trazaBytes);

                if (isPagare) {
                    // PAGARÉ: solo guardar vi_traza_path. NO tocar custom_pdf_path.
                    // El interim construirá el PDF individual con esta traza cuando el firmante firme.
                    await new Promise((resolve, reject) => {
                        db.query(
                            'UPDATE document_recipients SET vi_traza_path = ? WHERE recipient_id = ?',
                            [trazaRelPath, recipient.recipient_id],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });
                    console.log(`✅ [VI-CALLBACK] Traza VI guardada para pagaré ${recipient.email}: ${trazaFilename} (custom_pdf_path NO modificado)`);
                } else {
                    // DOCUMENTO NORMAL: generar vi_personal (PDF base + traza) y actualizar custom_pdf_path
                    const { PDFDocument: PDFDoc } = require('pdf-lib');
                    const basePdfRel = (recipient.personal_pdf_path || recipient.custom_pdf_path || recipient.file_path || '').replace(/^\/+/, '');
                    if (!basePdfRel) throw new Error('No hay PDF base para el destinatario');
                    const basePdfAbs = resolveFromRoot(basePdfRel);
                    if (!fs.existsSync(basePdfAbs)) throw new Error(`PDF base no encontrado: ${basePdfAbs}`);

                    const basePdf = await PDFDoc.load(fs.readFileSync(basePdfAbs));
                    const trazaPdf = await PDFDoc.load(trazaBytes);
                    const pages = await basePdf.copyPages(trazaPdf, trazaPdf.getPageIndices());
                    pages.forEach(p => basePdf.addPage(p));
                    const mergedBytes = await basePdf.save();

                    const personalFilename = `vi_personal_${recipient.recipient_id}_${Date.now()}.pdf`;
                    const personalAbsPath = path.join(resolveFromRoot('uploads/signed'), personalFilename);
                    const personalRelPath = `uploads/signed/${personalFilename}`;
                    fs.writeFileSync(personalAbsPath, mergedBytes);

                    await new Promise((resolve, reject) => {
                        db.query(
                            'UPDATE document_recipients SET custom_pdf_path = ?, vi_traza_path = ? WHERE recipient_id = ?',
                            [personalRelPath, trazaRelPath, recipient.recipient_id],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });
                    console.log(`✅ [VI-CALLBACK] VI personal generado para ${recipient.email}: ${personalFilename}`);
                }

                // Persistir verificación en vi_verified_emails para futuros documentos
                try {
                    const docOwner = await new Promise((resolve, reject) => {
                        db.query('SELECT owner_id FROM documents WHERE document_id = ?',
                            [recipient.document_id], (err, rows) => { if (err) reject(err); else resolve(rows); });
                    });
                    const ownerId = docOwner[0]?.owner_id || 0;
                    await new Promise((resolve, reject) => {
                        db.query(
                            `INSERT INTO vi_verified_emails (email, vi_validated_at, owner_user_id) VALUES (?, NOW(), ?)
                             ON DUPLICATE KEY UPDATE vi_validated_at = NOW()`,
                            [recipient.email.toLowerCase(), ownerId],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });
                } catch (_) {}

            } catch (e) {
                console.error('⚠️ [VI-CALLBACK] Error procesando trazabilidad VI (no crítico):', e.message);
            }
        }

        // 4. Si el firmante definitivo completó VI y estaba en 'pending' → enviar email ahora
        if (recipient.is_final_signer === 1 && recipient.status === 'pending') {
            console.log(`⚖️ [VI-CALLBACK] Firmante definitivo verificado — actualizando status y enviando email`);
            try {
                await new Promise((resolve, reject) => {
                    db.query(
                        `UPDATE document_recipients SET status = 'sent' WHERE recipient_id = ?`,
                        [recipient.recipient_id],
                        (err) => { if (err) reject(err); else resolve(); }
                    );
                });
                // notifyFinalSigner ya encontrará el recipient existente (status='sent') y procederá a enviar el email
                await notifyFinalSigner(recipient.document_id);
            } catch (e) {
                console.error('⚠️ [VI-CALLBACK] Error enviando email a firmante definitivo:', e.message);
            }
        }

    } catch (error) {
        console.error('❌ [VI-CALLBACK POST] Error:', error.message);
    }
});

// GET /api/public/vi-callback
// El browser del firmante llega aquí tras completar la validación en VI.
// Verifica que el token exista y redirige a public-sign.html para que el firmante pueda firmar.
app.get('/api/public/vi-callback', async (req, res) => {
    const { token } = req.query;
    if (!token) {
        console.warn('⚠️ [VI-CALLBACK GET] Sin token en query string');
        return res.status(400).send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enlace inválido</title><style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}div{background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1)}h2{color:#c62828;margin:0 0 12px}p{color:#555;font-size:14px;line-height:1.6;margin:0}</style></head><body><div><h2>Enlace inválido</h2><p>El enlace de validación no es válido o ya fue usado. Por favor contacte al remitente del documento para obtener un nuevo enlace.</p></div></body></html>`);
    }
    // Verificar que el token exista en BD antes de redirigir
    try {
        const rows = await new Promise((resolve) => {
            db.query('SELECT recipient_id, status FROM document_recipients WHERE token = ?', [token], (err, r) => resolve(r || []));
        });
        if (!rows.length) {
            console.warn(`⚠️ [VI-CALLBACK GET] Token no encontrado en BD: ${token.substring(0,16)}...`);
            return res.status(404).send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Enlace expirado</title><style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}div{background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.1)}h2{color:#e65100;margin:0 0 12px}p{color:#555;font-size:14px;line-height:1.6;margin:0}</style></head><body><div><h2>Enlace expirado</h2><p>Este enlace de validación ya no es válido. Es posible que el proceso haya sido reiniciado. Por favor contacte al remitente del documento para recibir un nuevo enlace de firma.</p></div></body></html>`);
        }
        console.log(`✅ [VI-CALLBACK GET] Redirigiendo firmante token=${token.substring(0,16)}... → public-sign.html`);
    } catch (_) {}
    return res.redirect(`/public-sign.html?token=${token}&vi_ok=1`);
});

// POST /api/recipients/check-vi-status
// Recibe lista de emails, devuelve cuáles tienen VI válida (dentro del último año)
// Consulta AMBAS tablas: document_recipients (historial por documento) y vi_verified_emails (registro persistente)
app.post('/api/recipients/check-vi-status', requireAuth, async (req, res) => {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
        return res.json({ verified: {} });
    }
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const emailsLower = emails.map(e => e.toLowerCase());
        const placeholders = emailsLower.map(() => '?').join(',');
        console.log(`🔍 [CHECK-VI] Emails recibidos:`, emailsLower);

        const verified = {};

        // 1. Consultar vi_verified_emails (registro persistente — fuente principal)
        await new Promise((resolve) => {
            db.query(
                `SELECT email, vi_validated_at FROM vi_verified_emails
                 WHERE email IN (${placeholders}) AND vi_validated_at >= ?`,
                [...emailsLower, oneYearAgo],
                (err, rows) => {
                    if (!err && rows) rows.forEach(r => { verified[r.email.toLowerCase()] = r.vi_validated_at; });
                    resolve();
                }
            );
        });

        // 2. Consultar document_recipients (complemento — si no está en vi_verified_emails)
        await new Promise((resolve) => {
            db.query(
                `SELECT email, vi_validated_at FROM document_recipients
                 WHERE email IN (${placeholders}) AND vi_validated_at IS NOT NULL AND vi_validated_at >= ?`,
                [...emailsLower, oneYearAgo],
                (err, rows) => {
                    if (!err && rows) rows.forEach(r => {
                        if (!verified[r.email.toLowerCase()]) verified[r.email.toLowerCase()] = r.vi_validated_at;
                    });
                    resolve();
                }
            );
        });

        console.log(`🔍 [CHECK-VI] verified:`, Object.keys(verified));
        res.json({ verified });
    } catch (e) {
        res.json({ verified: {} });
    }
});

// ── Helper: descargar trazabilidad de VI e insertarla al final del PDF ──────
async function insertarTrazabilidadVI(validacionId, documentFilePath, recipientToken) {
    const { PDFDocument } = require('pdf-lib');
    const fs = require('fs');
    const path = require('path');
    const { resolveFromRoot } = require('./config/paths');
    const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
    const VI_API_KEY = process.env.INTERNAL_API_KEY || '';

    // Descargar trazabilidad PDF de VI
    const trazaUrl = new URL(`${VI_URL}/validacion/api/validaciones/${validacionId}/traza-pdf`);
    const transport = trazaUrl.protocol === 'https:' ? require('https') : require('http');

    const trazaBytes = await new Promise((resolve, reject) => {
        const chunks = [];
        const r = transport.request({
            hostname: trazaUrl.hostname,
            port: trazaUrl.port || 80,
            path: trazaUrl.pathname,
            method: 'GET',
            headers: { 'X-Internal-Api-Key': VI_API_KEY }
        }, (resp) => {
            if (resp.statusCode !== 200) {
                reject(new Error(`VI trazabilidad HTTP ${resp.statusCode}`));
                return;
            }
            resp.on('data', d => chunks.push(d));
            resp.on('end', () => resolve(Buffer.concat(chunks)));
        });
        r.on('error', reject);
        r.end();
    });

    // Resolver ruta del documento destino
    const cleanPath = documentFilePath.replace(/^\/+/, '');
    const docPath = resolveFromRoot(cleanPath);

    if (!fs.existsSync(docPath)) {
        // Archivo no existe aún — guardar solo la trazabilidad como archivo nuevo
        fs.writeFileSync(docPath, trazaBytes);
        console.log(`✅ [VI-TRAZA] Trazabilidad VI guardada en nuevo archivo ${path.basename(docPath)}`);
        return;
    }

    // El archivo ya existe — fusionar trazabilidad al final
    const docPdf = await PDFDocument.load(fs.readFileSync(docPath));
    const trazaPdf = await PDFDocument.load(trazaBytes);

    const trazaPageIndices = trazaPdf.getPageIndices();
    const copiedPages = await docPdf.copyPages(trazaPdf, trazaPageIndices);
    copiedPages.forEach(p => docPdf.addPage(p));

    const mergedBytes = await docPdf.save();
    fs.writeFileSync(docPath, mergedBytes);

    console.log(`✅ [VI-TRAZA] Trazabilidad VI fusionada en ${path.basename(docPath)} (${trazaPageIndices.length} pág.)`);
}

// ─────────────────────────────────────────────────────────────────────────────

// GET /api/public/document/:token/download - Descarga pública del PDF firmado + trazabilidad VI personal
app.get('/api/public/document/:token/download', async (req, res) => {
    const { token } = req.params;
    if (!token) return res.status(400).send('Token requerido');

    try {
        const [rows] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dr.recipient_id, dr.email, dr.vi_traza_path,
                        d.title, d.signed_file_path, d.file_path
                 FROM document_recipients dr
                 INNER JOIN documents d ON dr.document_id = d.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => { if (err) reject(err); else resolve([results]); }
            );
        });

        if (!rows || rows.length === 0) return res.status(404).send('Documento no encontrado');

        const rec = rows[0];
        const pdfRelPath = rec.signed_file_path || rec.file_path;
        if (!pdfRelPath) return res.status(404).send('PDF no disponible');

        const { PDFDocument: PDFDoc } = require('pdf-lib');
        const { resolveFromRoot } = require('./config/paths');

        const pdfAbsPath = resolveFromRoot(pdfRelPath.replace(/^\/+/, ''));
        if (!fs.existsSync(pdfAbsPath)) return res.status(404).send('Archivo PDF no encontrado');

        const fileName = `${rec.title}_${rec.email}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

        // Fusionar trazabilidad VI personal si existe
        if (rec.vi_traza_path) {
            const trazaAbsPath = resolveFromRoot(rec.vi_traza_path.replace(/^\/+/, ''));
            if (fs.existsSync(trazaAbsPath)) {
                const signedPdf = await PDFDoc.load(fs.readFileSync(pdfAbsPath));
                const trazaPdf = await PDFDoc.load(fs.readFileSync(trazaAbsPath));
                const pages = await signedPdf.copyPages(trazaPdf, trazaPdf.getPageIndices());
                pages.forEach(p => signedPdf.addPage(p));
                const mergedBytes = await signedPdf.save();
                res.setHeader('Content-Length', mergedBytes.length);
                console.log(`✅ [PUBLIC-DOWNLOAD] PDF + trazabilidad VI enviados para ${rec.email}`);
                return res.end(Buffer.from(mergedBytes));
            }
        }

        // Sin trazabilidad — enviar PDF tal cual
        console.log(`✅ [PUBLIC-DOWNLOAD] PDF enviado (sin traza VI) para ${rec.email}`);
        fs.createReadStream(pdfAbsPath).pipe(res);

    } catch (err) {
        console.error('❌ [PUBLIC-DOWNLOAD] Error:', err.message);
        res.status(500).send('Error al descargar el documento');
    }
});

// ─────────────────────────────────────────────────────────────────────────────

// GET /api/public/document/:token - Obtener información del documento por token
app.get('/api/public/document/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        console.log(`📄 Solicitando documento con token: ${token}`);

        // 🔒 Buscar el destinatario por token
        // IMPORTANTE: Para pagarés, el firmante definitivo puede tener su token en:
        // 1. document_recipients.token (si ya se creó el recipient)
        // 2. pagare_metadata.final_signer_token (token original)
        const recipientQuery = `
            SELECT
                dr.recipient_id,
                dr.document_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at,
                dr.part_id,
                dr.custom_pdf_path,
                dr.is_final_signer,
                dr.viewer_group_id,
                d.title as document_title,
                d.file_path,
                d.signed_file_path,
                d.document_type,
                d.owner_id,
                u.first_name,
                u.last_name,
                u.email as sender_email
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            INNER JOIN users u ON d.owner_id = u.user_id
            WHERE dr.token = ?
        `;

        let [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // 🔒 Si no se encuentra en document_recipients, buscar en pagare_metadata (firmante definitivo)
        if (recipients.length === 0) {
            console.log('🔍 Token no encontrado en document_recipients, buscando en pagare_metadata...');

            const [pagareMetadata] = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT
                        pm.document_id,
                        pm.final_signer_email as email,
                        pm.final_signer_name as name,
                        pm.final_signer_status,
                        pm.final_signer_token,
                        d.title as document_title,
                        d.file_path,
                        d.signed_file_path,
                        d.document_type,
                        d.owner_id,
                        u.first_name,
                        u.last_name,
                        u.email as sender_email
                     FROM pagare_metadata pm
                     INNER JOIN documents d ON pm.document_id = d.document_id
                     INNER JOIN users u ON d.owner_id = u.user_id
                     WHERE pm.final_signer_token = ?`,
                    [token],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (pagareMetadata.length > 0) {
                console.log('✅ Token encontrado en pagare_metadata (firmante definitivo)');

                // Verificar si ya existe un recipient para este firmante definitivo
                const [existingRecipient] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT
                            dr.recipient_id,
                            dr.document_id,
                            dr.email,
                            dr.name,
                            dr.status,
                            dr.sent_at,
                            dr.opened_at,
                            dr.completed_at,
                            dr.part_id,
                            dr.custom_pdf_path,
                            dr.is_final_signer,
                            dr.viewer_group_id,
                            d.title as document_title,
                            d.file_path,
                            d.signed_file_path,
                            d.document_type,
                            d.owner_id,
                            u.first_name,
                            u.last_name,
                            u.email as sender_email
                         FROM document_recipients dr
                         INNER JOIN documents d ON dr.document_id = d.document_id
                         INNER JOIN users u ON d.owner_id = u.user_id
                         WHERE dr.document_id = ? AND dr.is_final_signer = 1`,
                        [pagareMetadata[0].document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                if (existingRecipient.length === 0) {
                    // Crear recipient para el firmante definitivo
                    console.log('📝 Creando recipient para firmante definitivo...');
                    await new Promise((resolve, reject) => {
                        db.query(
                            `INSERT INTO document_recipients
                             (document_id, email, name, token, status, is_final_signer, viewer_group_id, created_at)
                             VALUES (?, ?, ?, ?, 'sent', 1, NULL, NOW())`,
                            [
                                pagareMetadata[0].document_id,
                                pagareMetadata[0].email,
                                pagareMetadata[0].name,
                                token
                            ],
                            (err, results) => {
                                if (err) reject(err);
                                else resolve(results);
                            }
                        );
                    });

                    // Re-consultar el recipient recién creado
                    [recipients] = await new Promise((resolve, reject) => {
                        db.query(recipientQuery, [token], (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        });
                    });
                } else {
                    // Usar el recipient existente
                    recipients = existingRecipient;
                }
            }
        }

        if (recipients.length === 0) {
            console.log('❌ Token no encontrado en ninguna tabla');
            return res.status(404).json({
                success: false,
                message: 'Token inválido o documento no encontrado'
            });
        }

        const recipient = recipients[0];

        // 🔒 VALIDACIÓN DE SEGURIDAD CRÍTICA: Control de Acceso para Pagarés
        if (recipient.document_type === 'pagare') {
            console.log('🔒 [SEGURIDAD] Documento tipo PAGARÉ detectado');
            console.log(`   - is_final_signer: ${recipient.is_final_signer}`);
            console.log(`   - viewer_group_id: ${recipient.viewer_group_id}`);
            console.log(`   - status: ${recipient.status}`);

            // Verificar el estado de la metadata del pagaré
            const [pagareMetadata] = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT final_signer_status, total_viewers
                     FROM pagare_metadata
                     WHERE document_id = ?`,
                    [recipient.document_id],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            if (pagareMetadata.length > 0) {
                const finalSignerStatus = pagareMetadata[0].final_signer_status;
                console.log(`   - final_signer_status: ${finalSignerStatus}`);

                // 🔴 VALIDACIÓN: Si es firmante definitivo y el estatus NO es 'signed', bloquear acceso a pagarés de viewer_groups
                if (recipient.is_final_signer === 1 && finalSignerStatus !== 'signed') {
                    // El firmante definitivo NO puede acceder antes de firmar
                    // Solo debe ver su propio PDF especial (que no contiene datos de viewer_groups)

                    // Verificar si todos los viewer_groups completaron
                    const [allViewerGroups] = await new Promise((resolve, reject) => {
                        db.query(
                            `SELECT COUNT(*) as total,
                                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
                             FROM pagare_viewer_groups
                             WHERE document_id = ?`,
                            [recipient.document_id],
                            (err, results) => {
                                if (err) reject(err);
                                else resolve([results]);
                            }
                        );
                    });

                    console.log('🔍 [DEBUG] Resultado de viewer_groups:', allViewerGroups[0]);
                    const totalGroups = Number(allViewerGroups[0].total);
                    const completedGroups = Number(allViewerGroups[0].completed) || 0; // Handle NULL and convert to number
                    console.log(`🔍 [DEBUG] Total: ${totalGroups}, Completados: ${completedGroups}`);

                    const allCompleted = totalGroups === completedGroups && totalGroups > 0;
                    console.log(`🔍 [DEBUG] allCompleted: ${allCompleted}`);

                    if (!allCompleted) {
                        // Los viewer_groups aún no completaron, firmante definitivo NO debe ver nada
                        console.log('🔴 [SEGURIDAD] ACCESO DENEGADO: Firmante definitivo intentó acceder antes de que todos los viewers completen');
                        return res.status(403).json({
                            success: false,
                            message: 'El documento aún no está disponible para firma definitiva. Por favor espera a que todos los firmantes completen.',
                            code: 'WAITING_FOR_VIEWERS'
                        });
                    }

                    console.log('✅ [SEGURIDAD] Firmante definitivo accede correctamente (todos los viewers completaron)');
                }

                // 🔴 VALIDACIÓN: Si NO es firmante definitivo pero intenta acceder después de firma definitiva
                if (recipient.is_final_signer === 0 && finalSignerStatus === 'signed') {
                    // Los viewer_groups NO deben poder acceder al documento después de la firma definitiva
                    // Solo pueden descargar su propio pagaré sellado
                    console.log('✅ [SEGURIDAD] Viewer puede acceder a su pagaré sellado (firma definitiva completada)');
                }
            }
        }

        // Si el documento aún no se ha abierto, actualizar estado a opened
        if (recipient.status === 'sent' && !recipient.opened_at) {
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE document_recipients SET status = ?, opened_at = NOW() WHERE token = ?',
                    ['opened', token],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });
            console.log('✅ Estado actualizado a opened');
        }

        // Obtener los campos del documento con sus valores guardados para este recipient
        // 🔥 IMPORTANTE: Si el destinatario tiene custom_pdf_path, NO devolver valores de texto
        // porque ya están escritos FIJOS en su PDF personalizado
        const hasCustomPdf = !!recipient.custom_pdf_path;

        const fieldsQuery = `
            SELECT
                df.field_id,
                df.field_type as type,
                df.page_number as page,
                df.x_position as x,
                df.y_position as y,
                df.width,
                df.height,
                df.field_label as label,
                df.required,
                df.part_id,
                -- 🔥 SOLUCIÓN DEFINITIVA:
                -- 1. Si tiene custom_pdf_path (CSV personalizado) → NO devolver valores de texto (ya están en PDF)
                -- 2. Si NO tiene custom_pdf_path:
                --    - Para campos de texto: usar field_values (valores específicos por recipient - pagarés)
                --    - Para otros campos: usar document_field_values (valores compartidos)
                CASE
                    WHEN df.field_type = 'text' AND ? = 1 THEN NULL
                    ELSE COALESCE(fv.text_value, dfv.field_value)
                END as value
            FROM document_fields df
            LEFT JOIN field_values fv ON df.field_id = fv.field_id AND fv.recipient_id = ?
            LEFT JOIN document_field_values dfv ON df.field_id = dfv.field_id AND dfv.document_id = ?
            WHERE df.document_id = ?
            ORDER BY df.field_id ASC
        `;

        const [fields] = await new Promise((resolve, reject) => {
            db.query(fieldsQuery, [hasCustomPdf ? 1 : 0, recipient.recipient_id, recipient.document_id, recipient.document_id], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        console.log(`✅ ${fields.length} campo(s) encontrado(s) para el documento`);
        console.log(`🔍 DEBUG - Query params: recipient_id=${recipient.recipient_id}, document_id=${recipient.document_id}, hasCustomPdf=${hasCustomPdf}`);

        // 🔥 DEBUG: Verificar si existen valores en field_values para este recipient
        const [fieldValuesCheck] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT fv.*, df.field_label FROM field_values fv
                 INNER JOIN document_fields df ON fv.field_id = df.field_id
                 WHERE fv.recipient_id = ?`,
                [recipient.recipient_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });
        console.log(`🔍 DEBUG - field_values encontrados para recipient ${recipient.recipient_id}: ${fieldValuesCheck.length} registro(s)`);
        if (fieldValuesCheck.length > 0) {
            fieldValuesCheck.forEach((fv, idx) => {
                console.log(`   ${idx + 1}. field_id=${fv.field_id}, label="${fv.field_label}", text_value="${fv.text_value}"`);
            });
        }

        // Log detallado de TODOS los campos
        console.log(`🔍 DEBUG - Listado completo de campos:`);
        fields.forEach((f, idx) => {
            console.log(`   ${idx + 1}. field_id=${f.field_id}, type=${f.type}, label=${f.label}, value=${f.value || 'NULL'}`);
        });

        // Log de campos con valores
        const fieldsWithValues = fields.filter(f => f.value);
        if (fieldsWithValues.length > 0) {
            console.log(`📝 ${fieldsWithValues.length} campo(s) con valores pre-llenados:`);
            fieldsWithValues.forEach(f => {
                console.log(`   - Campo ${f.field_id} (${f.label || f.type}): "${f.value}"`);
            });
        } else {
            console.log(`⚠️ ADVERTENCIA: No se encontraron campos con valores pre-llenados`);
        }

        // 🔥 Determinar qué PDF mostrar según el estado
        let sourcePath;
        let pdfType;

        // 🔒 VALIDACIÓN ESPECIAL PARA PAGARÉS: Firmante definitivo debe tener su propio PDF
        if (recipient.document_type === 'pagare' && recipient.is_final_signer === 1) {
            console.log('🔒 [SEGURIDAD] Firmante definitivo detectado - buscando su PDF especial');

            // 🔥 IMPORTANTE: El firmante definitivo puede tener custom_pdf_path ANTES de completar
            // (el PDF se genera cuando todos los viewers completan, NO cuando el firmante definitivo firma)
            if (recipient.custom_pdf_path) {
                // Verificar que el PDF sea el especial del firmante definitivo
                if (recipient.custom_pdf_path.includes('final_signer_')) {
                    sourcePath = recipient.custom_pdf_path;
                    pdfType = 'PAGARÉ - PDF ESPECIAL FIRMANTE DEFINITIVO';
                    console.log(`   ✅ PDF especial del firmante definitivo: ${sourcePath}`);
                } else {
                    // ❌ ERROR CRÍTICO: El firmante definitivo tiene asignado un PDF de viewer_group
                    console.error(`   ❌ ERROR CRÍTICO: Firmante definitivo tiene PDF de viewer_group: ${recipient.custom_pdf_path}`);
                    console.error(`   ❌ ESTE ES EL BUG DE SEGURIDAD: El firmante definitivo está viendo datos sensibles de deudores`);
                    // Fallback al PDF original para evitar filtración de datos
                    sourcePath = recipient.file_path;
                    pdfType = 'PAGARÉ - PDF ORIGINAL (FALLBACK POR ERROR DE SEGURIDAD)';
                    console.log(`   ⚠️ Usando PDF original como fallback para proteger datos sensibles: ${sourcePath}`);
                }
            } else {
                // No tiene custom_pdf_path, usar file_path original
                sourcePath = recipient.file_path;
                pdfType = 'PAGARÉ - PDF ORIGINAL';
                console.log(`   ℹ️ Firmante definitivo sin custom_pdf_path, usando PDF original: ${sourcePath}`);
            }
        } else if (recipient.status === 'completed' && hasCustomPdf && recipient.custom_pdf_path) {
            // Documento personalizado completado: usar custom_pdf_path (ya contiene el PDF sellado)
            sourcePath = recipient.custom_pdf_path;
            pdfType = 'PERSONALIZADO SELLADO (CSV)';
        } else if (recipient.status === 'completed' && recipient.signed_file_path) {
            // Documento compartido completado: usar signed_file_path
            sourcePath = recipient.signed_file_path;
            pdfType = 'COMPARTIDO SELLADO';
        } else if (recipient.custom_pdf_path) {
            // Documento personalizado sin completar: usar custom_pdf_path (PDF sin sellar)
            sourcePath = recipient.custom_pdf_path;
            pdfType = 'PERSONALIZADO (CSV)';
        } else {
            // Documento compartido sin completar: usar file_path
            sourcePath = recipient.file_path;
            pdfType = 'COMPARTIDO (Manual)';
        }

        // Construir ruta del PDF correctamente (evitar doble barra)
        let pdfPath = sourcePath.replace(/\\/g, '/'); // Convertir barras invertidas
        if (!pdfPath.startsWith('/')) {
            pdfPath = '/' + pdfPath; // Agregar barra inicial solo si no existe
        }

        console.log(`📄 PDF Path devuelto: ${pdfPath} [${pdfType}]`); // 🔥 DEBUG

        // ✅ Si hay PDF firmado, construir su ruta
        let signedPdfUrl = null;

        // Para documentos personalizados (CSV) completados, el PDF sellado está en custom_pdf_path
        // Para documentos compartidos, el PDF sellado está en signed_file_path
        if (recipient.status === 'completed') {
            if (hasCustomPdf && recipient.custom_pdf_path) {
                // Documento personalizado: usar custom_pdf_path (ya actualizado con PDF sellado)
                signedPdfUrl = recipient.custom_pdf_path.replace(/\\/g, '/');
                if (!signedPdfUrl.startsWith('/')) {
                    signedPdfUrl = '/' + signedPdfUrl;
                }
                console.log(`📄 Signed PDF URL devuelto (personalizado): ${signedPdfUrl}`);
            } else if (recipient.signed_file_path) {
                // Documento compartido: usar signed_file_path
                signedPdfUrl = recipient.signed_file_path.replace(/\\/g, '/');
                if (!signedPdfUrl.startsWith('/')) {
                    signedPdfUrl = '/' + signedPdfUrl;
                }
                console.log(`📄 Signed PDF URL devuelto (compartido): ${signedPdfUrl}`);
            }
        }

        // 🔒 FILTRADO DE SEGURIDAD: No exponer información sensible en pagarés
        let responseDocument = {
            id: recipient.document_id,
            title: recipient.document_title,
            pdfPath: pdfPath,
            signedPdfUrl: signedPdfUrl,
            senderName: `${recipient.first_name} ${recipient.last_name}`,
            senderEmail: recipient.sender_email,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            recipientPartId: recipient.part_id,
            isFinalSigner: recipient.is_final_signer === 1,
            documentType: recipient.document_type || 'normal',
            sentAt: recipient.sent_at,
            openedAt: recipient.opened_at,
            status: recipient.status,
            viValidatedAt: recipient.vi_validated_at || null,
            hasPersonalizedPdf: hasCustomPdf,
            fields: fields || []
        };

        // 🔒 CAPA ADICIONAL DE SEGURIDAD: Sanitizar campos para pagarés
        if (recipient.document_type === 'pagare') {
            console.log('🔒 [SEGURIDAD] Sanitizando respuesta para documento tipo PAGARÉ');

            // 🔒 NADIE en public-sign puede descargar el pagaré (ni viewers ni firmante definitivo)
            // Solo el dueño del documento puede descargarlo desde tracking.html
            responseDocument.signedPdfUrl = null;
            console.log('   🔒 signedPdfUrl eliminado — pagaré solo descargable desde tracking.html');

            // Si es firmante definitivo, debe recibir campos de texto Y firma para mostrar placeholders de censura
            if (recipient.is_final_signer === 1) {
                // Incluir campos final_signature, seal, text y signature (para mostrar placeholders)
                // Los campos de texto y firma regular se mostrarán censurados en el frontend
                responseDocument.fields = fields.filter(f =>
                    f.type === 'final_signature' || f.type === 'seal' || f.type === 'text' || f.type === 'signature'
                );

                // Marcar campos de texto/firma como censurados (eliminar valores sensibles)
                responseDocument.fields = responseDocument.fields.map(f => {
                    if (f.type === 'text' || f.type === 'signature') {
                        return {
                            ...f,
                            value: null, // Eliminar valor sensible
                            censored: true // Flag para indicar que está censurado
                        };
                    }
                    return f;
                });

                console.log(`   - Campos para firmante definitivo: ${responseDocument.fields.length} (incluyendo ${responseDocument.fields.filter(f => f.censored).length} censurados)`);
            }

            // Si es viewer_group, solo debe recibir sus propios campos
            if (recipient.viewer_group_id) {
                // Los viewers solo ven sus campos asignados (ya filtrados por part_id en el query)
                console.log(`   - Viewer_group ${recipient.viewer_group_id} accede solo a sus campos asignados`);
            }
        }

        // Responder con la información del documento (sanitizada)
        res.json({
            success: true,
            document: responseDocument
        });

    } catch (error) {
        console.error('❌ Error al obtener documento público:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar el documento'
        });
    }
});

// GET /api/public/document-recipients/:token - Obtener lista de destinatarios para verificar último firmante
app.get('/api/public/document-recipients/:token', async (req, res) => {
    const { token } = req.params;

    try {
        console.log(`👥 Obteniendo destinatarios para token: ${token}`);

        // Primero obtener el document_id y document_type del token actual
        const [currentRecipient] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dr.document_id, d.document_type
                 FROM document_recipients dr
                 INNER JOIN documents d ON dr.document_id = d.document_id
                 WHERE dr.token = ?`,
                [token],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (currentRecipient.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Token no encontrado'
            });
        }

        const documentId = currentRecipient[0].document_id;
        const documentType = currentRecipient[0].document_type;

        // Obtener todos los destinatarios del documento (excluyendo firmantes definitivos para pagarés)
        const [recipients] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    token,
                    email,
                    status,
                    is_final_signer
                 FROM document_recipients
                 WHERE document_id = ? AND (is_final_signer = 0 OR is_final_signer IS NULL)`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        console.log(`✅ Encontrados ${recipients.length} destinatario(s) para documento ${documentId} (tipo: ${documentType})`);

        res.json({
            success: true,
            recipients: recipients,
            documentType: documentType
        });

    } catch (error) {
        console.error('❌ Error al obtener destinatarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener destinatarios'
        });
    }
});

// POST /api/public/sign/:token - Guardar firma del documento
app.post('/api/public/sign/:token', async (req, res) => {
    const { token } = req.params;
    const { fields, timestamp } = req.body;

    try {
        console.log(`✍️ Procesando firma para token: ${token}`);
        console.log(`📝 Campos recibidos: ${fields ? fields.length : 0}`);

        // Verificar que el token existe y no ha sido completado
        const recipientQuery = `
            SELECT
                dr.recipient_id,
                dr.document_id,
                dr.email,
                dr.name,
                dr.status,
                dr.custom_pdf_path,
                dr.viewer_group_id,
                dr.is_final_signer,
                d.file_path,
                d.title
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            WHERE dr.token = ?
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (recipients.length === 0) {
            console.log('❌ Token no encontrado');
            return res.status(404).json({
                success: false,
                message: 'Token inválido'
            });
        }

        const recipient = recipients[0];

        if (recipient.status === 'completed') {
            console.log('⚠️ Documento ya fue firmado anteriormente');
            return res.status(400).json({
                success: false,
                message: 'Este documento ya ha sido firmado'
            });
        }

        // Guardar los valores de los campos en la base de datos
        if (fields && fields.length > 0) {
            console.log('💾 Guardando valores de campos en field_values...');
            console.log(`📊 Total de campos recibidos: ${fields.length}`);
            
            for (const field of fields) {
                console.log(`\n🔍 Procesando campo:`, {
                    field_id: field.field_id,
                    type: field.type,
                    signed: field.signed,
                    has_dataUrl: !!field.dataUrl,
                    has_textValue: !!field.textValue,
                    has_dateValue: !!field.dateValue
                });
                
                if (field.signed && field.field_id) {
                    // 🔥 IMPORTANTE: Verificar si el campo ya tiene un valor en document_field_values
                    // Si es así, NO guardarlo en field_values (es un campo pre-llenado de plantilla)
                    const [existingTemplateValue] = await new Promise((resolve, reject) => {
                        db.query(
                            'SELECT field_value FROM document_field_values WHERE field_id = ? AND document_id = ?',
                            [field.field_id, recipient.document_id],
                            (err, results) => {
                                if (err) reject(err);
                                else resolve([results]);
                            }
                        );
                    });

                    if (existingTemplateValue.length > 0 && existingTemplateValue[0].field_value) {
                        console.log(`   ⏭️ Campo ${field.field_id} ya tiene valor en document_field_values - NO se guarda en field_values`);
                        continue; // Saltar este campo, no guardarlo en field_values
                    }

                    let valueType = null;
                    let textValue = null;
                    let signaturePath = null;
                    let dateValue = null;

                    // Extraer el valor según el tipo de campo
                    if ((field.type === 'signature' || field.type === 'final_signature') && field.dataUrl) {
                        valueType = 'signature_image';
                        signaturePath = field.dataUrl; // Base64 de la imagen de firma
                        console.log(`   ✅ Firma detectada (${field.type}) con dataUrl de ${field.dataUrl.length} caracteres`);
                    } else if (field.type === 'text' && field.textValue) {
                        valueType = 'text';
                        textValue = JSON.stringify({
                            text: field.textValue,
                            style: field.textStyle
                        });
                        console.log(`   ✅ Texto detectado: "${field.textValue}"`);
                    } else if (field.type === 'date' && field.dateValue) {
                        valueType = 'date';
                        dateValue = field.dateValue;
                        console.log(`   ✅ Fecha detectada: ${field.dateValue}`);
                    }

                    if (valueType) {
                        // Insertar en tabla field_values
                        try {
                            await new Promise((resolve, reject) => {
                                db.query(
                                    `INSERT INTO field_values
                                    (field_id, recipient_id, value_type, text_value, signature_path, date_value)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE
                                    value_type = VALUES(value_type),
                                    text_value = VALUES(text_value),
                                    signature_path = VALUES(signature_path),
                                    date_value = VALUES(date_value),
                                    created_at = NOW()`,
                                    [field.field_id, recipient.recipient_id, valueType, textValue, signaturePath, dateValue],
                                    (err, results) => {
                                        if (err) reject(err);
                                        else resolve(results);
                                    }
                                );
                            });
                            console.log(`   ✓ Campo ${field.type} (field_id: ${field.field_id}) guardado en BD`);
                        } catch (err) {
                            console.error(`   ❌ Error guardando campo ${field.field_id}:`, err.message);
                        }
                    }
                }
            }
        }

        // Actualizar el estado del recipient a 'completed'
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE document_recipients SET status = ?, completed_at = NOW() WHERE token = ?',
                ['completed', token],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log('✅ Documento firmado exitosamente');
        console.log('📊 Estado actualizado a completed');

        // ✅ VERIFICAR SI ES UN PAGARÉ - Detectar viewer_group completado
        if (recipient.viewer_group_id) {
            console.log(`📋 Pagaré detectado - Viewer Group: ${recipient.viewer_group_id}`);
            await checkPagareCompletion(recipient.viewer_group_id, recipient.document_id);
        }

        // 🔥 NUEVO: Verificar si todas las partes han firmado (DESPUÉS de actualizar estado)
        const [allRecipients] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    dr.recipient_id,
                    dr.email,
                    dr.name,
                    dr.status,
                    dr.part_id,
                    COALESCE(dp.role_name, '') as part_name
                FROM document_recipients dr
                LEFT JOIN document_parts dp ON dr.part_id = dp.part_id
                WHERE dr.document_id = ?`,
                [recipient.document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const totalRecipients = allRecipients.length;
        const completedRecipients = allRecipients.filter(r => r.status === 'completed').length;

        console.log(`\n📊 Estado de firmantes:`);
        console.log(`   Total: ${totalRecipients}`);
        console.log(`   Completados: ${completedRecipients}`);
        console.log(`   Pendientes: ${totalRecipients - completedRecipients}`);

        allRecipients.forEach((r, idx) => {
            console.log(`   ${idx + 1}. ${r.email} (${r.name}) - ${r.status}${r.part_id ? ` [Parte ${r.part_id}]` : ''}`);
        });

        // 🔥 IMPORTANTE: Determinar si es documento personalizado (pagaré) o compartido
        // Un documento es pagaré si:
        // 1. El recipient tiene viewer_group_id (firmante regular de pagaré), O
        // 2. El recipient es firmante definitivo (is_final_signer=1) de un documento que tiene pagarés
        const isFinalSigner = recipient.is_final_signer === 1;

        // Verificar si el documento tiene metadata de pagaré
        const [pagareCheck] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT document_id FROM pagare_metadata WHERE document_id = ?',
                [recipient.document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const hasPagareMetadata = pagareCheck && pagareCheck.length > 0;
        const isPersonalizedDoc = !!recipient.viewer_group_id || (isFinalSigner && hasPagareMetadata);
        const docType = isPersonalizedDoc ? 'PERSONALIZADO (Pagaré)' : 'COMPARTIDO';

        console.log(`📄 Tipo de documento: ${docType}`);
        console.log(`   viewer_group_id: ${recipient.viewer_group_id || 'null'}`);
        console.log(`   is_final_signer: ${isFinalSigner}`);
        console.log(`   tiene metadata pagaré: ${hasPagareMetadata}`);

        // 🔥 NUEVO FLUJO PARA PAGARÉS:
        // - Firmante regular: NO sellar (allSigned = false)
        // - Firmante definitivo: Sellar TODOS los pagarés (allSigned = true)
        let allSigned = false;

        if (isPersonalizedDoc && isFinalSigner) {
            // 🔥 FIRMANTE DEFINITIVO: Saltar procesamiento normal y ir directo a sellar TODOS los pagarés
            console.log('✅ Firmante DEFINITIVO detectado: Saltando procesamiento normal, sellando TODOS los pagarés directamente');
            allSigned = true;

            // SKIP todo el procesamiento de PDF individual (líneas 1800-2225)
            // Ir directo al código de sellado masivo (línea 2227+)
            // NO ejecutar código de las líneas 1800-2225

        } else if (isPersonalizedDoc && !isFinalSigner) {
            // 🔥 FIRMANTE REGULAR: NO sellar, solo escribir firma
            console.log('📝 Firmante REGULAR detectado: Escribiendo firma SIN sello PKI');
            allSigned = false;
        } else {
            // Para documentos NO personalizados: esperar a que TODOS firmen
            if (completedRecipients === totalRecipients) {
                console.log('🎉 ¡Todos los destinatarios han firmado!');
                allSigned = true;
            } else {
                console.log(`⏳ Esperando a ${totalRecipients - completedRecipients} destinatario(s) más...`);
                console.log(`   📋 Firmados: ${completedRecipients}/${totalRecipients}`);
            }
        }

        // ========================================================================
        // GENERAR PDF INTERMEDIO CON FIRMAS ACTUALES (SOLO FIRMANTES REGULARES)
        // 🔥 FIRMANTE DEFINITIVO: Saltar este bloque completo
        // ========================================================================

        if (!(isPersonalizedDoc && isFinalSigner)) {
            // Solo procesar PDF individual si NO es firmante definitivo de pagaré
            console.log('\n📝 Generando PDF intermedio con firmas actuales...');

            try {

            // 1. Recuperar todos los campos del documento (incluyendo sellos)
            const allFieldsQuery = `
                SELECT
                    field_id,
                    field_type as type,
                    page_number as page,
                    x_position as x,
                    y_position as y,
                    width,
                    height
                FROM document_fields
                WHERE document_id = ?
            `;

            const [allFields] = await new Promise((resolve, reject) => {
                db.query(allFieldsQuery, [recipient.document_id], (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                });
            });

            // 2. Obtener campos de firma manuscrita (signature)
            let signatureFieldsQuery;
            let signatureFieldsParams;

            if (isPersonalizedDoc) {
                // Para pagarés, obtener TODAS las firmas del mismo viewer_group
                // Cada pagaré comparte firmas entre todos sus firmantes
                signatureFieldsQuery = `
                    SELECT
                        df.field_id,
                        df.page_number as page,
                        df.x_position as x,
                        df.y_position as y,
                        df.width,
                        df.height,
                        fv.signature_path,
                        dr.name as signer_name
                    FROM document_fields df
                    LEFT JOIN field_values fv ON df.field_id = fv.field_id
                    LEFT JOIN document_recipients dr ON fv.recipient_id = dr.recipient_id
                    WHERE df.document_id = ? AND df.field_type = 'signature' AND fv.signature_path IS NOT NULL
                      AND dr.viewer_group_id = ?
                `;
                signatureFieldsParams = [recipient.document_id, recipient.viewer_group_id];
            } else {
                // Para documentos compartidos, obtener todas las firmas
                signatureFieldsQuery = `
                    SELECT
                        df.field_id,
                        df.page_number as page,
                        df.x_position as x,
                        df.y_position as y,
                        df.width,
                        df.height,
                        fv.signature_path,
                        dr.name as signer_name
                    FROM document_fields df
                    LEFT JOIN field_values fv ON df.field_id = fv.field_id
                    LEFT JOIN document_recipients dr ON fv.recipient_id = dr.recipient_id
                    WHERE df.document_id = ? AND df.field_type = 'signature' AND fv.signature_path IS NOT NULL
                `;
                signatureFieldsParams = [recipient.document_id];
            }

            const [signatureFields] = await new Promise((resolve, reject) => {
                db.query(signatureFieldsQuery, signatureFieldsParams, (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                });
            });

            console.log(`✍️ Firmas manuscritas encontradas: ${signatureFields.length}`);
            if (signatureFields.length > 0) {
                signatureFields.forEach((sig, idx) => {
                    console.log(`   Firma ${idx + 1}: ${sig.signer_name} - Página ${sig.page}, Posición (${sig.x}, ${sig.y})`);
                });
            }

            // 3. Filtrar campos tipo 'seal'
            const sealFields = allFields.filter(f => f.type === 'seal');
            console.log(`🔐 Sellos PKI encontrados: ${sealFields.length}`);

            if (sealFields.length > 0) {
                sealFields.forEach((seal, idx) => {
                    console.log(`   Sello ${idx + 1}: Página ${seal.page}, Posición (${seal.x}, ${seal.y}), Tamaño ${seal.width}×${seal.height}`);
                });
            }

            // 4. Leer el PDF (usar custom_pdf_path si existe, sino file_path compartido)
            // 🔥 IMPORTANTE: Si tiene custom_pdf_path, usar ese (CSV personalizado)
            const sourcePath = recipient.custom_pdf_path || recipient.file_path;
            const pdfType = recipient.custom_pdf_path ? 'PERSONALIZADO (CSV)' : 'COMPARTIDO (Manual)';

            // Limpiar la ruta: si empieza con /, quitarlo para Windows
            const cleanPath = sourcePath.startsWith('/')
                ? sourcePath.substring(1)
                : sourcePath;
            const pdfPath = resolveFromRoot(cleanPath);

            console.log(`📂 PDF a usar: ${pdfType}`);
            console.log(`📂 Ruta: ${pdfPath}`);

            if (!fs.existsSync(pdfPath)) {
                console.warn(`⚠️ PDF no encontrado: ${pdfPath}`);
                throw new Error('PDF original no encontrado');
            }

            let pdfBuffer = fs.readFileSync(pdfPath);
            console.log(`📄 PDF leído: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

            // 5. DIBUJAR FIRMAS MANUSCRITAS Y PREPARAR SELLOS PKI
            let sealsForPython = [];
            if (signatureFields.length > 0 || sealFields.length > 0) {
                try {
                    const { PDFDocument, rgb } = require('pdf-lib');
                    const pdfDoc = await PDFDocument.load(pdfBuffer);

                    // 5.1 Dibujar firmas manuscritas primero
                    if (signatureFields.length > 0) {
                        console.log(`✍️ Dibujando ${signatureFields.length} firma(s) manuscrita(s)...`);

                        for (const sigField of signatureFields) {
                            // Convertir de índice base-1 (frontend) a base-0 (pdf-lib)
                            const pageNum = (sigField.page || 1) - 1;
                            if (pageNum < 0 || pageNum >= pdfDoc.getPageCount()) {
                                console.warn(`   ⚠️ Página ${pageNum + 1} no existe, saltando firma`);
                                continue;
                            }

                            const page = pdfDoc.getPage(pageNum);
                            const { height: pageHeight, width: pageWidth } = page.getSize();

                            const fieldX = parseFloat(sigField.x) || 10;
                            const fieldY = parseFloat(sigField.y) || 10;
                            const fieldWidth = parseFloat(sigField.width) || 150;
                            const fieldHeight = parseFloat(sigField.height) || 50;

                            // Convertir coordenadas: Frontend usa Y desde arriba, PDF usa Y desde abajo
                            const x = fieldX;
                            const y = pageHeight - fieldY - fieldHeight;
                            const width = fieldWidth;
                            const height = fieldHeight;

                            console.log(`   📐 Coordenadas firma:`, {
                                pageSize: `${pageWidth}x${pageHeight}`,
                                campoFrontend: { x: fieldX, y: fieldY, width: fieldWidth, height: fieldHeight },
                                pdfCoords: { x, y, width, height }
                            });

                            // Validar que las coordenadas estén dentro de los límites
                            if (x < 0 || y < 0 || x + width > pageWidth || y + height > pageHeight) {
                                console.warn(`   ⚠️ Coordenadas fuera de límites, ajustando...`);
                                // Si está fuera, intentar ajustar
                                if (y < 0) {
                                    console.error(`   ❌ Y negativa (${y}), la firma está fuera del PDF. Campo mal posicionado.`);
                                    continue; // Saltar esta firma
                                }
                            }

                            // La firma viene en base64 (data:image/png;base64,...)
                            const signatureDataUrl = sigField.signature_path;

                            if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                                try {
                                    // Extraer el base64 puro
                                    const base64Data = signatureDataUrl.split(',')[1];
                                    const imageBytes = Buffer.from(base64Data, 'base64');

                                    console.log(`   📦 Imagen: ${imageBytes.length} bytes`);

                                    // Detectar tipo de imagen y embeber
                                    let image;
                                    if (signatureDataUrl.includes('image/png')) {
                                        image = await pdfDoc.embedPng(imageBytes);
                                        console.log(`   🖼️ PNG embedido`);
                                    } else if (signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg')) {
                                        image = await pdfDoc.embedJpg(imageBytes);
                                        console.log(`   🖼️ JPG embedido`);
                                    } else {
                                        console.warn(`   ⚠️ Formato de imagen no soportado`);
                                        continue;
                                    }

                                    // Escalar la firma para que quepa bien en el campo
                                    const imgDims = image.scale(1);
                                    const imgAspect = imgDims.width / imgDims.height;
                                    const fieldAspect = width / height;

                                    let drawWidth, drawHeight, drawX, drawY;
                                    if (imgAspect > fieldAspect) {
                                        drawWidth = width * 0.9;
                                        drawHeight = drawWidth / imgAspect;
                                    } else {
                                        drawHeight = height * 0.9;
                                        drawWidth = drawHeight * imgAspect;
                                    }

                                    // Centrar la firma en el campo
                                    drawX = x + (width - drawWidth) / 2;
                                    drawY = y + (height - drawHeight) / 2;

                                    console.log(`   🎨 Dibujando en:`, { drawX, drawY, drawWidth, drawHeight });

                                    // Dibujar la imagen de la firma
                                    page.drawImage(image, {
                                        x: drawX,
                                        y: drawY,
                                        width: drawWidth,
                                        height: drawHeight
                                    });

                                    console.log(`   ✅ Firma manuscrita dibujada en página ${pageNum + 1}`);
                                } catch (imgError) {
                                    console.error(`   ❌ Error dibujando firma: ${imgError.message}`);
                                }
                            }
                        }
                    }

                    // 5.1.5 NUEVO: Dibujar campos de texto completados por usuarios
                    // 🔥 CRÍTICO: Para pagarés (isPersonalizedDoc), NO dibujar textos
                    // porque ya están escritos permanentemente en el PDF por generatePersonalizedPagare()
                    console.log('\n📝 Procesando campos de texto...');

                    if (!isPersonalizedDoc) {
                        // Solo para documentos NO personalizados: dibujar textos completados por usuarios
                        console.log(`   ⏭️ Saltando campos pre-llenados (ya escritos en PDF por bulk-send)`);

                        const userTextQuery = `
                            SELECT df.field_id, df.page_number as page, df.x_position as x, df.y_position as y,
                                   df.width, df.height, fv.text_value
                            FROM document_fields df
                            LEFT JOIN field_values fv ON df.field_id = fv.field_id
                            WHERE df.document_id = ? AND df.field_type = 'text' AND fv.text_value IS NOT NULL
                        `;

                        const [userTexts] = await new Promise((resolve, reject) => {
                            db.query(userTextQuery, [recipient.document_id], (err, results) => {
                                if (err) reject(err);
                                else resolve([results]);
                            });
                        });

                        console.log(`   ✍️ Campos completados por usuarios: ${userTexts.length}`);

                        const allTextFields = userTexts;

                        if (allTextFields.length > 0) {
                        for (const textField of allTextFields) {
                            const pageNum = (textField.page || 1) - 1;
                            if (pageNum < 0 || pageNum >= pdfDoc.getPageCount()) {
                                continue;
                            }
                            
                            const page = pdfDoc.getPage(pageNum);
                            const { height: pageHeight } = page.getSize();
                            
                            const fieldX = parseFloat(textField.x) || 0;
                            const fieldY = parseFloat(textField.y) || 0;
                            const fieldHeight = parseFloat(textField.height) || 20;
                            
                            // Convertir coordenadas
                            const x = fieldX + 4; // Pequeño margen interno
                            const y = pageHeight - fieldY - fieldHeight + 4;
                            
                            // Extraer el texto (puede estar en JSON o texto plano)
                            let textContent = textField.text || textField.text_value;
                            if (textField.text_value) {
                                try {
                                    const parsed = JSON.parse(textField.text_value);
                                    textContent = parsed.text || textContent;
                                } catch (e) {
                                    // Si no es JSON, usar tal cual
                                }
                            }
                            
                            if (!textContent) continue;
                            
                            try {
                                page.drawText(textContent, {
                                    x: x,
                                    y: y,
                                    size: 12,
                                    color: rgb(0, 0, 0)
                                });
                                
                                console.log(`   ✅ Texto dibujado: "${textContent.substring(0, 30)}..." en página ${pageNum + 1}`);
                            } catch (drawError) {
                                console.error(`   ❌ Error dibujando texto: ${drawError.message}`);
                            }
                        }
                        }
                    } else {
                        // Para pagarés: textos ya están en el PDF, no dibujar nada
                        console.log(`   ⏭️ PAGARÉ: Textos ya escritos permanentemente en PDF por generatePersonalizedPagare (no se redibujan)`);
                    }

                    // 5.2 Preparar sellos PKI para el microservicio Python (con QR)
                    // Convertir coordenadas del editor a coordenadas PDF
                    if (sealFields.length > 0) {
                        console.log(`📝 Preparando ${sealFields.length} sello(s) PKI para Python...`);

                        for (const seal of sealFields) {
                            const pageNum = seal.page || 1;
                            const pageIndex = pageNum - 1;

                            if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
                                console.warn(`   ⚠️ Página ${pageNum} no existe, saltando sello`);
                                continue;
                            }

                            const page = pdfDoc.getPage(pageIndex);
                            const { height: pageHeight } = page.getSize();

                            const x = parseFloat(seal.x) || 10;
                            const width = parseFloat(seal.width) || 200;
                            const height = parseFloat(seal.height) || 80;
                            // Convertir Y del editor (desde arriba) a PDF (desde abajo)
                            const y = pageHeight - parseFloat(seal.y) - height;

                            sealsForPython.push({
                                page: pageNum,
                                x: x,
                                y: y,
                                width: width,
                                height: height
                            });

                            console.log(`   🔐 Sello ${sealsForPython.length}: Página ${pageNum}, PDF coords (${x.toFixed(0)}, ${y.toFixed(0)}), ${width}×${height}`);
                        }
                    }

                    // Guardar PDF con firmas manuscritas
                    pdfBuffer = Buffer.from(await pdfDoc.save());
                    console.log(`✅ PDF con firmas: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

                } catch (drawError) {
                    console.error('❌ Error dibujando firmas:', drawError.message);
                    throw drawError;
                }
            }

            // 6. Guardar PDF intermedio con firmas visuales
            const intermediatePdfDir = resolveFromRoot('uploads', 'signed');
            if (!fs.existsSync(intermediatePdfDir)) {
                fs.mkdirSync(intermediatePdfDir, { recursive: true });
            }

            const intermediatePdfFilename = `interim_${recipient.document_id}_${Date.now()}.pdf`;
            const intermediatePdfPath = path.join(intermediatePdfDir, intermediatePdfFilename);
            fs.writeFileSync(intermediatePdfPath, pdfBuffer);

            const relativeIntermediatePath = path.join('uploads', 'signed', intermediatePdfFilename);
            console.log(`💾 PDF intermedio guardado: ${relativeIntermediatePath}`);

            // 7. Actualizar file_path del documento para que apunte al PDF con firmas visuales
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE documents SET file_path = ? WHERE document_id = ?',
                    [relativeIntermediatePath, recipient.document_id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // ✅ CORREGIDO: Actualizar custom_pdf_path según el tipo de documento
            if (isPersonalizedDoc) {
                // DOCUMENTOS PERSONALIZADOS (Pagarés): PDF intermedio individual por recipient
                // El PDF base con firmas es compartido, pero la traza VI es EXCLUSIVA de cada uno.
                // Para cada recipient del viewer_group:
                //   - Si tiene vi_traza_path → su custom_pdf_path = PDF base con firmas + SU PROPIA traza
                //   - Si NO tiene vi_traza_path → su custom_pdf_path = PDF base con firmas (sin traza)
                const vgRecipientsForInterim = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT recipient_id, email, vi_traza_path FROM document_recipients WHERE viewer_group_id = ?',
                        [recipient.viewer_group_id],
                        (err, rows) => { if (err) reject(err); else resolve(rows); }
                    );
                });

                const { PDFDocument: PDFDocInterim } = require('pdf-lib');

                for (const vgRec of vgRecipientsForInterim) {
                    try {
                        // Empezar desde el PDF base con firmas (pdfBuffer ya tiene las firmas dibujadas)
                        let recInterimBuffer = pdfBuffer;

                        // Añadir SOLO la traza VI propia de este recipient (si la tiene)
                        if (vgRec.vi_traza_path) {
                            const trazaClean = vgRec.vi_traza_path.replace(/^\/+/, '');
                            const trazaAbs = resolveFromRoot(trazaClean);
                            if (fs.existsSync(trazaAbs)) {
                                const baseDoc = await PDFDocInterim.load(recInterimBuffer);
                                const trazaDoc = await PDFDocInterim.load(fs.readFileSync(trazaAbs));
                                const trazaPages = await baseDoc.copyPages(trazaDoc, trazaDoc.getPageIndices());
                                trazaPages.forEach(p => baseDoc.addPage(p));
                                recInterimBuffer = Buffer.from(await baseDoc.save());
                                console.log(`   📋 [${vgRec.email}] Traza VI propia añadida al interim`);
                            } else {
                                console.warn(`   ⚠️ [${vgRec.email}] Traza VI no encontrada: ${trazaAbs}`);
                            }
                        }

                        // Guardar interim individual para este recipient
                        const recInterimFilename = `interim_personal_${vgRec.recipient_id}_${Date.now()}.pdf`;
                        const recInterimPath = path.join(intermediatePdfDir, recInterimFilename);
                        fs.writeFileSync(recInterimPath, recInterimBuffer);
                        const recInterimRelPath = path.join('uploads', 'signed', recInterimFilename).replace(/\\/g, '/');

                        await new Promise((resolve, reject) => {
                            db.query(
                                'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                [recInterimRelPath, vgRec.recipient_id],
                                (err) => { if (err) reject(err); else resolve(); }
                            );
                        });
                        console.log(`   ✅ [${vgRec.email}] Interim individual guardado: ${recInterimFilename}`);
                    } catch (recInterimErr) {
                        console.error(`   ⚠️ [${vgRec.email}] Error generando interim individual:`, recInterimErr.message);
                        // Fallback: asignar el PDF base sin traza
                        await new Promise((resolve) => {
                            db.query(
                                'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                [relativeIntermediatePath, vgRec.recipient_id],
                                () => resolve()
                            );
                        });
                    }
                }
                console.log(`✅ Interim individual generado para ${vgRecipientsForInterim.length} recipient(s) del viewer_group_id=${recipient.viewer_group_id} (pagaré)`);
            } else {
                // DOCUMENTOS COMPARTIDOS: Verificar si tienen PDFs individuales por destinatario (envío masivo con datos únicos)
                // Si tienen PDFs distintos (bulk-send personalizado), hay que dibujar las firmas en el PDF de CADA UNO
                const allDocRecipients = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT recipient_id, email, custom_pdf_path, personal_pdf_path, vi_traza_path
                         FROM document_recipients WHERE document_id = ?`,
                        [recipient.document_id],
                        (err, rows) => { if (err) reject(err); else resolve(rows); }
                    );
                });

                // Detectar si hay PDFs individuales: cuando algún destinatario tiene personal_pdf_path
                // (guardado por bulk-send con datos únicos del CSV)
                const recipientsWithPersonalPdf = allDocRecipients.filter(r => r.personal_pdf_path);

                const hasPersonalPdfs = recipientsWithPersonalPdf.length > 0;

                if (hasPersonalPdfs) {
                    // Modo PDFs individuales: dibujar las mismas firmas en el PDF de CADA destinatario
                    console.log(`🎯 Documento con PDFs individuales detectado (${recipientsWithPersonalPdf.length} destinatario(s) con PDF personal)`);
                    console.log(`   → Dibujando firmas en PDF de cada destinatario individualmente`);

                    for (const rec of allDocRecipients) {
                        try {
                            // Usar personal_pdf_path (datos CSV) como base.
                            // Si el vi-callback ya generó un vi_personal (custom_pdf_path), ese tiene
                            // los datos CSV + traza VI — usarlo como base para que la traza se conserve.
                            const recSourcePath = rec.custom_pdf_path || rec.personal_pdf_path || recipient.file_path;
                            const recCleanPath = recSourcePath.startsWith('/') ? recSourcePath.substring(1) : recSourcePath;
                            const recPdfPath = resolveFromRoot(recCleanPath);

                            if (!fs.existsSync(recPdfPath)) {
                                console.warn(`   ⚠️ PDF no encontrado para ${rec.email}: ${recPdfPath}`);
                                continue;
                            }

                            let recPdfBuffer = fs.readFileSync(recPdfPath);
                            const { PDFDocument: PDFDocRec } = require('pdf-lib');
                            const recPdfDoc = await PDFDocRec.load(recPdfBuffer);

                            // Dibujar todas las firmas en este PDF personal
                            for (const sigField of signatureFields) {
                                const pageNum = (sigField.page || 1) - 1;
                                if (pageNum < 0 || pageNum >= recPdfDoc.getPageCount()) continue;
                                const page = recPdfDoc.getPage(pageNum);
                                const { height: pageHeight } = page.getSize();

                                const fieldX = parseFloat(sigField.x) || 0;
                                const fieldY = parseFloat(sigField.y) || 0;
                                const fieldWidth = parseFloat(sigField.width) || 100;
                                const fieldHeight = parseFloat(sigField.height) || 50;
                                const x = fieldX;
                                const y = pageHeight - fieldY - fieldHeight;

                                const signatureDataUrl = sigField.signature_path;
                                if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                                    const base64Data = signatureDataUrl.split(',')[1];
                                    const imageBytes = Buffer.from(base64Data, 'base64');
                                    let image;
                                    if (signatureDataUrl.includes('image/png')) {
                                        image = await recPdfDoc.embedPng(imageBytes);
                                    } else {
                                        image = await recPdfDoc.embedJpg(imageBytes);
                                    }
                                    if (image) {
                                        const imgDims = image.scale(1);
                                        const imgAspect = imgDims.width / imgDims.height;
                                        const fieldAspect = fieldWidth / fieldHeight;
                                        let drawWidth, drawHeight;
                                        if (imgAspect > fieldAspect) {
                                            drawWidth = fieldWidth * 0.9;
                                            drawHeight = drawWidth / imgAspect;
                                        } else {
                                            drawHeight = fieldHeight * 0.9;
                                            drawWidth = drawHeight * imgAspect;
                                        }
                                        const drawX = x + (fieldWidth - drawWidth) / 2;
                                        const drawY = y + (fieldHeight - drawHeight) / 2;
                                        page.drawImage(image, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
                                    }
                                }
                            }

                            recPdfBuffer = Buffer.from(await recPdfDoc.save());

                            // Guardar interim personal para este destinatario
                            const recInterimFilename = `interim_personal_${rec.recipient_id}_${Date.now()}.pdf`;
                            const recInterimPath = path.join(intermediatePdfDir, recInterimFilename);
                            fs.writeFileSync(recInterimPath, recPdfBuffer);
                            const recInterimRelPath = path.join('uploads', 'signed', recInterimFilename).replace(/\\/g, '/');

                            await new Promise((resolve, reject) => {
                                db.query(
                                    'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                    [recInterimRelPath, rec.recipient_id],
                                    (err) => { if (err) reject(err); else resolve(); }
                                );
                            });
                            console.log(`   ✅ Interim personal generado para ${rec.email}: ${recInterimFilename}`);
                        } catch (recErr) {
                            console.error(`   ⚠️ Error generando interim personal para ${rec.email}:`, recErr.message);
                        }
                    }
                } else {
                    // Sin PDFs individuales: todos comparten el mismo PDF intermedio
                    await new Promise((resolve, reject) => {
                        db.query(
                            'UPDATE document_recipients SET custom_pdf_path = ? WHERE document_id = ?',
                            [relativeIntermediatePath, recipient.document_id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                    console.log(`✅ custom_pdf_path actualizado para TODOS los destinatarios del documento ${recipient.document_id} (compartido)`);
                }
            }

            console.log('✅ PDF actualizado con firmas visuales');

            // ========================================================================
            // SI TODOS HAN FIRMADO: GENERAR SELLO PKI CON TODOS LOS FIRMANTES
            // ========================================================================

            if (!allSigned) {
                console.log('⏩ Saltando generación de sello PKI (esperando más firmas)');

                return res.json({
                    success: true,
                    message: 'Firma registrada exitosamente. Esperando a que todos los destinatarios completen su firma.',
                    allSigned: false,
                    completed: completedRecipients,
                    total: totalRecipients
                });
            }

            } catch (pdfProcessingError) {
                console.error('❌ Error procesando PDF:', pdfProcessingError);
                throw pdfProcessingError;
            }

        } // FIN del if (!(isPersonalizedDoc && isFinalSigner)) - Cerrar bloque de procesamiento normal

        // ========================================================================
        // SELLADO FINAL (para firmantes definitivos o cuando todos han firmado)
        // ========================================================================

        // 🔥 FIRMANTE DEFINITIVO: Sellar TODOS los pagarés
        if (isFinalSigner && isPersonalizedDoc) {
            try {
                console.log('\n🔒🔒🔒 FIRMANTE DEFINITIVO: Sellando TODOS los pagarés del documento...');

                // Definir directorio para PDFs intermedios y finales
                const intermediatePdfDir = resolveFromRoot('uploads', 'signed');
                if (!fs.existsSync(intermediatePdfDir)) {
                    fs.mkdirSync(intermediatePdfDir, { recursive: true });
                }

                // Obtener metadata del firmante definitivo
                const [finalSignerMetadata] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT final_signer_email, final_signer_name
                         FROM pagare_metadata
                         WHERE document_id = ?`,
                        [recipient.document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                const finalSignerName = finalSignerMetadata[0]?.final_signer_name || recipient.name || 'Firmante Definitivo';
                const finalSignerEmail = finalSignerMetadata[0]?.final_signer_email || recipient.email;

                // Obtener TODOS los viewer_groups del documento
                const [allViewerGroups] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT viewer_group_id, custom_pdf_path
                         FROM pagare_viewer_groups
                         WHERE document_id = ?`,
                        [recipient.document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                console.log(`   📋 Total de pagarés a sellar: ${allViewerGroups.length}`);

                // 🔥 Obtener el campo final_signature y su firma (es el MISMO para todos los pagarés)
                console.log(`   🔍 Buscando campo final_signature para recipient_id=${recipient.recipient_id}, document_id=${recipient.document_id}`);

                // Buscar la firma definitiva: primero intentar con recipient_id exacto,
                // si no tiene signature_path buscar cualquier field_value del campo final_signature
                // (puede pasar que el recipient_id en field_values no coincide exactamente)
                const [finalSignatureField] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT
                            df.field_id,
                            df.page_number as page,
                            df.x_position as x,
                            df.y_position as y,
                            df.width,
                            df.height,
                            df.field_type as type,
                            fv.signature_path,
                            fv.recipient_id as fv_recipient_id
                         FROM document_fields df
                         LEFT JOIN field_values fv ON df.field_id = fv.field_id
                             AND fv.signature_path IS NOT NULL
                         WHERE df.document_id = ? AND df.field_type = 'final_signature'
                         ORDER BY (fv.recipient_id = ?) DESC
                         LIMIT 1`,
                        [recipient.document_id, recipient.recipient_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                console.log(`   🔍 Resultado consulta: ${finalSignatureField ? finalSignatureField.length : 0} registro(s)`);
                if (finalSignatureField && finalSignatureField.length > 0) {
                    console.log(`   🔍 field_id: ${finalSignatureField[0].field_id}`);
                    console.log(`   🔍 signature_path: ${finalSignatureField[0].signature_path ? 'EXISTE ('+finalSignatureField[0].signature_path.substring(0,50)+'...)' : 'NULL'}`);
                    console.log(`   🔍 fv_recipient_id: ${finalSignatureField[0].fv_recipient_id}`);
                }

                if (!finalSignatureField || finalSignatureField.length === 0 || !finalSignatureField[0].signature_path) {
                    console.error('   ❌ No se encontró el campo final_signature o no tiene firma');
                    return res.status(400).json({
                        success: false,
                        message: 'No se encontró la firma definitiva'
                    });
                }

                const finalSigField = finalSignatureField[0];
                console.log(`   ✅ Campo final_signature encontrado (${finalSigField.width}x${finalSigField.height} en página ${finalSigField.page})`);

                // Procesar cada pagaré
                for (let i = 0; i < allViewerGroups.length; i++) {
                    const viewerGroup = allViewerGroups[i];
                    console.log(`\n   📝 Sellando pagaré ${i + 1}/${allViewerGroups.length} (viewer_group_id: ${viewerGroup.viewer_group_id})...`);

                    try {
                        // Obtener TODOS los recipients del viewer_group con sus datos
                        const vgAllRecipients = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT recipient_id, email, custom_pdf_path, personal_pdf_path,
                                        vi_traza_path, completed_at
                                 FROM document_recipients
                                 WHERE viewer_group_id = ?
                                 ORDER BY completed_at ASC`,
                                [viewerGroup.viewer_group_id],
                                (err, results) => {
                                    if (err) reject(err);
                                    else resolve(results);
                                }
                            );
                        });

                        if (vgAllRecipients.length === 0) {
                            console.warn(`   ⚠️ No se encontraron recipients para viewer_group ${viewerGroup.viewer_group_id}`);
                            continue;
                        }

                        // Construir PDF del pagaré por recipient:
                        // - PDF base con datos CSV (igual para todos del grupo)
                        // - Firmas de todos los firmantes del grupo (compartidas)
                        // - Firma definitiva (compartida)
                        // - Traza VI: EXCLUSIVA de cada recipient (no se comparte entre sí)
                        // - Sello PKI: individual por recipient
                        const { PDFDocument } = require('pdf-lib');

                        // 1. Tomar el PDF base con datos del CSV (personal_pdf_path del primer recipient con uno)
                        const baseRec = vgAllRecipients.find(r => r.personal_pdf_path) || vgAllRecipients[0];
                        const basePdfRelPath = (baseRec.personal_pdf_path || baseRec.custom_pdf_path || '');
                        const basePdfClean = basePdfRelPath.startsWith('/') ? basePdfRelPath.substring(1) : basePdfRelPath;
                        const basePdfAbs = resolveFromRoot(basePdfClean);

                        if (!basePdfAbs || !fs.existsSync(basePdfAbs)) {
                            console.warn(`   ⚠️ PDF base no encontrado para viewer_group ${viewerGroup.viewer_group_id}: ${basePdfAbs}`);
                            continue;
                        }

                        // 2. Obtener firmas de todos los firmantes del grupo
                        const vgSignatures = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT df.field_id, df.page_number as page,
                                        df.x_position as x, df.y_position as y,
                                        df.width, df.height, fv.signature_path, dr.name as signer_name
                                 FROM document_fields df
                                 LEFT JOIN field_values fv ON df.field_id = fv.field_id
                                 LEFT JOIN document_recipients dr ON fv.recipient_id = dr.recipient_id
                                 WHERE df.document_id = ? AND df.field_type = 'signature'
                                   AND fv.signature_path IS NOT NULL AND dr.viewer_group_id = ?`,
                                [recipient.document_id, viewerGroup.viewer_group_id],
                                (err, results) => { if (err) reject(err); else resolve(results); }
                            );
                        });

                        // 3. Obtener campos de sello una sola vez
                        const [sealFields] = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT page_number as page, x_position as x, y_position as y, width, height
                                 FROM document_fields
                                 WHERE document_id = ? AND field_type = 'seal'`,
                                [recipient.document_id],
                                (err, results) => { if (err) reject(err); else resolve([results]); }
                            );
                        });
                        console.log(`   🔐 Sellos PKI encontrados: ${sealFields.length}`);

                        // Helper: dibujar firmas de grupo en un PDFDocument ya cargado
                        async function drawGroupSignatures(pdfDoc) {
                            for (const sigField of vgSignatures) {
                                const pageNum = (sigField.page || 1) - 1;
                                if (pageNum < 0 || pageNum >= pdfDoc.getPageCount()) continue;
                                const page = pdfDoc.getPage(pageNum);
                                const { height: ph } = page.getSize();
                                const fx = parseFloat(sigField.x) || 0;
                                const fy = parseFloat(sigField.y) || 0;
                                const fw = parseFloat(sigField.width) || 100;
                                const fh = parseFloat(sigField.height) || 50;
                                const drawY = ph - fy - fh;
                                const sigUrl = sigField.signature_path;
                                if (sigUrl && sigUrl.startsWith('data:image')) {
                                    const b64 = sigUrl.split(',')[1];
                                    const imgBytes = Buffer.from(b64, 'base64');
                                    let img;
                                    try {
                                        if (sigUrl.includes('image/png')) img = await pdfDoc.embedPng(imgBytes);
                                        else img = await pdfDoc.embedJpg(imgBytes);
                                    } catch (_) { continue; }
                                    if (img) {
                                        const dims = img.scale(1);
                                        const aspect = dims.width / dims.height;
                                        const fAspect = fw / fh;
                                        let dw, dh;
                                        if (aspect > fAspect) { dw = fw * 0.9; dh = dw / aspect; }
                                        else { dh = fh * 0.9; dw = dh * aspect; }
                                        page.drawImage(img, {
                                            x: fx + (fw - dw) / 2,
                                            y: drawY + (fh - dh) / 2,
                                            width: dw, height: dh
                                        });
                                    }
                                }
                            }
                        }

                        // Helper: dibujar firma definitiva en un PDFDocument ya cargado
                        async function drawFinalSignature(pdfDoc) {
                            if (!finalSigField || !finalSigField.signature_path) return;
                            const pageNum = (finalSigField.page || 1) - 1;
                            if (pageNum < 0 || pageNum >= pdfDoc.getPageCount()) return;
                            const page = pdfDoc.getPage(pageNum);
                            const { height: pageHeight } = page.getSize();
                            const fieldX = parseFloat(finalSigField.x) || 10;
                            const fieldY = parseFloat(finalSigField.y) || 10;
                            const fieldWidth = parseFloat(finalSigField.width) || 150;
                            const fieldHeight = parseFloat(finalSigField.height) || 50;
                            const x = fieldX;
                            const y = pageHeight - fieldY - fieldHeight;
                            const signatureDataUrl = finalSigField.signature_path;
                            if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                                const base64Data = signatureDataUrl.split(',')[1];
                                const imageBytes = Buffer.from(base64Data, 'base64');
                                let image;
                                try {
                                    if (signatureDataUrl.includes('image/png')) image = await pdfDoc.embedPng(imageBytes);
                                    else image = await pdfDoc.embedJpg(imageBytes);
                                } catch (_) { return; }
                                if (image) {
                                    const imgDims = image.scale(1);
                                    const imgAspect = imgDims.width / imgDims.height;
                                    const fieldAspect = fieldWidth / fieldHeight;
                                    let drawWidth, drawHeight;
                                    if (imgAspect > fieldAspect) { drawWidth = fieldWidth * 0.9; drawHeight = drawWidth / imgAspect; }
                                    else { drawHeight = fieldHeight * 0.9; drawWidth = drawHeight * imgAspect; }
                                    page.drawImage(image, {
                                        x: x + (fieldWidth - drawWidth) / 2,
                                        y: y + (fieldHeight - drawHeight) / 2,
                                        width: drawWidth, height: drawHeight
                                    });
                                }
                            }
                        }

                        // Helper: calcular sellos para un PDFDocument dado
                        function computeSealPositions(pdfDoc) {
                            const seals = [];
                            for (const seal of sealFields) {
                                const pageNum = seal.page || 1;
                                const pageIndex = pageNum - 1;
                                if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount()) {
                                    const pg = pdfDoc.getPage(pageIndex);
                                    const { height: pageHeight } = pg.getSize();
                                    seals.push({
                                        page: pageNum,
                                        x: parseFloat(seal.x) || 10,
                                        y: pageHeight - parseFloat(seal.y) - (parseFloat(seal.height) || 80),
                                        width: parseFloat(seal.width) || 200,
                                        height: parseFloat(seal.height) || 80
                                    });
                                }
                            }
                            return seals;
                        }

                        // 4. Generar UN PDF sellado por cada recipient con SU PROPIA traza VI
                        console.log(`   📄 Generando PDF individual sellado para cada recipient del grupo...`);
                        const pythonSigner = new PythonSignerClient({ verbose: true });

                        for (const recToSeal of vgAllRecipients) {
                            try {
                                // Cargar PDF base (datos CSV) fresco para cada recipient
                                const recBasePath = recToSeal.personal_pdf_path || recToSeal.custom_pdf_path || '';
                                const recBaseClean = recBasePath.startsWith('/') ? recBasePath.substring(1) : recBasePath;
                                // Si el recipient tiene su propio personal_pdf_path usarlo, sino usar el base del grupo
                                const recPdfAbs = recBaseClean && fs.existsSync(resolveFromRoot(recBaseClean))
                                    ? resolveFromRoot(recBaseClean)
                                    : basePdfAbs;

                                const recPdfDoc = await PDFDocument.load(fs.readFileSync(recPdfAbs));

                                // Dibujar firmas compartidas del grupo
                                await drawGroupSignatures(recPdfDoc);
                                console.log(`      ✍️ [${recToSeal.email}] ${vgSignatures.length} firma(s) dibujada(s)`);

                                // Añadir SOLO la traza VI propia de este recipient
                                if (recToSeal.vi_traza_path) {
                                    const trazaAbs = resolveFromRoot(recToSeal.vi_traza_path.replace(/^\/+/, ''));
                                    if (fs.existsSync(trazaAbs)) {
                                        const trazaDoc = await PDFDocument.load(fs.readFileSync(trazaAbs));
                                        const trazaPages = await recPdfDoc.copyPages(trazaDoc, trazaDoc.getPageIndices());
                                        trazaPages.forEach(p => recPdfDoc.addPage(p));
                                        console.log(`      📋 [${recToSeal.email}] Traza VI propia añadida`);
                                    } else {
                                        console.warn(`      ⚠️ [${recToSeal.email}] Traza VI no encontrada: ${trazaAbs}`);
                                    }
                                } else {
                                    console.log(`      ℹ️ [${recToSeal.email}] Sin traza VI (identidad pre-verificada o no requerida)`);
                                }

                                // Dibujar firma definitiva
                                await drawFinalSignature(recPdfDoc);
                                console.log(`      ✍️ [${recToSeal.email}] Firma definitiva dibujada`);

                                // Calcular posiciones de sellos
                                let recPdfBuffer = Buffer.from(await recPdfDoc.save());
                                const recPdfDocForSeals = await PDFDocument.load(recPdfBuffer);
                                const sealsForRec = computeSealPositions(recPdfDocForSeals);

                                // Aplicar sello PKI individual
                                const pagareVerifToken = crypto
                                    .createHash('sha256')
                                    .update(`VERIFY-${recipient.document_id}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                                    .digest('hex')
                                    .substring(0, 32);
                                const signedRecPdfBuffer = await pythonSigner.signPdf(recPdfBuffer, {
                                    reason: `Firmante Definitivo: ${finalSignerName} (${finalSignerEmail})`,
                                    location: 'Colombia',
                                    signerName: 'PKI Services',
                                    contactInfo: finalSignerEmail,
                                    fieldName: `FinalSignature_${recipient.document_id}_vg${viewerGroup.viewer_group_id}_rec${recToSeal.recipient_id}`,
                                    visible: true,
                                    seals: sealsForRec.length > 0 ? sealsForRec : null,
                                    verificationToken: pagareVerifToken
                                });

                                // Guardar PDF final sellado individual
                                const finalPdfFilename = `final_${recipient.document_id}_vg${viewerGroup.viewer_group_id}_rec${recToSeal.recipient_id}_${Date.now()}.pdf`;
                                const finalPdfPath = path.join(intermediatePdfDir, finalPdfFilename);
                                fs.writeFileSync(finalPdfPath, signedRecPdfBuffer);
                                const relativeFinalPath = path.join('uploads', 'signed', finalPdfFilename);

                                // Actualizar custom_pdf_path SOLO de este recipient
                                await new Promise((resolve, reject) => {
                                    db.query(
                                        'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                        [relativeFinalPath, recToSeal.recipient_id],
                                        (err) => { if (err) reject(err); else resolve(); }
                                    );
                                });

                                console.log(`      ✅ [${recToSeal.email}] PDF sellado guardado: ${finalPdfFilename}`);

                            } catch (recSealErr) {
                                console.error(`      ❌ [${recToSeal.email}] Error sellando PDF individual:`, recSealErr.message);
                            }
                        }

                        console.log(`   ✅ Pagaré ${i + 1}: ${vgAllRecipients.length} PDF(s) individual(es) sellado(s)`);

                    } catch (vgError) {
                        console.error(`   ❌ Error sellando pagaré viewer_group ${viewerGroup.viewer_group_id}:`, vgError.message);
                    }
                }

                console.log(`\n✅✅✅ TODOS LOS PAGARÉS SELLADOS EXITOSAMENTE (${allViewerGroups.length} pagarés)`);

                // Guardar verification_token en documents para que el QR sea verificable
                const pagareDocVerifToken = crypto
                    .createHash('sha256')
                    .update(`VERIFY-${recipient.document_id}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                    .digest('hex')
                    .substring(0, 32);
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE documents SET verification_token = ? WHERE document_id = ?',
                        [pagareDocVerifToken, recipient.document_id],
                        (err) => { if (err) reject(err); else resolve(); }
                    );
                });
                console.log(`   🔐 verification_token guardado para pagaré doc ${recipient.document_id}`);

                // 🔥 GENERAR PDF ESPECIAL PARA EL FIRMANTE DEFINITIVO (PDF CENSURADO + firma definitiva + sello)
                // ⚠️ SOLO para pagarés con envío masivo
                console.log('\n📄 Generando PDF especial CENSURADO para el firmante definitivo...');

                try {
                    // ✅ VALIDACIÓN: Verificar que sea envío masivo
                    const viewerCount = allViewerGroups.length;
                    console.log(`   🔍 Viewer groups: ${viewerCount}`);

                    if (viewerCount <= 1) {
                        console.log(`   ℹ️  Pagaré con ${viewerCount} viewer(s), no es envío masivo`);
                        console.log(`   ℹ️  Usando PDF sin censura para firmante definitivo`);
                        // No generar PDF censurado, usar flujo normal
                        // (el código continuará sin custom_pdf_path especial)
                    }

                    // 🔒 Obtener el PDF CENSURADO del firmante definitivo (custom_pdf_path)
                    const [finalSignerRecipient] = await new Promise((resolve, reject) => {
                        db.query(
                            'SELECT custom_pdf_path FROM document_recipients WHERE document_id = ? AND is_final_signer = 1',
                            [recipient.document_id],
                            (err, results) => {
                                if (err) reject(err);
                                else resolve([results]);
                            }
                        );
                    });

                    let censoredPdfPath;
                    if (finalSignerRecipient.length > 0 && finalSignerRecipient[0].custom_pdf_path) {
                        // Usar el PDF censurado que se generó en notifyFinalSigner()
                        censoredPdfPath = finalSignerRecipient[0].custom_pdf_path;
                        console.log(`   ✅ Usando PDF censurado: ${censoredPdfPath}`);
                    } else {
                        // Para 1 viewer_group: generar un PDF censurado desde la base limpia (pagare_vg_)
                        // La base limpia tiene los datos CSV pero sin firmas manuscritas.
                        // Obtenemos personal_pdf_path de cualquier recipient del viewer group (no se sobreescribe).
                        console.log(`   ℹ️  Sin custom_pdf_path — generando PDF censurado desde base pagare_vg_`);

                        const [vgRecipient] = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT dr.personal_pdf_path FROM document_recipients dr
                                 WHERE dr.document_id = ? AND dr.is_final_signer = 0 AND dr.personal_pdf_path IS NOT NULL
                                 LIMIT 1`,
                                [recipient.document_id],
                                (err, r) => { if (err) reject(err); else resolve([r]); }
                            );
                        });

                        let basePdfPath;
                        if (vgRecipient.length > 0 && vgRecipient[0].personal_pdf_path) {
                            basePdfPath = vgRecipient[0].personal_pdf_path;
                            console.log(`   ✅ Base limpia (pagare_vg_): ${basePdfPath}`);
                        } else {
                            // Fallback: usar file_path del documento si no hay personal_pdf_path
                            const [docFallback] = await new Promise((resolve, reject) => {
                                db.query('SELECT file_path FROM documents WHERE document_id = ?',
                                    [recipient.document_id], (err, r) => { if (err) reject(err); else resolve([r]); });
                            });
                            basePdfPath = docFallback[0].file_path;
                            console.log(`   ⚠️  Fallback a file_path: ${basePdfPath}`);
                        }

                        const cleanBasePath = basePdfPath.startsWith('/') ? basePdfPath.substring(1) : basePdfPath;
                        const fullBasePath = resolveFromRoot(cleanBasePath);

                        if (!fs.existsSync(fullBasePath)) {
                            throw new Error(`PDF base no encontrado: ${fullBasePath}`);
                        }

                        // Cargar el PDF base limpio
                        const { PDFDocument: PDFDoc2, rgb: rgb2 } = require('pdf-lib');
                        const basePdfBytes = fs.readFileSync(fullBasePath);
                        const basePdfDoc = await PDFDoc2.load(basePdfBytes);

                        // Obtener todos los campos sensibles (text y signature)
                        const [fieldsToHide] = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT field_type, page_number, x_position, y_position, width, height
                                 FROM document_fields
                                 WHERE document_id = ? AND field_type IN ('text', 'signature')`,
                                [recipient.document_id],
                                (err, r) => { if (err) reject(err); else resolve([r]); }
                            );
                        });

                        console.log(`   🔒 Censurando ${fieldsToHide.length} campo(s) (text + signature)...`);

                        for (const field of fieldsToHide) {
                            const pageNum = field.page_number - 1;
                            if (pageNum >= 0 && pageNum < basePdfDoc.getPageCount()) {
                                const page = basePdfDoc.getPage(pageNum);
                                const { height: pageHeight } = page.getSize();

                                const fx = parseFloat(field.x_position);
                                const fy = pageHeight - parseFloat(field.y_position) - parseFloat(field.height);
                                const fw = parseFloat(field.width);
                                const fh = parseFloat(field.height);

                                if (field.field_type === 'signature') {
                                    // Campo de firma: rectángulo verde con texto "Firmado"
                                    page.drawRectangle({
                                        x: fx, y: fy, width: fw, height: fh,
                                        color: rgb2(0.88, 0.96, 0.88),
                                        borderColor: rgb2(0.2, 0.7, 0.2),
                                        borderWidth: 1.5
                                    });
                                    page.drawText('Firmado', {
                                        x: fx + fw / 2 - 20,
                                        y: fy + fh / 2 - 5,
                                        size: 11,
                                        color: rgb2(0.1, 0.5, 0.1)
                                    });
                                } else {
                                    // Campo de texto: rectángulo blanco con "*** PROTEGIDO ***"
                                    page.drawRectangle({
                                        x: fx, y: fy, width: fw, height: fh,
                                        color: rgb2(1, 1, 1),
                                        borderColor: rgb2(0.8, 0.8, 0.8),
                                        borderWidth: 1
                                    });
                                    page.drawText('*** PROTEGIDO ***', {
                                        x: fx + 5,
                                        y: fy + fh / 2 - 5,
                                        size: 9,
                                        color: rgb2(0.5, 0.5, 0.5)
                                    });
                                }
                            }
                        }

                        // Guardar PDF censurado
                        const censoredBytes = await basePdfDoc.save();
                        const censoredFinalFilename = `censored_final_${recipient.document_id}_${Date.now()}.pdf`;
                        const censoredFinalPath = path.join(intermediatePdfDir, censoredFinalFilename);
                        fs.writeFileSync(censoredFinalPath, censoredBytes);
                        censoredPdfPath = path.join('uploads', 'signed', censoredFinalFilename);
                        console.log(`   ✅ PDF censurado generado: ${censoredPdfPath}`);
                    }

                    const cleanPath = censoredPdfPath.startsWith('/') ? censoredPdfPath.substring(1) : censoredPdfPath;
                    const fullCensoredPath = resolveFromRoot(cleanPath);

                    if (fs.existsSync(fullCensoredPath)) {
                        // Cargar PDF CENSURADO
                        let finalSignerPdfBuffer = fs.readFileSync(fullCensoredPath);
                        const { PDFDocument } = require('pdf-lib');
                        const finalSignerPdfDoc = await PDFDocument.load(finalSignerPdfBuffer);

                            // Añadir traza VI del firmante definitivo (si tiene)
                            const [finalSignerViRow] = await new Promise((resolve, reject) => {
                                db.query(
                                    'SELECT vi_traza_path FROM document_recipients WHERE document_id = ? AND is_final_signer = 1 LIMIT 1',
                                    [recipient.document_id],
                                    (err, results) => { if (err) reject(err); else resolve([results]); }
                                );
                            });
                            const finalSignerTrazaPath = finalSignerViRow[0]?.vi_traza_path;
                            if (finalSignerTrazaPath) {
                                const trazaAbs = resolveFromRoot(finalSignerTrazaPath.replace(/^\/+/, ''));
                                if (fs.existsSync(trazaAbs)) {
                                    const trazaDoc = await PDFDocument.load(fs.readFileSync(trazaAbs));
                                    const trazaPages = await finalSignerPdfDoc.copyPages(trazaDoc, trazaDoc.getPageIndices());
                                    trazaPages.forEach(p => finalSignerPdfDoc.addPage(p));
                                    console.log(`   📋 Traza VI del firmante definitivo añadida`);
                                } else {
                                    console.warn(`   ⚠️ Traza VI del firmante definitivo no encontrada: ${trazaAbs}`);
                                }
                            } else {
                                console.log(`   ℹ️ Firmante definitivo sin traza VI`);
                            }

                            // Dibujar firma definitiva en el PDF original
                            if (finalSigField && finalSigField.signature_path) {
                                const pageNum = (finalSigField.page || 1) - 1;
                                if (pageNum >= 0 && pageNum < finalSignerPdfDoc.getPageCount()) {
                                    const page = finalSignerPdfDoc.getPage(pageNum);
                                    const { height: pageHeight } = page.getSize();

                                    const fieldX = parseFloat(finalSigField.x) || 10;
                                    const fieldY = parseFloat(finalSigField.y) || 10;
                                    const fieldWidth = parseFloat(finalSigField.width) || 150;
                                    const fieldHeight = parseFloat(finalSigField.height) || 50;

                                    const x = fieldX;
                                    const y = pageHeight - fieldY - fieldHeight;

                                    console.log(`   ✍️ Dibujando firma definitiva en PDF original...`);

                                    const signatureDataUrl = finalSigField.signature_path;
                                    if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                                        const base64Data = signatureDataUrl.split(',')[1];
                                        const imageBytes = Buffer.from(base64Data, 'base64');

                                        let image;
                                        if (signatureDataUrl.includes('image/png')) {
                                            image = await finalSignerPdfDoc.embedPng(imageBytes);
                                        } else if (signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg')) {
                                            image = await finalSignerPdfDoc.embedJpg(imageBytes);
                                        }

                                        if (image) {
                                            const imgDims = image.scale(1);
                                            const imgAspect = imgDims.width / imgDims.height;
                                            const fieldAspect = fieldWidth / fieldHeight;

                                            let drawWidth, drawHeight;
                                            if (imgAspect > fieldAspect) {
                                                drawWidth = fieldWidth * 0.9;
                                                drawHeight = drawWidth / imgAspect;
                                            } else {
                                                drawHeight = fieldHeight * 0.9;
                                                drawWidth = drawHeight * imgAspect;
                                            }

                                            const drawX = x + (fieldWidth - drawWidth) / 2;
                                            const drawY = y + (fieldHeight - drawHeight) / 2;

                                            page.drawImage(image, {
                                                x: drawX,
                                                y: drawY,
                                                width: drawWidth,
                                                height: drawHeight
                                            });

                                            console.log(`   ✅ Firma definitiva dibujada en PDF original`);
                                        }
                                    }
                                }
                            }

                            // Guardar PDF con firma
                            finalSignerPdfBuffer = Buffer.from(await finalSignerPdfDoc.save());

                            // Aplicar sello PKI
                            console.log(`   🔐 Aplicando sello PKI al PDF del firmante definitivo...`);
                            const pythonSigner = new PythonSignerClient({ verbose: true });

                            // Obtener campos de sello (reutilizar los ya obtenidos antes)
                            const [finalSignerSealFields] = await new Promise((resolve, reject) => {
                                db.query(
                                    `SELECT page_number as page, x_position as x, y_position as y, width, height
                                     FROM document_fields
                                     WHERE document_id = ? AND field_type = 'seal'`,
                                    [recipient.document_id],
                                    (err, results) => {
                                        if (err) reject(err);
                                        else resolve([results]);
                                    }
                                );
                            });

                            let finalSignerSeals = [];
                            for (const seal of finalSignerSealFields) {
                                const pageNum = seal.page || 1;
                                const pageIndex = pageNum - 1;

                                if (pageIndex >= 0 && pageIndex < finalSignerPdfDoc.getPageCount()) {
                                    const page = finalSignerPdfDoc.getPage(pageIndex);
                                    const { height: pageHeight } = page.getSize();

                                    const x = parseFloat(seal.x) || 10;
                                    const width = parseFloat(seal.width) || 200;
                                    const height = parseFloat(seal.height) || 80;
                                    const y = pageHeight - parseFloat(seal.y) - height;

                                    finalSignerSeals.push({
                                        page: pageNum,
                                        x: x,
                                        y: y,
                                        width: width,
                                        height: height
                                    });
                                }
                            }

                            const finalSignerVerifToken = crypto
                                .createHash('sha256')
                                .update(`VERIFY-${recipient.document_id}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                                .digest('hex')
                                .substring(0, 32);
                            const signedFinalSignerPdfBuffer = await pythonSigner.signPdf(finalSignerPdfBuffer, {
                                reason: `Firmante Definitivo: ${finalSignerName} (${finalSignerEmail})`,
                                location: 'Colombia',
                                signerName: 'PKI Services',
                                contactInfo: finalSignerEmail,
                                fieldName: `FinalSignature_${recipient.document_id}_finalSigner`,
                                visible: true,
                                seals: finalSignerSeals.length > 0 ? finalSignerSeals : null,
                                verificationToken: finalSignerVerifToken
                            });

                            // Guardar PDF final del firmante definitivo
                            const finalSignerPdfFilename = `final_signer_${recipient.document_id}_${Date.now()}.pdf`;
                            const finalSignerPdfPath = path.join(intermediatePdfDir, finalSignerPdfFilename);
                            fs.writeFileSync(finalSignerPdfPath, signedFinalSignerPdfBuffer);

                            const relativeFinalSignerPath = path.join('uploads', 'signed', finalSignerPdfFilename);

                            // Actualizar custom_pdf_path del firmante definitivo
                            // 🔥 IMPORTANTE: Usar is_final_signer = 1 porque en este punto recipient es un viewer_group
                            const updateResult = await new Promise((resolve, reject) => {
                                db.query(
                                    'UPDATE document_recipients SET custom_pdf_path = ? WHERE document_id = ? AND is_final_signer = 1',
                                    [relativeFinalSignerPath, recipient.document_id],
                                    (err, result) => {
                                        if (err) reject(err);
                                        else resolve(result);
                                    }
                                );
                            });

                            if (updateResult.affectedRows > 0) {
                                console.log(`   ✅ PDF especial del firmante definitivo guardado: ${relativeFinalSignerPath}`);
                                console.log(`   ✅ custom_pdf_path del firmante definitivo actualizado correctamente`);
                            } else {
                                console.error(`   ❌ ERROR: No se pudo actualizar el custom_pdf_path del firmante definitivo`);
                            }
                    } else {
                        console.error(`   ❌ ERROR: No se encontró el PDF censurado: ${fullCensoredPath}`);
                    }
                } catch (pdfGenError) {
                    console.error('   ⚠️ Error generando PDF del firmante definitivo:', pdfGenError.message);
                    // No lanzar error, solo advertencia
                }

                // Marcar firmante definitivo como completado
                await new Promise((resolve, reject) => {
                    db.query(
                        `UPDATE pagare_metadata SET final_signer_status = 'signed', final_signed_at = NOW()
                         WHERE document_id = ?`,
                        [recipient.document_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // Retornar respuesta exitosa para firmante definitivo
                return res.json({
                    success: true,
                    message: `Firma definitiva aplicada exitosamente a ${allViewerGroups.length} pagaré(s)`,
                    allSigned: true,
                    completed: allViewerGroups.length,
                    total: allViewerGroups.length,
                    isFinalSigner: true
                });

            } catch (finalSignerError) {
                console.error('❌ Error sellando pagarés del firmante definitivo:', finalSignerError);
                return res.status(500).json({
                    success: false,
                    message: 'Error al sellar los pagarés',
                    error: finalSignerError.message
                });
            }
        } else if (!isPersonalizedDoc && allSigned) {
            // Código de sellado para documentos COMPARTIDOS (NO pagarés) cuando todos han firmado
            try {
                console.log('\n🔒 Todos han firmado documento compartido. Aplicando sello PKI final...');

                const intermediatePdfDir = resolveFromRoot('uploads', 'signed');

                // Recuperar todos los destinatarios con su PDF actual
                const allDocRecipientsFinal = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT recipient_id, email, custom_pdf_path, personal_pdf_path, vi_traza_path
                         FROM document_recipients WHERE document_id = ?`,
                        [recipient.document_id],
                        (err, rows) => { if (err) reject(err); else resolve(rows); }
                    );
                });

                // Detectar si hay PDFs individuales: cuando alguno tiene personal_pdf_path (bulk-send con datos únicos)
                const hasIndividualPdfs = allDocRecipientsFinal.some(r => r.personal_pdf_path);

                console.log(`   📋 Destinatarios: ${allDocRecipientsFinal.length}`);
                console.log(`   🎯 Modo: ${hasIndividualPdfs ? 'PDFs INDIVIDUALES (sellar cada uno)' : 'PDF COMPARTIDO (sellar único)'}`);

                // Recuperar campos del documento para sellos PKI
                const [allFieldsFinal] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT field_id, field_type as type, page_number as page,
                                x_position as x, y_position as y, width, height
                         FROM document_fields WHERE document_id = ?`,
                        [recipient.document_id],
                        (err, results) => { if (err) reject(err); else resolve([results]); }
                    );
                });
                const sealFieldsFinal = allFieldsFinal.filter(f => f.type === 'seal');

                // Construir reason con TODOS los firmantes
                const completedSigners = allRecipients.filter(r => r.status === 'completed');
                const reasonText = completedSigners
                    .map(r => r.part_name ? `${r.email} - ${r.part_name}` : r.email)
                    .join('; ') || 'Documento firmado digitalmente';
                const contactInfo = completedSigners.map(r => r.email).join(', ');
                console.log(`   📋 Firmantes: ${reasonText}`);

                // Generar token para QR
                const verificationToken = crypto
                    .createHash('sha256')
                    .update(`VERIFY-${recipient.document_id}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                    .digest('hex')
                    .substring(0, 32);

                // Verificar servicio Python
                const pythonSigner = new PythonSignerClient({ verbose: true });
                const isHealthy = await pythonSigner.healthCheck();
                if (!isHealthy) {
                    throw new Error('Servicio de firma no disponible');
                }
                console.log('✅ Servicio Python disponible');

                // Helper: calcular seals en coordenadas PDF para un buffer dado
                async function computeSeals(pdfBuf, sealFields) {
                    const { PDFDocument } = require('pdf-lib');
                    const doc = await PDFDocument.load(pdfBuf);
                    const seals = [];
                    for (const seal of sealFields) {
                        const idx = (seal.page || 1) - 1;
                        if (idx < 0 || idx >= doc.getPageCount()) continue;
                        const pg = doc.getPage(idx);
                        const { height: ph } = pg.getSize();
                        const x = parseFloat(seal.x) || 10;
                        const w = parseFloat(seal.width) || 200;
                        const h = parseFloat(seal.height) || 80;
                        const y = ph - parseFloat(seal.y) - h;
                        seals.push({ page: seal.page || 1, x, y, width: w, height: h });
                    }
                    return seals;
                }

                if (hasIndividualPdfs) {
                    // ===== MODO PDFs INDIVIDUALES: sellar cada PDF por separado =====
                    console.log('\n🔐 Sellando PDF individual de cada destinatario...');

                    for (const rec of allDocRecipientsFinal) {
                        try {
                            if (!rec.custom_pdf_path) {
                                console.warn(`   ⚠️ Sin PDF intermedio para ${rec.email}, saltando`);
                                continue;
                            }
                            const recPdfAbs = resolveFromRoot(rec.custom_pdf_path.replace(/^\/+/, ''));
                            if (!fs.existsSync(recPdfAbs)) {
                                console.warn(`   ⚠️ Archivo no encontrado para ${rec.email}: ${recPdfAbs}`);
                                continue;
                            }
                            let recPdfBuffer = fs.readFileSync(recPdfAbs);
                            const sealsForRec = await computeSeals(recPdfBuffer, sealFieldsFinal);

                            // NOTA: La trazabilidad VI ya está incluida en custom_pdf_path
                            // (fue añadida por vi-callback al generar vi_personal_xxx.pdf).
                            // NO añadir de nuevo aquí — solo sellar el PDF tal como está.

                            const signedBuf = await pythonSigner.signPdf(recPdfBuffer, {
                                reason: reasonText,
                                location: 'Colombia',
                                signerName: 'PKI Services',
                                contactInfo,
                                fieldName: `Signature_${recipient.document_id}_rec${rec.recipient_id}`,
                                visible: true,
                                seals: sealsForRec.length > 0 ? sealsForRec : null,
                                verificationToken
                            });

                            const finalFilename = `final_${recipient.document_id}_recipient_${rec.recipient_id}_${Date.now()}.pdf`;
                            const finalAbs = path.join(intermediatePdfDir, finalFilename);
                            const finalRel = path.join('uploads', 'signed', finalFilename).replace(/\\/g, '/');
                            fs.writeFileSync(finalAbs, signedBuf);

                            await new Promise((resolve, reject) => {
                                db.query(
                                    'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                    [finalRel, rec.recipient_id],
                                    (err) => { if (err) reject(err); else resolve(); }
                                );
                            });
                            console.log(`   ✅ PDF final sellado para ${rec.email}: ${finalFilename}`);
                        } catch (recSealErr) {
                            console.error(`   ❌ Error sellando PDF de ${rec.email}:`, recSealErr.message);
                        }
                    }

                    // Actualizar signed_file_path del documento con el PDF final del firmante actual como referencia
                    const updatedRow = await new Promise((resolve, reject) => {
                        db.query(
                            'SELECT custom_pdf_path FROM document_recipients WHERE recipient_id = ?',
                            [recipient.recipient_id],
                            (err, rows) => { if (err) reject(err); else resolve(rows[0] || null); }
                        );
                    });
                    if (updatedRow && updatedRow.custom_pdf_path) {
                        await new Promise((resolve, reject) => {
                            db.query(
                                'UPDATE documents SET signed_file_path = ?, verification_token = ? WHERE document_id = ?',
                                [updatedRow.custom_pdf_path, verificationToken, recipient.document_id],
                                (err) => { if (err) reject(err); else resolve(); }
                            );
                        });
                    }

                } else {
                    // ===== MODO PDF COMPARTIDO (sin datos individuales): sellar único =====
                    if (!allDocRecipientsFinal[0]?.custom_pdf_path) {
                        throw new Error('No se encontró el PDF intermedio con las firmas');
                    }

                    const intermediatePdfPath = resolveFromRoot(allDocRecipientsFinal[0].custom_pdf_path);
                    const pdfBuffer = fs.readFileSync(intermediatePdfPath);
                    console.log(`📄 PDF intermedio leído: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

                    const sealsForPython = await computeSeals(pdfBuffer, sealFieldsFinal);

                    const signedPdfBuffer = await pythonSigner.signPdf(pdfBuffer, {
                        reason: reasonText,
                        location: 'Colombia',
                        signerName: 'PKI Services',
                        contactInfo,
                        fieldName: `Signature_${recipient.document_id}`,
                        visible: true,
                        seals: sealsForPython.length > 0 ? sealsForPython : null,
                        verificationToken
                    });

                    console.log(`✅ PDF firmado con PKI: ${(signedPdfBuffer.length / 1024).toFixed(2)} KB`);

                    const finalPdfFilename = `final_${recipient.document_id}_${Date.now()}.pdf`;
                    const finalPdfPath = path.join(intermediatePdfDir, finalPdfFilename);
                    fs.writeFileSync(finalPdfPath, signedPdfBuffer);

                    const relativeFinalPath = path.join('uploads', 'signed', finalPdfFilename).replace(/\\/g, '/');
                    console.log(`💾 PDF final con PKI guardado: ${relativeFinalPath}`);

                    // Actualizar signed_file_path, doc_only_path y verification_token del documento
                    await new Promise((resolve, reject) => {
                        db.query(
                            'UPDATE documents SET signed_file_path = ?, doc_only_path = ?, verification_token = ? WHERE document_id = ?',
                            [relativeFinalPath, relativeFinalPath, verificationToken, recipient.document_id],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });

                    // Actualizar custom_pdf_path: sin VI = mismo final; con VI = final + traza
                    await new Promise((resolve, reject) => {
                        db.query(
                            'UPDATE document_recipients SET custom_pdf_path = ? WHERE document_id = ? AND vi_traza_path IS NULL',
                            [relativeFinalPath, recipient.document_id],
                            (err) => { if (err) reject(err); else resolve(); }
                        );
                    });
                    console.log('✅ PDF compartido actualizado (destinatarios sin traza VI)');

                    // Trazabilidad VI: mezclar final + traza para cada destinatario con VI
                    try {
                        const { PDFDocument: PDFDoc } = require('pdf-lib');
                        const finalAbsPath = resolveFromRoot(relativeFinalPath);
                        const recipientsWithTraza = allDocRecipientsFinal.filter(r => r.vi_traza_path);

                        for (const rec of recipientsWithTraza) {
                            try {
                                const trazaAbsPath = resolveFromRoot(rec.vi_traza_path.replace(/^\/+/, ''));
                                if (!fs.existsSync(trazaAbsPath)) {
                                    console.warn(`⚠️ [VI-TRAZA] Archivo traza no encontrado para ${rec.email}`);
                                    continue;
                                }
                                const finalPdf = await PDFDoc.load(fs.readFileSync(finalAbsPath));
                                const trazaPdf = await PDFDoc.load(fs.readFileSync(trazaAbsPath));
                                const pages = await finalPdf.copyPages(trazaPdf, trazaPdf.getPageIndices());
                                pages.forEach(p => finalPdf.addPage(p));
                                const mergedBytes = await finalPdf.save();

                                const personalFilename = `final_${recipient.document_id}_recipient_${rec.recipient_id}_vi_${Date.now()}.pdf`;
                                const personalAbsPath = path.join(intermediatePdfDir, personalFilename);
                                const personalRelPath = path.join('uploads', 'signed', personalFilename).replace(/\\/g, '/');
                                fs.writeFileSync(personalAbsPath, mergedBytes);

                                await new Promise((resolve, reject) => {
                                    db.query(
                                        'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                                        [personalRelPath, rec.recipient_id],
                                        (err) => { if (err) reject(err); else resolve(); }
                                    );
                                });
                                console.log(`✅ [VI-TRAZA] PDF personal con trazabilidad para ${rec.email}: ${personalFilename}`);
                            } catch (recErr) {
                                console.error(`⚠️ [VI-TRAZA] Error para ${rec.email}:`, recErr.message);
                            }
                        }
                    } catch (trazaErr) {
                        console.error('⚠️ [VI-TRAZA] Error procesando trazabilidades VI (no crítico):', trazaErr.message);
                    }
                }

                console.log('✅ PDF final con sello PKI generado exitosamente');

            } catch (sharedDocError) {
                console.error('❌ Error sellando documento compartido:', sharedDocError);
                return res.status(500).json({
                    success: false,
                    message: 'Error al sellar el documento compartido',
                    error: sharedDocError.message
                });
            }
        }

        // ========================================================================
        // RESPUESTA AL CLIENTE
        // ========================================================================

        // Obtener la ruta del PDF firmado de la BD
        let signedPdfUrl = null;
        try {
            if (isPersonalizedDoc) {
                // Para documentos personalizados, obtener custom_pdf_path del destinatario
                const [recipientDoc] = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT custom_pdf_path FROM document_recipients WHERE recipient_id = ?',
                        [recipient.recipient_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                if (recipientDoc.length > 0 && recipientDoc[0].custom_pdf_path) {
                    signedPdfUrl = `/${recipientDoc[0].custom_pdf_path}`;
                    console.log(`📄 URL del PDF personalizado: ${signedPdfUrl}`);
                }
            } else {
                // Para documentos compartidos, obtener signed_file_path del documento
                const [signedDoc] = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT signed_file_path FROM documents WHERE document_id = ?',
                        [recipient.document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                if (signedDoc.length > 0 && signedDoc[0].signed_file_path) {
                    signedPdfUrl = `/${signedDoc[0].signed_file_path}`;
                    console.log(`📄 URL del PDF compartido: ${signedPdfUrl}`);
                }
            }
        } catch (e) {
            console.warn('⚠️ No se pudo obtener la URL del PDF firmado');
        }

        res.json({
            success: true,
            message: 'Documento firmado exitosamente',
            data: {
                documentId: recipient.document_id,
                documentTitle: recipient.title,
                completedAt: new Date().toISOString(),
                fieldsProcessed: fields ? fields.filter(f => f.signed).length : 0,
                signedPdfUrl: signedPdfUrl  // ✅ Incluir URL del PDF firmado
            }
        });

    } catch (error) {
        console.error('❌ Error al procesar firma:', error);
        res.status(500).json({
            success: false,
            message: 'Error al procesar la firma',
            error: error.message
        });
    }
});

// GET /api/documents/:docId/recipients/:recipientId/values - Obtener valores completados
app.get('/api/documents/:docId/recipients/:recipientId/values', async (req, res) => {
    const { docId, recipientId } = req.params;
    const userId = req.query.user_id;

    try {
        console.log(`📥 Obteniendo valores completados para doc: ${docId}, recipient: ${recipientId}`);

        // Verificar que el usuario sea el propietario del documento
        const ownerCheck = await new Promise((resolve, reject) => {
            db.query(
                'SELECT owner_id FROM documents WHERE document_id = ?',
                [docId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (ownerCheck.length === 0 || ownerCheck[0].owner_id != userId) {
            return res.status(403).json({
                success: false,
                message: 'No tienes permiso para ver este documento'
            });
        }

        // Obtener los valores completados
        const valuesQuery = `
            SELECT 
                fv.value_id,
                fv.field_id,
                fv.value_type,
                fv.text_value,
                fv.signature_path,
                fv.date_value,
                fv.created_at,
                df.field_type,
                df.field_label
            FROM field_values fv
            INNER JOIN document_fields df ON fv.field_id = df.field_id
            WHERE fv.recipient_id = ?
            ORDER BY fv.field_id ASC
        `;

        const [values] = await new Promise((resolve, reject) => {
            db.query(valuesQuery, [recipientId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        console.log(`✅ ${values.length} valor(es) encontrado(s)`);

        res.json({
            success: true,
            values: values
        });

    } catch (error) {
        console.error('❌ Error obteniendo valores completados:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener los valores',
            error: error.message
        });
    }
});

// GET /api/public/verify/:token - Endpoint de verificación desde QR (usa token seguro)
app.get('/api/public/verify/:token', async (req, res) => {
    const { token } = req.params;

    try {
        console.log(`🔍 Verificación de documento desde QR con token: ${token.substring(0, 8)}...`);

        // Buscar documento directamente por verification_token almacenado (rápido, O(1))
        const directQuery = `
            SELECT
                d.document_id,
                d.title,
                d.created_at,
                d.signed_file_path,
                d.owner_id,
                u.first_name as owner_first_name,
                u.last_name as owner_last_name,
                u.email as owner_email
            FROM documents d
            INNER JOIN users u ON d.owner_id = u.user_id
            WHERE d.verification_token = ? AND d.status != 'deleted'
            LIMIT 1
        `;

        let [directResults] = await new Promise((resolve, reject) => {
            db.query(directQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        let matchedDocument = directResults.length > 0 ? directResults[0] : null;

        // Fallback: buscar iterando todos los documentos (para docs sellados antes del campo verification_token)
        if (!matchedDocument) {
            console.log(`   ↩️  No encontrado por columna, probando fallback por hash...`);
            const fallbackQuery = `
                SELECT
                    d.document_id,
                    d.title,
                    d.created_at,
                    d.signed_file_path,
                    d.owner_id,
                    u.first_name as owner_first_name,
                    u.last_name as owner_last_name,
                    u.email as owner_email
                FROM documents d
                INNER JOIN users u ON d.owner_id = u.user_id
                WHERE d.status != 'deleted'
            `;
            const [allDocs] = await new Promise((resolve, reject) => {
                db.query(fallbackQuery, [], (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                });
            });
            for (const doc of allDocs) {
                const expectedToken = crypto
                    .createHash('sha256')
                    .update(`VERIFY-${doc.document_id}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                    .digest('hex')
                    .substring(0, 32);
                if (expectedToken === token) {
                    matchedDocument = doc;
                    // Backfill the verification_token column for future lookups
                    db.query('UPDATE documents SET verification_token = ? WHERE document_id = ?',
                        [token, doc.document_id], () => {});
                    break;
                }
            }
        }

        if (!matchedDocument) {
            console.log(`❌ Token de verificación inválido: ${token.substring(0, 8)}...`);
            return res.status(404).json({
                success: false,
                message: 'Token de verificación inválido o documento no encontrado'
            });
        }

        const document = matchedDocument;

        // Obtener todos los destinatarios (firmantes) del documento
        const recipientsQuery = `
            SELECT
                dr.recipient_id,
                dr.email,
                dr.name,
                dr.status,
                dr.completed_at,
                dr.token
            FROM document_recipients dr
            WHERE dr.document_id = ?
            ORDER BY dr.recipient_id ASC
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientsQuery, [document.document_id], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Filtrar solo los que completaron la firma
        const completedRecipients = recipients.filter(r => r.status === 'completed' && r.completed_at);

        // Generar token único del documento para mostrar (basado en su ID y fecha de creación)
        const documentToken = crypto
            .createHash('sha256')
            .update(`${document.document_id}-${document.title}-${document.created_at}`)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();

        // Obtener fechas
        const fechaCreacion = new Date(document.created_at).toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        let fechaFirma = 'No firmado';
        if (completedRecipients.length > 0) {
            // Usar la fecha de firma más reciente
            const latestSignature = completedRecipients.reduce((latest, current) => {
                return new Date(current.completed_at) > new Date(latest.completed_at) ? current : latest;
            });
            fechaFirma = new Date(latestSignature.completed_at).toLocaleString('es-CO', {
                timeZone: 'America/Bogota',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        }

        // Nombres de firmantes
        const firmantes = completedRecipients.map(r => r.name || r.email).join(', ') || 'Sin firmas';

        console.log(`✅ Documento verificado: ${document.title}`);
        console.log(`   - Firmantes: ${completedRecipients.length}`);
        console.log(`   - Token documento: ${documentToken}`);

        // Responder con la información del documento (SIN exponer el document_id)
        res.json({
            success: true,
            verification: {
                token_documento: documentToken,
                fecha_creacion: fechaCreacion,
                fecha_firma: fechaFirma,
                firmantes: firmantes,
                token_verificacion: token.substring(0, 16).toUpperCase(),
                titulo_documento: document.title,
                enlace_pqr: 'https://pkiservices.co/soporte/?wpsc-section=ticket-list'
            }
        });

    } catch (error) {
        console.error('❌ Error en verificación de documento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al verificar el documento',
            error: error.message
        });
    }
});

// GET /api/public/audit/:token - Obtener trazabilidad/auditoría del documento
app.get('/api/public/audit/:token', async (req, res) => {
    const { token } = req.params;

    try {
        console.log(`📊 Solicitando auditoría para token: ${token}`);

        // Buscar el destinatario y documento por token
        const recipientQuery = `
            SELECT
                dr.recipient_id,
                dr.document_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at,
                dr.token,
                d.title as document_title,
                d.file_path,
                d.signed_file_path,
                d.created_at as document_created_at,
                d.owner_id,
                u.first_name as owner_first_name,
                u.last_name as owner_last_name,
                u.email as owner_email
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            INNER JOIN users u ON d.owner_id = u.user_id
            WHERE dr.token = ?
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (recipients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Token inválido o documento no encontrado'
            });
        }

        const recipient = recipients[0];

        // Obtener todos los destinatarios del documento
        const allRecipientsQuery = `
            SELECT
                dr.recipient_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at
            FROM document_recipients dr
            WHERE dr.document_id = ?
            ORDER BY dr.recipient_id ASC
        `;

        const [allRecipients] = await new Promise((resolve, reject) => {
            db.query(allRecipientsQuery, [recipient.document_id], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Obtener firmas de los participantes
        const signaturesQuery = `
            SELECT
                fv.recipient_id,
                fv.signature_path
            FROM field_values fv
            WHERE fv.recipient_id IN (${allRecipients.map(r => r.recipient_id).join(',')})
            AND fv.value_type = 'signature'
            AND fv.signature_path IS NOT NULL
        `;

        const [signatures] = await new Promise((resolve, reject) => {
            db.query(signaturesQuery, (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Mapear firmas a participantes
        const participantsWithSignatures = allRecipients.map(r => {
            const sig = signatures.find(s => s.recipient_id === r.recipient_id);
            return {
                ...r,
                signature: sig ? sig.signature_path : null
            };
        });

        // Generar eventos de trazabilidad
        const events = [];

        // Evento: Documento creado
        events.push({
            timestamp: recipient.document_created_at,
            description: `Documento creado por ${recipient.owner_first_name} ${recipient.owner_last_name}`,
            email: recipient.owner_email,
            recipientName: `${recipient.owner_first_name} ${recipient.owner_last_name}`
        });

        // Eventos por cada destinatario
        allRecipients.forEach(r => {
            // Evento: Correo enviado
            if (r.sent_at) {
                events.push({
                    timestamp: r.sent_at,
                    description: `Correo electrónico enviado a`,
                    email: r.email,
                    recipientName: r.name || r.email
                });
            }

            // Evento: Documento abierto
            if (r.opened_at) {
                events.push({
                    timestamp: r.opened_at,
                    description: `Enlace de firma abierto por`,
                    email: r.email,
                    recipientName: r.name || r.email
                });
            }

            // Evento: Documento completado
            if (r.completed_at) {
                events.push({
                    timestamp: r.completed_at,
                    description: `Documento firmado por`,
                    email: r.email,
                    recipientName: r.name || r.email
                });

                events.push({
                    timestamp: r.completed_at,
                    description: `Código QR generado con enlace de firma`,
                    email: r.email,
                    recipientName: r.name || r.email
                });
            }
        });

        // Ordenar eventos por fecha
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Calcular hash del documento (simplificado)
        const crypto = require('crypto');
        const documentHash = crypto
            .createHash('sha256')
            .update(`${recipient.document_id}-${recipient.document_title}-${recipient.document_created_at}`)
            .digest('hex');

        // Responder con datos de auditoría
        res.json({
            success: true,
            audit: {
                document: {
                    id: recipient.document_id,
                    title: recipient.document_title,
                    createdAt: recipient.document_created_at,
                    hash: documentHash
                },
                participants: participantsWithSignatures,
                events: events
            }
        });

    } catch (error) {
        console.error('❌ Error al obtener auditoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al cargar auditoría'
        });
    }
});

// GET /api/public/audit/:token/pdf - Generar y descargar reporte de auditoría en PDF
app.get('/api/public/audit/:token/pdf', async (req, res) => {
    const { token } = req.params;

    try {
        console.log(`📄 Generando reporte PDF de auditoría para token: ${token}`);

        // Obtener datos de auditoría
        const recipientQuery = `
            SELECT
                dr.recipient_id,
                dr.document_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at,
                d.title as document_title,
                d.created_at as document_created_at,
                d.owner_id,
                u.first_name as owner_first_name,
                u.last_name as owner_last_name,
                u.email as owner_email
            FROM document_recipients dr
            INNER JOIN documents d ON dr.document_id = d.document_id
            INNER JOIN users u ON d.owner_id = u.user_id
            WHERE dr.token = ?
        `;

        const [recipients] = await new Promise((resolve, reject) => {
            db.query(recipientQuery, [token], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (recipients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Token inválido o documento no encontrado'
            });
        }

        const recipient = recipients[0];

        // Obtener todos los destinatarios del documento
        const allRecipientsQuery = `
            SELECT
                dr.recipient_id,
                dr.email,
                dr.name,
                dr.status,
                dr.sent_at,
                dr.opened_at,
                dr.completed_at
            FROM document_recipients dr
            WHERE dr.document_id = ?
            ORDER BY dr.recipient_id ASC
        `;

        const [allRecipients] = await new Promise((resolve, reject) => {
            db.query(allRecipientsQuery, [recipient.document_id], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Generar eventos de trazabilidad
        const events = [];

        events.push({
            timestamp: recipient.document_created_at,
            description: `Documento creado por ${recipient.owner_first_name} ${recipient.owner_last_name}`,
            email: recipient.owner_email
        });

        allRecipients.forEach(r => {
            if (r.sent_at) {
                events.push({
                    timestamp: r.sent_at,
                    description: `Correo electrónico enviado a`,
                    email: r.email
                });
            }

            if (r.opened_at) {
                events.push({
                    timestamp: r.opened_at,
                    description: `Enlace de firma abierto por`,
                    email: r.email
                });
            }

            if (r.completed_at) {
                events.push({
                    timestamp: r.completed_at,
                    description: `Documento firmado por`,
                    email: r.email
                });

                events.push({
                    timestamp: r.completed_at,
                    description: `Código QR generado con enlace de firma`,
                    email: r.email
                });
            }
        });

        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Calcular hash del documento
        const crypto = require('crypto');
        const documentHash = crypto
            .createHash('sha256')
            .update(`${recipient.document_id}-${recipient.document_title}-${recipient.document_created_at}`)
            .digest('hex');

        // Generar PDF con PDFKit
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

        // Configurar respuesta
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Auditoria_${recipient.document_title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`);

        // Pipe del documento al response
        doc.pipe(res);

        // ===== ENCABEZADO =====
        doc.fillColor('#2a0d31')
           .fontSize(24)
           .font('Helvetica-Bold')
           .text('Registro de Auditoría', { align: 'center' });

        doc.fontSize(11)
           .fillColor('#666')
           .font('Helvetica')
           .text('Documento Construido con Plataforma de Firma Electrónica PKI TECH®', { align: 'center' });

        doc.moveDown(1.5);

        // ===== DOCUMENTO ORIGINAL =====
        doc.fillColor('#2a0d31')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('Documento Original');

        doc.moveDown(0.5);

        doc.fontSize(10)
           .fillColor('#333')
           .font('Helvetica');

        doc.text(`Título: `, { continued: true })
           .font('Helvetica-Bold')
           .text(recipient.document_title);

        doc.font('Helvetica')
           .text(`ID: `, { continued: true })
           .font('Helvetica-Bold')
           .text(recipient.document_id.toString());

        doc.font('Helvetica')
           .text(`Fecha y Hora: `, { continued: true })
           .font('Helvetica-Bold')
           .text(new Date(recipient.document_created_at).toLocaleString('es-ES'));

        doc.moveDown(1);

        // ===== HASH SHA256 =====
        doc.fillColor('#2a0d31')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('Hash SHA256 del Documento Firmado');

        doc.moveDown(0.5);

        doc.fontSize(9)
           .fillColor('#333')
           .font('Courier')
           .text(documentHash, { width: 500 });

        doc.moveDown(1);

        // ===== INFORMACIÓN DE PARTICIPANTES =====
        doc.fillColor('#2a0d31')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('Información de los Participantes');

        doc.moveDown(0.5);

        allRecipients.forEach((participant, index) => {
            if (index > 0) doc.moveDown(0.5);

            doc.fontSize(11)
               .fillColor('#495057')
               .font('Helvetica-Bold')
               .text(participant.name || participant.email);

            doc.fontSize(10)
               .fillColor('#333')
               .font('Helvetica');

            doc.text(`Correo: ${participant.email}`);
            doc.text(`Nombre: ${participant.name || '-'}`);
            doc.text(`Estado: ${participant.status || 'Pendiente'}`);

            if (participant.completed_at) {
                doc.text(`Fecha de Aprobación: ${new Date(participant.completed_at).toLocaleString('es-ES')}`);
            } else {
                doc.text('Fecha de Aprobación: Pendiente');
            }
        });

        doc.moveDown(1);

        // ===== PRUEBA DE TRAZABILIDAD =====
        doc.fillColor('#2a0d31')
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('Prueba de Trazabilidad');

        doc.moveDown(0.5);

        events.forEach((event, index) => {
            const eventNumber = index + 1;
            const date = new Date(event.timestamp);
            const dateStr = date.toLocaleDateString('es-ES');
            const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

            doc.fontSize(10)
               .fillColor('#333')
               .font('Helvetica');

            doc.text(`${eventNumber}. `, { continued: true })
               .font('Helvetica-Bold')
               .text(`${dateStr} - ${timeStr}: `, { continued: true })
               .font('Helvetica')
               .text(`${event.description} ${event.email ? `(${event.email})` : ''}`);

            doc.moveDown(0.3);
        });

        // ===== PIE DE PÁGINA =====
        doc.moveDown(2);
        doc.fontSize(9)
           .fillColor('#666')
           .font('Helvetica-Oblique')
           .text(`Generado el ${new Date().toLocaleString('es-ES')}`, { align: 'center' });

        // Finalizar el documento
        doc.end();

        console.log('✅ Reporte PDF generado exitosamente');

    } catch (error) {
        console.error('❌ Error al generar reporte PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error al generar reporte PDF',
            error: error.message
        });
    }
});

// GET /api/documents/:docId/recipients/:recipientId/download - Descargar PDF completado
app.get('/api/documents/:docId/recipients/:recipientId/download', async (req, res) => {
    const { docId, recipientId } = req.params;
    const userId = req.query.user_id;
    const mode = req.query.mode || 'download'; // 'download' o 'view'
    const noTraza = req.query.no_traza === '1'; // si true, omite trazabilidad VI

    try {
        console.log(`📥 ${mode === 'view' ? 'Visualizando' : 'Descargando'} PDF para doc: ${docId}, recipient: ${recipientId}`);

        // Verificar que el usuario sea el propietario del documento
        const [documentInfo] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.title, d.file_path, d.signed_file_path, d.owner_id,
                        dr.email, dr.completed_at, dr.status as recipient_status, dr.vi_traza_path, dr.custom_pdf_path as recipient_custom_pdf_path
                 FROM documents d
                 INNER JOIN document_recipients dr ON d.document_id = dr.document_id
                 WHERE d.document_id = ? AND dr.recipient_id = ?`,
                [docId, recipientId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (documentInfo.length === 0) {
            return res.status(404).json({ success: false, message: 'Documento no encontrado' });
        }

        const document = documentInfo[0];
        
        console.log(`📋 Documento: ${document.title}, Status recipient: ${document.recipient_status}`);

        if (document.owner_id != userId) {
            return res.status(403).json({ success: false, message: 'No tienes permiso para descargar este documento' });
        }

        // Definir nombre del archivo
        const fileName = document.recipient_status === 'completed'
            ? `${document.title}_completado_${document.email}.pdf`
            : `${document.title}_${document.email}.pdf`;

        // ✅ Si el documento está completado, usar custom_pdf_path del recipient (ya tiene traza fusionada) o signed_file_path
        if (document.recipient_status === 'completed' && (document.recipient_custom_pdf_path || document.signed_file_path)) {
            // Preferir custom_pdf_path del recipient (ya tiene la firma sellada + traza VI pre-fusionada).
            // Con noTraza=1: usar custom_pdf_path igual (tiene la firma sellada) pero sin fusionar traza encima.
            // Fallback a signed_file_path solo si no hay custom_pdf_path.
            const sourceRelPath = document.recipient_custom_pdf_path
                ? document.recipient_custom_pdf_path
                : document.signed_file_path;

            console.log(`✅ Documento completado, descargando PDF firmado desde: ${sourceRelPath}`);

            let signedRelativePath = sourceRelPath;
            if (signedRelativePath.startsWith('/')) {
                signedRelativePath = signedRelativePath.substring(1);
            }
            const signedFilePath = path.resolve(__dirname, '..', signedRelativePath);

            console.log(`📁 Ruta del PDF firmado: ${signedFilePath}`);

            if (!fs.existsSync(signedFilePath)) {
                console.error(`❌ PDF firmado no encontrado en: ${signedFilePath}`);
                return res.status(404).json({
                    success: false,
                    message: 'PDF firmado no encontrado. El documento debe ser completado primero.'
                });
            }

            // Enviar el PDF firmado
            res.setHeader('Content-Type', 'application/pdf');
            if (mode === 'view') {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            }

            // Si NO tiene custom_pdf_path propio y tiene traza VI, fusionar al vuelo (fallback)
            if (!document.recipient_custom_pdf_path && document.vi_traza_path && !noTraza) {
                try {
                    const { PDFDocument: PDFDoc } = require('pdf-lib');
                    const { resolveFromRoot } = require('./config/paths');

                    const trazaClean = document.vi_traza_path.replace(/^\/+/, '');
                    const trazaAbsPath = resolveFromRoot(trazaClean);

                    if (fs.existsSync(trazaAbsPath)) {
                        const signedBytes = fs.readFileSync(signedFilePath);
                        const trazaBytes = fs.readFileSync(trazaAbsPath);

                        const signedPdf = await PDFDoc.load(signedBytes);
                        const trazaPdf = await PDFDoc.load(trazaBytes);

                        const trazaPages = await signedPdf.copyPages(trazaPdf, trazaPdf.getPageIndices());
                        trazaPages.forEach(p => signedPdf.addPage(p));

                        const mergedBytes = await signedPdf.save();
                        res.setHeader('Content-Length', mergedBytes.length);
                        res.end(Buffer.from(mergedBytes));
                        console.log(`✅ PDF firmado + trazabilidad VI ${mode === 'view' ? 'mostrado' : 'descargado'}: ${fileName}`);
                        return;
                    }
                } catch (trazaErr) {
                    console.error('⚠️ Error fusionando trazabilidad VI al descargar (se envía PDF sin traza):', trazaErr.message);
                }
            }

            // DOC. SELLADO: usar doc_only_path si existe, si no re-generarlo via Python
            if (noTraza) {
                try {
                    // Intentar usar doc_only_path pre-generado de la DB
                    const [docOnlyRow] = await new Promise((resolve, reject) => {
                        db.query(
                            'SELECT doc_only_path FROM documents WHERE document_id = ?',
                            [docId],
                            (err, rows) => { if (err) reject(err); else resolve(rows); }
                        );
                    });

                    const docOnlyRel = docOnlyRow && docOnlyRow.doc_only_path;
                    if (docOnlyRel) {
                        const docOnlyAbs = path.resolve(__dirname, '..', docOnlyRel.replace(/^\/+/, ''));
                        if (fs.existsSync(docOnlyAbs)) {
                            const docOnlyStream = fs.createReadStream(docOnlyAbs);
                            docOnlyStream.pipe(res);
                            console.log(`✅ DOC. SELLADO desde doc_only_path: ${fileName}`);
                            return;
                        }
                    }

                    // Fallback: extraer páginas sin traza y re-sellar via Python
                    console.log('⚙️ Generando DOC. SELLADO al vuelo (extrayendo páginas sin traza VI)...');
                    const axios = require('axios');
                    const signedBytes = fs.readFileSync(signedFilePath);
                    const b64 = signedBytes.toString('base64');

                    const pyResp = await axios.post('http://127.0.0.1:5001/api/strip-traza', {
                        pdf_base64: b64
                    }, { timeout: 60000 });

                    if (pyResp.data && pyResp.data.pdf_base64) {
                        const outBytes = Buffer.from(pyResp.data.pdf_base64, 'base64');
                        // Guardar para futuras descargas
                        const docOnlyFilename = `doc_only_${docId}_${Date.now()}.pdf`;
                        const docOnlyPath = path.join(path.dirname(signedFilePath), docOnlyFilename);
                        fs.writeFileSync(docOnlyPath, outBytes);
                        const docOnlyRelSave = path.join('uploads', 'signed', docOnlyFilename).replace(/\\/g, '/');
                        db.query('UPDATE documents SET doc_only_path = ? WHERE document_id = ?', [docOnlyRelSave, docId]);

                        res.setHeader('Content-Length', outBytes.length);
                        res.end(outBytes);
                        console.log(`✅ DOC. SELLADO generado (${outBytes.length} bytes): ${fileName}`);
                        return;
                    }
                } catch (filterErr) {
                    console.error('⚠️ Error generando DOC. SELLADO:', filterErr.message);
                    // Fallback: enviar tal cual
                }
            }

            // Sin filtrado — enviar PDF firmado tal cual
            const fileStream = fs.createReadStream(signedFilePath);
            fileStream.pipe(res);

            console.log(`✅ PDF firmado ${mode === 'view' ? 'mostrado' : 'descargado'}: ${fileName}`);
            return;
        }

        // Si el documento NO está completado, enviar el PDF original
        console.log(`📄 Documento sin completar, ${mode === 'view' ? 'mostrando' : 'descargando'} PDF original`);

        let relativePath = document.file_path;
        if (relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        const filePath = path.resolve(__dirname, '..', relativePath);

        console.log(`📁 Ruta del archivo original: ${filePath}`);

        if (!fs.existsSync(filePath)) {
            console.error(`❌ Archivo no encontrado en: ${filePath}`);
            return res.status(404).json({ success: false, message: 'Archivo no encontrado' });
        }

        res.setHeader('Content-Type', 'application/pdf');

        // ✅ Si mode=view, usar 'inline' para mostrar en navegador, si no 'attachment' para descargar
        if (mode === 'view') {
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        } else {
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        }

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        console.log(`✅ PDF original ${mode === 'view' ? 'mostrado' : 'descargado'}: ${fileName}`);

    } catch (error) {
        console.error('❌ Error descargando PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF',
            error: error.message
        });
    }
});

// ==================== DESCARGA COMPLETA DE PAGARÉ ====================
// GET /api/documents/:docId/pagares/:viewerGroupId/download-complete
// Genera UN SOLO PDF con:
//   - PDF base con datos del CSV del viewer_group (personal_pdf_path)
//   - Firmas de todos los viewers del grupo dibujadas en sus campos
//   - Firma definitiva dibujada en su campo
//   - Sello PKI
//   - Trazabilidades de todos los participantes (viewers + firmante definitivo) al final
// Solo disponible cuando todos han completado. Solo para administradores (requireAuth).
app.get('/api/documents/:docId/pagares/:viewerGroupId/download-complete', requireAuth, async (req, res) => {
    const docId = parseInt(req.params.docId);
    const viewerGroupId = parseInt(req.params.viewerGroupId);
    console.log(`\n📥 [PAGARE-COMPLETE] Descarga completa doc=${docId} vg=${viewerGroupId} user=${req.userId}`);

    try {
        const fs = require('fs');
        const path = require('path');
        const { PDFDocument, rgb } = require('pdf-lib');

        // 1. Verificar que el documento pertenece al usuario
        const [docRows] = await db.promise().query(
            'SELECT document_id, title FROM documents WHERE document_id = ? AND owner_id = ?',
            [docId, req.userId]
        );
        if (!docRows.length) return res.status(404).json({ success: false, message: 'Documento no encontrado' });
        const docTitle = docRows[0].title || `Pagare_${docId}`;

        // 2. Obtener recipients del viewer_group
        const [vgRecipients] = await db.promise().query(
            `SELECT recipient_id, email, name, status, personal_pdf_path, custom_pdf_path, vi_traza_path
             FROM document_recipients
             WHERE viewer_group_id = ? AND is_final_signer = 0
             ORDER BY completed_at ASC`,
            [viewerGroupId]
        );
        if (!vgRecipients.length) return res.status(404).json({ success: false, message: 'Pagaré no encontrado' });

        // 3. Verificar que TODOS los viewers han completado
        if (!vgRecipients.every(r => r.status === 'completed')) {
            return res.status(400).json({ success: false, message: 'El pagaré aún no ha sido completado por todos los firmantes' });
        }

        // 4. Verificar que el firmante definitivo también completó
        const [finalSignerRows] = await db.promise().query(
            `SELECT recipient_id, email, name, status, vi_traza_path
             FROM document_recipients
             WHERE document_id = ? AND is_final_signer = 1 AND status = 'completed'
             LIMIT 1`,
            [docId]
        );
        if (!finalSignerRows.length) {
            return res.status(400).json({ success: false, message: 'El firmante definitivo aún no ha completado el proceso' });
        }
        const finalSigner = finalSignerRows[0];

        // 5. Cargar PDF base con datos del CSV (personal_pdf_path del grupo)
        const baseRec = vgRecipients.find(r => r.personal_pdf_path) || vgRecipients[0];
        const basePdfRel = (baseRec.personal_pdf_path || baseRec.custom_pdf_path || '').replace(/^\/+/, '');
        if (!basePdfRel) return res.status(500).json({ success: false, message: 'No se encontró el PDF base del pagaré' });
        const basePdfAbs = resolveFromRoot(basePdfRel);
        if (!fs.existsSync(basePdfAbs)) return res.status(500).json({ success: false, message: `PDF base no encontrado: ${basePdfAbs}` });

        const pdfDoc = await PDFDocument.load(fs.readFileSync(basePdfAbs));
        console.log(`   ✅ PDF base cargado: ${basePdfRel} (${pdfDoc.getPageCount()} páginas)`);

        // 6. Obtener firmas de los viewers del grupo y dibujarlas
        const [vgSignatures] = await db.promise().query(
            `SELECT df.field_id, df.page_number as page,
                    df.x_position as x, df.y_position as y,
                    df.width, df.height, fv.signature_path, dr.name as signer_name
             FROM document_fields df
             LEFT JOIN field_values fv ON df.field_id = fv.field_id
             LEFT JOIN document_recipients dr ON fv.recipient_id = dr.recipient_id
             WHERE df.document_id = ? AND df.field_type = 'signature'
               AND fv.signature_path IS NOT NULL AND dr.viewer_group_id = ?`,
            [docId, viewerGroupId]
        );
        console.log(`   ✍️ ${vgSignatures.length} firma(s) de viewers a dibujar`);

        for (const sig of vgSignatures) {
            const pageNum = (sig.page || 1) - 1;
            if (pageNum < 0 || pageNum >= pdfDoc.getPageCount()) continue;
            const page = pdfDoc.getPage(pageNum);
            const { height: ph } = page.getSize();
            const fx = parseFloat(sig.x) || 0, fy = parseFloat(sig.y) || 0;
            const fw = parseFloat(sig.width) || 100, fh = parseFloat(sig.height) || 50;
            const drawY = ph - fy - fh;
            if (sig.signature_path && sig.signature_path.startsWith('data:image')) {
                const b64 = sig.signature_path.split(',')[1];
                const imgBytes = Buffer.from(b64, 'base64');
                try {
                    const img = sig.signature_path.includes('image/png')
                        ? await pdfDoc.embedPng(imgBytes)
                        : await pdfDoc.embedJpg(imgBytes);
                    const dims = img.scale(1);
                    const aspect = dims.width / dims.height;
                    const fAspect = fw / fh;
                    let dw, dh;
                    if (aspect > fAspect) { dw = fw * 0.9; dh = dw / aspect; }
                    else { dh = fh * 0.9; dw = dh * aspect; }
                    page.drawImage(img, { x: fx + (fw - dw) / 2, y: drawY + (fh - dh) / 2, width: dw, height: dh });
                } catch (_) {}
            }
        }

        // 7. Obtener y dibujar la firma definitiva
        // Buscar cualquier field_value con signature_path, priorizando el del firmante definitivo
        const [finalSigFields] = await db.promise().query(
            `SELECT df.page_number as page, df.x_position as x, df.y_position as y,
                    df.width, df.height, fv.signature_path
             FROM document_fields df
             LEFT JOIN field_values fv ON df.field_id = fv.field_id
                 AND fv.signature_path IS NOT NULL
             WHERE df.document_id = ? AND df.field_type = 'final_signature'
             ORDER BY (fv.recipient_id = ?) DESC
             LIMIT 1`,
            [docId, finalSigner.recipient_id]
        );
        if (finalSigFields.length && finalSigFields[0].signature_path) {
            const fsf = finalSigFields[0];
            const pageNum = (fsf.page || 1) - 1;
            if (pageNum >= 0 && pageNum < pdfDoc.getPageCount()) {
                const page = pdfDoc.getPage(pageNum);
                const { height: ph } = page.getSize();
                const fx = parseFloat(fsf.x) || 0, fy = parseFloat(fsf.y) || 0;
                const fw = parseFloat(fsf.width) || 150, fh = parseFloat(fsf.height) || 50;
                const drawY = ph - fy - fh;
                if (fsf.signature_path.startsWith('data:image')) {
                    const b64 = fsf.signature_path.split(',')[1];
                    const imgBytes = Buffer.from(b64, 'base64');
                    try {
                        const img = fsf.signature_path.includes('image/png')
                            ? await pdfDoc.embedPng(imgBytes)
                            : await pdfDoc.embedJpg(imgBytes);
                        const dims = img.scale(1);
                        const aspect = dims.width / dims.height;
                        const fAspect = fw / fh;
                        let dw, dh;
                        if (aspect > fAspect) { dw = fw * 0.9; dh = dw / aspect; }
                        else { dh = fh * 0.9; dw = dh * aspect; }
                        page.drawImage(img, { x: fx + (fw - dw) / 2, y: drawY + (fh - dh) / 2, width: dw, height: dh });
                        console.log(`   ✍️ Firma definitiva dibujada`);
                    } catch (_) {}
                }
            }
        }

        // 8. Aplicar sello PKI
        const [sealFields] = await db.promise().query(
            `SELECT page_number as page, x_position as x, y_position as y, width, height
             FROM document_fields WHERE document_id = ? AND field_type = 'seal'`,
            [docId]
        );
        const seals = sealFields.map(seal => {
            const pageIndex = (seal.page || 1) - 1;
            if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) return null;
            const pg = pdfDoc.getPage(pageIndex);
            const { height: ph } = pg.getSize();
            return { page: seal.page, x: parseFloat(seal.x) || 10, y: ph - parseFloat(seal.y) - (parseFloat(seal.height) || 80), width: parseFloat(seal.width) || 200, height: parseFloat(seal.height) || 80 };
        }).filter(Boolean);

        // 9. Agregar trazabilidades ANTES de sellar (para no romper la firma PKI)
        //    Orden: viewer1, viewer2, ..., firmante definitivo
        const allWithTraza = [...vgRecipients, finalSigner];
        const mergedDoc = await PDFDocument.load(await pdfDoc.save());

        for (const participant of allWithTraza) {
            if (!participant.vi_traza_path) {
                console.log(`   ℹ️ [${participant.email}] Sin trazabilidad VI`);
                continue;
            }
            const trazaAbs = resolveFromRoot(participant.vi_traza_path.replace(/^\/+/, ''));
            if (!fs.existsSync(trazaAbs)) {
                console.warn(`   ⚠️ [${participant.email}] Traza no encontrada: ${trazaAbs}`);
                continue;
            }
            try {
                const trazaDoc = await PDFDocument.load(fs.readFileSync(trazaAbs));
                const trazaPages = await mergedDoc.copyPages(trazaDoc, trazaDoc.getPageIndices());
                trazaPages.forEach(p => mergedDoc.addPage(p));
                console.log(`   📋 [${participant.email}] Trazabilidad añadida (${trazaDoc.getPageCount()} págs)`);
            } catch (e) {
                console.warn(`   ⚠️ [${participant.email}] Error añadiendo traza: ${e.message}`);
            }
        }

        // 10. Aplicar sello PKI DESPUÉS de las trazas (última operación para preservar firma)
        let pdfBuffer = Buffer.from(await mergedDoc.save());
        const pythonSigner = new PythonSignerClient({ verbose: false });
        try {
            const [fsMeta] = await db.promise().query('SELECT final_signer_email, final_signer_name FROM pagare_metadata WHERE document_id = ?', [docId]);
            const fsEmail = fsMeta[0]?.final_signer_email || finalSigner.email;
            const [docVerifRow] = await db.promise().query('SELECT verification_token FROM documents WHERE document_id = ?', [docId]);
            const verifToken = docVerifRow[0]?.verification_token || crypto.createHash('sha256').update(`VERIFY-${docId}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`).digest('hex').substring(0, 32);
            pdfBuffer = await pythonSigner.signPdf(pdfBuffer, {
                reason: `Pagaré Completo: ${docTitle}`,
                location: 'Colombia',
                signerName: 'PKI Services',
                contactInfo: fsEmail,
                fieldName: `PagareCompleto_${docId}_vg${viewerGroupId}_${Date.now()}`,
                visible: true,
                seals: seals.length > 0 ? seals : null,
                documentId: docId,
                verificationToken: verifToken
            });
            console.log(`   🔐 Sello PKI aplicado`);
        } catch (sealErr) {
            console.warn(`   ⚠️ Sello PKI falló, continuando sin sello: ${sealErr.message}`);
        }

        const finalBytes = pdfBuffer;
        const safeTitle = docTitle.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 50);
        const filename = `Pagare_Completo_${safeTitle}_vg${viewerGroupId}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', finalBytes.length);
        res.send(Buffer.from(finalBytes));

        console.log(`   ✅ [PAGARE-COMPLETE] Enviado: ${mergedDoc.getPageCount()} páginas totales, ${finalBytes.length} bytes`);

    } catch (error) {
        console.error('❌ [PAGARE-COMPLETE] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error al generar el pagaré completo', error: error.message });
    }
});

// ==================== DESCARGA MASIVA DE PAGARÉS (ZIP) ====================
// GET /api/documents/:docId/pagares/download-all-zip
// Genera un ZIP con todos los pagarés COMPLETADOS del documento.
// Cada pagaré = un PDF completo (base + firmas + PKI + trazas VI).
// Solo para administradores (requireAuth).
app.get('/api/documents/:docId/pagares/download-all-zip', requireAuth, async (req, res) => {
    const { docId } = req.params;
    const archiver = require('archiver');

    try {
        console.log(`\n📦 [PAGARE-ZIP] Iniciando descarga masiva - Documento ${docId}`);

        // Obtener info del documento
        const [docs] = await db.promise().query(
            `SELECT d.title, d.document_type
             FROM documents d WHERE d.document_id = ?`,
            [docId]
        );
        if (!docs.length || docs[0].document_type !== 'pagare') {
            return res.status(400).json({ success: false, message: 'Documento no es pagaré' });
        }
        const docTitle = docs[0].title;

        // Obtener todos los viewer_groups COMPLETADOS
        const [viewerGroups] = await db.promise().query(
            `SELECT vg.viewer_group_id, vg.viewer_id
             FROM pagare_viewer_groups vg
             WHERE vg.document_id = ? AND vg.status = 'completed'
             ORDER BY vg.viewer_id`,
            [docId]
        );

        // Verificar que el firmante definitivo también completó
        const [finalSignerRows] = await db.promise().query(
            `SELECT final_signer_status FROM pagare_metadata WHERE document_id = ?`,
            [docId]
        );
        const finalSignerDone = finalSignerRows[0]?.final_signer_status === 'signed';

        const completedGroups = viewerGroups.filter(vg => true); // ya filtrados por status='completed'

        if (completedGroups.length === 0) {
            return res.status(400).json({ success: false, message: 'No hay pagarés completados para descargar' });
        }

        console.log(`   📋 ${completedGroups.length} pagaré(s) completado(s) encontrado(s)`);

        // Obtener firmante definitivo (email, nombre, firma, traza VI)
        const [finalSignerRecipients] = await db.promise().query(
            `SELECT dr.recipient_id, dr.email, dr.name, dr.custom_pdf_path, dr.vi_traza_path
             FROM document_recipients dr
             WHERE dr.document_id = ? AND dr.is_final_signer = 1`,
            [docId]
        );
        const finalSigner = finalSignerRecipients[0] || null;

        // Firma definitiva — buscar cualquier field_value con signature_path del campo final_signature,
        // priorizando el del firmante definitivo (por si acaso hay duplicados)
        let finalSignatureDataUrl = null;
        let finalSigField = null;
        if (finalSigner) {
            const [finalSigFields] = await db.promise().query(
                `SELECT df.field_id, df.page_number as page, df.x_position as x, df.y_position as y,
                        df.width, df.height, fv.signature_path
                 FROM document_fields df
                 LEFT JOIN field_values fv ON fv.field_id = df.field_id
                     AND fv.signature_path IS NOT NULL
                 WHERE df.document_id = ? AND df.field_type = 'final_signature'
                 ORDER BY (fv.recipient_id = ?) DESC
                 LIMIT 1`,
                [docId, finalSigner.recipient_id]
            );
            finalSigField = finalSigFields[0] || null;
        }

        // Sello PKI
        const [sealFields] = await db.promise().query(
            `SELECT page_number as page, x_position as x, y_position as y, width, height
             FROM document_fields WHERE document_id = ? AND field_type = 'seal'`,
            [docId]
        );

        // Configurar respuesta ZIP
        const safeTitle = docTitle.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 40);
        const zipFilename = `Pagares_${safeTitle}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', err => {
            console.error('❌ [PAGARE-ZIP] Error archiver:', err.message);
            if (!res.headersSent) res.status(500).json({ success: false, message: err.message });
        });
        archive.pipe(res);

        // Generar PDF por cada viewer_group
        for (let i = 0; i < completedGroups.length; i++) {
            const vg = completedGroups[i];
            const viewerGroupId = vg.viewer_group_id;
            console.log(`   📄 [PAGARE-ZIP] Generando pagaré ${i + 1}/${completedGroups.length} (VG ${viewerGroupId})...`);

            try {
                const { PDFDocument } = require('pdf-lib');

                // Obtener recipients del grupo
                const [groupRecipients] = await db.promise().query(
                    `SELECT dr.recipient_id, dr.email, dr.name,
                            dr.personal_pdf_path, dr.custom_pdf_path, dr.vi_traza_path
                     FROM document_recipients dr
                     WHERE dr.document_id = ? AND dr.viewer_group_id = ? AND dr.is_final_signer = 0
                     ORDER BY dr.recipient_id`,
                    [docId, viewerGroupId]
                );

                // PDF base: personal_pdf_path (pagare_vg_ sin firmas manuscritas)
                const basePdfRel = groupRecipients[0]?.personal_pdf_path || '';
                const cleanBase = basePdfRel.startsWith('/') ? basePdfRel.substring(1) : basePdfRel;
                const baseAbsPath = resolveFromRoot(cleanBase);

                if (!fs.existsSync(baseAbsPath)) {
                    console.warn(`   ⚠️ PDF base no encontrado para VG ${viewerGroupId}: ${baseAbsPath}`);
                    continue;
                }

                const mergedDoc = await PDFDocument.load(fs.readFileSync(baseAbsPath));

                // Dibujar firmas de cada viewer en sus campos
                for (const rec of groupRecipients) {
                    const [sigFields] = await db.promise().query(
                        `SELECT df.page_number as page, df.x_position as x, df.y_position as y,
                                df.width, df.height, fv.signature_path
                         FROM document_fields df
                         LEFT JOIN field_values fv ON fv.field_id = df.field_id AND fv.recipient_id = ?
                         WHERE df.document_id = ? AND df.field_type = 'signature'`,
                        [rec.recipient_id, docId]
                    );

                    for (const sf of sigFields) {
                        if (!sf.signature_path || !sf.signature_path.startsWith('data:image')) continue;
                        const pageIdx = (sf.page || 1) - 1;
                        if (pageIdx < 0 || pageIdx >= mergedDoc.getPageCount()) continue;
                        const page = mergedDoc.getPage(pageIdx);
                        const { height: ph } = page.getSize();
                        const fx = parseFloat(sf.x), fy = parseFloat(sf.y);
                        const fw = parseFloat(sf.width), fh = parseFloat(sf.height);
                        const drawX = fx, drawY = ph - fy - fh;

                        try {
                            const base64 = sf.signature_path.split(',')[1];
                            const imgBytes = Buffer.from(base64, 'base64');
                            const img = sf.signature_path.includes('image/png')
                                ? await mergedDoc.embedPng(imgBytes)
                                : await mergedDoc.embedJpg(imgBytes);
                            const dims = img.scale(1);
                            const aspect = dims.width / dims.height;
                            const fa = fw / fh;
                            let dw, dh;
                            if (aspect > fa) { dw = fw * 0.9; dh = dw / aspect; }
                            else { dh = fh * 0.9; dw = dh * aspect; }
                            page.drawImage(img, {
                                x: drawX + (fw - dw) / 2,
                                y: drawY + (fh - dh) / 2,
                                width: dw, height: dh
                            });
                        } catch (e) {
                            console.warn(`   ⚠️ Error dibujando firma ${rec.email}: ${e.message}`);
                        }
                    }
                }

                // Dibujar firma definitiva
                if (finalSigField?.signature_path?.startsWith('data:image')) {
                    const pageIdx = (finalSigField.page || 1) - 1;
                    if (pageIdx >= 0 && pageIdx < mergedDoc.getPageCount()) {
                        const page = mergedDoc.getPage(pageIdx);
                        const { height: ph } = page.getSize();
                        const fx = parseFloat(finalSigField.x), fy = parseFloat(finalSigField.y);
                        const fw = parseFloat(finalSigField.width), fh = parseFloat(finalSigField.height);
                        try {
                            const base64 = finalSigField.signature_path.split(',')[1];
                            const imgBytes = Buffer.from(base64, 'base64');
                            const img = finalSigField.signature_path.includes('image/png')
                                ? await mergedDoc.embedPng(imgBytes)
                                : await mergedDoc.embedJpg(imgBytes);
                            const dims = img.scale(1);
                            const aspect = dims.width / dims.height;
                            const fa = fw / fh;
                            let dw, dh;
                            if (aspect > fa) { dw = fw * 0.9; dh = dw / aspect; }
                            else { dh = fh * 0.9; dw = dh * aspect; }
                            page.drawImage(img, {
                                x: fx + (fw - dw) / 2,
                                y: ph - fy - fh + (fh - dh) / 2,
                                width: dw, height: dh
                            });
                        } catch (e) {
                            console.warn(`   ⚠️ Error dibujando firma definitiva: ${e.message}`);
                        }
                    }
                }

                // Añadir trazabilidades VI (viewers + firmante definitivo)
                const allParticipants = [...groupRecipients, ...(finalSigner ? [finalSigner] : [])];
                for (const p of allParticipants) {
                    if (!p.vi_traza_path) continue;
                    const trazaClean = p.vi_traza_path.startsWith('/') ? p.vi_traza_path.substring(1) : p.vi_traza_path;
                    const trazaAbs = resolveFromRoot(trazaClean);
                    if (!fs.existsSync(trazaAbs)) continue;
                    try {
                        const trazaDoc = await PDFDocument.load(fs.readFileSync(trazaAbs));
                        const pages = await mergedDoc.copyPages(trazaDoc, trazaDoc.getPageIndices());
                        pages.forEach(p => mergedDoc.addPage(p));
                    } catch (e) {
                        console.warn(`   ⚠️ Error añadiendo traza ${p.email}: ${e.message}`);
                    }
                }

                // Aplicar sello PKI
                const pdfBuffer = Buffer.from(await mergedDoc.save());
                let finalBuffer = pdfBuffer;

                try {
                    const pythonSigner = new PythonSignerClient({ verbose: false });
                    const verifToken = crypto
                        .createHash('sha256')
                        .update(`VERIFY-${docId}-${process.env.JWT_SECRET || 'firmalegal-secret-key'}`)
                        .digest('hex').substring(0, 32);

                    const sealsForPKI = [];
                    for (const seal of sealFields) {
                        const { PDFDocument: PD2 } = require('pdf-lib');
                        const tmpDoc = await PD2.load(pdfBuffer);
                        const pageIdx = (seal.page || 1) - 1;
                        if (pageIdx >= 0 && pageIdx < tmpDoc.getPageCount()) {
                            const pg = tmpDoc.getPage(pageIdx);
                            const { height: ph } = pg.getSize();
                            sealsForPKI.push({
                                page: seal.page,
                                x: parseFloat(seal.x),
                                y: ph - parseFloat(seal.y) - parseFloat(seal.height),
                                width: parseFloat(seal.width),
                                height: parseFloat(seal.height)
                            });
                        }
                    }

                    finalBuffer = await pythonSigner.signPdf(pdfBuffer, {
                        reason: `Pagaré ${i + 1} - ${docTitle}`,
                        location: 'Colombia',
                        signerName: 'PKI Services',
                        fieldName: `PagareZip_${docId}_vg${viewerGroupId}`,
                        visible: true,
                        seals: sealsForPKI.length > 0 ? sealsForPKI : null,
                        verificationToken: verifToken
                    });
                } catch (pkiErr) {
                    console.warn(`   ⚠️ PKI error VG ${viewerGroupId}: ${pkiErr.message} — usando sin sello`);
                }

                const pdfFilename = `Pagare_${i + 1}_${safeTitle}_vg${viewerGroupId}.pdf`;
                archive.append(Buffer.from(finalBuffer), { name: pdfFilename });
                console.log(`   ✅ [PAGARE-ZIP] Pagaré ${i + 1} agregado al ZIP`);

            } catch (vgErr) {
                console.error(`   ❌ [PAGARE-ZIP] Error VG ${viewerGroupId}:`, vgErr.message);
            }
        }

        await archive.finalize();
        console.log(`   ✅ [PAGARE-ZIP] ZIP enviado: ${completedGroups.length} pagaré(s)`);

    } catch (error) {
        console.error('❌ [PAGARE-ZIP] Error general:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Error al generar el ZIP', error: error.message });
        }
    }
});

// ==================== E-TITULO VALOR ====================

// POST /api/documents/:id/enviar-etitulo
app.post('/api/documents/:id/enviar-etitulo', requireAuth, async (req, res) => {
    const docId = parseInt(req.params.id);
    const { beneficiarioId, viewerGroupId: viewerGroupIdFromBody } = req.body;

    if (!beneficiarioId) {
        return res.status(400).json({ success: false, message: 'BeneficiarioId es requerido' });
    }

    try {
        const [docRows] = await db.promise().query(
            `SELECT d.document_id, d.title, d.tv_guid
             FROM documents d WHERE d.document_id = ? AND d.owner_id = ? AND d.document_type = 'pagare'`,
            [docId, req.userId]
        );
        if (!docRows.length) return res.status(404).json({ success: false, message: 'Pagaré no encontrado' });
        const doc = docRows[0];

        if (doc.tv_guid) {
            return res.status(400).json({ success: false, message: 'Este pagaré ya fue enviado al baúl', tv_guid: doc.tv_guid });
        }

        // Obtener viewer_group_id: del body (envío masivo) o buscar el primero completado
        let viewerGroupId = viewerGroupIdFromBody ? parseInt(viewerGroupIdFromBody) : null;
        if (!viewerGroupId) {
            const [vgRows] = await db.promise().query(
                `SELECT DISTINCT viewer_group_id FROM document_recipients
                 WHERE document_id = ? AND is_final_signer = 0 AND status = 'completed'
                 LIMIT 1`,
                [docId]
            );
            if (!vgRows.length || !vgRows[0].viewer_group_id) {
                return res.status(400).json({ success: false, message: 'El pagaré aún no está completamente firmado' });
            }
            viewerGroupId = vgRows[0].viewer_group_id;
        }
        if (!viewerGroupId) {
            return res.status(400).json({ success: false, message: 'El pagaré aún no está completamente firmado' });
        }

        const [recipients] = await db.promise().query(
            `SELECT dr.name, dr.email, dp.role_name
             FROM document_recipients dr
             LEFT JOIN document_parts dp ON dr.part_id = dp.part_id
             WHERE dr.document_id = ? AND dr.is_final_signer = 0 AND dr.status = 'completed'`,
            [docId]
        );

        // Obtener el PDF completo (con firmas + trazabilidades) llamando al endpoint interno
        console.log(`📄 [E-TITULO] Generando PDF completo para doc=${docId} vg=${viewerGroupId}...`);
        const PORT_INT = process.env.PORT || 3000;
        // Necesitamos un JWT válido — usamos el token del request actual
        const authCookie = req.cookies?.auth_token || '';
        const completePdfResp = await fetch(
            `http://localhost:${PORT_INT}/api/documents/${docId}/pagares/${viewerGroupId}/download-complete`,
            { headers: { 'Cookie': `auth_token=${authCookie}` } }
        );
        if (!completePdfResp.ok) {
            const errText = await completePdfResp.text().catch(() => '');
            return res.status(500).json({ success: false, message: 'No se pudo generar el PDF completo del pagaré', detail: errText });
        }
        const pdfArrayBuffer = await completePdfResp.arrayBuffer();
        const pdfBuffer = Buffer.from(pdfArrayBuffer);
        const pdfBase64 = pdfBuffer.toString('base64');

        const hashDocumento = crypto.createHash('sha256')
            .update(Buffer.from(pdfBase64, 'ascii'))
            .digest('hex')
            .toUpperCase();

        const TV_API_URL = process.env.TV_API_URL || 'https://ra.pkiservices.co/api';

        console.log(`📦 [E-TITULO] Obteniendo token para documento ${docId}...`);
        const tokenResp = await fetch(`${TV_API_URL}/Token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: process.env.TV_API_USUARIO, clave: process.env.TV_API_CLAVE })
        });
        const tokenData = await tokenResp.json();
        if (!tokenData.dato) {
            return res.status(500).json({ success: false, message: 'Error obteniendo token de e-titulo', detail: tokenData });
        }
        const tvToken = tokenData.dato;
        console.log(`✅ [E-TITULO] Token obtenido`);

        const rolMap = (roleName) => {
            if (!roleName) return 'DEUDOR';
            const r = roleName.toUpperCase();
            if (r.includes('CODEUDOR') || r.includes('COD') || r.includes('N2')) return 'CODEUDOR';
            return 'DEUDOR';
        };

        const contactos = recipients.map(r => {
            const parts = (r.name || '').trim().split(' ');
            return {
                nombre: parts[0] || r.email,
                apellido: parts.slice(1).join(' ') || '',
                rolFirmante: rolMap(r.role_name),
                tipoDocumento: 'CC',
                numeroDocumento: '',
                correo: r.email,
                telefono: ''
            };
        });

        if (!contactos.length || !contactos.some(c => c.rolFirmante === 'DEUDOR')) {
            if (contactos.length) contactos[0].rolFirmante = 'DEUDOR';
            else contactos.push({
                nombre: 'Firmante', apellido: '', rolFirmante: 'DEUDOR',
                tipoDocumento: 'CC', numeroDocumento: '', correo: '', telefono: ''
            });
        }

        const payload = {
            BeneficiarioId: parseInt(beneficiarioId),
            numero: String(docId),
            estado: 'ARCHIVO_Y_CONSERVACION',
            nombreDocumento: doc.title || `PAGARE_${docId}`,
            montoDelPagare: 0,
            tipoMoneda: 'COP',
            fechaExpedicion: '',
            fechaVencimiento: '',
            documentoB64: pdfBase64,
            hashDocumento: hashDocumento,
            cantidadAdicional: 0,
            ArregloAdicionales: [],
            contactos
        };

        console.log(`📤 [E-TITULO] Enviando pagaré ${docId} al baúl ${beneficiarioId}...`);
        const pagarResp = await fetch(`${TV_API_URL}/pagare/pagareCustodia`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tvToken}`
            },
            body: JSON.stringify(payload)
        });
        const pagarData = await pagarResp.json();
        console.log(`📥 [E-TITULO] Respuesta:`, JSON.stringify(pagarData).substring(0, 300));

        if (pagarData.code !== 1000 || !pagarData.pagare?.guidId) {
            return res.status(500).json({ success: false, message: 'Error enviando al baúl', detail: pagarData });
        }

        const guidId = pagarData.pagare.guidId;

        // Guardar tv_guid por viewer_group (permite múltiples pagarés por documento)
        await db.promise().query(
            'UPDATE pagare_viewer_groups SET tv_guid = ?, tv_baul_id = ? WHERE viewer_group_id = ?',
            [guidId, parseInt(beneficiarioId), viewerGroupId]
        );
        // También guardar en documents para compatibilidad (si solo hay un pagaré)
        await db.promise().query(
            'UPDATE documents SET tv_guid = ?, tv_baul_id = ? WHERE document_id = ? AND tv_guid IS NULL',
            [guidId, parseInt(beneficiarioId), docId]
        );

        console.log(`✅ [E-TITULO] Pagaré ${docId}/vg${viewerGroupId} custodiado. GUID: ${guidId}`);
        res.json({ success: true, message: 'Pagaré enviado al baúl exitosamente', guidId, numeroPagare: pagarData.pagare.numeroPagare });

    } catch (error) {
        console.error('❌ [E-TITULO] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
});

// GET /api/documents/:id/certificado-etitulo
app.get('/api/documents/:id/certificado-etitulo', requireAuth, async (req, res) => {
    const docId = parseInt(req.params.id);
    try {
        const [rows] = await db.promise().query(
            'SELECT tv_guid, title FROM documents WHERE document_id = ? AND owner_id = ?',
            [docId, req.userId]
        );
        if (!rows.length || !rows[0].tv_guid) {
            return res.status(404).json({ success: false, message: 'Este pagaré no tiene certificado de custodia' });
        }
        const { tv_guid } = rows[0];

        const TV_API_URL = process.env.TV_API_URL || 'https://ra.pkiservices.co/api';
        const tokenResp2 = await fetch(`${TV_API_URL}/Token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: process.env.TV_API_USUARIO, clave: process.env.TV_API_CLAVE })
        });
        const tokenData2 = await tokenResp2.json();
        if (!tokenData2.dato) return res.status(500).json({ success: false, message: 'Error obteniendo token' });

        const certResp = await fetch(`${TV_API_URL}/Pagare/comprobanteRecepcionGuidId/${tv_guid}`, {
            headers: { 'Authorization': `Bearer ${tokenData2.dato}` }
        });
        const certData = await certResp.json();
        if (!certData.dato) return res.status(500).json({ success: false, message: 'Certificado no disponible aún', detail: certData });

        const pdfBuf = Buffer.from(certData.dato, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="certificado_custodia_${docId}.pdf"`);
        res.send(pdfBuf);

    } catch (error) {
        console.error('❌ [E-TITULO-CERT] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});