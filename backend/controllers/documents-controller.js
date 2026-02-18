/**
 * =============================================
 * CONTROLADOR DE DOCUMENTOS
 * API REST para gestión de documentos/plantillas
 * =============================================
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, logActivity } = require('../middleware/auth');
const pdfParse = require('pdf-parse'); // 🔥 NUEVO: Para extracción de labels
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); // Para extracción con coordenadas
const mailer = require('../lib/email/mailer'); // 📧 NUEVO: Para envío de emails
const crypto = require('crypto'); // 🔐 Para generar tokens

// =============================================
// CONFIGURACIÓN DE MULTER PARA UPLOAD
// =============================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'documents');

        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true, mode: 0o777 });
            console.log(`📁 [UPLOAD] Directorio creado: ${uploadDir}`);
        }

        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generar nombre único: timestamp_originalname
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueName = `${timestamp}_${sanitizedName}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB máximo por archivo
    },
    fileFilter: function (req, file, cb) {
        console.log(`📄 [UPLOAD] Archivo recibido: ${file.originalname} (${file.mimetype})`);

        // Tipos de archivo permitidos
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/webp'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
        }
    }
});

// =============================================
// RUTAS DE ROLES (ANTES DE OTRAS RUTAS - IMPORTANTE!)
// Las rutas específicas deben ir ANTES de las rutas con parámetros variables como /:id
// =============================================
const rolesController = require('./roles-controller');

// Rutas que terminan en /roles
router.post('/:id/roles', requireAuth, rolesController.createRoles);
router.get('/:id/roles', requireAuth, rolesController.getRoles);

// Rutas que terminan en /roles/auto-create
router.post('/:id/roles/auto-create', requireAuth, rolesController.autoCreateRoles);

// Rutas que terminan en /fields/assign-roles
router.post('/:id/fields/assign-roles', requireAuth, rolesController.assignFieldsToRoles);

// Rutas que terminan en /recipients/assign-roles
router.post('/:id/recipients/assign-roles', requireAuth, rolesController.assignRecipientsToRoles);

// =============================================
// ENDPOINTS
// =============================================

/**
 * GET /api/documents
 * Obtener documentos de una carpeta (o todos si no se especifica carpeta)
 * Query params:
 *   - folder_id: ID de carpeta (opcional)
 *   - is_template: 1 o 0 (default: 1)
 *   - status: 'active', 'archived', 'deleted' (default: 'active')
 */
router.get('/', requireAuth, async (req, res) => {
    console.log('\n📄 [DOCUMENTS] GET /api/documents');
    console.log(`   Usuario: ${req.userId}`);

    const { folder_id, is_template = '1', status = 'active' } = req.query;
    console.log(`   Carpeta: ${folder_id || '(todas)'}`);
    console.log(`   Es plantilla: ${is_template}`);
    console.log(`   Estado: ${status}`);

    const db = req.app.locals.db;

    try {
        // Obtener team_id del usuario (si pertenece a un equipo)
        const teamRows = await new Promise((resolve, reject) => {
            db.query(
                'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1',
                [req.userId],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
        const userTeamId = teamRows.length > 0 ? teamRows[0].team_id : null;

        let query;
        let params;

        if (userTeamId) {
            // Usuario en equipo: ver sus docs + docs de compañeros de equipo con team_id
            query = `
                SELECT
                    d.document_id,
                    d.folder_id,
                    d.title,
                    d.file_name,
                    d.file_path,
                    d.file_type,
                    d.file_size,
                    d.owner_id,
                    d.is_template,
                    d.status,
                    d.document_type,
                    d.google_drive_url,
                    d.tags,
                    d.created_at,
                    d.updated_at,
                    d.team_id,
                    u.first_name,
                    u.last_name,
                    CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                    f.folder_name,
                    f.folder_slug
                FROM documents d
                LEFT JOIN users u ON d.owner_id = u.user_id
                LEFT JOIN folders f ON d.folder_id = f.folder_id
                WHERE d.status = ?
                  AND (d.owner_id = ? OR d.team_id = ?)
            `;
            params = [status, req.userId, userTeamId];
        } else {
            // Usuario sin equipo: solo sus docs
            query = `
                SELECT
                    d.document_id,
                    d.folder_id,
                    d.title,
                    d.file_name,
                    d.file_path,
                    d.file_type,
                    d.file_size,
                    d.owner_id,
                    d.is_template,
                    d.status,
                    d.document_type,
                    d.google_drive_url,
                    d.tags,
                    d.created_at,
                    d.updated_at,
                    d.team_id,
                    u.first_name,
                    u.last_name,
                    CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                    f.folder_name,
                    f.folder_slug
                FROM documents d
                LEFT JOIN users u ON d.owner_id = u.user_id
                LEFT JOIN folders f ON d.folder_id = f.folder_id
                WHERE d.owner_id = ? AND d.status = ?
            `;
            params = [req.userId, status];
        }

        // Filtrar por carpeta si se especifica
        if (folder_id) {
            query += ` AND d.folder_id = ?`;
            params.push(parseInt(folder_id));
        }

        // Filtrar por tipo (plantilla o no)
        if (is_template !== undefined) {
            query += ` AND d.is_template = ?`;
            params.push(parseInt(is_template));
        }

        query += ` ORDER BY d.updated_at DESC`;

        console.log('   Query:', query);
        console.log('   Params:', params);

        const results = await new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        console.log(`✅ [DOCUMENTS] ${results.length} documentos encontrados`);

        // Formatear respuesta
        const documents = results.map(d => ({
            id: d.document_id,
            folder_id: d.folder_id,
            title: d.title,
            file_name: d.file_name,
            file_path: d.file_path,
            file_type: d.file_type,
            file_size: d.file_size,
            owner_id: d.owner_id,
            owner_name: d.owner_name,
            is_template: d.is_template,
            status: d.status,
            document_type: d.document_type || 'normal',
            google_drive_url: d.google_drive_url,
            tags: d.tags,
            folder_name: d.folder_name,
            folder_slug: d.folder_slug,
            created_at: d.created_at,
            updated_at: d.updated_at
        }));

        res.json({
            ok: true,
            success: true,
            data: documents,
            count: documents.length
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener documentos',
            message: error.message
        });
    }
});

/**
 * GET /api/documents/:id
 * Obtener información de un documento específico
 */
router.get('/:id', requireAuth, async (req, res) => {
    console.log(`\n📄 [DOCUMENTS] GET /api/documents/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.*,
                        u.first_name, u.last_name,
                        CONCAT(u.first_name, ' ', u.last_name) as owner_name,
                        f.folder_name
                 FROM documents d
                 LEFT JOIN users u ON d.owner_id = u.user_id
                 LEFT JOIN folders f ON d.folder_id = f.folder_id
                 WHERE d.document_id = ?`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (results.length === 0) {
            console.log('❌ [DOCUMENTS] Documento no encontrado');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado'
            });
        }

        const doc = results[0];

        // Verificar permisos: dueño directo O miembro del equipo al que pertenece el documento
        if (doc.owner_id !== req.userId) {
            let allowed = false;
            if (doc.team_id) {
                const teamRows = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT team_id FROM team_members WHERE user_id = ? AND team_id = ? LIMIT 1`,
                        [req.userId, doc.team_id],
                        (err, rows) => { if (err) reject(err); else resolve(rows); }
                    );
                });
                allowed = teamRows.length > 0;
            }
            if (!allowed) {
                console.log('❌ [DOCUMENTS] Acceso denegado');
                return res.status(403).json({
                    ok: false,
                    success: false,
                    error: 'No tienes permiso para acceder a este documento'
                });
            }
        }

        console.log(`✅ [DOCUMENTS] Documento encontrado: ${doc.title}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'view_document',
            entityType: 'document',
            entityId: documentId,
            details: { title: doc.title },
            req
        });

        res.json({
            ok: true,
            success: true,
            data: {
                id: doc.document_id,
                folder_id: doc.folder_id,
                title: doc.title,
                file_name: doc.file_name,
                file_path: doc.file_path,
                file_type: doc.file_type,
                file_size: doc.file_size,
                owner_name: doc.owner_name,
                folder_name: doc.folder_name,
                is_template: doc.is_template,
                status: doc.status,
                created_at: doc.created_at,
                updated_at: doc.updated_at
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener documento',
            message: error.message
        });
    }
});

/**
 * POST /api/documents/upload
 * Subir uno o múltiples documentos
 * Body (multipart/form-data):
 *   - files: archivos a subir (campo 'files[]')
 *   - folder_id: ID de carpeta destino (opcional)
 *   - titles: array de títulos personalizados (opcional, mismo orden que files)
 *   - is_template: 1 o 0 (default: 1)
 *   - tags: JSON array de tags (opcional)
 */
router.post('/upload', requireAuth, upload.array('files', 10), async (req, res) => {
    console.log('\n📤 [DOCUMENTS] POST /api/documents/upload');
    console.log(`   Usuario: ${req.userId}`);
    console.log('   Body:', JSON.stringify(req.body, null, 2));
    console.log(`   Archivos recibidos: ${req.files ? req.files.length : 0}`);

    if (!req.files || req.files.length === 0) {
        console.log('❌ [DOCUMENTS] No se recibieron archivos');
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'No se recibieron archivos para subir'
        });
    }

    const {
        folder_id,
        titles, // JSON string de array: ["titulo1", "titulo2"]
        is_template = '1',
        tags, // JSON string de array: ["tag1", "tag2"]
        document_type = 'normal' // ✅ Tipo de documento: 'normal' o 'pagare'
    } = req.body;

    console.log(`   📋 Tipo de documento: ${document_type}`);

    const db = req.app.locals.db;
    const uploadedDocuments = [];
    const errors = [];

    try {
        // Obtener team_id del usuario (si pertenece a un equipo)
        const teamRows = await new Promise((resolve, reject) => {
            db.query(
                'SELECT team_id FROM team_members WHERE user_id = ? LIMIT 1',
                [req.userId],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });
        const userTeamId = teamRows.length > 0 ? teamRows[0].team_id : null;

        // Parsear títulos personalizados si vienen
        let customTitles = [];
        if (titles) {
            try {
                customTitles = JSON.parse(titles);
            } catch (e) {
                console.log('⚠️ [DOCUMENTS] Error al parsear títulos, usando nombres originales');
            }
        }

        // Procesar cada archivo
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const title = customTitles[i] || file.originalname.replace(/\.[^/.]+$/, ''); // Sin extensión

            console.log(`   📄 Procesando archivo ${i + 1}/${req.files.length}: ${file.originalname}`);

            try {
                // Insertar en BD (con team_id si el usuario pertenece a un equipo)
                const result = await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO documents
                         (folder_id, title, file_name, file_path, file_type, file_size, owner_id, is_template, status, document_type, team_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
                        [
                            folder_id || null,
                            title,
                            file.originalname,
                            `/uploads/documents/${file.filename}`,
                            file.mimetype,
                            file.size,
                            req.userId,
                            parseInt(is_template),
                            document_type,
                            userTeamId  // ✅ Asignar team_id automáticamente
                        ],
                        (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        }
                    );
                });

                const documentId = result.insertId;

                console.log(`      ✅ Documento guardado en BD: ID ${documentId}`);

                // Log de actividad
                await logActivity(db, {
                    userId: req.userId,
                    action: 'upload_document',
                    entityType: 'document',
                    entityId: documentId,
                    details: {
                        title,
                        file_name: file.originalname,
                        file_size: file.size,
                        folder_id
                    },
                    req
                });

                uploadedDocuments.push({
                    document_id: documentId,
                    title,
                    file_name: file.originalname,
                    file_path: `/uploads/documents/${file.filename}`
                });

            } catch (error) {
                console.error(`      ❌ Error al guardar en BD: ${error.message}`);
                errors.push({
                    file: file.originalname,
                    error: error.message
                });

                // Eliminar archivo físico si falló la BD
                try {
                    fs.unlinkSync(file.path);
                    console.log(`      🗑️ Archivo eliminado: ${file.filename}`);
                } catch (unlinkError) {
                    console.error(`      ❌ Error al eliminar archivo: ${unlinkError.message}`);
                }
            }
        }

        // Respuesta final
        if (uploadedDocuments.length > 0) {
            console.log(`✅ [DOCUMENTS] ${uploadedDocuments.length} documentos subidos exitosamente`);

            res.status(201).json({
                ok: true,
                success: true,
                message: `${uploadedDocuments.length} documento(s) subido(s) exitosamente`,
                data: uploadedDocuments,
                errors: errors.length > 0 ? errors : undefined
            });
        } else {
            console.log(`❌ [DOCUMENTS] Todos los uploads fallaron`);

            res.status(500).json({
                ok: false,
                success: false,
                error: 'No se pudo subir ningún documento',
                errors
            });
        }

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error general:', error);

        // Limpiar archivos subidos en caso de error general
        if (req.files) {
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`   🗑️ Archivo limpiado: ${file.filename}`);
                } catch (e) {
                    // Ignorar errores de limpieza
                }
            });
        }

        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al subir documentos',
            message: error.message
        });
    }
});

/**
 * PUT /api/documents/:id
 * Actualizar información de un documento
 * Body: { title?, folder_id?, is_template?, status?, tags? }
 */
router.put('/:id', requireAuth, async (req, res) => {
    console.log(`\n📄 [DOCUMENTS] PUT /api/documents/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);
    console.log('   Body:', JSON.stringify(req.body, null, 2));

    const documentId = parseInt(req.params.id);
    const { title, folder_id, is_template, status, tags } = req.body;

    const db = req.app.locals.db;

    try {
        // Verificar que el documento existe y pertenece al usuario
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            console.log('❌ [DOCUMENTS] Documento no encontrado o sin permisos');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado o no tienes permisos para editarlo'
            });
        }

        // Construir query de actualización
        const updates = [];
        const params = [];

        if (title !== undefined) {
            updates.push('title = ?');
            params.push(title);
        }

        if (folder_id !== undefined) {
            updates.push('folder_id = ?');
            params.push(folder_id || null);
        }

        if (is_template !== undefined) {
            updates.push('is_template = ?');
            params.push(parseInt(is_template));
        }

        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }

        if (tags !== undefined) {
            updates.push('tags = ?');
            params.push(JSON.stringify(tags));
        }

        if (updates.length === 0) {
            console.log('⚠️ [DOCUMENTS] No hay cambios para actualizar');
            return res.status(400).json({
                ok: false,
                success: false,
                error: 'No se proporcionaron campos para actualizar'
            });
        }

        params.push(documentId);

        const query = `UPDATE documents SET ${updates.join(', ')} WHERE document_id = ?`;

        await new Promise((resolve, reject) => {
            db.query(query, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        console.log(`✅ [DOCUMENTS] Documento actualizado: ${documentId}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'update_document',
            entityType: 'document',
            entityId: documentId,
            details: { changes: req.body },
            req
        });

        res.json({
            ok: true,
            success: true,
            message: 'Documento actualizado exitosamente'
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al actualizar documento',
            message: error.message
        });
    }
});

/**
 * DELETE /api/documents/:id
 * Eliminar documento (marca como deleted, no elimina archivo físico)
 */
router.delete('/:id', requireAuth, async (req, res) => {
    console.log(`\n📄 [DOCUMENTS] DELETE /api/documents/${req.params.id}`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Verificar que el documento existe y pertenece al usuario
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            console.log('❌ [DOCUMENTS] Documento no encontrado o sin permisos');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado o no tienes permisos para eliminarlo'
            });
        }

        // Soft delete: marcar como 'deleted'
        await new Promise((resolve, reject) => {
            db.query(
                'UPDATE documents SET status = ? WHERE document_id = ?',
                ['deleted', documentId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        console.log(`✅ [DOCUMENTS] Documento marcado como eliminado: ${documentId}`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'delete_document',
            entityType: 'document',
            entityId: documentId,
            details: { title: docs[0].title },
            req
        });

        res.json({
            ok: true,
            success: true,
            message: 'Documento eliminado exitosamente'
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al eliminar documento',
            message: error.message
        });
    }
});

/**
 * GET /api/documents/:id/file
 * Descargar/servir el archivo PDF de un documento
 */
router.get('/:id/file', requireAuth, async (req, res) => {
    console.log(`\n📥 [DOCUMENTS] GET /api/documents/${req.params.id}/file`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Obtener información del documento
        const results = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.file_path, d.file_name, d.file_type, d.owner_id, d.team_id
                 FROM documents d
                 WHERE d.document_id = ?`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (results.length === 0) {
            console.log('❌ [DOCUMENTS] Documento no encontrado');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado'
            });
        }

        const doc = results[0];

        // Verificar permisos: dueño directo O miembro del equipo al que pertenece el documento
        if (doc.owner_id !== req.userId) {
            let allowed = false;
            if (doc.team_id) {
                const teamRows = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT team_id FROM team_members WHERE user_id = ? AND team_id = ? LIMIT 1`,
                        [req.userId, doc.team_id],
                        (err, rows) => { if (err) reject(err); else resolve(rows); }
                    );
                });
                allowed = teamRows.length > 0;
            }
            if (!allowed) {
                console.log('❌ [DOCUMENTS] Acceso denegado');
                return res.status(403).json({
                    ok: false,
                    success: false,
                    error: 'No tienes permiso para acceder a este documento'
                });
            }
        }

        // Construir ruta completa del archivo
        const filePath = path.join(__dirname, '..', '..', doc.file_path);
        console.log(`📂 [DOCUMENTS] Ruta del archivo: ${filePath}`);

        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            console.log('❌ [DOCUMENTS] Archivo no encontrado en el sistema de archivos');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Archivo no encontrado en el servidor'
            });
        }

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'download_document',
            entityType: 'document',
            entityId: documentId,
            details: { file_name: doc.file_name },
            req
        });

        console.log(`✅ [DOCUMENTS] Enviando archivo: ${doc.file_name}`);

        // Configurar headers para el tipo de archivo
        res.setHeader('Content-Type', doc.file_type || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);

        // Enviar el archivo
        res.sendFile(filePath, (err) => {
            if (err) {
                console.error('❌ [DOCUMENTS] Error al enviar archivo:', err);
                if (!res.headersSent) {
                    res.status(500).json({
                        ok: false,
                        success: false,
                        error: 'Error al enviar el archivo'
                    });
                }
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener el archivo',
            message: error.message
        });
    }
});

/**
 * POST /api/documents/:id/duplicate
 * Duplicar un documento existente
 */
router.post('/:id/duplicate', requireAuth, async (req, res) => {
    console.log(`\n📄 [DOCUMENTS] POST /api/documents/${req.params.id}/duplicate`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Obtener información del documento original
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT * FROM documents WHERE document_id = ?`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            console.log('❌ [DOCUMENTS] Documento no encontrado');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado'
            });
        }

        const originalDoc = docResults[0];

        // Verificar permisos: debe ser el dueño
        if (originalDoc.owner_id !== req.userId) {
            console.log('❌ [DOCUMENTS] Acceso denegado');
            return res.status(403).json({
                ok: false,
                success: false,
                error: 'No tienes permiso para duplicar este documento'
            });
        }

        // Generar nuevo nombre para el documento duplicado
        const newTitle = `${originalDoc.title} (Copia)`;

        let newFileName = originalDoc.file_name;
        let newFilePath = originalDoc.file_path;

        // Intentar copiar el archivo físico si existe
        const originalFilePath = path.join(__dirname, '..', '..', originalDoc.file_path);
        if (fs.existsSync(originalFilePath)) {
            console.log('📄 [DOCUMENTS] Copiando archivo físico...');
            // Copiar el archivo físico
            const fileExt = path.extname(originalDoc.file_name);
            newFileName = `${Date.now()}-copy${fileExt}`;
            const newFileAbsolutePath = path.join(path.dirname(originalFilePath), newFileName);

            fs.copyFileSync(originalFilePath, newFileAbsolutePath);
            newFilePath = path.relative(path.join(__dirname, '..', '..'), newFileAbsolutePath);
        } else {
            console.log('⚠️ [DOCUMENTS] Archivo original no encontrado, duplicando solo metadatos');
            // Generar nuevo nombre de archivo aunque no exista físicamente
            const fileExt = path.extname(originalDoc.file_name);
            newFileName = `${Date.now()}-copy${fileExt}`;
            // Mantener la misma estructura de ruta
            const dir = path.dirname(originalDoc.file_path);
            newFilePath = path.join(dir, newFileName);
        }

        // Insertar el nuevo documento en la BD
        const newDocResult = await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO documents (title, file_name, file_path, file_type, file_size, folder_id, owner_id, is_template, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newTitle,
                    newFileName,
                    newFilePath,
                    originalDoc.file_type,
                    originalDoc.file_size,
                    originalDoc.folder_id,
                    req.userId,
                    originalDoc.is_template,
                    'active'
                ],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        const newDocId = newDocResult.insertId;

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'duplicate_document',
            entityType: 'document',
            entityId: newDocId,
            details: {
                original_document_id: documentId,
                title: newTitle
            },
            req
        });

        console.log(`✅ [DOCUMENTS] Documento duplicado: ${newDocId}`);

        res.json({
            ok: true,
            success: true,
            data: {
                document_id: newDocId,
                title: newTitle,
                file_name: newFileName,
                folder_id: originalDoc.folder_id
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error al duplicar:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al duplicar el documento',
            message: error.message
        });
    }
});

/**
 * =============================================
 * ENDPOINTS PARA CAMPOS DE DOCUMENTOS (SPRINT 3)
 * =============================================
 */

/**
 * GET /api/documents/:id/fields
 * Obtener campos de un documento
 */
router.get('/:id/fields', requireAuth, async (req, res) => {
    console.log(`\n📋 [DOCUMENTS] GET /api/documents/${req.params.id}/fields`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        const results = await new Promise((resolve, reject) => {
            db.query(
                `SELECT df.field_id, df.field_type, df.page_number, df.x_position, df.y_position, 
                        df.width, df.height, df.required, df.field_label, df.created_at,
                        df.part_id, dp.role_name, dp.color
                 FROM document_fields df
                 LEFT JOIN document_parts dp ON df.part_id = dp.part_id
                 WHERE df.document_id = ?
                 ORDER BY df.page_number, df.field_id`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        const fields = results.map(f => ({
            id: f.field_id,
            field_id: f.field_id, // ✅ Incluir field_id para compatibilidad
            type: f.field_type,
            page: f.page_number,
            x: parseFloat(f.x_position),
            y: parseFloat(f.y_position),
            width: parseFloat(f.width),
            height: parseFloat(f.height),
            required: f.required === 1,
            label: f.field_label,
            created_at: f.created_at,
            partId: f.part_id || null, // 🔥 NUEVO
            roleName: f.role_name || null, // 🔥 NUEVO
            roleColor: f.color || null // 🔥 NUEVO
        }));

        console.log(`✅ [DOCUMENTS] ${fields.length} campo(s) encontrado(s)`);

        res.json({
            ok: true,
            success: true,
            data: {
                document_id: documentId,
                fields: fields,
                count: fields.length
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener campos',
            message: error.message
        });
    }
});

/**
 * POST /api/documents/:id/fields
 * Guardar campos de un documento (reemplaza campos existentes)
 * Body: { fields: [{ type, page, x, y, width, height, label?, required? }] }
 */
router.post('/:id/fields', requireAuth, async (req, res) => {
    console.log(`\n💾 [DOCUMENTS] POST /api/documents/${req.params.id}/fields`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const { fields } = req.body;

    if (!fields || !Array.isArray(fields)) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'Se requiere un array de campos'
        });
    }

    console.log(`   Campos a guardar: ${fields.length}`);
    console.log('🏷️ [BACKEND] Labels recibidos desde frontend:');
    fields.forEach((field, index) => {
        console.log(`      Campo ${index + 1}: tipo="${field.type}" label="${field.label}" page=${field.page}`);
    });

    const db = req.app.locals.db;

    try {
        // Verificar que el documento existe y pertenece al usuario
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                'SELECT document_id FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado o sin permisos'
            });
        }

        // 🔥 NUEVO: Cargar las partes del documento para mapear roleId → part_id
        const documentParts = await new Promise((resolve, reject) => {
            db.query(
                `SELECT part_id, role_name, order_position 
                 FROM document_parts 
                 WHERE document_id = ? 
                 ORDER BY order_position ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log(`   📋 Partes del documento cargadas: ${documentParts.length}`);
        documentParts.forEach(part => {
            console.log(`      - Orden ${part.order_position}: ${part.role_name} (part_id=${part.part_id})`);
        });

        // Crear mapa: roleId (orden del frontend) → part_id (ID real en BD)
        // ✅ CORREGIDO: Usar order_position en lugar del índice del array
        const roleToPartMap = {};
        documentParts.forEach((part) => {
            // El roleId del frontend es el order_position de la parte
            roleToPartMap[part.order_position] = part.part_id;
        });

        console.log(`   🗺️ Mapa roleId (order_position) → part_id:`, roleToPartMap);

        // Iniciar transacción
        await new Promise((resolve, reject) => {
            db.query('START TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // 1. Eliminar campos existentes
            await new Promise((resolve, reject) => {
                db.query(
                    'DELETE FROM document_fields WHERE document_id = ?',
                    [documentId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            console.log('   ✅ Campos anteriores eliminados');

            // 2. Insertar nuevos campos
            const insertedFields = [];

            // Validación estricta: todos los campos deben tener parte válida si tienen roleId
            for (const field of fields) {
                if (field.roleId && !field.roleId.toString().startsWith('temp_')) {
                    const frontendRoleId = parseInt(field.roleId);
                    if (!roleToPartMap[frontendRoleId]) {
                        // Rollback inmediato
                        await new Promise((resolve) => { db.query('ROLLBACK', () => resolve()); });
                        console.error(`❌ [VALIDACIÓN] Campo con roleId=${frontendRoleId} no tiene parte válida en BD.`);
                        return res.status(400).json({
                            ok: false,
                            success: false,
                            error: `Campo con roleId=${frontendRoleId} no tiene parte válida. Corrija la asignación de partes antes de guardar los campos.`
                        });
                    }
                }
            }


            for (const field of fields) {
                // 🔥 Mapear roleId del frontend al part_id real de la BD
                let partId = null;
                if (field.roleId && !field.roleId.toString().startsWith('temp_')) {
                    const frontendRoleId = parseInt(field.roleId);
                    partId = roleToPartMap[frontendRoleId] || null;
                    console.log(`      🔄 Campo ${field.type}: roleId ${frontendRoleId} → part_id ${partId}`);
                }
                const result = await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO document_fields 
                         (document_id, field_type, page_number, x_position, y_position, 
                          width, height, required, field_label, part_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            documentId,
                            field.type,
                            field.page || 1,
                            field.x,
                            field.y,
                            field.width,
                            field.height,
                            field.required !== false ? 1 : 0,
                            field.label || null,
                            partId
                        ],
                        (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        }
                    );
                });
                insertedFields.push({
                    id: result.insertId,
                    type: field.type,
                    page: field.page || 1,
                    x: field.x,
                    y: field.y,
                    width: field.width,
                    height: field.height,
                    required: field.required !== false,
                    label: field.label,
                    partId: partId,
                    roleName: field.roleName || null
                });
                if (partId) {
                    console.log(`   📌 Campo "${field.label || field.type}" asignado a parte ID: ${partId} (${field.roleName})`);
                }
            }

            console.log(`   ✅ ${insertedFields.length} campo(s) insertado(s)`);

            // Commit transacción
            await new Promise((resolve, reject) => {
                db.query('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // 🔥 NUEVO: Marcar documento como plantilla automáticamente
            try {
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE documents SET is_template = 1, has_acroform = 0 WHERE document_id = ?',
                        [documentId],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
                console.log('   ✅ Documento marcado como plantilla automáticamente');
            } catch (templateError) {
                console.warn('   ⚠️ No se pudo marcar como plantilla:', templateError.message);
            }

            // 🔥 NUEVO: Extraer labels automáticamente para campos de texto
            // 🚫 Desactivado: No extraer labels automáticamente, siempre usar el label del frontend
            // const textFields = insertedFields.filter(f => f.type === 'text');
            // if (textFields.length > 0) {
            //     console.log(`\n🏷️ [AUTO-EXTRACT] Extrayendo labels para ${textFields.length} campos de texto...`);
            //     try {
            //         await autoExtractLabels(db, documentId, textFields);
            //     } catch (extractError) {
            //         console.warn('   ⚠️ Error en extracción automática de labels:', extractError.message);
            //     }
            // }

            // Registrar actividad
            await logActivity(db, {
                userId: req.userId,
                action: 'document_fields_updated',
                entityType: 'document',
                entityId: documentId,
                details: { field_count: insertedFields.length },
                req
            });

            res.json({
                ok: true,
                success: true,
                message: `${insertedFields.length} campo(s) guardado(s) exitosamente`,
                data: {
                    document_id: documentId,
                    fields: insertedFields
                }
            });

        } catch (innerError) {
            // Rollback en caso de error
            await new Promise((resolve) => {
                db.query('ROLLBACK', () => resolve());
            });
            throw innerError;
        }

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al guardar campos',
            message: error.message
        });
    }
});

/**
 * DELETE /api/documents/:id/fields
 * Eliminar todos los campos de un documento
 */
router.delete('/:id/fields', requireAuth, async (req, res) => {
    console.log(`\n🗑️ [DOCUMENTS] DELETE /api/documents/${req.params.id}/fields`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Verificar permisos
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                'SELECT document_id FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado o sin permisos'
            });
        }

        // Eliminar campos
        const result = await new Promise((resolve, reject) => {
            db.query(
                'DELETE FROM document_fields WHERE document_id = ?',
                [documentId],
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });

        console.log(`✅ [DOCUMENTS] ${result.affectedRows} campo(s) eliminado(s)`);

        res.json({
            ok: true,
            success: true,
            message: 'Campos eliminados exitosamente',
            data: {
                document_id: documentId,
                deleted_count: result.affectedRows
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al eliminar campos',
            message: error.message
        });
    }
});

/**
 * =============================================
 * ENDPOINT: ENVIAR DOCUMENTO A DESTINATARIOS
 * POST /api/documents/:id/send
 * =============================================
 * Envia el documento a una lista de destinatarios vía email
 * Body: { recipients: [{email, name}] }
 */
router.post('/:id/send', requireAuth, async (req, res) => {
    console.log(`\n📤 [DOCUMENTS] POST /api/documents/${req.params.id}/send`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const { recipients } = req.body;

    // Validación estricta de destinatarios
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'Se requiere al menos un destinatario'
        });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set();
    const recipientErrors = [];
    for (let i = 0; i < recipients.length; i++) {
        const r = recipients[i];
        if (!r.email || !emailRegex.test(r.email)) {
            recipientErrors.push({
                index: i,
                field: 'email',
                message: `Email inválido o vacío: ${r.email}`
            });
        } else if (seenEmails.has(r.email.toLowerCase())) {
            recipientErrors.push({
                index: i,
                field: 'email',
                message: `Email duplicado: ${r.email}`
            });
        } else {
            seenEmails.add(r.email.toLowerCase());
        }
        // Si no tiene nombre, usar el email como nombre
        if (!r.name || typeof r.name !== 'string' || !r.name.trim()) {
            r.name = r.email;
        }
        // NOTA: La validación de roleId/part_id se hace más adelante una vez se obtengan las partes del documento
    }
    if (recipientErrors.length > 0) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'Errores de validación en destinatarios',
            validation_errors: recipientErrors
        });
    }

    console.log(`   Destinatarios: ${recipients.length}`);
    console.log(`   🔍 [DEBUG] Recipients recibidos:`, JSON.stringify(recipients, null, 2));

    const db = req.app.locals.db;
    const crypto = require('crypto');
    const sendgrid = require('../lib/email/sendgrid');
    const signatureRequestTemplate = require('../lib/email/templates/signature-request-bulk');

    try {
        // 1. Obtener información del documento
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.title, d.file_name, d.owner_id,
                        u.first_name, u.last_name, u.email as owner_email,
                        ec.email_from as sender_email, ec.email_from_name as sender_name
                 FROM documents d
                 INNER JOIN users u ON d.owner_id = u.user_id
                 LEFT JOIN email_config ec ON u.user_id = ec.user_id
                 WHERE d.document_id = ? AND d.owner_id = ?`,
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado o sin permisos'
            });
        }

        const document = docResults[0];

        // 2. Verificar que el documento tenga campos asignados
        const fieldsResults = await new Promise((resolve, reject) => {
            db.query(
                'SELECT COUNT(*) as field_count FROM document_fields WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (fieldsResults[0].field_count === 0) {
            return res.status(400).json({
                ok: false,
                success: false,
                error: 'El documento debe tener campos asignados antes de enviarlo'
            });
        }

        // 3. Obtener configuración de firma con roles (si existe)
        const [signingConfig] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM document_signing_config WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const signInOrder = signingConfig.length > 0 && signingConfig[0].sign_in_order === 1;

        // 🔥 Obtener partes del documento (document_parts) para mapear roleId → part_id
        const [documentParts] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT part_id, role_name, order_position FROM document_parts WHERE document_id = ? ORDER BY order_position ASC',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // 🔥 CORREGIDO: Crear mapa usando order_position (no index)
        const roleToPartMap = {};
        documentParts.forEach((part) => {
            roleToPartMap[part.order_position] = part.part_id; // order_position → part_id
        });

        console.log(`   📋 Partes del documento: ${documentParts.length}`);
        documentParts.forEach(p => {
            console.log(`      - Orden ${p.order_position}: ${p.role_name} (part_id=${p.part_id})`);
        });
        console.log(`   🗺️ Mapa roleId (order_position) → part_id:`, roleToPartMap);

        // Obtener roles si existen (tabla signer_roles - sistema antiguo)
        const [roles] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM signer_roles WHERE document_id = ? ORDER BY role_order ASC',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const roleMap = {};
        roles.forEach(r => {
            roleMap[r.role_id] = r;
        });

        console.log(`   Roles encontrados: ${roles.length}`);
        console.log(`   Firma secuencial: ${signInOrder ? 'SÍ' : 'NO'}`);

        // 4. Configurar SendGrid con la API Key del usuario
        const apiKeyResults = await new Promise((resolve, reject) => {
            db.query(
                'SELECT sendgrid_api_key FROM email_config WHERE user_id = ?',
                [req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (apiKeyResults.length === 0 || !apiKeyResults[0].sendgrid_api_key) {
            return res.status(400).json({
                ok: false,
                success: false,
                error: 'Debes configurar tu cuenta de SendGrid antes de enviar documentos'
            });
        }

        // Configurar SendGrid temporalmente para este envío
        sendgrid.configureSendGrid(apiKeyResults[0].sendgrid_api_key);

        // 5. Insertar destinatarios y generar tokens
        const insertedRecipients = [];
        const emailsToSend = [];

        for (const recipient of recipients) {
            // Generar token único seguro
            const token = crypto.randomBytes(32).toString('hex');

            // 🔥 Obtener part_id (para filtrar campos por destinatario)
            let partId = null;
            let roleId = null;
            let signingOrder = null;
            let canSignAt = null;

            console.log(`\n   🔍 [DEBUG] Procesando recipient:`, {
                email: recipient.email,
                roleId: recipient.roleId,
                roleToPartMap: roleToPartMap,
                documentParts: documentParts.length
            });

            if (recipient.roleId) {
                // Mapear roleId del frontend al part_id real de la BD
                partId = roleToPartMap[recipient.roleId] || null;
                console.log(`   🔍 [DEBUG] roleId ${recipient.roleId} → part_id ${partId}`);
                
                // Si existe configuración de roles (signer_roles), usarla también
                if (roleMap[recipient.roleId]) {
                    const role = roleMap[recipient.roleId];
                    roleId = recipient.roleId;
                    signingOrder = role.role_order;

                    // Si firma secuencial está activada:
                    // - Rol orden 1 puede firmar inmediatamente
                    // - Otros roles esperan su turno (can_sign_at = NULL)
                    if (signInOrder && role.role_order === 1) {
                        canSignAt = new Date();
                    }

                    console.log(`   📋 Destinatario ${recipient.email} → Rol "${role.role_name}" (orden ${signingOrder}) → part_id ${partId}`);
                } else {
                    // Solo tenemos document_parts (sin signer_roles)
                    signingOrder = recipient.roleId; // El roleId es el orden
                    if (signInOrder && signingOrder === 1) {
                        canSignAt = new Date();
                    }
                    const partName = documentParts.find(p => p.order_position === signingOrder)?.role_name || 'Sin nombre';
                    console.log(`   📋 Destinatario ${recipient.email} → Parte "${partName}" (orden ${signingOrder}) → part_id ${partId}`);
                }
            }

            // 🔥 Insertar en la base de datos con part_id, role_id, signing_order y can_sign_at
            const result = await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO document_recipients 
                     (document_id, email, name, token, status, part_id, role_id, signing_order, can_sign_at)
                     VALUES (?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
                    [documentId, recipient.email, recipient.name || recipient.email, token, partId, roleId, signingOrder, canSignAt],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });

            insertedRecipients.push({
                id: result.insertId,
                email: recipient.email,
                name: recipient.name || recipient.email,
                token,
                roleId,
                signingOrder
            });

            // Preparar email
            const signatureUrl = `${req.protocol}://${req.get('host')}/public-sign.html?token=${token}`;
            const appUrl = `${req.protocol}://${req.get('host')}`;

            const senderName = document.sender_name || `${document.first_name} ${document.last_name}`;
            const fromEmail = document.sender_email || document.owner_email;

            const htmlContent = signatureRequestTemplate({
                recipientName: recipient.name || recipient.email,
                documentTitle: document.title || 'Documento sin título',
                senderName: senderName,
                signatureUrl: signatureUrl,
                appUrl: appUrl
            });

            // Preparar texto plano (muy importante para evitar spam) - coincide con template HTML
            const plainText = `
Estimado cliente,

¡Buenas noticias! Ya está listo el documento para tu firma digital. Es un proceso fácil y seguro que consta de dos partes:

✅ Ya realizaste la validación de identidad biométrica de manera exitosa.

Ahora debes proceder con la firma del documento.

DOCUMENTO A FIRMAR: ${document.title || 'Documento'}

⚠️ ANTES DE HACER CLIC EN EL ENLACE, POR FAVOR TEN EN CUENTA LO SIGUIENTE:

Al ingresar al sistema de firma digital, deberás buscar el recuadro designado para la firma. Allí podrás elegir entre TRES OPCIONES para completarla:

1. Firma tecleada:
   Escribe tu nombre completo y se generará automáticamente una firma en estilo tipográfico.

2. Firma manuscrita (gráfica):
   Dibuja tu firma directamente en el recuadro usando el cursor o una pantalla táctil.

3. Cargar imagen de tu firma:
   Si ya tienes tu firma escaneada, puedes subirla en formato JPG o PNG.

ENLACE PARA FIRMAR EL DOCUMENTO:
${signatureUrl}

💬 ¿Necesitas ayuda?
Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos. Estamos aquí para ayudarte en lo que necesites.

¡Que tengas un buen día!

Atentamente,
Isabella Vergara
📧 Firmalegalonline@pkiservices.co

═══════════════════════════════════════════════════════════

📜 MARCO LEGAL

Ley 527 de 1999 y Decreto 2364 de 2012:
El Decreto 2364 de 2012, que reglamenta el artículo 7 de la Ley 527 de 1999, define la firma electrónica como aquel método implementado para identificar a una persona y su voluntad para un fin específico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.

Para que la firma electrónica genere efectos legales, deberá cumplir los mismos requisitos que tiene cualquier documento físico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen idénticos efectos.

⚖️ CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE

PKI SERVICES S.A.S. debe dar cumplimiento al artículo 83 de la constitución política colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades públicas deberán ceñirse a los postulados de buena fe, la cual se presumirá en todas las gestiones que aquéllos adelanten ante éstas."

⚠️ FALSEDAD EN DOCUMENTO PRIVADO

Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Artículo 289: "El que falsifique documento privado que pueda servir de prueba, incurrirá, si lo usa, en prisión de uno (1) a seis (6) años."

🏛️ ACREDITACIÓN ONAC

PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACIÓN DE COLOMBIA (ONAC).

Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atención al cliente en:
🔗 Soporte PKI Services: https://pkiservices.co/soporte/?wpsc-section=ticket-list

═══════════════════════════════════════════════════════════

PKI SERVICES S.A.S.
Plataforma de Firma Electrónica Certificada

Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener información confidencial sometida a secreto profesional. No está permitida su reproducción o distribución sin la autorización expresa. Si usted no es el destinatario final por favor elimínelo e infórmenos por este mismo medio.

De acuerdo con la Ley Estatutaria 1581 de 2012 de Protección de Datos y normas concordantes, le informamos que nuestra entidad cuenta con política para el tratamiento de los datos personales almacenados en sus bases de datos.

© ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
            `.trim();

            emailsToSend.push({
                to: recipient.email,
                from: fromEmail,
                fromName: `${senderName} (FirmaLegal)`,
                replyTo: fromEmail, // Permite responder directamente al remitente
                subject: `Solicitud de firma: ${document.title || 'Documento'}`,
                text: plainText,
                html: htmlContent,
                // Headers anti-spam optimizados para Gmail
                headers: {
                    'X-Priority': '3',
                    'X-MSMail-Priority': 'Normal',
                    'Importance': 'normal',
                    'X-Mailer': 'FirmaLegal Online',
                    'List-Unsubscribe': `<${appUrl}/unsubscribe?token=${token}>`,
                    'Precedence': 'bulk'
                },
                // Categorías de SendGrid
                categories: ['signature-request', 'legal-document'],
                // Custom args para tracking
                customArgs: {
                    document_id: String(documentId),
                    recipient_id: String(result.insertId)
                },
                // Tracking settings (importante para reputación)
                trackingSettings: {
                    clickTracking: { enable: true },
                    openTracking: { enable: true },
                    subscriptionTracking: { enable: false }
                }
            });
        }

        console.log(`   ✅ ${insertedRecipients.length} destinatario(s) registrado(s)`);

        // 6. Enviar emails en batch
        console.log(`   📧 Enviando ${emailsToSend.length} email(s)...`);

        const sendResult = await sendgrid.sendBatchEmails(emailsToSend);

        if (!sendResult.success) {
            // Si falla el envío, marcar como error pero no eliminar destinatarios
            console.error('❌ Error al enviar emails:', sendResult.error);

            return res.status(500).json({
                ok: false,
                success: false,
                error: 'Error al enviar emails',
                details: sendResult.details,
                recipients: insertedRecipients // Devolver destinatarios creados
            });
        }

        console.log(`   ✅ Emails enviados exitosamente`);

        // 7. Registrar actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'document_sent',
            entityType: 'document',
            entityId: documentId,
            details: {
                recipient_count: insertedRecipients.length,
                emails: insertedRecipients.map(r => r.email),
                with_roles: roles.length > 0,
                sign_in_order: signInOrder
            },
            req
        });

        // 8. Responder con éxito
        res.json({
            ok: true,
            success: true,
            message: `Documento enviado a ${insertedRecipients.length} destinatario(s)`,
            data: {
                document_id: documentId,
                recipients: insertedRecipients.map(r => ({
                    id: r.id,
                    email: r.email,
                    name: r.name,
                    status: 'sent'
                })),
                emails_sent: sendResult.count
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error al enviar documento:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al enviar documento',
            details: error.message
        });
    }
});

/**
 * =============================================
 * ENDPOINT: OBTENER DESTINATARIOS DE UN DOCUMENTO
 * GET /api/documents/:id/recipients
 * =============================================
 */
router.get('/:id/recipients', requireAuth, async (req, res) => {
    console.log(`\n📋 [DOCUMENTS] GET /api/documents/${req.params.id}/recipients`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Verificar que el documento pertenece al usuario
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                'SELECT document_id FROM documents WHERE document_id = ? AND owner_id = ?',
                [documentId, req.userId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado'
            });
        }

        // Obtener destinatarios
        const recipients = await new Promise((resolve, reject) => {
            db.query(
                `SELECT recipient_id as id, email, name, token, status, 
                        sent_at, opened_at, completed_at, rejected_at
                 FROM document_recipients
                 WHERE document_id = ?
                 ORDER BY sent_at DESC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log(`✅ [DOCUMENTS] ${recipients.length} destinatario(s) encontrado(s)`);

        res.json({
            ok: true,
            success: true,
            data: {
                document_id: documentId,
                recipients: recipients
            }
        });

    } catch (error) {
        console.error('❌ [DOCUMENTS] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener destinatarios'
        });
    }
});

// =============================================
// ENDPOINT: Guardar Partes del Documento
// =============================================
/**
 * POST /api/documents/:id/parts
 * Guardar las partes (Primera Parte, Segunda Parte, etc.) de un documento
 */
router.post('/:id/parts', requireAuth, async (req, res) => {
    const documentId = req.params.id;
    const { parts } = req.body;
    const db = req.app.locals.db; // 🔥 IMPORTANTE: Obtener conexión a BD

    console.log(`📋 [PARTS] Guardando partes para documento ${documentId}`);
    console.log(`📋 [PARTS] Partes recibidas:`, parts);

    try {
        // Validar que haya partes
        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            return res.status(400).json({
                ok: false,
                error: 'No se proporcionaron partes válidas'
            });
        }

        // Verificar que el documento existe
        const [doc] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM documents WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (!doc) {
            return res.status(404).json({
                ok: false,
                error: 'Documento no encontrado'
            });
        }

        // Eliminar partes anteriores del documento (si existen)
        await new Promise((resolve, reject) => {
            db.query(
                'DELETE FROM document_parts WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log(`🗑️ [PARTS] Partes anteriores eliminadas`);

        // Insertar nuevas partes
        const insertedParts = [];
        for (const part of parts) {
            const result = await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO document_parts (document_id, role_name, order_position, color)
                     VALUES (?, ?, ?, ?)`,
                    [documentId, part.name, part.order, part.color],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results);
                    }
                );
            });

            insertedParts.push({
                partId: result.insertId,
                name: part.name,
                order: part.order,
                color: part.color
            });

            console.log(`✅ [PARTS] Parte "${part.name}" guardada con ID ${result.insertId}`);
        }

        res.json({
            ok: true,
            message: `${parts.length} parte(s) guardada(s) exitosamente`,
            parts: insertedParts
        });

    } catch (error) {
        console.error('❌ [PARTS] Error guardando partes:', error);
        res.status(500).json({
            ok: false,
            error: 'Error al guardar partes: ' + error.message
        });
    }
});

/**
 * GET /api/documents/:id/parts
 * Obtener las partes de un documento
 */
router.get('/:id/parts', requireAuth, async (req, res) => {
    const documentId = req.params.id;
    const db = req.app.locals.db; // 🔥 IMPORTANTE: Obtener conexión a BD

    try {
        const parts = await new Promise((resolve, reject) => {
            db.query(
                `SELECT part_id as partId, role_name as name, order_position as \`order\`, color
                 FROM document_parts
                 WHERE document_id = ?
                 ORDER BY order_position ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        res.json({
            ok: true,
            parts: parts
        });

    } catch (error) {
        console.error('❌ [PARTS] Error obteniendo partes:', error);
        res.status(500).json({
            ok: false,
            error: 'Error al obtener partes: ' + error.message
        });
    }
});

/**
 * POST /api/documents/personalize-single
 * Genera un PDF personalizado único con valores de campos
 */
router.post('/personalize-single', async (req, res) => {
    console.log('\n🎨 [PERSONALIZE] POST /api/documents/personalize-single');
    const { templateId, fieldValues } = req.body;

    if (!templateId) {
        return res.status(400).json({
            success: false,
            error: 'Se requiere templateId'
        });
    }

    if (!fieldValues || Object.keys(fieldValues).length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Se requieren valores para al menos un campo'
        });
    }

    const db = req.app.locals.db;

    try {
        console.log(`📄 Plantilla ID: ${templateId}`);
        console.log(`📝 Valores:`, fieldValues);

        // 1. Obtener información del documento/plantilla
        const [docs] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT document_id, title, file_name, file_path FROM documents WHERE document_id = ? AND is_template = 1',
                [templateId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        const template = docs[0];
        console.log(`✅ Plantilla encontrada: ${template.title}`);

        // 2. Obtener campos de la plantilla
        const [fields] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT field_id, field_key, field_type, page, position_x, position_y, width, height
                 FROM document_fields
                 WHERE signature_document_id = ?
                 ORDER BY page ASC, position_y ASC`,
                [templateId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'La plantilla no tiene campos definidos'
            });
        }

        console.log(`📋 ${fields.length} campos encontrados`);

        // 3. Mapear valores a campos
        const fieldsWithValues = fields
            .filter(f => f.field_type === 'text' && fieldValues[f.field_key])
            .map(f => ({
                ...f,
                value: fieldValues[f.field_key],
                font_size: 12
            }));

        if (fieldsWithValues.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Ninguno de los valores proporcionados coincide con los campos de la plantilla'
            });
        }

        console.log(`✓ ${fieldsWithValues.length} campos con valores`);

        // 4. Generar PDF usando pdf-filler.js
        const { fillPDFWithCoordinates } = require('../lib/pdf/pdf-filler');
        const { PATHS } = require('../config/paths');
        
        const templatePath = path.join(PATHS.UPLOADS_DIR, 'documents', path.basename(template.file_path));
        
        // Generar un ID único para este PDF
        const uniqueId = `single_${Date.now()}`;
        const outputFullPath = await fillPDFWithCoordinates(
            templatePath,
            fieldsWithValues,
            uniqueId,
            1
        );

        // Extraer nombre del archivo de la ruta completa
        const outputFileName = path.basename(outputFullPath);

        console.log(`✅ PDF generado: ${outputFileName}`);

        // 5. Retornar URL del PDF generado
        const pdfUrl = `/uploads/filled_pdfs/${uniqueId}/${outputFileName}`;

        res.json({
            success: true,
            data: {
                pdfUrl,
                fileName: outputFileName,
                templateName: template.title,
                fieldsProcessed: fieldsWithValues.length
            }
        });

    } catch (error) {
        console.error('❌ [PERSONALIZE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al generar PDF: ' + error.message
        });
    }
});

// =============================================
// FUNCIÓN HELPER: EXTRACCIÓN AUTOMÁTICA DE LABELS
// =============================================

async function autoExtractLabels(db, documentId, textFields) {
    try {
        // 1. Obtener ruta del PDF
        const [docResult] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT file_path FROM documents WHERE document_id = ?',
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (!docResult) {
            console.log('   ⚠️ Documento no encontrado, saltando extracción');
            return;
        }

        // 🔥 FIX: Quitar "/" inicial si existe para evitar que se interprete como ruta absoluta
        const cleanPath = docResult.file_path.startsWith('/')
            ? docResult.file_path.substring(1)
            : docResult.file_path;
        const pdfPath = path.resolve(__dirname, '../../', cleanPath);
        console.log(`   📂 PDF: ${pdfPath}`);

        // 2. 🚀 EXTRACCIÓN CON COORDENADAS usando pdfjs-dist
        const dataBuffer = fs.readFileSync(pdfPath);
        const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(dataBuffer),
            verbosity: 0
        });
        const pdfDocument = await loadingTask.promise;

        // Extraer todos los elementos de texto con sus coordenadas
        const textItems = [];
        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            for (const item of textContent.items) {
                if (item.str && item.str.trim()) {
                    // Convertir coordenadas: PDF usa bottom-up, necesitamos top-down
                    const y = viewport.height - item.transform[5];
                    textItems.push({
                        text: item.str,
                        x: item.transform[4],
                        y: y,
                        page: pageNum
                    });
                }
            }
        }

        console.log(`   📝 ${textItems.length} elementos de texto extraídos con coordenadas`);

        // Parámetros de tolerancia
        const Y_SAME_LINE_TOLERANCE = 15;  // ±15px se considera la MISMA línea
        const Y_ABOVE_TOLERANCE = 40;      // Hasta 40px ARRIBA se considera válido
        const X_DIAGONAL_TOLERANCE = 60;   // Hasta 60px a la izquierda para diagonal
        const MAX_X_DISTANCE = 300;        // Máximo 300 píxeles a la izquierda
        const MAX_Y_DISTANCE = 100;        // Máximo 100 píxeles arriba

        let updatedCount = 0;
        let labelSet = new Set();
        let fieldsWithMissingLabels = [];

        for (const field of textFields) {
            const fieldPage = field.page;
            const fieldX = field.x;
            const fieldY = field.y;

            console.log(`\n--- Campo ${field.id} ---`);
            console.log(`   Página: ${fieldPage}, X: ${fieldX}, Y: ${fieldY}`);

            // 1. Buscar en la MISMA LÍNEA (prioridad máxima)
            let sameLine = textItems.filter(item => {
                const samePage = item.page === fieldPage;
                const toTheLeft = item.x < fieldX && (fieldX - item.x) <= MAX_X_DISTANCE;
                const onSameLine = Math.abs(item.y - fieldY) <= Y_SAME_LINE_TOLERANCE;
                const trimmed = item.text.trim();
                const isOnlyUnderscores = /^_+$/.test(trimmed);
                const isTooShort = trimmed.length === 0;
                return samePage && toTheLeft && onSameLine && !isOnlyUnderscores && !isTooShort;
            });

            // 2. Si no hay en la misma línea, buscar ARRIBA (verticalmente)
            let above = [];
            if (sameLine.length === 0) {
                above = textItems.filter(item => {
                    const samePage = item.page === fieldPage;
                    const aboveY = item.y < fieldY && (fieldY - item.y) <= MAX_Y_DISTANCE;
                    const closeX = Math.abs(item.x - fieldX) <= X_DIAGONAL_TOLERANCE;
                    const trimmed = item.text.trim();
                    const isOnlyUnderscores = /^_+$/.test(trimmed);
                    const isTooShort = trimmed.length === 0;
                    return samePage && aboveY && closeX && !isOnlyUnderscores && !isTooShort;
                });
            }

            // 3. Si no hay arriba, buscar en DIAGONAL (arriba-izquierda)
            let diagonal = [];
            if (sameLine.length === 0 && above.length === 0) {
                diagonal = textItems.filter(item => {
                    const samePage = item.page === fieldPage;
                    const aboveY = item.y < fieldY && (fieldY - item.y) <= MAX_Y_DISTANCE;
                    const toTheLeft = item.x < fieldX && (fieldX - item.x) <= MAX_X_DISTANCE;
                    const diagonalEnough = (fieldX - item.x) > 0 && Math.abs(fieldY - item.y) > 0;
                    const trimmed = item.text.trim();
                    const isOnlyUnderscores = /^_+$/.test(trimmed);
                    const isTooShort = trimmed.length === 0;
                    return samePage && aboveY && toTheLeft && diagonalEnough && !isOnlyUnderscores && !isTooShort;
                });
            }

            // 4. Si no hay nada, buscar cercanos (fallback original)
            let fallback = [];
            if (sameLine.length === 0 && above.length === 0 && diagonal.length === 0) {
                fallback = textItems.filter(item => {
                    const samePage = item.page === fieldPage;
                    const toTheLeft = item.x < fieldX && (fieldX - item.x) <= MAX_X_DISTANCE;
                    const nearby = Math.abs(item.y - fieldY) <= Y_SAME_LINE_TOLERANCE * 3;
                    const trimmed = item.text.trim();
                    const isOnlyUnderscores = /^_+$/.test(trimmed);
                    const isTooShort = trimmed.length === 0;
                    return samePage && toTheLeft && nearby && !isOnlyUnderscores && !isTooShort;
                });
            }

            let candidates = sameLine.length > 0 ? sameLine : (above.length > 0 ? above : (diagonal.length > 0 ? diagonal : fallback));
            let foundLabel = null;

            if (candidates.length > 0) {
                // Ordenar por distancia total (euclidiana)
                candidates.sort((a, b) => {
                    const distA = Math.sqrt(Math.pow(fieldX - a.x, 2) + Math.pow(fieldY - a.y, 2));
                    const distB = Math.sqrt(Math.pow(fieldX - b.x, 2) + Math.pow(fieldY - b.y, 2));
                    return distA - distB;
                });
                const firstCandidate = candidates[0];
                const trimmed = firstCandidate.text.trim();
                foundLabel = trimmed
                    .replace(/_+$/g, '')
                    .replace(/\s+$/g, '')
                    .trim();
                // Validar duplicados en la misma página
                const labelKey = `${fieldPage}::${foundLabel.toLowerCase()}`;
                if (labelSet.has(labelKey)) {
                    fieldsWithMissingLabels.push({ fieldId: field.id, reason: `Etiqueta duplicada en la página: "${foundLabel}"` });
                    foundLabel = null;
                } else {
                    labelSet.add(labelKey);
                }
                console.log(`   ✅ Candidato seleccionado: "${trimmed}" → Limpio: "${foundLabel}"`);
            } else {
                fieldsWithMissingLabels.push({ fieldId: field.id, reason: 'No se encontró texto real para el campo' });
                foundLabel = null;
                console.log(`   ⚠️ Sin texto válido, campo sin label asignado.`);
            }

            // Actualizar en base de datos
            await new Promise((resolve, reject) => {
                db.query(
                    'UPDATE document_fields SET field_label = ? WHERE field_id = ?',
                    [foundLabel, field.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            updatedCount++;
        }

        if (fieldsWithMissingLabels.length > 0) {
            let msg = fieldsWithMissingLabels.map(f => `Campo ID ${f.fieldId}: ${f.reason}`).join('; ');
            throw new Error('No se pudo extraer una etiqueta real para todos los campos: ' + msg);
        }

        console.log(`\n   ✅ ${updatedCount} labels actualizados automáticamente\n`);

    } catch (error) {
        console.error('   ❌ Error en autoExtractLabels:', error.message);
        throw error;
    }
}

// =============================================
// ✅ FUNCIONES AUXILIARES PARA PAGARÉS
// =============================================

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const mailerDynamic = require('../lib/email/mailer-dynamic');

/**
 * Generar PDF personalizado para un viewer group
 */
async function generatePersonalizedPagare(originalPdfPath, viewerGroupId, textFieldsData, allFields) {
    try {
        console.log(`📄 Generando PDF personalizado para viewer_group ${viewerGroupId}`);

        const existingPdfBytes = await fs.readFile(originalPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        const textValuesMap = {};
        textFieldsData.forEach(data => {
            textValuesMap[data.field_label] = data.field_value;
        });

        for (const field of allFields) {
            if (field.field_type === 'text' && textValuesMap[field.label]) {
                const pageIndex = (field.page || 1) - 1;
                const page = pdfDoc.getPages()[pageIndex];
                const { height } = page.getSize();

                const pdfX = parseFloat(field.x);
                const pdfY = height - parseFloat(field.y) - parseFloat(field.height);
                const pdfHeight = parseFloat(field.height);

                const textValue = textValuesMap[field.label];
                const fontSize = Math.min(12, pdfHeight * 0.8);

                page.drawText(textValue, {
                    x: pdfX + 2,
                    y: pdfY + (pdfHeight / 2) - (fontSize / 2),
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });

                console.log(`   ✅ Campo texto: ${field.label} = ${textValue}`);
            }
        }

        const pdfBytes = await pdfDoc.save();
        const outputDir = path.join(__dirname, '..', '..', 'uploads', 'pagares');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true, mode: 0o777 });
        }

        const outputFileName = `pagare_viewer_${viewerGroupId}_${Date.now()}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);

        await fs.writeFile(outputPath, pdfBytes);

        console.log(`✅ PDF personalizado generado: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error('❌ Error al generar PDF personalizado:', error);
        throw error;
    }
}

/**
 * Enviar emails a todos los recipients de un viewer group
 */
async function sendEmailsToViewerGroup(viewerGroupId, recipients, document, userId) {
    try {
        console.log(`📧 Enviando emails para viewer_group ${viewerGroupId} (${recipients.length} recipient(s))`);

        const [emailConfigs] = await db.promise().query(
            `SELECT * FROM email_config WHERE user_id = ? LIMIT 1`,
            [userId]
        );

        if (emailConfigs.length === 0) {
            console.warn('⚠️ Usuario no tiene configuración de email, saltando envío');
            return { success: false, error: 'No hay configuración de email' };
        }

        const userConfig = emailConfigs[0];
        const APP_URL = process.env.APP_URL || 'http://localhost:3000';

        for (const recipient of recipients) {
            const signUrl = `${APP_URL}/public-sign.html?token=${recipient.token}`;

            const subject = `✍️ Firma requerida: ${document.name}`;

            const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">📋 Pagaré - Firma Requerida</h1>
        </div>
        <div class="content">
            <p>Hola,</p>
            <p>Se te ha enviado un pagaré para firma digital: <strong>${document.name}</strong></p>
            <p>Por favor haz clic en el siguiente botón para revisar y firmar el documento:</p>
            <p style="text-align: center;">
                <a href="${signUrl}" class="button">🔗 Abrir Documento para Firmar</a>
            </p>
            <p style="font-size: 14px; color: #6b7280;">
                O copia este enlace en tu navegador:<br>
                <code style="background: #e5e7eb; padding: 4px 8px; border-radius: 4px;">${signUrl}</code>
            </p>
            <p><strong>Importante:</strong> Este enlace es único y personal. No lo compartas con nadie.</p>
        </div>
        <div class="footer">
            <p>Enviado desde FirmaLegal Online</p>
        </div>
    </div>
</body>
</html>
            `.trim();

            const text = `
Hola,

Se te ha enviado un pagaré para firma digital: ${document.name}

Por favor accede al siguiente enlace para revisar y firmar el documento:
${signUrl}

Importante: Este enlace es único y personal. No lo compartas con nadie.

Enviado desde FirmaLegal Online
            `.trim();

            const result = await mailerDynamic.sendEmailWithUserConfig(userConfig, {
                to: recipient.email,
                subject,
                text,
                html
            });

            if (result.success) {
                console.log(`   ✅ Email enviado a ${recipient.email}`);

                await db.promise().query(
                    `UPDATE document_recipients SET status = 'sent', sent_at = NOW() WHERE recipient_id = ?`,
                    [recipient.recipientId]
                );
            } else {
                console.error(`   ❌ Error enviando email a ${recipient.email}:`, result.error);
            }
        }

        console.log(`✅ Emails enviados para viewer_group ${viewerGroupId}`);
        return { success: true };

    } catch (error) {
        console.error('❌ Error al enviar emails:', error);
        throw error;
    }
}

/**
 * Generar PDF personalizado con textos escritos para un pagaré específico
 * @param {string} sourcePdfPath - Ruta del PDF original (plantilla)
 * @param {number} viewerGroupId - ID del viewer group
 * @param {object} fieldValues - Valores de texto a escribir { field_label: value }
 * @param {array} allFields - Todos los campos del documento con coordenadas
 * @returns {string} Ruta del PDF personalizado generado
 */
async function generatePersonalizedPagare(sourcePdfPath, viewerGroupId, fieldValues, allFields) {
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

    try {
        console.log(`      📄 Generando PDF personalizado para viewer group ${viewerGroupId}`);

        // Leer el PDF original
        const existingPdfBytes = fs.readFileSync(sourcePdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Filtrar solo campos de texto
        const textFields = allFields.filter(f => f.field_type === 'text');

        console.log(`      📝 Escribiendo ${Object.keys(fieldValues).length} valores en ${textFields.length} campos de texto`);

        // Contador para manejar labels duplicados
        const labelCounters = {};

        for (const field of textFields) {
            const fieldLabel = field.field_label;

            // Determinar qué key del CSV usar basado en cuántas veces hemos visto este label
            let csvKey;

            if (labelCounters[fieldLabel] === undefined) {
                // Primera vez que vemos este label: sin sufijo
                labelCounters[fieldLabel] = 0;
                csvKey = fieldLabel;
            } else {
                // Ya vimos este label antes: incrementar y usar sufijo _1, _2, etc.
                labelCounters[fieldLabel]++;
                csvKey = `${fieldLabel}_${labelCounters[fieldLabel]}`;
            }

            const value = fieldValues[csvKey];

            if (value) {
                const page = pdfDoc.getPage(field.page_number - 1);
                const { height } = page.getSize();

                // 🔥 Convertir coordenadas a números (vienen como strings de la BD)
                const fieldX = parseFloat(field.x_position);
                const fieldY = parseFloat(field.y_position);
                const fieldHeight = parseFloat(field.height);

                // Convertir coordenadas (Y invertido en PDF)
                const x = fieldX;
                const y = height - fieldY - fieldHeight;

                // Escribir el texto en el PDF
                page.drawText(String(value), {
                    x: x + 4, // Pequeño padding
                    y: y + (fieldHeight / 2) - 4, // Centrar verticalmente
                    size: 12,
                    font: font,
                    color: rgb(0, 0, 0)
                });

                console.log(`         ✅ ${fieldLabel} [CSV: "${csvKey}"] = "${value}" escrito en PDF`);
            }
        }

        // Guardar el PDF personalizado
        const pdfBytes = await pdfDoc.save();
        const customFileName = `pagare_vg${viewerGroupId}_${Date.now()}.pdf`;
        const customPdfPath = path.join(__dirname, '..', '..', 'uploads', 'pagares', customFileName);

        // Crear directorio si no existe
        const pagareDir = path.join(__dirname, '..', '..', 'uploads', 'pagares');
        if (!fs.existsSync(pagareDir)) {
            fs.mkdirSync(pagareDir, { recursive: true, mode: 0o777 });
        }

        fs.writeFileSync(customPdfPath, pdfBytes);

        console.log(`      ✅ PDF personalizado guardado: ${customFileName}`);

        // Retornar ruta relativa para guardar en BD
        return `/uploads/pagares/${customFileName}`;

    } catch (error) {
        console.error(`      ❌ Error al generar PDF personalizado:`, error);
        throw error;
    }
}

/**
 * Generar PDFs y enviar emails para todos los viewer groups
 */
async function generateAndSendPagares(docId, document, viewerGroups, allFields, userId, db) {
    try {
        console.log(`📋 Procesando ${viewerGroups.length} viewer group(s)`);

        const sendgrid = require('../lib/email/sendgrid');
        const signatureRequestTemplate = require('../lib/email/templates/signature-request-bulk');

        // Array para acumular todos los emails a enviar en batch
        const emailsToSend = [];

        for (const vg of viewerGroups) {
            // Obtener los valores de campos de texto para este viewer group
            // Los valores están en field_values vinculados al primer recipient del grupo
            const firstRecipientId = vg.recipients[0]?.recipientId;

            const [fieldValuesRows] = await db.promise().query(
                `SELECT df.field_id, df.field_label, fv.text_value
                 FROM field_values fv
                 INNER JOIN document_fields df ON fv.field_id = df.field_id
                 WHERE fv.recipient_id = ? AND fv.value_type = 'text'
                 ORDER BY df.field_id ASC`,
                [firstRecipientId]
            );

            // 🔥 Convertir a formato { field_label: value } manejando duplicados
            const fieldValues = {};
            const labelCounters = {};

            fieldValuesRows.forEach(row => {
                const label = row.field_label;
                let key;

                if (labelCounters[label] === undefined) {
                    // Primera vez: sin sufijo
                    labelCounters[label] = 0;
                    key = label;
                } else {
                    // Ya existe: incrementar y usar sufijo
                    labelCounters[label]++;
                    key = `${label}_${labelCounters[label]}`;
                }

                fieldValues[key] = row.text_value;
            });

            console.log(`   📝 Campos de texto para viewer group ${vg.viewerGroupId}:`, Object.keys(fieldValues).length);

            // 🔥 Generar PDF personalizado con textos escritos
            const sourcePdfPath = path.join(__dirname, '../..', document.file_path);
            const customPdfPath = await generatePersonalizedPagare(
                sourcePdfPath,
                vg.viewerGroupId,
                fieldValues,
                allFields
            );

            // Guardar la ruta del PDF personalizado en la BD
            await db.promise().query(
                `UPDATE pagare_viewer_groups SET custom_pdf_path = ? WHERE viewer_group_id = ?`,
                [customPdfPath, vg.viewerGroupId]
            );

            // Actualizar custom_pdf_path en cada recipient de este viewer group
            for (const recipient of vg.recipients) {
                await db.promise().query(
                    `UPDATE document_recipients SET custom_pdf_path = ? WHERE recipient_id = ?`,
                    [customPdfPath, recipient.recipientId]
                );
            }

            console.log(`   ✅ PDF personalizado asignado a ${vg.recipients.length} recipient(s)`);

            // Preparar emails para todos los recipients del grupo
            console.log(`   📧 Preparando emails para ${vg.recipients.length} recipient(s)...`);

            // Preparar email para cada firmante del viewer group
            for (const recipient of vg.recipients) {
                try {
                    const signatureUrl = `${process.env.APP_URL || 'http://localhost:3000'}/public-sign.html?token=${recipient.token}`;
                    const appUrl = process.env.APP_URL || 'http://localhost:3000';

                    // Obtener sender name y email (igual que documentos normales)
                    const senderName = document.sender_name || `${document.first_name} ${document.last_name}`;
                    const fromEmail = document.sender_email || document.owner_email;

                    // Usar el mismo template que documentos normales
                    const htmlContent = signatureRequestTemplate({
                        recipientName: recipient.name || recipient.email,
                        documentTitle: document.title || 'Pagaré',
                        senderName: senderName,
                        signatureUrl: signatureUrl,
                        appUrl: appUrl
                    });

                    // Texto plano (importante para evitar spam) - mismo formato que documentos normales
                    const plainText = `
Estimado cliente,

¡Buenas noticias! Ya está listo el documento para tu firma digital. Es un proceso fácil y seguro que consta de dos partes:

✅ Ya realizaste la validación de identidad biométrica de manera exitosa.

Ahora debes proceder con la firma del documento.

DOCUMENTO A FIRMAR: ${document.title || 'Pagaré'}

⚠️ ANTES DE HACER CLIC EN EL ENLACE, POR FAVOR TEN EN CUENTA LO SIGUIENTE:

Al ingresar al sistema de firma digital, deberás buscar el recuadro designado para la firma. Allí podrás elegir entre TRES OPCIONES para completarla:

1. Firma tecleada:
   Escribe tu nombre completo y se generará automáticamente una firma en estilo tipográfico.

2. Firma manuscrita (gráfica):
   Dibuja tu firma directamente en el recuadro usando el cursor o una pantalla táctil.

3. Cargar imagen de tu firma:
   Si ya tienes tu firma escaneada, puedes subirla en formato JPG o PNG.

ENLACE PARA FIRMAR EL DOCUMENTO:
${signatureUrl}

💬 ¿Necesitas ayuda?
Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos. Estamos aquí para ayudarte en lo que necesites.

¡Que tengas un buen día!

Atentamente,
Isabella Vergara
📧 Firmalegalonline@pkiservices.co

═══════════════════════════════════════════════════════════

📜 MARCO LEGAL

Ley 527 de 1999 y Decreto 2364 de 2012:
El Decreto 2364 de 2012, que reglamenta el artículo 7 de la Ley 527 de 1999, define la firma electrónica como aquel método implementado para identificar a una persona y su voluntad para un fin específico, por ejemplo, para verificar la voluntad de adquirir derechos y obligaciones en un documento.

Para que la firma electrónica genere efectos legales, deberá cumplir los mismos requisitos que tiene cualquier documento físico aplicando el Principio de Equivalencia Funcional para que los supuestos de la vida real sean iguales en la vida digital y generen idénticos efectos.

⚖️ CUMPLIMIENTO AL PRINCIPIO CONSTITUCIONAL DE LA BUENA FE

PKI SERVICES S.A.S. debe dar cumplimiento al artículo 83 de la constitución política colombiana, sobre el principio de la buena fe: "Las actuaciones de los particulares y de las autoridades públicas deberán ceñirse a los postulados de buena fe, la cual se presumirá en todas las gestiones que aquéllos adelanten ante éstas."

⚠️ FALSEDAD EN DOCUMENTO PRIVADO

Los solicitantes deben dar cumplimiento a la LEY 599 DE 2000, Artículo 289: "El que falsifique documento privado que pueda servir de prueba, incurrirá, si lo usa, en prisión de uno (1) a seis (6) años."

🏛️ ACREDITACIÓN ONAC

PKI SERVICES en cumplimiento de la LEY 527 de 1999 y sus decretos reglamentarios, es una entidad acreditada por el ORGANISMO NACIONAL DE ACREDITACIÓN DE COLOMBIA (ONAC).

Para cualquier duda o inquietud sobre la plataforma de Firma, puede ponerse en contacto con nuestro servicio de atención al cliente en:
🔗 Soporte PKI Services: https://pkiservices.co/soporte/?wpsc-section=ticket-list

═══════════════════════════════════════════════════════════

PKI SERVICES S.A.S.
Plataforma de Firma Electrónica Certificada

Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario pudiendo contener información confidencial sometida a secreto profesional. No está permitida su reproducción o distribución sin la autorización expresa. Si usted no es el destinatario final por favor elimínelo e infórmenos por este mismo medio.

De acuerdo con la Ley Estatutaria 1581 de 2012 de Protección de Datos y normas concordantes, le informamos que nuestra entidad cuenta con política para el tratamiento de los datos personales almacenados en sus bases de datos.

© ${new Date().getFullYear()} PKI Services S.A.S. - Todos los derechos reservados
                    `.trim();

                    // Agregar a la lista de emails (mismo formato que documentos normales)
                    emailsToSend.push({
                        to: recipient.email,
                        from: fromEmail,
                        fromName: `${senderName} (FirmaLegal)`,
                        replyTo: fromEmail,
                        subject: `Solicitud de firma: ${document.title || 'Pagaré'}`,
                        text: plainText,
                        html: htmlContent,
                        // Headers anti-spam optimizados para Gmail
                        headers: {
                            'X-Priority': '3',
                            'X-MSMail-Priority': 'Normal',
                            'Importance': 'normal',
                            'X-Mailer': 'FirmaLegal Online',
                            'List-Unsubscribe': `<${appUrl}/unsubscribe?token=${recipient.token}>`,
                            'Precedence': 'bulk'
                        },
                        // Categorías de SendGrid
                        categories: ['signature-request', 'legal-document', 'pagare'],
                        // Custom args para tracking
                        customArgs: {
                            document_id: String(docId),
                            recipient_id: String(recipient.recipientId),
                            viewer_group_id: String(vg.viewerGroupId)
                        },
                        // Tracking settings (importante para reputación)
                        trackingSettings: {
                            clickTracking: { enable: true },
                            openTracking: { enable: true },
                            subscriptionTracking: { enable: false }
                        }
                    });

                    console.log(`      ✅ Email preparado para ${recipient.email}`);
                } catch (emailError) {
                    console.error(`      ❌ Error preparando email para ${recipient.email}:`, emailError.message);
                }
            }

            await db.promise().query(
                `INSERT INTO pagare_events (document_id, viewer_group_id, event_type, details)
                 VALUES (?, ?, 'viewer_group_created', ?)`,
                [docId, vg.viewerGroupId, JSON.stringify({
                    message: `Viewer group procesado con ${vg.recipients.length} recipient(s)`,
                    recipients_count: vg.recipients.length,
                    field_count: Object.keys(fieldValues).length
                })]
            );
        }

        // Enviar todos los emails en batch usando el mismo sistema que documentos normales
        if (emailsToSend.length > 0) {
            console.log(`\n   📧 Enviando ${emailsToSend.length} email(s) en batch...`);

            const sendResult = await sendgrid.sendBatchEmails(emailsToSend);

            if (!sendResult.success) {
                console.error('❌ Error al enviar emails:', sendResult.error);
                throw new Error(`Error al enviar emails: ${sendResult.error}`);
            }

            console.log(`   ✅ ${sendResult.count} email(s) enviado(s) exitosamente`);
        } else {
            console.log(`   ⚠️ No hay emails para enviar`);
        }

        console.log(`✅ Todos los viewer groups procesados`);

    } catch (error) {
        console.error('❌ Error en generateAndSendPagares:', error);
        throw error;
    }
}

// =============================================
// ✅ ENDPOINTS PARA PAGARÉS
// =============================================

/**
 * POST /api/documents/:docId/pagare/send-bulk
 * Enviar pagarés masivos basados en CSV
 */
router.post('/:docId/pagare/send-bulk', requireAuth, async (req, res) => {
    const { docId } = req.params;
    const { csvData, finalSignerEmail, finalSignerName } = req.body;
    const userId = req.body.user_id || req.query.user_id;
    const db = req.app.locals.db; // ✅ Obtener conexión DB

    console.log(`📋 [PAGARE] Enviando pagarés masivos para documento ${docId}`);
    console.log(`   Filas CSV: ${csvData?.length || 0}`);
    console.log(`   Firmante final: ${finalSignerEmail}`);

    try {
        // Validaciones
        if (!csvData || !Array.isArray(csvData) || csvData.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Datos CSV inválidos o vacíos'
            });
        }

        if (!finalSignerEmail || !finalSignerName) {
            return res.status(400).json({
                success: false,
                error: 'Email y nombre del firmante definitivo son requeridos'
            });
        }

        // Obtener documento con configuración de email (igual que documentos normales)
        const [docs] = await db.promise().query(
            `SELECT d.document_id, d.title, d.file_name, d.file_path, d.owner_id,
                    u.first_name, u.last_name, u.email as owner_email,
                    ec.email_from as sender_email, ec.email_from_name as sender_name
             FROM documents d
             INNER JOIN users u ON d.owner_id = u.user_id
             LEFT JOIN email_config ec ON u.user_id = ec.user_id
             WHERE d.document_id = ?`,
            [docId]
        );

        if (docs.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado'
            });
        }

        const document = docs[0];

        // Configurar SendGrid con la API Key del usuario (igual que documentos normales)
        const [apiKeyResults] = await db.promise().query(
            `SELECT sendgrid_api_key FROM email_config WHERE user_id = ?`,
            [userId]
        );

        if (apiKeyResults.length === 0 || !apiKeyResults[0].sendgrid_api_key) {
            return res.status(400).json({
                success: false,
                error: 'Debes configurar tu cuenta de SendGrid antes de enviar pagarés'
            });
        }

        // Configurar SendGrid temporalmente para este envío
        const sendgrid = require('../lib/email/sendgrid');
        sendgrid.configureSendGrid(apiKeyResults[0].sendgrid_api_key);

        // Obtener campos del documento
        const [fields] = await db.promise().query(
            `SELECT field_id, part_id, field_type, field_label, x_position, y_position, page_number, width, height
             FROM document_fields
             WHERE document_id = ?
             ORDER BY part_id, field_id`,
            [docId]
        );

        if (fields.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'El documento no tiene campos mapeados'
            });
        }

        // Obtener parts reales del documento
        const [documentParts] = await db.promise().query(
            `SELECT part_id, role_name FROM document_parts WHERE document_id = ? ORDER BY part_id`,
            [docId]
        );

        console.log(`📋 Document parts encontrados:`, documentParts.map(p => `${p.part_id}: ${p.role_name}`));

        // Agrupar campos por viewer (part_id)
        const fieldsByViewer = {};
        fields.forEach(field => {
            if (field.part_id !== null) {
                if (!fieldsByViewer[field.part_id]) {
                    fieldsByViewer[field.part_id] = [];
                }
                fieldsByViewer[field.part_id].push(field);
            }
        });

        const viewerGroupsCreated = [];
        const crypto = require('crypto');

        // ✅ Limpiar viewer groups existentes para este documento (evitar duplicados)
        console.log(`🧹 Limpiando viewer groups anteriores del documento ${docId}...`);
        await db.promise().query(
            `DELETE FROM pagare_viewer_groups WHERE document_id = ?`,
            [docId]
        );

        // ✅ Configurar pagare_metadata (una sola vez por documento)
        console.log(`📝 Configurando metadata del pagaré...`);
        const finalSignerToken = crypto.randomBytes(32).toString('hex');

        // Verificar si ya existe metadata para este documento
        const [existingMetadata] = await db.promise().query(
            `SELECT pagare_id FROM pagare_metadata WHERE document_id = ?`,
            [docId]
        );

        if (existingMetadata.length === 0) {
            // Crear nueva metadata
            await db.promise().query(
                `INSERT INTO pagare_metadata (document_id, total_viewers, final_signer_email, final_signer_name, final_signer_token)
                 VALUES (?, ?, ?, ?, ?)`,
                [docId, csvData.length, finalSignerEmail, finalSignerName, finalSignerToken]
            );
        } else {
            // Actualizar metadata existente
            await db.promise().query(
                `UPDATE pagare_metadata
                 SET total_viewers = ?, final_signer_email = ?, final_signer_name = ?, final_signer_token = ?, final_signer_status = 'waiting'
                 WHERE document_id = ?`,
                [csvData.length, finalSignerEmail, finalSignerName, finalSignerToken, docId]
            );
        }

        // ✅ NUEVO: Procesar cada pagaré del CSV
        // csvData ya viene procesado con estructura: { rowIndex, firmantes: [{email, partId, roleName}], textFields: {label: value} }
        for (let i = 0; i < csvData.length; i++) {
            const pagareData = csvData[i];
            const viewerIdNum = i + 1; // Número secuencial del viewer (1, 2, 3...)

            console.log(`\n📄 Procesando pagaré #${viewerIdNum}:`, {
                firmantes: pagareData.firmantes.length,
                campos: Object.keys(pagareData.textFields).length
            });

            // Crear viewer group para este pagaré
            const [groupResult] = await db.promise().query(
                `INSERT INTO pagare_viewer_groups (document_id, viewer_id, status, created_at)
                 VALUES (?, ?, 'pending', NOW())`,
                [docId, viewerIdNum]
            );

            const viewerGroupId = groupResult.insertId;
            console.log(`   ✅ Viewer group creado: ${viewerGroupId}`);

            const recipientsCreated = [];

            // Crear recipients para cada firmante de este pagaré
            for (const firmante of pagareData.firmantes) {
                const token = crypto.randomBytes(32).toString('hex');

                // Mapear partId del CSV (1, 2, 3...) al part_id real de la BD
                const realPartId = documentParts[firmante.partId - 1]?.part_id || null;

                console.log(`      🔗 Mapeando partId ${firmante.partId} -> part_id real: ${realPartId}`);

                // Crear recipient
                const [recipientResult] = await db.promise().query(
                    `INSERT INTO document_recipients
                     (document_id, email, name, viewer_group_id, part_id, status, token)
                     VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
                    [docId, firmante.email, firmante.roleName, viewerGroupId, realPartId, token]
                );

                const recipientId = recipientResult.insertId;
                console.log(`      📧 Firmante creado: ${firmante.email} (${firmante.roleName}, part: ${firmante.partId})`);

                recipientsCreated.push({
                    recipientId,
                    email: firmante.email,
                    name: firmante.roleName,
                    token,
                    partId: firmante.partId
                });

                // Los campos de firma ya están vinculados al recipient a través del part_id
                // No es necesario asignar campos individualmente en el sistema de pagarés
                console.log(`      ✅ Recipient creado con part_id ${realPartId} (campos filtrados automáticamente por part_id)`);
            }

            // 🔥 Guardar valores de campos de texto para TODOS los recipients del viewer group
            // IMPORTANTE: Todos los firmantes de la misma fila CSV ven los MISMOS valores
            // Ejemplo: Fila 2 → rangertm32@gmail.com y diegoarrietaherrera8@gmail.com ven: Juan, Rois, 10264548, etc.

            console.log(`      📝 Guardando valores de texto para ${recipientsCreated.length} recipient(s) del viewer group`);
            console.log(`      📋 Datos disponibles:`, Object.keys(pagareData.textFields));

            // Guardar los valores para CADA recipient (todos ven lo mismo)
            for (const recipient of recipientsCreated) {
                const recipientRealPartId = documentParts[recipient.partId - 1]?.part_id;

                // 🔥 PAGARÉS: Los campos de texto NO tienen part_id asignado (son NULL)
                // Por eso obtenemos TODOS los campos de texto del documento (no filtrados por part_id)
                const recipientTextFields = fields.filter(f => f.field_type === 'text');

                console.log(`         📧 ${recipient.email} (part_id: ${recipientRealPartId}) - ${recipientTextFields.length} campo(s)`);

                // 🔥 Contador para manejar labels duplicados
                // Ejemplo: Si hay 2 campos "Nombre:", el primero usa "Nombre:", el segundo "Nombre:_1"
                const labelCounters = {};

                for (const textField of recipientTextFields) {
                    const fieldLabel = textField.field_label;

                    // Determinar qué key del CSV usar basado en cuántas veces hemos visto este label
                    let csvKey = fieldLabel;

                    if (labelCounters[fieldLabel] !== undefined) {
                        // Ya vimos este label antes, usar sufijo
                        labelCounters[fieldLabel]++;
                        csvKey = `${fieldLabel}_${labelCounters[fieldLabel]}`;
                    } else {
                        // Primera vez que vemos este label
                        labelCounters[fieldLabel] = 0;
                    }

                    // Buscar el valor en el CSV con la key calculada
                    let fieldValue = pagareData.textFields[csvKey];

                    if (fieldValue) {
                        await db.promise().query(
                            `INSERT INTO field_values (field_id, recipient_id, value_type, text_value)
                             VALUES (?, ?, 'text', ?)`,
                            [textField.field_id, recipient.recipientId, fieldValue]
                        );
                        console.log(`            ✅ ${fieldLabel} [CSV: "${csvKey}"] = "${fieldValue}"`);
                    } else {
                        console.log(`            ⚠️ ${fieldLabel} [CSV: "${csvKey}"] - sin valor en CSV`);
                    }
                }
            }

            // Crear evento (usando details JSON)
            await db.promise().query(
                `INSERT INTO pagare_events (document_id, viewer_group_id, event_type, details)
                 VALUES (?, ?, 'viewer_group_created', ?)`,
                [docId, viewerGroupId, JSON.stringify({
                    viewer_id: viewerIdNum,
                    firmantes_count: recipientsCreated.length,
                    message: `Pagaré #${viewerIdNum} creado con ${recipientsCreated.length} firmante(s)`
                })]
            );

            viewerGroupsCreated.push({
                viewerGroupId,
                viewerId: viewerIdNum,
                recipients: recipientsCreated
            });
        }

        // ✅ Generar PDFs personalizados y enviar emails
        console.log(`📧 Generando PDFs y enviando emails...`);
        await generateAndSendPagares(docId, document, viewerGroupsCreated, fields, userId, db);

        res.json({
            success: true,
            message: `${viewerGroupsCreated.length} pagaré(s) procesado(s) y enviado(s) exitosamente`,
            viewerGroups: viewerGroupsCreated.map(vg => ({
                viewerGroupId: vg.viewerGroupId,
                viewerId: vg.viewerId,
                recipientsCount: vg.recipients.length
            }))
        });

    } catch (error) {
        console.error('❌ Error al procesar pagarés masivos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// OBTENER VALORES ASIGNADOS A CAMPOS DE TEXTO
// GET /api/documents/:id/field-values
// =============================================
router.get('/:id/field-values', async (req, res) => {
    const documentId = req.params.id;
    const db = req.app.locals.db;

    console.log(`📋 [FIELD-VALUES] GET /api/documents/${documentId}/field-values`);

    try {
        // Obtener valores de document_field_values para este documento
        const [fieldValues] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dfv.field_id, dfv.field_value
                 FROM document_field_values dfv
                 WHERE dfv.document_id = ? AND dfv.field_value IS NOT NULL AND dfv.field_value != ''`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // Convertir array a objeto { field_id: value }
        const fieldData = {};
        fieldValues.forEach(fv => {
            fieldData[fv.field_id] = fv.field_value;
        });

        console.log(`✅ Valores encontrados: ${Object.keys(fieldData).length} campos`);

        res.json({
            success: true,
            fieldValues: fieldData,
            count: Object.keys(fieldData).length
        });

    } catch (error) {
        console.error('❌ Error obteniendo valores de campos:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener valores de campos',
            details: error.message
        });
    }
});

module.exports = router;