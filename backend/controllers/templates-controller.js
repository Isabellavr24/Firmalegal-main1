/**
 * Templates Controller
 *
 * Maneja operaciones relacionadas con plantillas PDF:
 * - Upload de plantillas con AcroForm
 * - Parseo y almacenamiento de campos
 * - Consulta de templates y sus campos
 *
 * @module controllers/templates-controller
 */

const { parseTemplateFields, getPDFMetadata } = require('../lib/pdf/acroform-parser');
const { query } = require('../lib/db-utils');
const path = require('path');
const fs = require('fs').promises;

/**
 * Upload de plantilla PDF y extracción de campos AcroForm
 *
 * POST /api/templates/upload
 *
 * Body (multipart/form-data):
 *   - template: archivo PDF
 *   - name: nombre descriptivo (opcional)
 *   - description: descripción (opcional)
 */
async function uploadTemplate(req, res) {
    const db = req.app.locals.db;

    try {
        // 1. Validar que se subió un archivo
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No se recibió ningún archivo PDF'
            });
        }

        const pdfPath = req.file.path;
        const userId = req.userId || 1; // Usar userId del middleware de auth
        const templateName = req.body.name || req.file.originalname;
        const description = req.body.description || null;

        console.log(`[Templates] Procesando plantilla: ${templateName}`);
        console.log(`[Templates] Usuario: ${userId}`);

        // 2. Validar que es un PDF válido y tiene campos
        let fields;
        let metadata;

        try {
            metadata = await getPDFMetadata(pdfPath);

            if (!metadata.hasForm) {
                // Eliminar archivo subido
                await fs.unlink(pdfPath);
                return res.status(400).json({
                    success: false,
                    error: 'El PDF no contiene campos de formulario (AcroForm). Por favor, sube un PDF con campos editables.'
                });
            }

            fields = await parseTemplateFields(pdfPath);

            if (fields.length === 0) {
                await fs.unlink(pdfPath);
                return res.status(400).json({
                    success: false,
                    error: 'No se encontraron campos en el PDF'
                });
            }

        } catch (parseError) {
            // Eliminar archivo si hay error
            try {
                await fs.unlink(pdfPath);
            } catch(e) {}
            return res.status(400).json({
                success: false,
                error: `Error al parsear PDF: ${parseError.message}`
            });
        }

        // 3. Crear registro en documents usando helper query
        const docResult = await query(db,
            `INSERT INTO documents
             (name, file_path, uploaded_by, is_template, has_acroform, acroform_parsed_at, created_at)
             VALUES (?, ?, ?, TRUE, TRUE, NOW(), NOW())`,
            [templateName, pdfPath, userId]
        );

        const templateId = docResult.insertId;

        console.log(`[Templates] Documento creado con ID: ${templateId}`);

        // 4. Guardar campos en template_fields
        for (let index = 0; index < fields.length; index++) {
            const field = fields[index];
            await query(db,
                `INSERT INTO template_fields
                 (template_id, field_key, field_type, field_label, default_value, order_index, page_number, position_x, position_y, width, height, font_size, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    templateId,
                    field.name,
                    field.type,
                    field.label || field.name,
                    field.defaultValue,
                    index,
                    field.page_number || 1,
                    field.position_x || null,
                    field.position_y || null,
                    field.width || null,
                    field.height || null,
                    field.font_size || 12
                ]
            );
        }

        console.log(`[Templates] ${fields.length} campos guardados`);

        // 5. Respuesta exitosa
        res.json({
            success: true,
            data: {
                templateId: templateId,
                name: templateName,
                description: description,
                pageCount: metadata.pageCount,
                fieldCount: fields.length,
                fields: fields.map(f => ({
                    field_key: f.name,
                    field_type: f.type,
                    field_label: f.label,
                    default_value: f.defaultValue
                }))
            }
        });

    } catch (error) {
        console.error('[Templates] Error en uploadTemplate:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno al procesar la plantilla',
            details: error.message
        });
    }
}

/**
 * Obtiene lista de plantillas disponibles
 *
 * GET /api/templates
 *
 * Query params:
 *   - page: número de página (default 1)
 *   - limit: resultados por página (default 20)
 */
async function getTemplates(req, res) {
    const db = req.app.locals.db;

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const userId = req.userId || 1;

        // Mostrar todas las plantillas (no filtrar por usuario para pruebas)
        const templates = await query(db,
            `SELECT
                d.document_id as id,
                d.title as name,
                d.file_path,
                d.is_template,
                d.created_at,
                COUNT(tf.id) as field_count
             FROM documents d
             LEFT JOIN template_fields tf ON d.document_id = tf.template_id
             WHERE d.is_template = 1
             GROUP BY d.document_id, d.title, d.file_path, d.is_template, d.created_at
             ORDER BY d.created_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // Contar total para paginación
        const countResult = await query(db,
            `SELECT COUNT(*) as total
             FROM documents
             WHERE is_template = TRUE`,
            []
        );

        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            data: templates,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });

    } catch (error) {
        console.error('[Templates] Error en getTemplates:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener plantillas'
        });
    }
}

/**
 * Obtiene detalles de una plantilla específica con sus campos
 *
 * GET /api/templates/:id
 */
async function getTemplateById(req, res) {
    const db = req.app.locals.db;

    try {
        const templateId = req.params.id;
        
        console.log(`📥 [Templates API] GET /api/templates/${templateId}`);

        // PRIMERO: Verificar si el documento existe (sin filtro de is_template)
        const checkDoc = await query(db,
            `SELECT document_id, title, is_template, owner_id, file_path
             FROM documents 
             WHERE document_id = ?`,
            [templateId]
        );

        console.log(`🔍 [Templates API] Documento encontrado:`, checkDoc.length > 0 ? checkDoc[0] : 'NO EXISTE');

        if (checkDoc.length === 0) {
            console.error(`❌ [Templates API] Documento ${templateId} NO EXISTE en la base de datos`);
            return res.status(404).json({
                success: false,
                error: 'Documento no encontrado en la base de datos'
            });
        }

        const docInfo = checkDoc[0];
        
        if (!docInfo.is_template) {
            console.warn(`⚠️ [Templates API] Documento ${templateId} existe pero is_template=${docInfo.is_template}. Auto-marcando como plantilla...`);
            
            // Auto-marcar como plantilla
            await query(db,
                `UPDATE documents SET is_template = 1 WHERE document_id = ?`,
                [templateId]
            );
            
            console.log(`✅ [Templates API] Documento ${templateId} marcado automáticamente como plantilla`);
        }

        // Obtener template con JOIN
        const templates = await query(db,
            `SELECT
                d.*,
                CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                u.email as created_by_email
             FROM documents d
             LEFT JOIN users u ON d.owner_id = u.user_id
             WHERE d.document_id = ?`,
            [templateId]
        );

        console.log(`🔍 [Templates API] Template con JOIN: ${templates.length} resultados`);

        if (templates.length === 0) {
            console.error(`❌ [Templates API] Error inesperado: documento existe pero JOIN falló`);
            return res.status(500).json({
                success: false,
                error: 'Error al obtener datos de la plantilla'
            });
        }

        const template = templates[0];
        console.log(`✅ [Templates API] Plantilla encontrada:`, {
            id: template.document_id,
            title: template.title,
            is_template: template.is_template,
            owner_id: template.owner_id
        });

        // Obtener campos desde document_fields (tabla correcta del sistema)
        const fields = await query(db,
            `SELECT
                field_id as id,
                COALESCE(field_label, CONCAT(field_type, '_', field_id)) as name,
                field_type as type,
                COALESCE(field_label, CONCAT(field_type, '_', field_id)) as field_label,
                COALESCE(field_label, CONCAT(field_type, '_', field_id)) as field_key,
                field_type,
                page_number,
                x_position as position_x,
                y_position as position_y,
                width,
                height,
                required as is_required
             FROM document_fields
             WHERE document_id = ?
             ORDER BY page_number ASC, field_id ASC`,
            [templateId]
        );

        // ✅ LIMPIAR guiones bajos de los labels antes de enviar al frontend
        fields.forEach(field => {
            if (field.field_label && typeof field.field_label === 'string') {
                const cleanLabel = field.field_label
                    .replace(/_+/g, '')     // Eliminar todos los guiones bajos
                    .replace(/\s+/g, ' ')   // Normalizar espacios múltiples
                    .trim();                // Eliminar espacios al inicio/final

                // Solo actualizar si el label cambió
                if (cleanLabel !== field.field_label && !field.field_label.startsWith('text_') && !field.field_label.startsWith('signature_')) {
                    field.name = cleanLabel;
                    field.field_label = cleanLabel;
                    field.field_key = cleanLabel;
                }
            }
        });

        // ✅ HACER LABELS ÚNICOS agregando sufijo numérico a duplicados
        const labelCounts = {};
        const textFields = fields.filter(f => f.field_type === 'text' || f.field_type === 'date' || f.field_type === 'number');

        textFields.forEach(field => {
            const baseLabel = field.field_label || field.field_key || `Campo ${field.id}`;

            // Contar cuántas veces aparece este label
            if (!labelCounts[baseLabel]) {
                labelCounts[baseLabel] = 0;
            }
            labelCounts[baseLabel]++;

            // Si es la segunda aparición o más, agregar sufijo numérico
            if (labelCounts[baseLabel] > 1) {
                const uniqueLabel = `${baseLabel} ${labelCounts[baseLabel]}`;
                field.name = uniqueLabel;
                field.field_label = uniqueLabel;
                field.field_key = uniqueLabel;
                console.log(`🔄 [Templates API] Label duplicado detectado: "${baseLabel}" → "${uniqueLabel}"`);
            }
        });

        console.log(`📋 [Templates API] Campos encontrados: ${fields.length}`);
        if (fields.length > 0) {
            console.log(`📝 [Templates API] Lista de campos:`, fields.map(f => `${f.field_label || f.type} (page ${f.page_number})`).join(', '));
        }

        // Obtener partes/roles del documento desde document_parts
        const parts = await query(db,
            `SELECT
                part_id as id,
                role_name as name,
                order_position as position,
                color
             FROM document_parts
             WHERE document_id = ?
             ORDER BY order_position ASC`,
            [templateId]
        );

        console.log(`👥 [Templates API] Partes/roles encontradas: ${parts.length}`);
        if (parts.length > 0) {
            console.log(`📝 [Templates API] Lista de partes:`, parts.map(p => p.name).join(', '));
        }

        res.json({
            success: true,
            data: {
                ...template,
                fields: fields,
                parts: parts
            }
        });

        console.log(`✅ [Templates API] Respuesta enviada exitosamente`);

    } catch (error) {
        console.error('❌ [Templates API] Error en getTemplateById:', error);
        console.error('🔴 [Templates API] Stack trace:', error.stack);
        console.error('🔴 [Templates API] Error name:', error.name);
        console.error('🔴 [Templates API] Error message:', error.message);
        console.error('🔴 [Templates API] SQL Error Code:', error.code);
        console.error('🔴 [Templates API] SQL Error No:', error.errno);
        
        res.status(500).json({
            success: false,
            error: 'Error al obtener detalles de la plantilla',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            sqlError: process.env.NODE_ENV === 'development' ? error.code : undefined
        });
    }
}

/**
 * Obtiene solo los campos de una plantilla
 *
 * GET /api/templates/:id/fields
 */
async function getTemplateFields(req, res) {
    const db = req.app.locals.db;

    try {
        const templateId = req.params.id;

        // Verificar que la plantilla existe
        const templates = await query(db,
            `SELECT document_id FROM documents WHERE document_id = ? AND is_template = TRUE`,
            [templateId]
        );

        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        // Obtener campos
        const fields = await query(db,
            `SELECT
                id,
                field_key,
                field_type,
                field_label,
                default_value,
                is_required,
                order_index,
                validation_rule,
                page_number,
                position_x,
                position_y,
                width,
                height,
                font_size
             FROM template_fields
             WHERE template_id = ?
             ORDER BY page_number ASC, order_index ASC, field_key ASC`,
            [templateId]
        );

        res.json({
            success: true,
            data: fields
        });

    } catch (error) {
        console.error('[Templates] Error en getTemplateFields:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener campos'
        });
    }
}

/**
 * Actualiza información de un campo específico
 *
 * PUT /api/templates/fields/:fieldId
 *
 * Body:
 *   - field_label: nueva etiqueta (opcional)
 *   - is_required: booleano (opcional)
 *   - validation_rule: regex o regla (opcional)
 */
async function updateTemplateField(req, res) {
    const db = req.app.locals.db;

    try {
        const fieldId = req.params.fieldId;
        const { field_label, is_required, validation_rule, order_index } = req.body;

        const updates = [];
        const values = [];

        if (field_label !== undefined) {
            updates.push('field_label = ?');
            values.push(field_label);
        }

        if (is_required !== undefined) {
            updates.push('is_required = ?');
            values.push(is_required ? 1 : 0);
        }

        if (validation_rule !== undefined) {
            updates.push('validation_rule = ?');
            values.push(validation_rule);
        }

        if (order_index !== undefined) {
            updates.push('order_index = ?');
            values.push(order_index);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No se especificaron campos a actualizar'
            });
        }

        values.push(fieldId);

        await query(db,
            `UPDATE template_fields
             SET ${updates.join(', ')}, updated_at = NOW()
             WHERE id = ?`,
            values
        );

        res.json({
            success: true,
            message: 'Campo actualizado correctamente'
        });

    } catch (error) {
        console.error('[Templates] Error en updateTemplateField:', error);
        res.status(500).json({
            success: false,
            error: 'Error al actualizar campo'
        });
    }
}

/**
 * Elimina una plantilla y sus campos asociados
 *
 * DELETE /api/templates/:id
 */
async function deleteTemplate(req, res) {
    const db = req.app.locals.db;

    try {
        const templateId = req.params.id;
        const userId = req.userId || 1;

        // Verificar propiedad
        const templates = await query(db,
            `SELECT id, file_path, uploaded_by
             FROM documents
             WHERE id = ? AND is_template = TRUE`,
            [templateId]
        );

        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        const template = templates[0];

        // Verificar permisos
        if (template.uploaded_by !== userId) {
            return res.status(403).json({
                success: false,
                error: 'No tienes permisos para eliminar esta plantilla'
            });
        }

        // Verificar que no esté en uso
        const jobsUsing = await query(db,
            `SELECT COUNT(*) as count
             FROM bulk_jobs
             WHERE template_id = ? AND status IN ('processing', 'ready')`,
            [templateId]
        );

        if (jobsUsing[0].count > 0) {
            return res.status(400).json({
                success: false,
                error: 'No se puede eliminar: la plantilla está siendo usada en trabajos activos'
            });
        }

        // Eliminar archivo físico
        try {
            await fs.unlink(template.file_path);
        } catch (unlinkError) {
            console.warn('[Templates] No se pudo eliminar archivo físico:', unlinkError.message);
        }

        // Eliminar de BD (CASCADE eliminará template_fields)
        await query(db, `DELETE FROM documents WHERE id = ?`, [templateId]);

        res.json({
            success: true,
            message: 'Plantilla eliminada correctamente'
        });

    } catch (error) {
        console.error('[Templates] Error en deleteTemplate:', error);
        res.status(500).json({
            success: false,
            error: 'Error al eliminar plantilla'
        });
    }
}

/**
 * Guarda campos visuales desde el editor (DocuSeal-style)
 *
 * POST /api/templates/:id/fields
 *
 * Body:
 *   - fields: array de campos con coordenadas
 *     [
 *       {
 *         field_key: 'nombre_cliente',
 *         field_label: 'Nombre del Cliente',
 *         field_type: 'text',
 *         page_number: 1,
 *         position_x: 100,
 *         position_y: 200,
 *         width: 200,
 *         height: 30,
 *         font_size: 12
 *       }
 *     ]
 */
async function saveVisualFields(req, res) {
    const db = req.app.locals.db;

    try {
        const templateId = req.params.id;
        const { fields } = req.body;

        if (!fields || !Array.isArray(fields)) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere un array de campos'
            });
        }

        // Verificar que la plantilla existe y pertenece al usuario
        const templates = await query(db,
            `SELECT document_id, uploaded_by FROM documents WHERE document_id = ? AND is_template = TRUE`,
            [templateId]
        );

        if (templates.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        // Eliminar campos existentes
        await query(db, `DELETE FROM template_fields WHERE template_id = ?`, [templateId]);

        // Insertar nuevos campos
        for (let index = 0; index < fields.length; index++) {
            const field = fields[index];

            await query(db,
                `INSERT INTO template_fields
                 (template_id, field_key, field_type, field_label, page_number, position_x, position_y, width, height, font_size, order_index, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    templateId,
                    field.field_key,
                    field.field_type || 'text',
                    field.field_label || field.field_key,
                    field.page_number || 1,
                    field.position_x,
                    field.position_y,
                    field.width,
                    field.height,
                    field.font_size || 12,
                    index
                ]
            );
        }

        console.log(`[Templates] ${fields.length} campos visuales guardados para plantilla ${templateId}`);

        res.json({
            success: true,
            message: 'Campos guardados exitosamente',
            data: {
                template_id: templateId,
                fields_saved: fields.length
            }
        });

    } catch (error) {
        console.error('[Templates] Error en saveVisualFields:', error);
        res.status(500).json({
            success: false,
            error: 'Error al guardar campos visuales',
            details: error.message
        });
    }
}

/**
 * Rellenar plantilla con datos dinámicos
 * 
 * POST /api/documents/fill-template
 * 
 * Body:
 *   - templateId: ID de la plantilla
 *   - fieldData: objeto con { fieldId: valor }
 */
async function fillTemplate(req, res) {
    const db = req.app.locals.db;
    const userId = req.userId;
    const { templateId, fieldData } = req.body;

    try {
        console.log('📝 [FILL-TEMPLATE] Guardando valores de plantilla:', templateId);
        console.log('📝 [FILL-TEMPLATE] Datos recibidos:', fieldData);

        // Validar datos
        if (!templateId) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere templateId'
            });
        }

        if (!fieldData || Object.keys(fieldData).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren datos para guardar'
            });
        }

        // Verificar que la plantilla existe
        const [template] = await query(db,
            'SELECT * FROM documents WHERE document_id = ? AND is_template = 1',
            [templateId]
        );

        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        console.log('📄 [FILL-TEMPLATE] Plantilla encontrada:', template.title);

        // Crear o actualizar la tabla de valores de campos (si no existe)
        await query(db, `
            CREATE TABLE IF NOT EXISTS document_field_values (
                value_id INT AUTO_INCREMENT PRIMARY KEY,
                document_id INT NOT NULL,
                field_id INT NOT NULL,
                field_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
                FOREIGN KEY (field_id) REFERENCES document_fields(field_id) ON DELETE CASCADE,
                UNIQUE KEY unique_doc_field (document_id, field_id)
            )
        `);

        // Guardar cada valor de campo
        for (const [fieldId, value] of Object.entries(fieldData)) {
            if (value && value.trim()) {
                await query(db, `
                    INSERT INTO document_field_values (document_id, field_id, field_value)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        field_value = VALUES(field_value),
                        updated_at = CURRENT_TIMESTAMP
                `, [templateId, fieldId, value.trim()]);
                
                console.log(`💾 [FILL-TEMPLATE] Guardado campo ${fieldId}: "${value}"`);
            }
        }

        console.log('✅ [FILL-TEMPLATE] Todos los valores guardados en la plantilla');

        res.json({
            success: true,
            message: 'Valores guardados exitosamente en la plantilla',
            data: {
                templateId: templateId,
                fieldsSaved: Object.keys(fieldData).length
            }
        });

    } catch (error) {
        console.error('❌ [FILL-TEMPLATE] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al guardar valores',
            details: error.message
        });
    }
}

/**
 * Extraer etiquetas de campos del PDF
 * Analiza el texto del PDF para encontrar etiquetas cerca de los campos
 * 
 * GET /api/templates/:id/extract-labels
 */
async function extractFieldLabels(req, res) {
    const db = req.app.locals.db;
    const templateId = req.params.id;

    try {
        // Obtener la plantilla
        const [template] = await query(db,
            'SELECT * FROM documents WHERE document_id = ? AND is_template = 1',
            [templateId]
        );

        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Plantilla no encontrada'
            });
        }

        // Obtener campos CON sus field_label existentes
        const fields = await query(db,
            `SELECT field_id, x_position, y_position, page_number, field_label
             FROM document_fields
             WHERE document_id = ? AND field_type = 'text'
             ORDER BY page_number, y_position`,
            [templateId]
        );

        console.log(`📋 [EXTRACT-LABELS] Encontrados ${fields.length} campos de texto`);

        // Verificar si se fuerza la re-extracción
        const forceExtraction = req.query.force === 'true';
        console.log(`🔧 [EXTRACT-LABELS] Modo forzado: ${forceExtraction ? 'SÍ' : 'NO'}`);

        // PASO 1: Verificar si ya existen etiquetas en la BD (que NO sean text_XXXX)
        const labelsFromDB = {};
        let needsExtraction = false;

        if (!forceExtraction) {
            for (const field of fields) {
                if (field.field_label && !field.field_label.startsWith('text_') && field.field_label.trim() !== '') {
                    labelsFromDB[field.field_id] = field.field_label;
                    console.log(`   ✅ Campo ${field.field_id} ya tiene label en BD: "${field.field_label}"`);
                } else {
                    needsExtraction = true;
                    console.log(`   ⚠️ Campo ${field.field_id} necesita extracción (label actual: "${field.field_label || 'vacío'}")`);
                }
            }

            // Si todos los campos ya tienen etiquetas válidas, retornarlas sin extraer
            if (!needsExtraction) {
                console.log('✅ [EXTRACT-LABELS] Todos los campos ya tienen etiquetas válidas en BD');

                // ✅ HACER LABELS ÚNICOS agregando sufijo numérico a duplicados
                console.log('🔄 [EXTRACT-LABELS] Verificando labels duplicados en labels de BD...');
                const labelCounts = {};
                const uniqueLabelsFromDB = {};

                // Primero, contar cuántas veces aparece cada label
                Object.entries(labelsFromDB).forEach(([fieldId, label]) => {
                    if (!labelCounts[label]) {
                        labelCounts[label] = [];
                    }
                    labelCounts[label].push(fieldId);
                });

                // Luego, agregar sufijo numérico a los duplicados
                Object.entries(labelCounts).forEach(([label, fieldIds]) => {
                    if (fieldIds.length === 1) {
                        // Label único, mantenerlo como está
                        uniqueLabelsFromDB[fieldIds[0]] = label;
                    } else {
                        // Label duplicado, agregar sufijo numérico
                        fieldIds.forEach((fieldId, index) => {
                            const uniqueLabel = index === 0 ? label : `${label} ${index + 1}`;
                            uniqueLabelsFromDB[fieldId] = uniqueLabel;
                            if (index > 0) {
                                console.log(`   🔄 Label duplicado en BD: "${label}" → "${uniqueLabel}" (campo ${fieldId})`);
                            }
                        });
                    }
                });

                console.log('✅ [EXTRACT-LABELS] Labels únicos generados desde BD\n');

                return res.json({
                    success: true,
                    data: {
                        labels: uniqueLabelsFromDB,
                        updatedCount: 0,
                        source: 'database'
                    }
                });
            }
        } else {
            console.log('🔄 [EXTRACT-LABELS] Forzando re-extracción de TODOS los campos...');
        }

        console.log('🔄 [EXTRACT-LABELS] Extrayendo etiquetas del PDF...');

        const fs = require('fs');
        const path = require('path');
        const pdfParse = require('pdf-parse');

        // Leer PDF - remover slash inicial si existe y subir dos niveles (backend/../..)
        let filePath = template.file_path;
        if (filePath.startsWith('/')) {
            filePath = filePath.substring(1);
        }
        const pdfPath = path.join(__dirname, '..', '..', filePath);
        console.log('📂 [EXTRACT-LABELS] Ruta del PDF:', pdfPath);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(pdfPath)) {
            console.error('❌ [EXTRACT-LABELS] Archivo no encontrado:', pdfPath);
            return res.status(404).json({
                success: false,
                error: 'Archivo PDF no encontrado'
            });
        }

        // Extraer texto del PDF con coordenadas usando pdfjs-dist
        console.log('🔄 [EXTRACT-LABELS] Extrayendo texto con coordenadas usando pdfjs-dist...');
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

        const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const pdfDocument = await loadingTask.promise;

        console.log(`📄 [EXTRACT-LABELS] PDF cargado: ${pdfDocument.numPages} páginas`);

        // Extraer texto con coordenadas de todas las páginas
        const textByPage = {};

        for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
            const page = await pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });
            const textContent = await page.getTextContent();

            const textItems = textContent.items.map(item => ({
                text: item.str.trim(),
                x: item.transform[4], // X position
                y: viewport.height - item.transform[5], // Y position (invertida)
                width: item.width,
                height: item.height
            })).filter(item => item.text.length > 0);

            textByPage[pageNum] = textItems;
            console.log(`   Página ${pageNum}: ${textItems.length} elementos de texto`);
        }

        // Mapear campos con etiquetas basándose en proximidad espacial real
        // Comenzar con las etiquetas que ya teníamos en la BD
        const labels = { ...labelsFromDB };

        console.log('\n🔍 [EXTRACT-LABELS] Mapeando campos con texto cercano...');
        console.log(`   Total de campos: ${fields.length}`);
        console.log(`   Etiquetas ya en BD: ${Object.keys(labelsFromDB).length}`);

        for (const field of fields) {
            // Si ya tenemos la etiqueta de la BD, saltarla
            if (labelsFromDB[field.field_id]) {
                console.log(`\n--- Campo ${field.field_id} ---`);
                console.log(`   ✅ Usando etiqueta existente de BD: "${labelsFromDB[field.field_id]}"`);
                continue;
            }

            const pageNum = field.page_number || 1;
            const fieldX = parseFloat(field.x_position);
            const fieldY = parseFloat(field.y_position);

            console.log(`\n--- Campo ${field.field_id} ---`);
            console.log(`   Página: ${pageNum}, X: ${fieldX}, Y: ${fieldY}`);

            if (!textByPage[pageNum]) {
                console.log(`   ⚠️ Página ${pageNum} no tiene texto extraído`);
                labels[field.field_id] = `Campo ${field.field_id}`;
                continue;
            }

            const textItems = textByPage[pageNum];

            // Buscar el texto MÁS CERCANO a la IZQUIERDA del campo
            // Buscar en esquina superior izquierda o inferior izquierda
            const Y_TOLERANCE = 30;  // Tolerancia amplia para encontrar texto arriba o abajo a la izquierda
            const MAX_X_DISTANCE = 300; // Máximo 300 píxeles a la izquierda

            const candidates = textItems.filter(item => {
                const toTheLeft = item.x < fieldX && (fieldX - item.x) <= MAX_X_DISTANCE;
                const verticallyClose = Math.abs(item.y - fieldY) <= Y_TOLERANCE;
                return toTheLeft && verticallyClose;
            });

            // Ordenar por distancia horizontal (más cercano a la izquierda primero)
            // Priorizar la distancia horizontal sobre la vertical
            candidates.sort((a, b) => {
                const distXA = fieldX - a.x;  // Distancia horizontal
                const distXB = fieldX - b.x;
                return distXA - distXB;  // El más cercano horizontalmente gana
            });

            let foundLabel = null;

            if (candidates.length > 0) {
                console.log(`   🔍 Encontrados ${candidates.length} candidatos a la izquierda:`);

                // Mostrar los primeros 5 candidatos
                for (let i = 0; i < Math.min(5, candidates.length); i++) {
                    const c = candidates[i];
                    const distX = fieldX - c.x;
                    const distY = Math.abs(fieldY - c.y);
                    console.log(`      ${i + 1}. "${c.text}" (X: ${c.x.toFixed(2)}, Y: ${c.y.toFixed(2)}, DistX: ${distX.toFixed(2)}, DistY: ${distY.toFixed(2)})`);
                }

                // Tomar el texto MÁS CERCANO horizontalmente
                foundLabel = candidates[0].text.trim();

                // Solo buscar el siguiente candidato si el texto son ÚNICAMENTE guiones bajos
                if (!foundLabel || /^_+$/.test(foundLabel)) {
                    console.log(`   ⚠️ Texto "${foundLabel}" es solo guiones bajos, buscando siguiente candidato...`);

                    // Buscar en los siguientes candidatos
                    for (let i = 1; i < Math.min(candidates.length, 5); i++) {
                        const nextText = candidates[i].text.trim();
                        // Tomar cualquier texto que no sea solo guiones bajos
                        if (nextText && !/^_+$/.test(nextText)) {
                            foundLabel = nextText;
                            console.log(`   ✅ Encontrado candidato ${i + 1}: "${foundLabel}"`);
                            break;
                        }
                    }
                }

                // 🧹 LIMPIEZA PROFESIONAL: Quitar guiones bajos al final (líneas de relleno del PDF)
                // Mantener puntos, dos puntos, acentos, etc. Solo limpiar los guiones bajos de relleno
                const cleanLabel = foundLabel
                    .replace(/_+$/g, '')           // Quitar guiones bajos al FINAL
                    .replace(/\s+$/g, '')          // Quitar espacios en blanco al final
                    .trim();

                console.log(`   ✅ Etiqueta seleccionada: "${foundLabel}" → Limpia: "${cleanLabel}"`);
                foundLabel = cleanLabel;
            } else {
                foundLabel = `Campo ${field.field_id}`;
                console.log(`   ⚠️ Sin texto cercano a la izquierda, usando fallback: "${foundLabel}"`);
            }

            labels[field.field_id] = foundLabel;
        }

        console.log('\n📋 [EXTRACT-LABELS] ===== RESUMEN DE ETIQUETAS =====');
        Object.entries(labels).forEach(([fieldId, label]) => {
            console.log(`   Campo ${fieldId} → "${label}"`);
        });
        console.log('=====================================\n');

        // 🔥 Actualizar field_label en la base de datos
        console.log('💾 [EXTRACT-LABELS] Actualizando labels en la base de datos...');
        let updatedCount = 0;

        for (const [fieldId, label] of Object.entries(labels)) {
            // Si es forzado, actualizar TODOS. Si no, solo los que no estaban en BD
            if (forceExtraction || !labelsFromDB[fieldId]) {
                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE document_fields SET field_label = ? WHERE field_id = ?',
                        [label, fieldId],
                        (err, result) => {
                            if (err) {
                                console.error(`   ❌ Error actualizando campo ${fieldId}:`, err);
                                reject(err);
                            } else {
                                updatedCount++;
                                console.log(`   ✅ Campo ${fieldId} actualizado con label "${label}"`);
                                resolve(result);
                            }
                        }
                    );
                });
            } else {
                console.log(`   ⏭️ Campo ${fieldId} ya tenía label, no se actualiza`);
            }
        }

        console.log(`✅ [EXTRACT-LABELS] ${updatedCount} campos actualizados en BD\n`);

        // ✅ HACER LABELS ÚNICOS agregando sufijo numérico a duplicados
        console.log('🔄 [EXTRACT-LABELS] Verificando labels duplicados...');
        const labelCounts = {};
        const uniqueLabels = {};

        // Primero, contar cuántas veces aparece cada label
        Object.entries(labels).forEach(([fieldId, label]) => {
            if (!labelCounts[label]) {
                labelCounts[label] = [];
            }
            labelCounts[label].push(fieldId);
        });

        // Luego, agregar sufijo numérico a los duplicados
        Object.entries(labelCounts).forEach(([label, fieldIds]) => {
            if (fieldIds.length === 1) {
                // Label único, mantenerlo como está
                uniqueLabels[fieldIds[0]] = label;
            } else {
                // Label duplicado, agregar sufijo numérico
                fieldIds.forEach((fieldId, index) => {
                    const uniqueLabel = index === 0 ? label : `${label} ${index + 1}`;
                    uniqueLabels[fieldId] = uniqueLabel;
                    if (index > 0) {
                        console.log(`   🔄 Label duplicado: "${label}" → "${uniqueLabel}" (campo ${fieldId})`);
                    }
                });
            }
        });

        console.log('✅ [EXTRACT-LABELS] Labels únicos generados\n');

        res.json({
            success: true,
            data: {
                labels: uniqueLabels,
                updatedCount: updatedCount
            }
        });

    } catch (error) {
        console.error('❌ [EXTRACT-LABELS] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al extraer etiquetas',
            details: error.message
        });
    }
}

module.exports = {
    uploadTemplate,
    getTemplates,
    getTemplateById,
    getTemplateFields,
    updateTemplateField,
    deleteTemplate,
    saveVisualFields,
    fillTemplate,
    extractFieldLabels
};
