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

/**
 * Convierte una fecha UTC a hora de Colombia (UTC-5)
 * @param {Date|string} date - Fecha en UTC
 * @returns {string} Fecha formateada en hora de Colombia
 */
function formatColombiaTime(date) {
    const d = new Date(date);
    // Convertir a hora de Colombia (UTC-5)
    return d.toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

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
                     (document_id, field_id, field_type, page, x, y, width, height, required, label)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        signatureDocId,
                        fieldId,
                        field.type || 'signature',
                        field.page || 1,
                        field.x,
                        field.y,
                        field.w,
                        field.h,
                        field.required ? 1 : 0,
                        field.label || null
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

// =============================================
// ENDPOINTS DE TRAZABILIDAD Y AUDITORÍA
// =============================================

/**
 * GET /api/signatures/documents/:id/events
 * Obtener todos los eventos de trazabilidad de un documento
 */
router.get('/documents/:id/events', requireAuth, async (req, res) => {
    console.log('\n📊 [TRAZABILIDAD] GET /api/signatures/documents/:id/events');

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        // Obtener eventos de la tabla signature_events
        const events = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    se.event_id,
                    se.event_type,
                    se.event_data,
                    se.ip_address,
                    se.user_agent,
                    se.created_at,
                    sr.role_name,
                    dr.email AS recipient_email,
                    dr.name AS recipient_name
                 FROM signature_events se
                 LEFT JOIN signer_roles sr ON se.role_id = sr.role_id
                 LEFT JOIN document_recipients dr ON se.recipient_id = dr.recipient_id
                 WHERE se.document_id = ?
                 ORDER BY se.created_at ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        // Obtener destinatarios con sus timestamps
        const recipients = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    dr.recipient_id,
                    dr.email,
                    dr.name,
                    dr.status,
                    dr.sent_at,
                    dr.opened_at,
                    dr.completed_at,
                    dr.ip_address,
                    dr.user_agent,
                    sr.role_name
                 FROM document_recipients dr
                 LEFT JOIN signer_roles sr ON dr.role_id = sr.role_id
                 WHERE dr.document_id = ?
                 ORDER BY dr.recipient_id ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        // Agregar eventos derivados de recipients que no estén en signature_events
        const derivedEvents = [];

        recipients.forEach(recipient => {
            // Verificar si ya existe un evento de firma para este destinatario
            const hasSignedEvent = events.some(
                e => e.event_type === 'document_signed' && e.recipient_email === recipient.email
            );

            // Si el destinatario completó pero no hay evento de firma, agregarlo
            if (recipient.completed_at && !hasSignedEvent) {
                derivedEvents.push({
                    event_type: 'document_signed',
                    created_at: recipient.completed_at,
                    recipient_email: recipient.email,
                    recipient_name: recipient.name,
                    role_name: recipient.role_name,
                    ip_address: recipient.ip_address,
                    user_agent: recipient.user_agent,
                    derived: true
                });

                // Agregar evento de QR generado
                derivedEvents.push({
                    event_type: 'qr_code_generated',
                    created_at: new Date(new Date(recipient.completed_at).getTime() + 1000), // 1 segundo después
                    recipient_email: recipient.email,
                    recipient_name: recipient.name,
                    role_name: recipient.role_name,
                    derived: true
                });
            }
        });

        // Combinar eventos reales y derivados
        const allEvents = [...events, ...derivedEvents];

        // Ordenar todos los eventos cronológicamente
        allEvents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        console.log(`✅ ${allEvents.length} eventos encontrados`);

        res.json({
            success: true,
            events: allEvents,
            recipients: recipients
        });

    } catch (error) {
        console.error('❌ [TRAZABILIDAD] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener eventos de trazabilidad'
        });
    }
});

/**
 * GET /api/signatures/documents/:id/audit-pdf
 * Generar PDF de auditoría con todos los eventos
 */
router.get('/documents/:id/audit-pdf', requireAuth, async (req, res) => {
    console.log('\n📄 [AUDIT-PDF] GET /api/signatures/documents/:id/audit-pdf');

    const documentId = parseInt(req.params.id);
    const db = req.app.locals.db;

    try {
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({
            margin: 50,
            size: 'LETTER'
        });

        // Headers para descarga del PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=auditoria-documento-${documentId}.pdf`);

        // Pipe del PDF a la respuesta
        doc.pipe(res);

        // Obtener información del documento
        const docInfo = await new Promise((resolve, reject) => {
            db.query(
                `SELECT d.document_id, d.file_name, d.created_at, u.first_name, u.last_name, u.email
                 FROM documents d
                 LEFT JOIN users u ON d.owner_id = u.user_id
                 WHERE d.document_id = ?`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results[0] || {});
                }
            );
        });

        // Obtener eventos de la tabla signature_events
        const events = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    se.event_type,
                    se.event_data,
                    se.ip_address,
                    se.user_agent,
                    se.created_at,
                    sr.role_name,
                    dr.email AS recipient_email,
                    dr.name AS recipient_name
                 FROM signature_events se
                 LEFT JOIN signer_roles sr ON se.role_id = sr.role_id
                 LEFT JOIN document_recipients dr ON se.recipient_id = dr.recipient_id
                 WHERE se.document_id = ?
                 ORDER BY se.created_at ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        // Obtener destinatarios para generar eventos derivados
        const recipients = await new Promise((resolve, reject) => {
            db.query(
                `SELECT
                    dr.recipient_id,
                    dr.email,
                    dr.name,
                    dr.status,
                    dr.sent_at,
                    dr.opened_at,
                    dr.completed_at,
                    dr.ip_address,
                    dr.user_agent,
                    sr.role_name
                 FROM document_recipients dr
                 LEFT JOIN signer_roles sr ON dr.role_id = sr.role_id
                 WHERE dr.document_id = ?
                 ORDER BY dr.recipient_id ASC`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve(results);
                }
            );
        });

        // Generar eventos derivados de recipients
        const derivedEvents = [];

        recipients.forEach(recipient => {
            // Evento de email enviado
            if (recipient.sent_at) {
                const hasSentEvent = events.some(
                    e => e.event_type === 'email_sent' && e.recipient_email === recipient.email
                );
                if (!hasSentEvent) {
                    derivedEvents.push({
                        event_type: 'email_sent',
                        created_at: recipient.sent_at,
                        recipient_email: recipient.email,
                        recipient_name: recipient.name,
                        role_name: recipient.role_name
                    });
                }
            }

            // Evento de documento abierto
            if (recipient.opened_at) {
                const hasOpenedEvent = events.some(
                    e => e.event_type === 'document_opened' && e.recipient_email === recipient.email
                );
                if (!hasOpenedEvent) {
                    derivedEvents.push({
                        event_type: 'document_opened',
                        created_at: recipient.opened_at,
                        recipient_email: recipient.email,
                        recipient_name: recipient.name,
                        role_name: recipient.role_name
                    });
                }
            }

            // Evento de documento firmado
            if (recipient.completed_at) {
                const hasSignedEvent = events.some(
                    e => e.event_type === 'document_signed' && e.recipient_email === recipient.email
                );
                if (!hasSignedEvent) {
                    derivedEvents.push({
                        event_type: 'document_signed',
                        created_at: recipient.completed_at,
                        recipient_email: recipient.email,
                        recipient_name: recipient.name,
                        role_name: recipient.role_name
                    });

                    // Evento de QR generado
                    derivedEvents.push({
                        event_type: 'qr_code_generated',
                        created_at: new Date(new Date(recipient.completed_at).getTime() + 1000),
                        recipient_email: recipient.email,
                        recipient_name: recipient.name,
                        role_name: recipient.role_name
                    });
                }
            }
        });

        // Combinar eventos reales y derivados
        const allEvents = [...events, ...derivedEvents];

        // Ordenar todos los eventos cronológicamente
        allEvents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // TÍTULO DEL PDF
        doc.fontSize(20).font('Helvetica-Bold').text('REPORTE DE AUDITORÍA', { align: 'center' });
        doc.moveDown();

        // INFORMACIÓN DEL DOCUMENTO
        doc.fontSize(14).font('Helvetica-Bold').text('Documento Original');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Título: ${docInfo.file_name || 'N/A'}`);
        doc.text(`ID: ${docInfo.document_id}`);
        doc.text(`Fecha y Hora: ${formatColombiaTime(docInfo.created_at)}`);
        doc.moveDown(2);

        // HASH SHA256 DEL DOCUMENTO FIRMADO
        doc.fontSize(14).font('Helvetica-Bold').text('Hash SHA256 del Documento Firmado');
        doc.moveDown(0.5);

        // Calcular hash del documento si existe el archivo
        const crypto = require('crypto');
        const fs = require('fs');
        const path = require('path');
        let documentHash = 'N/A';

        try {
            // Buscar el archivo del documento firmado final
            const signedDocQuery = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT file_path, signed_file_path FROM documents WHERE document_id = ?`,
                    [documentId],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve(results[0]);
                    }
                );
            });

            console.log('📄 [HASH] Query result:', signedDocQuery);

            if (signedDocQuery) {
                // Intentar primero con signed_file_path (documento sellado con PKI)
                let filePath = null;

                if (signedDocQuery.signed_file_path) {
                    // Subir 2 niveles desde controllers/ para llegar a la raíz del proyecto
                    filePath = path.resolve(__dirname, '../..', signedDocQuery.signed_file_path);
                    console.log('📄 [HASH] Using signed_file_path:', filePath);
                } else if (signedDocQuery.file_path) {
                    // Si no hay signed_file_path, usar file_path
                    filePath = path.resolve(__dirname, '../..', signedDocQuery.file_path);
                    console.log('📄 [HASH] Using file_path:', filePath);
                }

                console.log('📄 [HASH] File exists?', filePath ? fs.existsSync(filePath) : 'No path');

                if (filePath && fs.existsSync(filePath)) {
                    const fileBuffer = fs.readFileSync(filePath);
                    documentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                    console.log('✅ [HASH] Calculated:', documentHash);
                } else {
                    console.log('❌ [HASH] File not found at:', filePath);
                }
            }
        } catch (error) {
            console.error('❌ [HASH] Error calculando hash:', error);
        }

        doc.fontSize(9).font('Courier');
        doc.text(documentHash, { width: 500 });
        doc.moveDown(2);

        // INFORMACIÓN DE LOS PARTICIPANTES
        doc.fontSize(14).font('Helvetica-Bold').text('Información de los Participantes');
        doc.moveDown(0.5);

        recipients.forEach((recipient, index) => {
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text(`${recipient.email}`, { underline: true });
            doc.fontSize(10).font('Helvetica');
            doc.text(`Correo: ${recipient.email}`);
            doc.text(`Nombre: ${recipient.name || recipient.email}`);
            doc.text(`Estado: ${recipient.status}`);
            if (recipient.completed_at) {
                doc.text(`Fecha de Aprobación: ${formatColombiaTime(recipient.completed_at)}`);
            }
            doc.moveDown();
        });

        doc.moveDown();

        // PRUEBA DE TRAZABILIDAD
        doc.fontSize(14).font('Helvetica-Bold').text('Prueba de Trazabilidad');
        doc.moveDown();

        const eventTypeLabels = {
            'document_created': 'Documento creado',
            'recipient_added': 'Destinatario agregado',
            'email_sent': 'Email enviado',
            'document_opened': 'Documento abierto',
            'field_completed': 'Campo completado',
            'document_signed': 'Documento firmado',
            'document_rejected': 'Documento rechazado',
            'reminder_sent': 'Recordatorio enviado',
            'document_completed': 'Documento completado',
            'document_voided': 'Documento anulado',
            'qr_code_generated': 'Código QR generado'
        };

        allEvents.forEach((event, index) => {
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text(`${index + 1}. ${eventTypeLabels[event.event_type] || event.event_type}`, { continued: false });

            doc.font('Helvetica');
            doc.text(`   Fecha: ${formatColombiaTime(event.created_at)}`);

            if (event.recipient_name || event.recipient_email) {
                doc.text(`   Destinatario: ${event.recipient_name || event.recipient_email}`);
            }

            if (event.role_name) {
                doc.text(`   Rol: ${event.role_name}`);
            }

            if (event.ip_address) {
                doc.text(`   IP: ${event.ip_address}`);
            }

            doc.moveDown(0.5);
        });

        // FOOTER
        doc.moveDown(2);
        doc.fontSize(8).font('Helvetica-Oblique');
        doc.text(`Reporte generado el ${new Date().toLocaleString('es-ES')}`, { align: 'center' });
        doc.text('FirmaLegal Online - Sistema de Firma Electrónica', { align: 'center' });

        // Finalizar PDF
        doc.end();

        console.log('✅ PDF de auditoría generado');

    } catch (error) {
        console.error('❌ [AUDIT-PDF] Error:', error);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Error al generar PDF de auditoría'
            });
        }
    }
});

module.exports = router;
