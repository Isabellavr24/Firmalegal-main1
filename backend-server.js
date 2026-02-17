const express = require('express');
const mysql = require('mysql2');
// Pool de conexiones MySQL centralizado
const db = require('./config/database');

const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
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

const app = express();
// Hacer el pool de conexiones disponible para todos los controladores
app.locals.db = db;

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
app.use(express.static(PATHS.FRONTEND));
// Servir carpeta de uploads para acceder a documentos y firmas
app.use('/uploads', express.static(PATHS.UPLOADS_DIR));

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

// Redirect stray /login requests to proper login page
app.get('/login', (req, res) => res.redirect('/login.html'));
app.post('/login', (req, res) => res.redirect(303, '/login.html'));

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
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'public-sign.html'));
});

app.get('/bulk-send.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'bulk-send.html'));
});

app.get('/verify.html', (req, res) => {
    res.sendFile(resolveFromRoot('frontend', 'public', 'Main', 'verify.html'));
});

// COMENTADO - Ahora usamos pool centralizado
// const db = mysql.createConnection({
//     host: process.env.DB_HOST || 'localhost',
//     port: process.env.DB_PORT || 3306,
//     user: process.env.DB_USER || 'root',
//     password: process.env.DB_PASSWORD || '',
//     database: process.env.DB_NAME || 'firmalegalonline',
//     connectTimeout: 60000,
//     acquireTimeout: 60000,
//     timeout: 60000
// });

// =============================================
// CONEXIONES ANTIGUAS ELIMINADAS
// Ahora usamos pool centralizado desde config/database.js
// =============================================


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

        // 🔥 CREAR document_recipient para el firmante definitivo (si no existe)
        const [existingRecipient] = await db.promise().query(
            `SELECT recipient_id FROM document_recipients
             WHERE document_id = ? AND is_final_signer = 1 AND email = ?`,
            [documentId, finalSignerEmail]
        );

        let recipientId;
        if (existingRecipient.length === 0) {
            // Crear nuevo recipient para firmante definitivo (sin columnas role y viewer_group_id)
            const [result] = await db.promise().query(
                `INSERT INTO document_recipients
                 (document_id, email, name, token, status, is_final_signer)
                 VALUES (?, ?, ?, ?, 'sent', 1)`,
                [documentId, finalSignerEmail, finalSignerName, finalSignerToken]
            );
            recipientId = result.insertId;
            console.log(`   ✅ Recipient creado para firmante definitivo (ID: ${recipientId})`);
        } else {
            recipientId = existingRecipient[0].recipient_id;
            console.log(`   ℹ️ Recipient ya existe para firmante definitivo (ID: ${recipientId})`);
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
                return;
            }

            if (docInfo[0].viewer_count <= 1) {
                console.log(`   ℹ️  Pagaré con ${docInfo[0].viewer_count} viewer(s), no es envío masivo, saltando censura`);
                return;
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
            console.error(`   ⚠️ Error:`, pdfError.message);
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

        const subject = `⚖️ Firma Definitiva Requerida: ${viewerGroups.length} Pagaré(s) Completado(s)`;

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
        </div>

        <div class="footer">
            <p class="footer-logo">FirmaLegal Online</p>
            <p>Plataforma de Firma Electrónica Segura</p>
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
⚖️ FIRMA DEFINITIVA REQUERIDA
================================

Estimado/a ${finalSignerName || 'Firmante Definitivo'},

Todos los firmantes han completado sus firmas en el documento: ${document.name}

📊 RESUMEN
----------
Total de pagarés completados: ${viewerGroups.length}

📋 PAGARÉS LISTOS PARA FIRMA DEFINITIVA
----------------------------------------
${pagaresTextList.join('\n\n')}

🔐 ACCIÓN REQUERIDA
-------------------
Por favor, accede al sistema para aplicar tu firma definitiva y sellar todos los documentos:

${APP_URL}/public-sign.html?token=${finalSignerToken}

⚠️ IMPORTANTE
-------------
Tu firma sellará de forma definitiva los ${viewerGroups.length} pagaré${viewerGroups.length > 1 ? 's' : ''} completado${viewerGroups.length > 1 ? 's' : ''}, finalizando todo el proceso de firma electrónica.

--
FirmaLegal Online
Plataforma de Firma Electrónica Segura
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
            secure: true,  // Secure cookie para HTTPS
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
               DATABASE() as current_db
        FROM users u
        INNER JOIN roles r ON u.role_id = r.role_id
        ORDER BY u.created_at DESC
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

// Crear nuevo usuario
app.post('/api/users', async (req, res) => {
    console.log('➕ Creando nuevo usuario');
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const { firstName, lastName, email, password, roleId, requestingUserId, requestingUserRole } = req.body;

    // VERIFICAR PERMISOS: Solo Superadministrador puede crear usuarios
    if (!requestingUserRole || !canManageUsers(requestingUserRole)) {
        console.warn('⛔ Intento de crear usuario sin permisos:', requestingUserRole);
        return res.status(403).json({ 
            success: false, 
            message: 'No tienes permisos para crear usuarios' 
        });
    }

    // Validaciones
    if (!firstName || !lastName || !email || !password || !roleId) {
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

        // Hashear contraseña
        const passwordHash = await bcrypt.hash(password, 10);

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
        res.json({ success: true, message: 'Usuario creado exitosamente' });

    } catch (error) {
        console.error('❌ Error al crear usuario:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al crear usuario' 
        });
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

        // Verificar si el email ya existe (excepto el usuario actual)
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

        // Actualizar usuario
        if (password) {
            // Si se proporciona contraseña, actualizarla también
            const passwordHash = await bcrypt.hash(password, 10);
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, email = ?, password_hash = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, email, passwordHash, roleId, userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });
        } else {
            // Sin cambiar contraseña
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE users SET first_name = ?, last_name = ?, email = ?, role_id = ? WHERE user_id = ?',
                    [firstName, lastName, email, roleId, userId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
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
        // ✅ Obtener información de TODOS los recipients del documento para detección frontend
        const [allRecipients] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT recipient_id, email, name, status, token, is_final_signer, viewer_group_id
                 FROM document_recipients
                 WHERE document_id = ?
                 ORDER BY recipient_id ASC`,
                [recipient.document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        console.log(`📊 Enviando info de ${allRecipients.length} recipient(s) para detección frontend`);

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
            sentAt: recipient.sent_at,
            openedAt: recipient.opened_at,
            status: recipient.status,
            hasPersonalizedPdf: hasCustomPdf,
            fields: fields || [],
            recipients: allRecipients  // ✅ Agregar lista de recipients para detección
        };

        // 🔒 CAPA ADICIONAL DE SEGURIDAD: Sanitizar campos para pagarés
        if (recipient.document_type === 'pagare') {
            console.log('🔒 [SEGURIDAD] Sanitizando respuesta para documento tipo PAGARÉ');

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
                // DOCUMENTOS PERSONALIZADOS (Pagarés): Actualizar TODOS los recipients del mismo viewer_group
                // Todos los firmantes del mismo pagaré comparten el PDF con firmas acumuladas
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE document_recipients SET custom_pdf_path = ? WHERE viewer_group_id = ?',
                        [relativeIntermediatePath, recipient.viewer_group_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`✅ custom_pdf_path actualizado para TODOS los recipients del viewer_group_id=${recipient.viewer_group_id} (pagaré)`);
            } else {
                // DOCUMENTOS COMPARTIDOS (incluyendo CSV con partes): Actualizar TODOS los destinatarios
                // Todos los destinatarios comparten el mismo PDF con firmas acumuladas
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
                    isLastSigner: false,
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
                         LEFT JOIN field_values fv ON df.field_id = fv.field_id AND fv.recipient_id = ?
                         WHERE df.document_id = ? AND df.field_type = 'final_signature'
                         LIMIT 1`,
                        [recipient.recipient_id, recipient.document_id],
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
                        // Obtener el último PDF intermedio del viewer_group
                        const [vgRecipients] = await new Promise((resolve, reject) => {
                            db.query(
                                `SELECT custom_pdf_path FROM document_recipients
                                 WHERE viewer_group_id = ? AND custom_pdf_path IS NOT NULL
                                 ORDER BY completed_at DESC LIMIT 1`,
                                [viewerGroup.viewer_group_id],
                                (err, results) => {
                                    if (err) reject(err);
                                    else resolve([results]);
                                }
                            );
                        });

                        if (vgRecipients.length === 0 || !vgRecipients[0].custom_pdf_path) {
                            console.warn(`   ⚠️ No se encontró PDF intermedio para viewer_group ${viewerGroup.viewer_group_id}`);
                            continue;
                        }

                        const intermediatePdfPath = vgRecipients[0].custom_pdf_path;
                        const cleanPath = intermediatePdfPath.startsWith('/')
                            ? intermediatePdfPath.substring(1)
                            : intermediatePdfPath;
                        const fullPdfPath = resolveFromRoot(cleanPath);

                        if (!fs.existsSync(fullPdfPath)) {
                            console.warn(`   ⚠️ PDF no encontrado: ${fullPdfPath}`);
                            continue;
                        }

                        // Leer PDF intermedio (con datos únicos + firmas regulares)
                        let vgPdfBuffer = fs.readFileSync(fullPdfPath);
                        console.log(`   📄 PDF intermedio cargado: ${(vgPdfBuffer.length / 1024).toFixed(2)} KB`);

                        // Dibujar la firma definitiva en este PDF
                        const { PDFDocument } = require('pdf-lib');
                        const vgPdfDoc = await PDFDocument.load(vgPdfBuffer);

                        // Obtener campos de sello para este documento
                        const [sealFields] = await new Promise((resolve, reject) => {
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

                        console.log(`   🔐 Sellos PKI encontrados: ${sealFields.length}`);

                        // Preparar sellos para Python
                        let sealsForPython = [];
                        for (const seal of sealFields) {
                            const pageNum = seal.page || 1;
                            const pageIndex = pageNum - 1;

                            if (pageIndex >= 0 && pageIndex < vgPdfDoc.getPageCount()) {
                                const page = vgPdfDoc.getPage(pageIndex);
                                const { height: pageHeight } = page.getSize();

                                const x = parseFloat(seal.x) || 10;
                                const width = parseFloat(seal.width) || 200;
                                const height = parseFloat(seal.height) || 80;
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

                        // Usar el campo final_signature obtenido (es el MISMO para todos)

                        if (finalSigField && finalSigField.signature_path) {
                            const pageNum = (finalSigField.page || 1) - 1;
                            if (pageNum >= 0 && pageNum < vgPdfDoc.getPageCount()) {
                                const page = vgPdfDoc.getPage(pageNum);
                                const { height: pageHeight } = page.getSize();

                                const fieldX = parseFloat(finalSigField.x) || 10;
                                const fieldY = parseFloat(finalSigField.y) || 10;
                                const fieldWidth = parseFloat(finalSigField.width) || 150;
                                const fieldHeight = parseFloat(finalSigField.height) || 50;

                                const x = fieldX;
                                const y = pageHeight - fieldY - fieldHeight;

                                console.log(`   ✍️ Dibujando firma definitiva en página ${pageNum + 1}...`);

                                // Extraer y embeber imagen de firma
                                const signatureDataUrl = finalSigField.signature_path;
                                if (signatureDataUrl && signatureDataUrl.startsWith('data:image')) {
                                    const base64Data = signatureDataUrl.split(',')[1];
                                    const imageBytes = Buffer.from(base64Data, 'base64');

                                    let image;
                                    if (signatureDataUrl.includes('image/png')) {
                                        image = await vgPdfDoc.embedPng(imageBytes);
                                    } else if (signatureDataUrl.includes('image/jpeg') || signatureDataUrl.includes('image/jpg')) {
                                        image = await vgPdfDoc.embedJpg(imageBytes);
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

                                        console.log(`   ✅ Firma definitiva dibujada`);
                                    }
                                }
                            }
                        }

                        // Guardar PDF con firma definitiva
                        vgPdfBuffer = Buffer.from(await vgPdfDoc.save());

                        // Aplicar sello PKI con Python
                        console.log(`   🔐 Aplicando sello PKI...`);
                        const pythonSigner = new PythonSignerClient({ verbose: true });

                        const signedVgPdfBuffer = await pythonSigner.signPdf(vgPdfBuffer, {
                            reason: `Firmante Definitivo: ${finalSignerName} (${finalSignerEmail})`,
                            location: 'Colombia',
                            signerName: 'PKI Services',
                            contactInfo: finalSignerEmail,
                            fieldName: `FinalSignature_${recipient.document_id}_vg${viewerGroup.viewer_group_id}`,
                            visible: true,
                            seals: sealsForPython.length > 0 ? sealsForPython : null,
                            documentId: recipient.document_id
                        });

                        console.log(`   ✅ Sello PKI aplicado: ${(signedVgPdfBuffer.length / 1024).toFixed(2)} KB`);

                        // Guardar PDF final sellado
                        const finalPdfFilename = `final_${recipient.document_id}_vg${viewerGroup.viewer_group_id}_${Date.now()}.pdf`;
                        const finalPdfPath = path.join(intermediatePdfDir, finalPdfFilename);
                        fs.writeFileSync(finalPdfPath, signedVgPdfBuffer);

                        const relativeFinalPath = path.join('uploads', 'signed', finalPdfFilename);
                        console.log(`   💾 PDF final sellado guardado: ${relativeFinalPath}`);

                        // Actualizar custom_pdf_path de TODOS los recipients de este viewer_group
                        await new Promise((resolve, reject) => {
                            db.query(
                                'UPDATE document_recipients SET custom_pdf_path = ? WHERE viewer_group_id = ?',
                                [relativeFinalPath, viewerGroup.viewer_group_id],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });

                        console.log(`   ✅ Pagaré ${i + 1} sellado exitosamente`);

                    } catch (vgError) {
                        console.error(`   ❌ Error sellando pagaré viewer_group ${viewerGroup.viewer_group_id}:`, vgError.message);
                    }
                }

                console.log(`\n✅✅✅ TODOS LOS PAGARÉS SELLADOS EXITOSAMENTE (${allViewerGroups.length} pagarés)`);

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
                        // Fallback: Si no existe PDF censurado, usar file_path (CON ADVERTENCIA DE SEGURIDAD)
                        const [docInfo] = await new Promise((resolve, reject) => {
                            db.query(
                                'SELECT file_path FROM documents WHERE document_id = ?',
                                [recipient.document_id],
                                (err, results) => {
                                    if (err) reject(err);
                                    else resolve([results]);
                                }
                            );
                        });
                        censoredPdfPath = docInfo[0].file_path;
                        console.warn(`   ⚠️ ADVERTENCIA: No se encontró PDF censurado, usando file_path (PUEDE CONTENER DATOS SENSIBLES)`);
                    }

                    const cleanPath = censoredPdfPath.startsWith('/') ? censoredPdfPath.substring(1) : censoredPdfPath;
                    const fullCensoredPath = resolveFromRoot(cleanPath);

                    if (fs.existsSync(fullCensoredPath)) {
                        // Cargar PDF CENSURADO
                        let finalSignerPdfBuffer = fs.readFileSync(fullCensoredPath);
                        const { PDFDocument } = require('pdf-lib');
                        const finalSignerPdfDoc = await PDFDocument.load(finalSignerPdfBuffer);

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

                            const signedFinalSignerPdfBuffer = await pythonSigner.signPdf(finalSignerPdfBuffer, {
                                reason: `Firmante Definitivo: ${finalSignerName} (${finalSignerEmail})`,
                                location: 'Colombia',
                                signerName: 'PKI Services',
                                contactInfo: finalSignerEmail,
                                fieldName: `FinalSignature_${recipient.document_id}_finalSigner`,
                                visible: true,
                                seals: finalSignerSeals.length > 0 ? finalSignerSeals : null,
                                documentId: recipient.document_id
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
                console.log('\n🎯 ========== RESPUESTA AL CLIENTE (FIRMANTE DEFINITIVO - PAGARÉS) ==========');
                console.log('✅ isLastSigner: true');
                console.log('📄 Documento ID:', recipient.document_id);
                console.log('📋 Pagarés sellados:', allViewerGroups.length);
                console.log('🔔 El frontend DEBE mostrar el modal de progreso');
                console.log('🎯 ===========================================================================\n');

                return res.json({
                    success: true,
                    message: `Firma definitiva aplicada exitosamente a ${allViewerGroups.length} pagaré(s)`,
                    allSigned: true,
                    isLastSigner: true,
                    completed: allViewerGroups.length,
                    total: allViewerGroups.length
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

                // Leer el PDF intermedio que tiene todas las firmas dibujadas
                const intermediatePdfQuery = await new Promise((resolve, reject) => {
                    db.query(
                        'SELECT custom_pdf_path FROM document_recipients WHERE document_id = ? LIMIT 1',
                        [recipient.document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve(results);
                        }
                    );
                });

                if (!intermediatePdfQuery || intermediatePdfQuery.length === 0 || !intermediatePdfQuery[0].custom_pdf_path) {
                    throw new Error('No se encontró el PDF intermedio con las firmas');
                }

                const intermediatePdfPath = resolveFromRoot(intermediatePdfQuery[0].custom_pdf_path);
                const pdfBuffer = fs.readFileSync(intermediatePdfPath);
                console.log(`📄 PDF intermedio leído: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

                // Recuperar todos los campos del documento
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

                // Preparar sellos PKI
                const sealFields = allFields.filter(f => f.type === 'seal');
                let sealsForPython = [];

                if (sealFields.length > 0) {
                    const { PDFDocument } = require('pdf-lib');
                    const pdfDoc = await PDFDocument.load(pdfBuffer);

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

                const intermediatePdfDir = resolveFromRoot('uploads', 'signed');

                // 8. Preparar cliente Python signer
                const pythonSigner = new PythonSignerClient({
                    verbose: true
                });

            // 9. Verificar que el servicio Python esté disponible
            const isHealthy = await pythonSigner.healthCheck();
            if (!isHealthy) {
                console.warn('⚠️ Servicio Python no disponible. PDF guardado sin firma PKI.');
                throw new Error('Servicio de firma no disponible');
            }

            console.log('✅ Servicio Python disponible');

            // 10. Firmar PDF con certificado PKI (firmas y sellos ya dibujados)
            console.log('🔐 Firmando PDF con certificado PKI...');

            // ✅ Construir el campo "reason"
            let reasonText;
            let completedSigners;

            if (isPersonalizedDoc) {
                // Para documentos personalizados (CSV), solo mostrar el firmante actual
                const email = recipient.email;
                const partInfo = recipient.part_name ? ` - ${recipient.part_name}` : '';
                reasonText = `${email}${partInfo}`;
                completedSigners = [recipient];
                console.log(`   📋 Razón de firma (individual): ${reasonText}`);
            } else {
                // Para documentos compartidos, mostrar TODOS los firmantes completados
                completedSigners = allRecipients.filter(r => r.status === 'completed');
                const signersList = completedSigners
                    .map((r) => {
                        const email = r.email;
                        const partInfo = r.part_name ? ` - ${r.part_name}` : '';
                        return `${email}${partInfo}`;
                    })
                    .join('; ');
                reasonText = signersList || 'Documento firmado digitalmente';
                console.log(`   📋 Razón de firma (todos): ${reasonText}`);
                console.log(`   👥 Total firmantes: ${completedSigners.length}`);
            }

            const signedPdfBuffer = await pythonSigner.signPdf(pdfBuffer, {
                reason: reasonText,  // ✅ Incluye TODOS los firmantes
                location: 'Colombia',
                signerName: 'PKI Services',
                contactInfo: completedSigners.map(r => r.email).join(', '),  // ✅ Todos los emails
                fieldName: `Signature_${recipient.document_id}`,
                visible: true,  // Firma VISIBLE en los campos del formulario
                seals: sealsForPython.length > 0 ? sealsForPython : null,  // Pasar sellos PKI con QR
                documentId: recipient.document_id  // ✅ NUEVO: Pasar document_id para el QR
            });

            console.log(`✅ PDF firmado con PKI: ${(signedPdfBuffer.length / 1024).toFixed(2)} KB`);

            // 11. Guardar PDF final con sello PKI
            const finalPdfFilename = isPersonalizedDoc
                ? `final_${recipient.document_id}_recipient_${recipient.recipient_id}_${Date.now()}.pdf`
                : `final_${recipient.document_id}_${Date.now()}.pdf`;
            const finalPdfPath = path.join(intermediatePdfDir, finalPdfFilename);
            fs.writeFileSync(finalPdfPath, signedPdfBuffer);

            const relativeFinalPath = path.join('uploads', 'signed', finalPdfFilename);
            console.log(`💾 PDF final con PKI guardado: ${relativeFinalPath}`);

            // 12. ✅ CORREGIDO: Actualizar la ruta del PDF final con sello PKI
            if (isPersonalizedDoc) {
                // Para pagarés personalizados, actualizar custom_pdf_path del destinatario
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?',
                        [relativeFinalPath, recipient.recipient_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log(`✅ PDF personalizado actualizado para recipient_id=${recipient.recipient_id}`);
            } else {
                // Para documentos compartidos, actualizar signed_file_path del documento
                // Y TAMBIÉN actualizar custom_pdf_path de TODOS los destinatarios para que vean el PDF final
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE documents SET signed_file_path = ? WHERE document_id = ?',
                        [relativeFinalPath, recipient.document_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                // ✅ NUEVO: Actualizar custom_pdf_path de TODOS los recipients para que vean el PDF final
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE document_recipients SET custom_pdf_path = ? WHERE document_id = ?',
                        [relativeFinalPath, recipient.document_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                console.log('✅ PDF compartido actualizado en signed_file_path y custom_pdf_path de TODOS los destinatarios');
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

        console.log('\n🎯 ========== RESPUESTA AL CLIENTE (ÚLTIMO FIRMANTE) ==========');
        console.log('✅ isLastSigner: true');
        console.log('📄 Documento ID:', recipient.document_id);
        console.log('🔔 El frontend DEBE mostrar el modal de progreso');
        console.log('🎯 ============================================================\n');

        res.json({
            success: true,
            message: 'Documento firmado exitosamente',
            isLastSigner: true,
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

// GET /api/public/verify/:documentId - Endpoint de verificación desde QR
app.get('/api/public/verify/:documentId', async (req, res) => {
    const { documentId } = req.params;

    try {
        console.log(`🔍 Verificación de documento desde QR: ${documentId}`);

        // Buscar el documento en la base de datos
        const documentQuery = `
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
            WHERE d.document_id = ?
        `;

        const [documents] = await new Promise((resolve, reject) => {
            db.query(documentQuery, [documentId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        if (documents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        const document = documents[0];

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
            db.query(recipientsQuery, [documentId], (err, results) => {
                if (err) reject(err);
                else resolve([results]);
            });
        });

        // Filtrar solo los que completaron la firma
        const completedRecipients = recipients.filter(r => r.status === 'completed' && r.completed_at);

        // Generar token único del documento (basado en su ID y fecha de creación)
        const crypto = require('crypto');
        const documentToken = crypto
            .createHash('sha256')
            .update(`${document.document_id}-${document.title}-${document.created_at}`)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();

        // Generar token del QR (único por documento)
        const qrToken = crypto
            .createHash('sha256')
            .update(`QR-${document.document_id}-${document.created_at}`)
            .digest('hex')
            .substring(0, 16)
            .toUpperCase();

        // Obtener fechas
        const fechaCreacion = new Date(document.created_at).toLocaleString('es-CO', {
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
        console.log(`   - Token QR: ${qrToken}`);

        // Responder con la información del documento
        res.json({
            success: true,
            verification: {
                token_documento: documentToken,
                id_documento: document.document_id,
                fecha_creacion: fechaCreacion,
                fecha_firma: fechaFirma,
                firmantes: firmantes,
                token_qr: qrToken,
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

    try {
        console.log(`📥 ${mode === 'view' ? 'Visualizando' : 'Descargando'} PDF para doc: ${docId}, recipient: ${recipientId}`);

        // ✅ MEJORADO: Obtener también custom_pdf_path del recipient (para pagarés personalizados)
        const [documentInfo] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.title, d.file_path, d.signed_file_path, d.owner_id, d.document_type,
                        dr.email, dr.completed_at, dr.status as recipient_status, dr.custom_pdf_path,
                        dr.is_final_signer, dr.viewer_group_id
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
        console.log(`📋 Tipo: ${document.document_type}, custom_pdf_path: ${document.custom_pdf_path || 'null'}`);

        if (document.owner_id != userId) {
            return res.status(403).json({ success: false, message: 'No tienes permiso para descargar este documento' });
        }

        // Definir nombre del archivo
        const fileName = document.recipient_status === 'completed'
            ? `${document.title}_completado_${document.email}.pdf`
            : `${document.title}_${document.email}.pdf`;

        // ✅ PRIORIDAD DE PDFs:
        // 1. custom_pdf_path del recipient (pagarés/documentos personalizados con firma individual)
        // 2. signed_file_path del documento (documentos normales compartidos)
        // 3. file_path del documento (sin firmar)

        let pdfPath = null;
        let pdfType = '';

        // ✅ PRIMERO: Verificar si el recipient tiene su propio PDF personalizado (pagarés)
        if (document.recipient_status === 'completed' && document.custom_pdf_path) {
            console.log('✅ Usando custom_pdf_path del recipient (PDF personalizado/pagaré)');
            pdfPath = document.custom_pdf_path;
            pdfType = 'PERSONALIZADO';
        }
        // ✅ SEGUNDO: Si no hay custom_pdf_path, usar signed_file_path del documento
        else if (document.recipient_status === 'completed' && document.signed_file_path) {
            console.log('✅ Usando signed_file_path del documento (PDF compartido)');
            pdfPath = document.signed_file_path;
            pdfType = 'COMPARTIDO';
        }
        // ✅ TERCERO: PDF original sin firmar
        else {
            console.log('📄 Usando file_path original (sin firmar)');
            pdfPath = document.file_path;
            pdfType = 'ORIGINAL';
        }

        if (pdfPath) {
            // Limpiar la ruta
            let relativePath = pdfPath;
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.substring(1);
            }
            const fullPath = path.resolve(__dirname, '..', relativePath);

            console.log(`📁 Ruta del PDF (${pdfType}): ${fullPath}`);

            if (!fs.existsSync(fullPath)) {
                console.error(`❌ PDF no encontrado en: ${fullPath}`);
                return res.status(404).json({
                    success: false,
                    message: 'PDF no encontrado.'
                });
            }

            // Enviar el PDF
            res.setHeader('Content-Type', 'application/pdf');

            if (mode === 'view') {
                res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            }

            const fileStream = fs.createReadStream(fullPath);
            fileStream.pipe(res);

            console.log(`✅ PDF ${pdfType} ${mode === 'view' ? 'mostrado' : 'descargado'}: ${fileName}`);
            return;
        }

        // Si llegamos aquí, no hay ningún PDF disponible
        return res.status(404).json({
            success: false,
            message: 'No se encontró ningún PDF para este documento'
        });

    } catch (error) {
        console.error('❌ Error descargando PDF:', error);
        res.status(500).json({
            success: false,
            message: 'Error al descargar el PDF',
            error: error.message
        });
    }
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});