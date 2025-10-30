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

// =============================================
// CONFIGURACIÓN DE MULTER PARA UPLOAD
// =============================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'documents');

        // Crear directorio si no existe
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
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
        let query = `
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
                d.google_drive_url,
                d.tags,
                d.created_at,
                d.updated_at,
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

        const params = [req.userId, status];

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

        // Verificar permisos: debe ser el dueño
        if (doc.owner_id !== req.userId) {
            console.log('❌ [DOCUMENTS] Acceso denegado');
            return res.status(403).json({
                ok: false,
                success: false,
                error: 'No tienes permiso para acceder a este documento'
            });
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
        tags // JSON string de array: ["tag1", "tag2"]
    } = req.body;

    const db = req.app.locals.db;
    const uploadedDocuments = [];
    const errors = [];

    try {
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
                // Insertar en BD
                const result = await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO documents
                         (folder_id, title, file_name, file_path, file_type, file_size, owner_id, is_template, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
                        [
                            folder_id || null,
                            title,
                            file.originalname,
                            `/uploads/documents/${file.filename}`,
                            file.mimetype,
                            file.size,
                            req.userId,
                            parseInt(is_template)
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

module.exports = router;
