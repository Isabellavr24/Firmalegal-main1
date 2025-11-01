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
                `SELECT d.document_id, d.file_path, d.file_name, d.file_type, d.owner_id
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

        // Verificar permisos: debe ser el dueño
        if (doc.owner_id !== req.userId) {
            console.log('❌ [DOCUMENTS] Acceso denegado');
            return res.status(403).json({
                ok: false,
                success: false,
                error: 'No tienes permiso para acceder a este documento'
            });
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

        // Verificar que el archivo original existe
        const originalFilePath = path.join(__dirname, '..', '..', originalDoc.file_path);
        if (!fs.existsSync(originalFilePath)) {
            console.log('❌ [DOCUMENTS] Archivo original no encontrado');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Archivo original no encontrado'
            });
        }

        // Generar nuevo nombre para el documento duplicado
        const newTitle = `${originalDoc.title} (Copia)`;

        // Copiar el archivo físico
        const fileExt = path.extname(originalDoc.file_name);
        const newFileName = `${Date.now()}-copy${fileExt}`;
        const newFilePath = path.join(path.dirname(originalFilePath), newFileName);

        fs.copyFileSync(originalFilePath, newFilePath);

        // Insertar el nuevo documento en la BD
        const newDocResult = await new Promise((resolve, reject) => {
            db.query(
                `INSERT INTO documents (title, file_name, file_path, file_type, file_size, folder_id, owner_id, is_template, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newTitle,
                    newFileName,
                    path.relative(path.join(__dirname, '..', '..'), newFilePath),
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
                `SELECT field_id, field_type, page_number, x_position, y_position, 
                        width, height, required, field_label, created_at
                 FROM document_fields
                 WHERE document_id = ?
                 ORDER BY page_number, field_id`,
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
            created_at: f.created_at
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

            for (const field of fields) {
                const result = await new Promise((resolve, reject) => {
                    db.query(
                        `INSERT INTO document_fields 
                         (document_id, field_type, page_number, x_position, y_position, 
                          width, height, required, field_label)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            documentId,
                            field.type,
                            field.page || 1,
                            field.x,
                            field.y,
                            field.width,
                            field.height,
                            field.required !== false ? 1 : 0,
                            field.label || null
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
                    label: field.label
                });
            }

            console.log(`   ✅ ${insertedFields.length} campo(s) insertado(s)`);

            // Commit transacción
            await new Promise((resolve, reject) => {
                db.query('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

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

    // Validar recipients
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'Se requiere al menos un destinatario'
        });
    }

    // Validar formato de emails
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
        if (!recipient.email || !emailRegex.test(recipient.email)) {
            return res.status(400).json({
                ok: false,
                success: false,
                error: `Email inválido: ${recipient.email}`
            });
        }
    }

    console.log(`   Destinatarios: ${recipients.length}`);

    const db = req.app.locals.db;
    const crypto = require('crypto');
    const sendgrid = require('../lib/email/sendgrid');
    const signatureRequestTemplate = require('../lib/email/templates/signature-request');

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

        // 3. Configurar SendGrid con la API Key del usuario
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

        // 4. Insertar destinatarios y generar tokens
        const insertedRecipients = [];
        const emailsToSend = [];

        for (const recipient of recipients) {
            // Generar token único seguro
            const token = crypto.randomBytes(32).toString('hex');

            // Insertar en la base de datos
            const result = await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO document_recipients 
                     (document_id, email, name, token, status)
                     VALUES (?, ?, ?, ?, 'sent')`,
                    [documentId, recipient.email, recipient.name || recipient.email, token],
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
                token
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

            // Preparar texto plano (muy importante para evitar spam)
            const plainText = `
Hola ${recipient.name || recipient.email},

${senderName} te ha enviado un documento para firmar digitalmente.

Documento: ${document.title || 'Sin título'}

Para revisar y firmar el documento, haz clic en el siguiente enlace:
${signatureUrl}

Este enlace es único y personal. No lo compartas con nadie.

Si tienes alguna pregunta, contacta directamente con ${senderName} en ${fromEmail}.

Saludos,
Equipo de FirmaLegal Online

---
Este es un correo automático generado por FirmaLegal Online.
Si recibiste este correo por error, por favor ignóralo.
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

        // 5. Enviar emails en batch
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

        // 6. Registrar actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'document_sent',
            entityType: 'document',
            entityId: documentId,
            details: {
                recipient_count: insertedRecipients.length,
                emails: insertedRecipients.map(r => r.email)
            },
            req
        });

        // 7. Responder con éxito
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

module.exports = router;