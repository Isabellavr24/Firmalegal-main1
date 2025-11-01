/**
 * =============================================
 * CONTROLADOR DE FIRMAS ELECTRÓNICAS
 * API REST para gestión de documentos con campos de firma
 * =============================================
 */

const express = require('express');
const router = express.Router();
const { requireAuth, logActivity } = require('../middleware/auth');
const crypto = require('crypto');

// =============================================
// ENDPOINTS
// =============================================

/**
 * POST /api/signatures/documents
 * Crear un documento de firma con sus campos
 * Body:
 *   - document_id: ID del documento original
 *   - fields: Array de campos [{type, page, x, y, w, h}]
 */
router.post('/documents', requireAuth, async (req, res) => {
    console.log('\n📝 [SIGNATURES] POST /api/signatures/documents');
    console.log(`   Usuario: ${req.userId}`);

    const { document_id, fields } = req.body;

    if (!document_id) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'document_id es requerido'
        });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({
            ok: false,
            success: false,
            error: 'Debes proporcionar al menos un campo de firma'
        });
    }

    const db = req.app.locals.db;

    try {
        // Verificar que el documento existe y pertenece al usuario
        const docResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.file_name, d.file_path, d.file_type, d.owner_id
                 FROM documents d
                 WHERE d.document_id = ?`,
                [document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (docResults.length === 0) {
            console.log('❌ [SIGNATURES] Documento no encontrado');
            return res.status(404).json({
                ok: false,
                success: false,
                error: 'Documento no encontrado'
            });
        }

        const doc = docResults[0];

        if (doc.owner_id !== req.userId) {
            console.log('❌ [SIGNATURES] Acceso denegado');
            return res.status(403).json({
                ok: false,
                success: false,
                error: 'No tienes permiso para modificar este documento'
            });
        }

        console.log(`📋 Documento encontrado: ${doc.file_name}`);

        // Verificar si ya existe un signature_document para este document_id
        const existingResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT id FROM signature_documents WHERE document_id = ?`,
                [document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        let signatureDocId;

        if (existingResults.length > 0) {
            // Ya existe, usar ese ID y eliminar campos antiguos
            signatureDocId = existingResults[0].id;
            console.log(`📝 Actualizando signature_document existente: ${signatureDocId}`);

            // Eliminar campos antiguos
            await new Promise((resolve, reject) => {
                db.query(
                    `DELETE FROM signature_fields WHERE document_id = ?`,
                    [signatureDocId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            // Actualizar fecha de actualización
            await new Promise((resolve, reject) => {
                db.query(
                    `UPDATE signature_documents SET updated_at = NOW() WHERE id = ?`,
                    [signatureDocId],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

        } else {
            // Crear nuevo signature_document
            console.log('📝 Creando nuevo signature_document');

            const insertResult = await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO signature_documents
                     (user_id, document_id, file_name, file_path, num_pages, page_width, page_height, status)
                     VALUES (?, ?, ?, ?, 1, 595, 842, 'draft')`,
                    [req.userId, document_id, doc.file_name, doc.file_path],
                    (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                );
            });

            signatureDocId = insertResult.insertId;
            console.log(`✅ signature_document creado con ID: ${signatureDocId}`);
        }

        // Insertar los campos
        console.log(`📝 Insertando ${fields.length} campos...`);

        for (const field of fields) {
            const fieldId = crypto.randomUUID();

            await new Promise((resolve, reject) => {
                db.query(
                    `INSERT INTO signature_fields
                     (document_id, field_id, field_type, page, x, y, width, height, required)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        signatureDocId,
                        fieldId,
                        field.type || 'signature',
                        field.page || 1,
                        field.x,
                        field.y,
                        field.w,
                        field.h,
                        field.required ? 1 : 0
                    ],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        console.log('✅ Campos insertados exitosamente');

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'create_signature_document',
            entityType: 'signature_document',
            entityId: signatureDocId,
            details: {
                document_id,
                file_name: doc.file_name,
                num_fields: fields.length
            },
            req
        });

        res.json({
            ok: true,
            success: true,
            data: {
                signature_document_id: signatureDocId,
                document_id,
                num_fields: fields.length
            },
            message: 'Campos de firma guardados exitosamente'
        });

    } catch (error) {
        console.error('❌ [SIGNATURES] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al guardar campos de firma',
            message: error.message
        });
    }
});

/**
 * GET /api/signatures/documents/:document_id
 * Obtener el signature_document y sus campos de un documento
 */
router.get('/documents/:document_id', requireAuth, async (req, res) => {
    console.log(`\n📄 [SIGNATURES] GET /api/signatures/documents/${req.params.document_id}`);
    console.log(`   Usuario: ${req.userId}`);

    const documentId = parseInt(req.params.document_id);
    const db = req.app.locals.db;

    try {
        // Obtener signature_document
        const signatureDocResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT sd.*, d.title, d.file_name as original_file_name
                 FROM signature_documents sd
                 JOIN documents d ON sd.document_id = d.document_id
                 WHERE sd.document_id = ?`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        if (signatureDocResults.length === 0) {
            console.log('⚠️ [SIGNATURES] No hay campos de firma configurados para este documento');
            return res.json({
                ok: true,
                success: true,
                data: null,
                message: 'No hay campos configurados'
            });
        }

        const signatureDoc = signatureDocResults[0];

        // Verificar permisos
        if (signatureDoc.user_id !== req.userId) {
            console.log('❌ [SIGNATURES] Acceso denegado');
            return res.status(403).json({
                ok: false,
                success: false,
                error: 'No tienes permiso para acceder a este documento'
            });
        }

        // Obtener campos
        const fieldsResults = await new Promise((resolve, reject) => {
            db.query(
                `SELECT * FROM signature_fields WHERE document_id = ? ORDER BY page, y`,
                [signatureDoc.id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        console.log(`✅ [SIGNATURES] Encontrados ${fieldsResults.length} campos`);

        res.json({
            ok: true,
            success: true,
            data: {
                signature_document_id: signatureDoc.id,
                document_id: signatureDoc.document_id,
                title: signatureDoc.title,
                file_name: signatureDoc.file_name,
                status: signatureDoc.status,
                fields: fieldsResults.map(f => ({
                    id: f.field_id,
                    type: f.field_type,
                    page: f.page,
                    x: parseFloat(f.x),
                    y: parseFloat(f.y),
                    w: parseFloat(f.width),
                    h: parseFloat(f.height),
                    required: f.required === 1
                }))
            }
        });

    } catch (error) {
        console.error('❌ [SIGNATURES] Error:', error);
        res.status(500).json({
            ok: false,
            success: false,
            error: 'Error al obtener campos de firma',
            message: error.message
        });
    }
});

module.exports = router;
