/**
 * =============================================
 * CONTROLADOR DE ENVÍO MASIVO
 * Manejo de envío masivo de documentos vía CSV/XLSX
 * =============================================
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const crypto = require('crypto');
const Queue = require('bull');
const { requireAuth, logActivity } = require('../middleware/auth');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// =============================================
// CONFIGURACIÓN DE MULTER PARA SUBIDA DE ARCHIVOS
// =============================================
const storage = multer.memoryStorage(); // Guardar en memoria (Buffer)
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    },
    fileFilter: (req, file, cb) => {
        // Solo permitir CSV y XLSX
        const allowedTypes = /csv|xlsx|xls/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = file.mimetype === 'text/csv' ||
                         file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                         file.mimetype === 'application/vnd.ms-excel';

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV o XLSX'));
        }
    }
});

// =============================================
// CONFIGURACIÓN DE BULL (COLA DE EMAILS)
// =============================================
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

let emailQueue;
try {
    emailQueue = new Queue('bulk-emails', {
        redis: {
            host: REDIS_HOST,
            port: REDIS_PORT
        }
    });
    console.log(`✅ [BULK-SEND] Cola de emails inicializada (Redis: ${REDIS_HOST}:${REDIS_PORT})`);
} catch (error) {
    console.error('❌ [BULK-SEND] Error al conectar con Redis:', error.message);
    console.warn('⚠️ [BULK-SEND] El envío masivo requiere Redis. Por favor instálalo y ejecuta: redis-server');
}

// =============================================
// FUNCIONES AUXILIARES
// =============================================

/**
 * Normalizar label para comparación (case-insensitive, sin espacios extra, sin caracteres especiales)
 */
function normalizeLabel(label) {
    if (!label) return '';
    return label
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')  // Reemplazar múltiples espacios por uno solo
        .normalize('NFD')       // Normalizar caracteres Unicode (ñ, á, etc.)
        .replace(/[\u0300-\u036f]/g, '');  // Quitar diacríticos pero mantener símbolos como ° y :
}

/**
 * Obtener valor de una fila CSV de forma case-insensitive
 * @param {Object} row - Fila del CSV
 * @param {string|string[]} possibleKeys - Clave(s) posible(s) a buscar
 * @returns {string} - Valor encontrado o string vacío
 */
function getRowValue(row, possibleKeys) {
    const keys = Array.isArray(possibleKeys) ? possibleKeys : [possibleKeys];

    for (const searchKey of keys) {
        const searchKeyNormalized = normalizeLabel(searchKey);

        // Buscar en las keys de la fila
        for (const rowKey of Object.keys(row)) {
            if (normalizeLabel(rowKey) === searchKeyNormalized) {
                return (row[rowKey] || '').toString().trim();
            }
        }
    }

    return '';
}

/**
 * Parsear archivo CSV
 */
function parseCSV(fileBuffer) {
    const csvString = fileBuffer.toString('utf8');
    const parsed = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()  // NO convertir a minúsculas aquí, lo haremos después con normalizeLabel
    });

    if (parsed.errors.length > 0) {
        throw new Error('Error al parsear CSV: ' + parsed.errors[0].message);
    }

    return parsed.data;
}

/**
 * Parsear archivo XLSX
 */
function parseXLSX(fileBuffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Primera hoja
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, {
        raw: false, // Convertir todo a string
        defval: ''  // Valores vacíos como string vacío
    });

    // Mantener los nombres de columnas originales (solo trim, sin lowercase)
    // La normalización se hará después con normalizeLabel()
    return data.map(row => {
        const normalized = {};
        Object.keys(row).forEach(key => {
            normalized[key.trim()] = row[key];
        });
        return normalized;
    });
}

/**
 * Validar datos de destinatarios (simple o con múltiples partes)
 * @param {Array} data - Datos parseados del CSV
 * @param {Array} documentParts - Partes del documento
 * @param {string} documentType - Tipo de documento: 'normal' o 'pagare'
 */
function validateRecipients(data, documentParts = [], documentType = 'normal') {
    const errors = [];
    const validRecipients = [];
    const seenEmails = new Set();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Detectar formato del CSV
    const firstRow = data[0] || {};

    // Normalizar las keys del firstRow para detección case-insensitive
    const firstRowKeys = Object.keys(firstRow);
    const firstRowKeysNormalized = firstRowKeys.map(key => normalizeLabel(key));

    // Formato 1: Columnas por parte (primera_parte_email, primera_parte_nombre, etc.)
    const hasMultipleParts = documentParts.length > 1 &&
                            documentParts.some(part => {
                                const partName = normalizeLabel(part.role_name).replace(/\s+/g, '_');
                                return firstRowKeysNormalized.some(key => key === `${partName}_email`);
                            });

    // Formato 2: Columna "Parte" + Email + Nombre (una fila por destinatario)
    const hasParteColumn = firstRowKeysNormalized.includes('parte');

    console.log(`📋 Modo de procesamiento: ${hasMultipleParts ? 'MÚLTIPLES PARTES (columnas)' : hasParteColumn ? 'PARTE POR FILA' : 'SIMPLE'}`);

    if (hasParteColumn && documentParts.length > 0) {
        // 🔥 Detectar si el documento es tipo "normal" o "pagare"
        const isNormalType = documentType === 'normal';

        if (isNormalType) {
            console.log('📋 Detectado formato con columna Parte + tipo NORMAL');
        } else {
            console.log('📋 Detectado formato con columna Parte + tipo PAGARE - extrayendo datos por fila individual');
        }

        // 🔥 Para tipo NORMAL: detectar si las filas tienen datos DISTINTOS entre sí.
        // Si son distintos → PDFs individuales (igual que pagare).
        // Si son iguales o solo hay una fila con datos → campos compartidos.
        let hasDistinctRowData = false;
        let sharedFieldValues = {};

        if (isNormalType) {
            // Extraer campos extra (no estándar) de cada fila
            const rowsWithData = data
                .map(row => {
                    const fields = {};
                    Object.keys(row).forEach(key => {
                        const kn = normalizeLabel(key);
                        if (kn !== 'parte' && kn !== 'email' && kn !== 'nombre' && kn !== 'name') {
                            const v = (row[key] || '').toString().trim();
                            if (v) fields[key] = v;
                        }
                    });
                    return fields;
                })
                .filter(f => Object.keys(f).length > 0);

            if (rowsWithData.length > 1) {
                // Comparar cada fila con la primera — si alguna difiere, son datos individuales
                const firstJson = JSON.stringify(rowsWithData[0]);
                hasDistinctRowData = rowsWithData.some(r => JSON.stringify(r) !== firstJson);
            }

            if (hasDistinctRowData) {
                console.log('📋 [NORMAL] Filas con datos distintos detectadas → PDFs individuales por destinatario');
            } else if (rowsWithData.length > 0) {
                sharedFieldValues = rowsWithData[0];
                console.log(`📝 Campos compartidos (todos iguales): ${JSON.stringify(sharedFieldValues)}`);
            }
        }

        // Procesar cada fila de destinatarios
        data.forEach((row, index) => {
            const rowNum = index + 2;
            const parteName = getRowValue(row, ['Parte', 'parte']);
            const email = getRowValue(row, ['Email', 'email']);
            const name = getRowValue(row, ['Nombre', 'nombre', 'Name', 'name']);

            // Ignorar filas vacías
            if (!parteName && !email && !name) {
                console.log(`⚠️ Fila ${rowNum} vacía, ignorando...`);
                return;
            }

            // Buscar la parte correspondiente
            const matchingPart = documentParts.find(p =>
                p.role_name.toLowerCase() === parteName.toLowerCase()
            );

            if (!matchingPart) {
                errors.push({
                    row: rowNum,
                    field: 'Parte',
                    message: `Parte "${parteName}" no existe en el documento`
                });
                return;
            }

            // Validaciones
            if (!email) {
                errors.push({
                    row: rowNum,
                    field: 'Email',
                    message: 'Email vacío'
                });
                return;
            }

            if (!emailRegex.test(email)) {
                errors.push({
                    row: rowNum,
                    field: 'Email',
                    message: `Email inválido: ${email}`
                });
                return;
            }

            if (seenEmails.has(email.toLowerCase())) {
                errors.push({
                    row: rowNum,
                    field: 'Email',
                    message: `Email duplicado: ${email}`
                });
                return;
            }

            if (!name) {
                errors.push({
                    row: rowNum,
                    field: 'Nombre',
                    message: 'Nombre vacío'
                });
                return;
            }

            seenEmails.add(email.toLowerCase());
            const studentId = getRowValue(row, ['ID estudiante', 'id estudiante', 'ID_ESTUDIANTE', 'id_estudiante', 'IDEstudiante', 'idEstudiante', 'estudiante_id', 'student_id']);
            const recipient = {
                email,
                name,
                part_id: matchingPart.part_id,
                part_name: matchingPart.role_name,
                student_id: studentId || null
            };

            // Extraer fieldValues individuales para: pagare O normal con datos distintos por fila
            if (!isNormalType || hasDistinctRowData) {
                const rowFieldValues = {};
                Object.keys(row).forEach(key => {
                    const keyNormalized = normalizeLabel(key);
                    // Excluir columnas de control (no son campos del PDF)
                    if (keyNormalized !== 'parte' && keyNormalized !== 'email' && keyNormalized !== 'nombre' && keyNormalized !== 'name' && keyNormalized !== 'id estudiante' && keyNormalized !== 'id_estudiante' && keyNormalized !== 'estudiante_id' && keyNormalized !== 'student_id') {
                        const value = (row[key] || '').toString().trim();
                        if (value) {
                            rowFieldValues[key] = value;
                            console.log(`   📝 Campo fila ${rowNum} "${key}": "${value}"`);
                        }
                    }
                });

                if (Object.keys(rowFieldValues).length > 0) {
                    recipient.fieldValues = rowFieldValues;
                    console.log(`   ✅ ${Object.keys(rowFieldValues).length} campos específicos para ${email}`);
                }
            } else {
                console.log(`   ℹ️ [NORMAL] Sin campos distintos por fila - usará campos compartidos`);
            }

            validRecipients.push(recipient);

            console.log(`✅ Destinatario: ${email} → ${matchingPart.role_name} (part_id=${matchingPart.part_id})`);
        });

        // Retornar campos compartidos solo si es NORMAL sin datos distintos por fila
        return { validRecipients, errors, sharedFieldValues: (isNormalType && !hasDistinctRowData) ? sharedFieldValues : null };

    } else if (hasMultipleParts) {
        // Procesamiento con múltiples partes
        data.forEach((row, index) => {
            const rowNum = index + 2;
            const rowRecipients = [];

            documentParts.forEach(part => {
                const partName = part.role_name.toLowerCase().replace(/\s+/g, '_');
                const email = (row[`${partName}_email`] || '').trim();
                const name = (row[`${partName}_nombre`] || '').trim();

                if (!email || !name) {
                    return; // Parte opcional vacía
                }

                // Validar formato de email
                if (!emailRegex.test(email)) {
                    errors.push({
                        row: rowNum,
                        field: `${partName}_email`,
                        message: `Email inválido: ${email}`
                    });
                    return;
                }

                // Validar email duplicado en esta fila
                if (seenEmails.has(email.toLowerCase())) {
                    errors.push({
                        row: rowNum,
                        field: `${partName}_email`,
                        message: `Email duplicado: ${email}`
                    });
                    return;
                }

                seenEmails.add(email.toLowerCase());
                rowRecipients.push({
                    email,
                    name,
                    part_id: part.part_id,
                    part_name: part.role_name
                });
            });

            if (rowRecipients.length > 0) {
                validRecipients.push(...rowRecipients);
            }
        });
    } else {
        // Procesamiento simple (sin partes/roles) - MODO CSV SIN COLUMNA "PARTE"
        console.log('📋 Modo SIMPLE: procesando CSV sin columna "Parte"');

        data.forEach((row, index) => {
            const rowNum = index + 2;
            const email = getRowValue(row, ['Email', 'email']);
            const name = getRowValue(row, ['Nombre', 'nombre', 'Name', 'name']);

            // Ignorar filas vacías
            if (!email && !name) {
                console.log(`⚠️ Fila ${rowNum} vacía, ignorando...`);
                return;
            }

            if (!email) {
                errors.push({
                    row: rowNum,
                    field: 'email',
                    message: 'Email vacío'
                });
                return;
            }

            if (!emailRegex.test(email)) {
                errors.push({
                    row: rowNum,
                    field: 'email',
                    message: `Email inválido: ${email}`
                });
                return;
            }

            if (seenEmails.has(email.toLowerCase())) {
                errors.push({
                    row: rowNum,
                    field: 'email',
                    message: `Email duplicado: ${email}`
                });
                return;
            }

            if (!name) {
                errors.push({
                    row: rowNum,
                    field: 'name',
                    message: 'Nombre vacío'
                });
                return;
            }

            seenEmails.add(email.toLowerCase());

            // 🔥 NUEVO: Extraer campos de texto adicionales del CSV (igual que con partes)
            const textFieldValues = {};
            Object.keys(row).forEach(key => {
                const keyNormalized = normalizeLabel(key);
                // Ignorar las columnas estándar
                if (keyNormalized !== 'email' && keyNormalized !== 'nombre' && keyNormalized !== 'name') {
                    const value = (row[key] || '').toString().trim();
                    if (value) {
                        textFieldValues[key] = value;
                        console.log(`   📝 Campo "${key}": "${value}"`);
                    }
                }
            });

            const recipient = {
                email,
                name,
                part_id: null, // Sin parte asignada
                part_name: null
            };

            // Agregar campos de texto si existen
            if (Object.keys(textFieldValues).length > 0) {
                recipient.fieldValues = textFieldValues;
                console.log(`   ✅ ${Object.keys(textFieldValues).length} campos de texto para ${email}`);
            }

            validRecipients.push(recipient);
        });
    }

    return { validRecipients, errors };
}

/**
 * Generar token único
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// =============================================
// ENDPOINTS
// =============================================

/**
 * POST /api/signatures/bulk-send
 * Envío masivo de documentos desde CSV/XLSX
 */
router.post('/bulk-send', requireAuth, upload.single('file'), async (req, res) => {
    console.log('\n📊 [BULK-SEND] POST /api/signatures/bulk-send');
    console.log(`   Usuario: ${req.userId}`);

    const { signature_document_id } = req.body;
    const db = req.app.locals.db;

    // Validar que se proporcionó archivo
    if (!req.file) {
        console.log('❌ [BULK-SEND] No se proporcionó archivo');
        return res.status(400).json({
            success: false,
            error: 'Debes subir un archivo CSV o XLSX'
        });
    }

    // Validar que se proporcionó signature_document_id
    if (!signature_document_id) {
        console.log('❌ [BULK-SEND] No se proporcionó signature_document_id');
        return res.status(400).json({
            success: false,
            error: 'signature_document_id es requerido'
        });
    }

    try {
        // Verificar que el documento existe y pertenece al usuario
        // Buscar en la tabla 'documents' usando el document_id
        const [docResults] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT document_id, owner_id, title, file_path, document_type
                 FROM documents
                 WHERE document_id = ?`,
                [signature_document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (docResults.length === 0) {
            console.log('❌ [BULK-SEND] Documento no encontrado');
            return res.status(404).json({
                success: false,
                error: 'Documento de firma no encontrado'
            });
        }

        const doc = docResults[0];

        if (doc.owner_id !== req.userId) {
            console.log('❌ [BULK-SEND] Acceso denegado');
            return res.status(403).json({
                success: false,
                error: 'No tienes permiso para enviar este documento'
            });
        }

        const documentType = doc.document_type || 'normal';
        console.log(`📄 Documento encontrado: ${doc.title}`);
        console.log(`📋 Tipo de documento: ${documentType}`);

        // Obtener las partes del documento
        const [partsResults] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT part_id, role_name, order_position, color
                 FROM document_parts
                 WHERE document_id = ?
                 ORDER BY order_position ASC`,
                [signature_document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const documentParts = partsResults || [];
        console.log(`📋 Documento tiene ${documentParts.length} parte(s) definida(s)`);

        // 🔥 NUEVO: Obtener configuración de firma secuencial
        const [signingConfig] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM document_signing_config WHERE document_id = ?',
                [signature_document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        const signInOrder = signingConfig.length > 0 && signingConfig[0].sign_in_order === 1;
        console.log(`📋 Firma secuencial: ${signInOrder ? 'SÍ' : 'NO'}`);

        // 🔥 NUEVO: Obtener roles si existen (tabla signer_roles - para compatibilidad)
        const [roles] = await new Promise((resolve, reject) => {
            db.query(
                'SELECT * FROM signer_roles WHERE document_id = ? ORDER BY role_order ASC',
                [signature_document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        // Crear mapa: role_id → role data
        const roleMap = {};
        roles.forEach(r => {
            roleMap[r.role_id] = r;
        });

        console.log(`📋 Roles en signer_roles: ${roles.length}`);

        // Parsear archivo según extensión
        let parsedData;
        const ext = req.file.originalname.split('.').pop().toLowerCase();

        console.log(`📝 Parseando archivo ${ext.toUpperCase()}...`);

        if (ext === 'csv') {
            parsedData = parseCSV(req.file.buffer);
        } else if (ext === 'xlsx' || ext === 'xls') {
            parsedData = parseXLSX(req.file.buffer);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Formato de archivo no soportado'
            });
        }

        console.log(`✅ ${parsedData.length} filas parseadas`);

        // Validar datos (pasando las partes del documento y el tipo de documento)
        const validationResult = validateRecipients(parsedData, documentParts, documentType);
        const validRecipients = validationResult.validRecipients;
        const errors = validationResult.errors;
        const sharedFieldValues = validationResult.sharedFieldValues || null;

        console.log(`✅ ${validRecipients.length} destinatarios válidos`);
        if (errors.length > 0) {
            console.log(`⚠️ ${errors.length} errores de validación`);
        }
        if (sharedFieldValues && Object.keys(sharedFieldValues).length > 0) {
            console.log(`📝 Campos compartidos detectados (CSV con columna Parte): ${Object.keys(sharedFieldValues).length} campos`);
        }

        // Si hay errores, retornarlos
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Errores de validación en el archivo',
                validation_errors: errors,
                valid_count: validRecipients.length,
                error_count: errors.length
            });
        }

        // Límite de destinatarios (configurable)
        const MAX_RECIPIENTS = 1000;
        if (validRecipients.length > MAX_RECIPIENTS) {
            return res.status(400).json({
                success: false,
                error: `El límite es ${MAX_RECIPIENTS} destinatarios por envío. Tu archivo tiene ${validRecipients.length}.`
            });
        }

        // 🔥 DETECTAR MODO: CSV personalizado vs Manual compartido
        // Strip leading "/" if present to ensure relative path
        const cleanPath = doc.file_path.startsWith('/') ? doc.file_path.substring(1) : doc.file_path;
        const originalPdfPath = path.resolve(__dirname, '../../', cleanPath);
        console.log(`📂 Ruta PDF original: ${originalPdfPath}`);

        const hasPersonalizedData = validRecipients.some(r => r.fieldValues && Object.keys(r.fieldValues).length > 0);
        const hasSharedData = sharedFieldValues && Object.keys(sharedFieldValues).length > 0;

        if (hasPersonalizedData) {
            console.log(`\n🎯 MODO: CSV con datos personalizados por destinatario`);
            console.log(`   → Se generará un PDF único para cada destinatario con sus datos específicos`);
            console.log(`   → NO se pre-llena el PDF compartido (cada destinatario tendrá su propio PDF)\n`);
        } else {
            console.log(`\n🎯 MODO: Rellenar Manualmente (datos compartidos)`);
            console.log(`   → Se pre-llenará UN PDF compartido con valores de document_field_values`);
            console.log(`   → Todos los destinatarios verán el mismo PDF pre-llenado\n`);

            // 🔥 NUEVO: Si hay sharedFieldValues del CSV, guardarlos en document_field_values
            if (hasSharedData) {
                console.log('📝 [SHARED-VALUES] Guardando campos compartidos del CSV en document_field_values...');

                // Obtener campos de texto del documento
                const [textFields] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT field_id, field_label, field_type
                         FROM document_fields
                         WHERE document_id = ? AND field_type = 'text'
                         ORDER BY field_id ASC`,
                        [signature_document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                console.log(`📋 [SHARED-VALUES] Campos de texto en documento: ${textFields.length}`);

                // Crear mapa: label normalizado → array de field_ids (para manejar duplicados)
                const fieldMap = {};
                textFields.forEach(field => {
                    const labelNormalized = normalizeLabel(field.field_label);
                    if (!fieldMap[labelNormalized]) {
                        fieldMap[labelNormalized] = [];
                    }
                    fieldMap[labelNormalized].push(field.field_id);
                    console.log(`   🗺️ "${field.field_label}" (normalizado: "${labelNormalized}") → field_id=${field.field_id}`);
                });

                // Guardar cada valor compartido en document_field_values
                for (const [csvLabel, value] of Object.entries(sharedFieldValues)) {
                    const csvLabelNormalized = normalizeLabel(csvLabel);

                    console.log(`\n   🔍 Procesando campo CSV: "${csvLabel}"`);
                    console.log(`      Normalizado: "${csvLabelNormalized}"`);
                    console.log(`      Tiene sufijo numérico: ${/\s+\d+$/.test(csvLabel)}`);
                    console.log(`      Existe en mapa directo: ${!!fieldMap[csvLabelNormalized]}`);

                    // 🔥 NUEVO: Manejar labels con sufijos numéricos (ej. "CLAUSULA XXXX: 2")
                    let fieldId = null;

                    // Primero intentar búsqueda directa
                    if (fieldMap[csvLabelNormalized] && fieldMap[csvLabelNormalized].length > 0) {
                        fieldId = fieldMap[csvLabelNormalized][0]; // Usar el primero
                        console.log(`      ✅ Mapeo directo: "${csvLabel}" → field_id=${fieldId}`);
                    }
                    // Si no encuentra y termina con " N", buscar el label base
                    else if (/\s+\d+$/.test(csvLabel)) {
                        // Extraer label base y número de sufijo
                        const match = csvLabel.match(/^(.+?)\s+(\d+)$/);
                        if (match) {
                            const baseLabel = match[1].trim();
                            const suffixNumber = parseInt(match[2]);
                            const baseLabelNormalized = normalizeLabel(baseLabel);

                            console.log(`   🔍 Detectado sufijo en "${csvLabel}": base="${baseLabel}", sufijo=${suffixNumber}`);

                            // Buscar array de field_ids con el label base
                            if (fieldMap[baseLabelNormalized] && fieldMap[baseLabelNormalized].length > 0) {
                                // Usar el índice basado en el sufijo (sufijo 2 = índice 1, sufijo 3 = índice 2)
                                const index = suffixNumber - 1;

                                if (index < fieldMap[baseLabelNormalized].length) {
                                    fieldId = fieldMap[baseLabelNormalized][index];
                                    console.log(`   ✅ Mapeo con sufijo: "${csvLabel}" → field_id=${fieldId} (índice ${index} en array de ${fieldMap[baseLabelNormalized].length})`);
                                } else {
                                    console.log(`   ⚠️ Sufijo ${suffixNumber} fuera de rango (solo hay ${fieldMap[baseLabelNormalized].length} campos con label "${baseLabel}")`);
                                }
                            } else {
                                console.log(`   ⚠️ Label base "${baseLabel}" no encontrado en fieldMap`);
                            }
                        }
                    }

                    if (!fieldId) {
                        console.log(`   ⚠️ Campo "${csvLabel}" no encontrado en document_fields, omitiendo...`);
                        continue;
                    }

                    // Verificar si ya existe un valor para este campo
                    const [existing] = await new Promise((resolve, reject) => {
                        db.query(
                            'SELECT value_id FROM document_field_values WHERE document_id = ? AND field_id = ?',
                            [signature_document_id, fieldId],
                            (err, results) => {
                                if (err) reject(err);
                                else resolve([results]);
                            }
                        );
                    });

                    if (existing && existing.length > 0) {
                        // Actualizar valor existente
                        await new Promise((resolve, reject) => {
                            db.query(
                                'UPDATE document_field_values SET field_value = ? WHERE value_id = ?',
                                [value, existing[0].value_id],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                        console.log(`   ✅ Actualizado "${csvLabel}" → "${value}" (field_id=${fieldId})`);
                    } else {
                        // Insertar nuevo valor
                        await new Promise((resolve, reject) => {
                            db.query(
                                'INSERT INTO document_field_values (document_id, field_id, field_value) VALUES (?, ?, ?)',
                                [signature_document_id, fieldId, value],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                        console.log(`   ✅ Insertado "${csvLabel}" → "${value}" (field_id=${fieldId})`);
                    }
                }

                console.log('✅ [SHARED-VALUES] Campos compartidos guardados en document_field_values\n');
            }

            // 🔥 NUEVO: Migrar valores de field_id viejos a nuevos si es necesario
            // Esto ocurre cuando los valores se guardaron ANTES de que se guardaran los campos finales
            console.log('🔄 [MIGRATION] Verificando si hay valores con field_id desactualizados...');

            // Obtener todos los valores guardados para este documento
            const [existingValues] = await new Promise((resolve, reject) => {
                db.query(
                    `SELECT dfv.value_id, dfv.field_id, dfv.field_value, df.field_label, df.field_type
                     FROM document_field_values dfv
                     LEFT JOIN document_fields df ON dfv.field_id = df.field_id
                     WHERE dfv.document_id = ?`,
                    [signature_document_id],
                    (err, results) => {
                        if (err) reject(err);
                        else resolve([results]);
                    }
                );
            });

            console.log(`📊 [MIGRATION] Valores encontrados: ${existingValues.length}`);

            // Encontrar valores "huérfanos" (field_id no existe en document_fields)
            const orphanedValues = existingValues.filter(v => !v.field_type);

            if (orphanedValues.length > 0) {
                console.log(`⚠️ [MIGRATION] ${orphanedValues.length} valores tienen field_id desactualizados, migrando...`);

                // Obtener los campos de texto actuales del documento
                const [currentFields] = await new Promise((resolve, reject) => {
                    db.query(
                        `SELECT field_id, field_label, field_type
                         FROM document_fields
                         WHERE document_id = ? AND field_type = 'text'
                         ORDER BY field_id ASC`,
                        [signature_document_id],
                        (err, results) => {
                            if (err) reject(err);
                            else resolve([results]);
                        }
                    );
                });

                console.log(`📋 [MIGRATION] Campos de texto actuales: ${currentFields.length}`);

                // Migrar cada valor huérfano al campo correcto basándose en el orden
                for (let i = 0; i < orphanedValues.length && i < currentFields.length; i++) {
                    const oldValue = orphanedValues[i];
                    const newField = currentFields[i];

                    console.log(`🔄 [MIGRATION] Migrando valor "${oldValue.field_value}" de field_id ${oldValue.field_id} → ${newField.field_id} (${newField.field_label})`);

                    // Actualizar el field_id
                    await new Promise((resolve, reject) => {
                        db.query(
                            `UPDATE document_field_values SET field_id = ? WHERE value_id = ?`,
                            [newField.field_id, oldValue.value_id],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }

                console.log(`✅ [MIGRATION] ${orphanedValues.length} valores migrados correctamente`);
            } else {
                console.log(`✅ [MIGRATION] Todos los valores tienen field_id válidos`);
            }

            // Pre-llenar PDF con valores de document_field_values (modo manual)
            const prefilledPdfPath = await prefilPDFWithTemplateValues(db, signature_document_id, originalPdfPath);

            // Si se generó un PDF pre-llenado, actualizar el file_path del documento en la BD
            if (prefilledPdfPath !== originalPdfPath) {
                // Convertir la ruta absoluta a relativa para la BD
                const relativePath = path.relative(path.resolve(__dirname, '../../'), prefilledPdfPath).replace(/\\/g, '/');

                await new Promise((resolve, reject) => {
                    db.query(
                        'UPDATE documents SET file_path = ? WHERE document_id = ?',
                        [relativePath, signature_document_id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });

                doc.file_path = relativePath;
                console.log(`✅ PDF pre-llenado guardado y actualizado en BD: ${relativePath}`);
            }
        }

        // Verificar que Redis esté disponible
        if (!emailQueue) {
            console.error('❌ [BULK-SEND] Cola de emails no disponible (Redis no conectado)');
            return res.status(503).json({
                success: false,
                error: 'Servicio de cola de emails no disponible. Por favor contacta al administrador.'
            });
        }

        // 🔥 NUEVO: Obtener campos de texto del documento con sus posiciones para ordenar duplicados
        const [documentFields] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT field_id, field_label, field_type, x_position, page_number
                 FROM document_fields
                 WHERE document_id = ? AND field_type IN ('text', 'date', 'number')
                 ORDER BY page_number ASC, x_position ASC`,
                [signature_document_id],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        console.log(`📋 ${documentFields.length} campos de texto encontrados en el documento`);
        console.log(`🔍 DEBUG - Campos completos:`, JSON.stringify(documentFields, null, 2));

        // Crear mapa: label → array de field_ids (ordenados por posición X)
        // Esto permite manejar labels duplicados correctamente
        const fieldLabelMap = {}; // label_normalized → [field_id1, field_id2, ...]
        const fieldLabelMapDebug = {}; // Para debugging

        documentFields.forEach(field => {
            if (field.field_label) {
                // Normalizar el label para comparación consistente
                const labelNormalized = normalizeLabel(field.field_label);

                // Si el label ya existe, agregar este field_id al array
                if (!fieldLabelMap[labelNormalized]) {
                    fieldLabelMap[labelNormalized] = [];
                    fieldLabelMapDebug[labelNormalized] = [];
                }

                fieldLabelMap[labelNormalized].push(field.field_id);
                fieldLabelMapDebug[labelNormalized].push({
                    field_id: field.field_id,
                    original_label: field.field_label,
                    x_position: field.x_position,
                    page: field.page_number
                });

                console.log(`   🗺️ Mapeado: "${field.field_label}" → field_id=${field.field_id} (key normalizada: "${labelNormalized}", x=${field.x_position})`);
            } else {
                console.log(`   ⚠️ Campo field_id=${field.field_id} NO tiene field_label`);
            }
        });

        console.log(`📊 DEBUG - fieldLabelMap final (${Object.keys(fieldLabelMap).length} labels únicos):`);
        for (const [key, value] of Object.entries(fieldLabelMap)) {
            console.log(`   "${key}" → [${value.join(', ')}] (${value.length} campos)`);
        }
        console.log(`📊 DEBUG - fieldLabelMapDebug:`, JSON.stringify(fieldLabelMapDebug, null, 2));

        // Verificar si el owner está vinculado a VI (una sola vez, aplica a todos los destinatarios)
        const VI_URL = process.env.VI_URL || 'http://validacion-identidad-app-1:3000';
        const VI_API_KEY = process.env.INTERNAL_API_KEY || '';
        let ownerVinculadoVI = false;
        try {
            const checkUrl = new URL(`${VI_URL}/validacion/api/firmalegal/check-vinculacion/${req.userId}`);
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
                    resp.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
                });
                r.on('error', () => resolve({}));
                r.end();
            });
            ownerVinculadoVI = checkResult.vinculado === true;
        } catch (_) { ownerVinculadoVI = false; }
        console.log(`   🔐 [BULK-SEND] Owner vinculado a VI: ${ownerVinculadoVI}`);

        // Iniciar transacción para insertar destinatarios
        console.log(`💾 Insertando ${validRecipients.length} destinatarios en la base de datos...`);

        const insertedRecipients = [];

        // Obtener conexión individual del pool para poder usar transacciones
        const conn = await new Promise((resolve, reject) => {
            db.getConnection((err, connection) => {
                if (err) return reject(err);
                resolve(connection);
            });
        });

        try {
            await new Promise((resolve, reject) => {
                conn.beginTransaction(async (err) => {
                    if (err) return reject(err);

                    try {
                        // Insertar cada destinatario
                        for (const recipient of validRecipients) {
                            const token = generateToken();

                            let roleId = null;
                            let signingOrder = null;
                            let canSignAt = null;

                            if (recipient.part_id) {
                                const part = documentParts.find(p => p.part_id === recipient.part_id);
                                if (part) {
                                    signingOrder = part.order_position;
                                    const matchingRole = roles.find(r => r.role_order === part.order_position);
                                    if (matchingRole) {
                                        roleId = matchingRole.role_id;
                                    }
                                    if (signInOrder && part.order_position === 1) {
                                        canSignAt = new Date();
                                    }
                                    console.log(`   📋 ${recipient.email} → Parte "${part.role_name}" (orden ${signingOrder}) → role_id ${roleId} → ${canSignAt ? 'PUEDE FIRMAR' : 'DEBE ESPERAR'}`);
                                }
                            }

                            // Generar PDF personalizado si tiene fieldValues (CSV personalizado)
                            let customPdfPath = null;

                            if (recipient.fieldValues && Object.keys(recipient.fieldValues).length > 0) {
                                console.log(`\n📝 Generando PDF personalizado para ${recipient.email}...`);
                                const personalizedPdfAbsPath = await prefillPDFWithRecipientData(
                                    db,
                                    signature_document_id,
                                    originalPdfPath,
                                    recipient.email,
                                    recipient.fieldValues,
                                    fieldLabelMap
                                );

                                if (personalizedPdfAbsPath) {
                                    customPdfPath = path.relative(path.resolve(__dirname, '../../'), personalizedPdfAbsPath).replace(/\\/g, '/');
                                    console.log(`   ✅ PDF personalizado: ${customPdfPath}`);
                                }
                            }

                            const insertResult = await new Promise((res, rej) => {
                                conn.query(
                                    `INSERT INTO document_recipients
                                     (document_id, email, name, student_id, token, custom_pdf_path, personal_pdf_path, status, part_id, role_id, signing_order, can_sign_at)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
                                    [signature_document_id, recipient.email, recipient.name, recipient.student_id || null, token, customPdfPath, customPdfPath, recipient.part_id, roleId, signingOrder, canSignAt],
                                    (err, result) => {
                                        if (err) rej(err);
                                        else res(result);
                                    }
                                );
                            });

                            const recipientId = insertResult.insertId;

                            // Si owner vinculado a VI: copiar vi_validated_at si el email fue validado en el último año
                            if (ownerVinculadoVI) {
                                const oneYearAgo = new Date();
                                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                                // Buscar primero en vi_verified_emails (fuente permanente, case-insensitive)
                                let viCheck = await new Promise((res, rej) => {
                                    db.query(
                                        `SELECT vi_validated_at FROM vi_verified_emails
                                         WHERE LOWER(email) = LOWER(?) AND vi_validated_at >= ?
                                         ORDER BY vi_validated_at DESC LIMIT 1`,
                                        [recipient.email, oneYearAgo],
                                        (err, rows) => { if (err) rej(err); else res(rows); }
                                    );
                                });
                                // Si no está en vi_verified_emails, buscar en document_recipients
                                if (viCheck.length === 0) {
                                    viCheck = await new Promise((res, rej) => {
                                        db.query(
                                            `SELECT vi_validated_at FROM document_recipients
                                             WHERE LOWER(email) = LOWER(?) AND vi_validated_at IS NOT NULL AND vi_validated_at >= ?
                                             ORDER BY vi_validated_at DESC LIMIT 1`,
                                            [recipient.email, oneYearAgo],
                                            (err, rows) => { if (err) rej(err); else res(rows); }
                                        );
                                    });
                                }
                                if (viCheck.length > 0) {
                                    // Email validado en VI — copiar vi_validated_at al recipient recién insertado
                                    await new Promise((res, rej) => {
                                        conn.query(
                                            'UPDATE document_recipients SET vi_validated_at = ? WHERE recipient_id = ?',
                                            [viCheck[0].vi_validated_at, recipientId],
                                            (err) => { if (err) rej(err); else res(); }
                                        );
                                    });
                                    console.log(`   ✅ [VI] ${recipient.email} validado (dentro de 1 año) — vi_validated_at copiado`);
                                } else {
                                    // Email NO validado — cambiar status a 'pending' para que tracking muestre bloque VI
                                    await new Promise((res, rej) => {
                                        conn.query(
                                            `UPDATE document_recipients SET status = 'pending' WHERE recipient_id = ?`,
                                            [recipientId],
                                            (err) => { if (err) rej(err); else res(); }
                                        );
                                    });
                                    console.log(`   🔐 [VI] ${recipient.email} no validado — status=pending, requerirá VI en tracking`);
                                }
                            }

                            // Verificar si tiene vi_validated_at (puede haberse copiado arriba)
                            const viValidatedRows = ownerVinculadoVI ? await new Promise((res, rej) => {
                                conn.query('SELECT vi_validated_at FROM document_recipients WHERE recipient_id = ?',
                                    [recipientId], (err, rows) => { if (err) rej(err); else res(rows); });
                            }) : [];
                            const hasVI = viValidatedRows.length > 0 && viValidatedRows[0].vi_validated_at !== null;

                            insertedRecipients.push({
                                id: recipientId,
                                email: recipient.email,
                                name: recipient.name,
                                token: token,
                                part_id: recipient.part_id,
                                part_name: recipient.part_name,
                                role_id: roleId,
                                signing_order: signingOrder,
                                custom_pdf_path: customPdfPath,
                                needsVI: ownerVinculadoVI && !hasVI
                            });

                            // Crear registros en field_values para los campos que debe firmar este destinatario
                            if (recipient.part_id) {
                                try {
                                    const fieldsForPart = await new Promise((res, rej) => {
                                        conn.query(
                                            `SELECT field_id, field_type
                                             FROM document_fields
                                             WHERE document_id = ? AND part_id = ?`,
                                            [signature_document_id, recipient.part_id],
                                            (err, results) => {
                                                if (err) rej(err);
                                                else res(results || []);
                                            }
                                        );
                                    });

                                    if (fieldsForPart && fieldsForPart.length > 0) {
                                        for (const field of fieldsForPart) {
                                            let valueType = field.field_type;
                                            if (field.field_type === 'signature' || field.field_type === 'seal') {
                                                valueType = 'signature_image';
                                            } else if (field.field_type === 'stamp') {
                                                valueType = 'stamp_data';
                                            }

                                            await new Promise((res, rej) => {
                                                conn.query(
                                                    `INSERT INTO field_values
                                                     (field_id, recipient_id, value_type)
                                                     VALUES (?, ?, ?)`,
                                                    [field.field_id, recipientId, valueType],
                                                    (err, result) => {
                                                        if (err) rej(err);
                                                        else res(result);
                                                    }
                                                );
                                            });
                                        }
                                        console.log(`   ✅ ${fieldsForPart.length} campos asignados a ${recipient.email}`);
                                    } else {
                                        console.log(`   ℹ️ No hay campos asignados para la parte ${recipient.part_id} del destinatario ${recipient.email}`);
                                    }
                                } catch (fieldError) {
                                    console.error(`   ⚠️ Error al asignar campos a ${recipient.email}:`, fieldError.message);
                                }
                            }

                            if (recipient.fieldValues && Object.keys(recipient.fieldValues).length > 0) {
                                console.log(`   ✅ Valores CSV escritos FIJOS en PDF personalizado (${Object.keys(recipient.fieldValues).length} campos)`);
                            } else {
                                console.log(`   ℹ️ Sin valores CSV específicos - destinatario usará PDF compartido`);
                            }
                        }

                        // Commit de la transacción
                        conn.commit((err) => {
                            if (err) {
                                return conn.rollback(() => reject(err));
                            }
                            resolve();
                        });

                    } catch (error) {
                        conn.rollback(() => reject(error));
                    }
                });
            });
        } finally {
            conn.release();
        }

        console.log(`✅ ${insertedRecipients.length} destinatarios insertados en BD`);

        // Encolar trabajos de email
        console.log(`📧 Encolando ${insertedRecipients.length} emails...`);

        let queuedCount = 0;
        let pendingViCount = 0;
        for (const recipient of insertedRecipients) {
            if (recipient.needsVI) {
                console.log(`   ⏸️ [VI] ${recipient.email} — email en espera (requiere validación de identidad)`);
                pendingViCount++;
                continue;
            }
            await emailQueue.add({
                recipientId: recipient.id,
                email: recipient.email,
                name: recipient.name,
                token: recipient.token,
                signatureDocumentId: signature_document_id,
                documentTitle: doc.title || doc.file_name,
                userId: req.userId
            }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 }
            });
            queuedCount++;
        }

        console.log(`✅ ${queuedCount} emails encolados, ${pendingViCount} en espera de validación VI`);

        // Log de actividad
        await logActivity(db, {
            userId: req.userId,
            action: 'bulk_send_documents',
            entityType: 'signature_document',
            entityId: signature_document_id,
            details: {
                file_name: req.file.originalname,
                recipients_count: insertedRecipients.length,
                document_title: doc.title || doc.file_name
            },
            req
        });

        // Responder al cliente
        res.json({
            success: true,
            message: `${insertedRecipients.length} destinatarios agregados correctamente`,
            data: {
                recipients_count: insertedRecipients.length,
                queued_emails: queuedCount,
                signature_document_id: signature_document_id,
                document_title: doc.title || doc.file_name
            }
        });

    } catch (error) {
        console.error('❌ [BULK-SEND] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al procesar envío masivo',
            message: error.message
        });
    }
});

/**
 * GET /api/signatures/queue-status
 * Obtener estado de la cola de emails
 */
router.get('/queue-status', requireAuth, async (req, res) => {
    console.log('\n📊 [BULK-SEND] GET /api/signatures/queue-status');

    try {
        if (!emailQueue) {
            return res.status(503).json({
                success: false,
                error: 'Cola de emails no disponible'
            });
        }

        const [waiting, active, completed, failed] = await Promise.all([
            emailQueue.getWaitingCount(),
            emailQueue.getActiveCount(),
            emailQueue.getCompletedCount(),
            emailQueue.getFailedCount()
        ]);

        res.json({
            success: true,
            queue: {
                waiting,
                active,
                completed,
                failed,
                total: waiting + active + completed + failed
            }
        });

    } catch (error) {
        console.error('❌ [BULK-SEND] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Error al obtener estado de cola',
            message: error.message
        });
    }
});

// =============================================
// FUNCIÓN HELPER: PRE-LLENAR PDF CON VALORES DE PLANTILLA
// =============================================

async function prefilPDFWithTemplateValues(db, documentId, pdfPath) {
    try {
        console.log(`\n📝 [PREFILL-PDF] Iniciando pre-llenado del PDF...`);

        // 1. Obtener valores de la plantilla (document_field_values)
        const [templateValues] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT dfv.field_id, dfv.field_value, df.x_position, df.y_position, df.page_number, df.width, df.height, df.field_config
                 FROM document_field_values dfv
                 JOIN document_fields df ON dfv.field_id = df.field_id
                 WHERE dfv.document_id = ? AND dfv.field_value IS NOT NULL AND dfv.field_value != ''
                 AND df.field_type = 'text'`,
                [documentId],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (!templateValues || templateValues.length === 0) {
            console.log(`   ℹ️ No hay valores de plantilla para pre-llenar`);
            return pdfPath; // Retornar PDF original sin modificar
        }

        console.log(`   ✅ Encontrados ${templateValues.length} valores para escribir en el PDF`);

        // 2. Leer el PDF original
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontTimesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

        function resolveFont(fmt) {
            if (!fmt) return fontHelvetica;
            const family = (fmt.fontFamily || '').toLowerCase();
            const bold = fmt.isBold;
            // Serif: Times New Roman, Georgia, Cambria, Palatino, Book Antiqua → TimesRoman
            if (family.includes('times') || family.includes('georgia') || family.includes('cambria') ||
                family.includes('palatino') || family.includes('book antiqua')) {
                return bold ? fontTimesBold : fontTimesRoman;
            }
            // Monospace: Courier New → Courier
            if (family.includes('courier') || family.includes('mono')) return fontCourier;
            // Sans-serif: Arial, Helvetica, Calibri, Verdana, Tahoma → Helvetica
            return bold ? fontHelveticaBold : fontHelvetica;
        }

        function parseColor(hex) {
            if (!hex || !hex.startsWith('#')) return rgb(0, 0, 0);
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            return rgb(r, g, b);
        }

        // Helper: calcular fontSize que cabe y truncar si excede el ancho
        function fitText(font, text, fieldWidth, fieldHeight, preferredSize) {
            let size = preferredSize ? Math.min(parseFloat(preferredSize), fieldHeight * 0.85) : Math.min(fieldHeight * 0.65, 12);
            size = Math.max(size, 6);
            const maxW = fieldWidth - 4;
            while (size > 6 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
            let displayText = text;
            while (font.widthOfTextAtSize(displayText, size) > maxW && displayText.length > 1) {
                displayText = displayText.slice(0, -1);
            }
            return { size, displayText };
        }

        // 3. Escribir cada valor en el PDF
        for (const fieldData of templateValues) {
            const pageIndex = fieldData.page_number - 1;
            const page = pdfDoc.getPage(pageIndex);
            const pageHeight = page.getHeight();

            const xPos = parseFloat(fieldData.x_position);
            const yPos = parseFloat(fieldData.y_position);
            const fieldWidth = parseFloat(fieldData.width);
            const fieldHeight = parseFloat(fieldData.height);

            const fmt = fieldData.field_config ? JSON.parse(fieldData.field_config) : null;
            const chosenFont = resolveFont(fmt);
            const chosenColor = parseColor(fmt && fmt.fontColor);
            const { size, displayText } = fitText(chosenFont, fieldData.field_value, fieldWidth, fieldHeight, fmt && fmt.fontSize);

            // Y invertido: yPos es desde arriba en viewport, pdf-lib usa desde abajo
            const pdfY = pageHeight - yPos - fieldHeight;

            // Alineación vertical
            const valign = fmt && fmt.verticalAlign;
            let textOffsetY = (fieldHeight - size) / 2; // middle por defecto
            if (valign === 'top') textOffsetY = fieldHeight - size - 2;
            else if (valign === 'bottom') textOffsetY = 2;

            // Alineación horizontal
            const halign = fmt && fmt.textAlign;
            let textOffsetX = 2;
            if (halign === 'center') {
                const textWidth = chosenFont.widthOfTextAtSize(displayText, size);
                textOffsetX = (fieldWidth - textWidth) / 2;
            } else if (halign === 'right') {
                const textWidth = chosenFont.widthOfTextAtSize(displayText, size);
                textOffsetX = fieldWidth - textWidth - 2;
            }

            page.drawText(displayText, {
                x: xPos + textOffsetX,
                y: pdfY + textOffsetY,
                size,
                font: chosenFont,
                color: chosenColor,
            });

            console.log(`   ✍️ Escrito "${fieldData.field_value}" en página ${fieldData.page_number} (x=${xPos}, y=${pdfY})`);
        }

        // 4. Guardar el PDF modificado con un nuevo nombre
        const pdfBytes = await pdfDoc.save();
        const dir = path.dirname(pdfPath);
        const ext = path.extname(pdfPath);
        const basename = path.basename(pdfPath, ext);
        const newPdfPath = path.join(dir, `${basename}_prefilled${ext}`);

        fs.writeFileSync(newPdfPath, pdfBytes);
        console.log(`   ✅ PDF pre-llenado guardado en: ${newPdfPath}\n`);

        return newPdfPath;

    } catch (error) {
        console.error('❌ [PREFILL-PDF] Error:', error);
        throw error;
    }
}

// =============================================
// FUNCIÓN HELPER: PRE-LLENAR PDF CON DATOS PERSONALIZADOS POR DESTINATARIO
// =============================================

async function prefillPDFWithRecipientData(db, documentId, pdfPath, recipientEmail, fieldValuesMap, fieldLabelMap) {
    try {
        console.log(`\n📝 [PREFILL-RECIPIENT-PDF] Pre-llenando PDF para ${recipientEmail}...`);

        if (!fieldValuesMap || Object.keys(fieldValuesMap).length === 0) {
            console.log(`   ℹ️ Sin valores específicos para ${recipientEmail}`);
            return null; // No hay datos específicos, usar PDF compartido
        }

        // 1. Obtener información de posiciones de los campos de texto
        // fieldLabelMap es { label → [field_id1, field_id2, ...] }, hay que aplanar
        const fieldIds = Object.values(fieldLabelMap).flat().filter(id => id);

        if (fieldIds.length === 0) {
            console.log(`   ⚠️ No se encontraron field_ids válidos`);
            return null;
        }

        const placeholders = fieldIds.map(() => '?').join(',');
        const [fieldPositions] = await new Promise((resolve, reject) => {
            db.query(
                `SELECT field_id, field_label, x_position, y_position, page_number, width, height, field_config
                 FROM document_fields
                 WHERE document_id = ? AND field_type = 'text' AND field_id IN (${placeholders})`,
                [documentId, ...fieldIds],
                (err, results) => {
                    if (err) reject(err);
                    else resolve([results]);
                }
            );
        });

        if (!fieldPositions || fieldPositions.length === 0) {
            console.log(`   ⚠️ No se encontraron posiciones de campos`);
            return null;
        }

        console.log(`   ✅ Encontradas ${fieldPositions.length} posiciones de campos`);

        // 2. Leer el PDF original
        const existingPdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const fontHlv = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontHlvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const fontTimesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
        const fontCourier2 = await pdfDoc.embedFont(StandardFonts.Courier);

        function resolveFont2(fmt) {
            if (!fmt) return fontHlv;
            const family = (fmt.fontFamily || '').toLowerCase();
            const bold = fmt.isBold;
            // Serif: Times New Roman, Georgia, Cambria, Palatino, Book Antiqua → TimesRoman
            if (family.includes('times') || family.includes('georgia') || family.includes('cambria') ||
                family.includes('palatino') || family.includes('book antiqua')) {
                return bold ? fontTimesBold : fontTimes;
            }
            // Monospace: Courier New → Courier
            if (family.includes('courier') || family.includes('mono')) return fontCourier2;
            // Sans-serif: Arial, Helvetica, Calibri, Verdana, Tahoma → Helvetica
            return bold ? fontHlvBold : fontHlv;
        }

        function parseColor2(hex) {
            if (!hex || !hex.startsWith('#')) return rgb(0, 0, 0);
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            return rgb(r, g, b);
        }

        let writtenCount = 0;

        // Helper: calcular fontSize que cabe y truncar texto si es necesario
        function fitTextInField(font, text, fieldWidth, fieldHeight, preferredSize) {
            let size = preferredSize ? Math.min(parseFloat(preferredSize), fieldHeight * 0.85) : Math.min(fieldHeight * 0.65, 12);
            size = Math.max(size, 6);
            const maxW = fieldWidth - 4;
            while (size > 6 && font.widthOfTextAtSize(text, size) > maxW) {
                size -= 0.5;
            }
            let displayText = text;
            while (font.widthOfTextAtSize(displayText, size) > maxW && displayText.length > 1) {
                displayText = displayText.slice(0, -1);
            }
            return { size, displayText };
        }

        // 3. Escribir cada valor del CSV en el PDF
        console.log(`\n📝 [PREFILL-RECIPIENT-PDF] Procesando ${Object.keys(fieldValuesMap).length} campos del CSV...`);
        console.log(`📋 DEBUG - Keys en fieldLabelMap:`, Object.keys(fieldLabelMap));
        console.log(`📋 DEBUG - Keys en fieldValuesMap (CSV):`, Object.keys(fieldValuesMap));

        for (const [csvLabel, value] of Object.entries(fieldValuesMap)) {
            // Normalizar el label del CSV de la misma forma que los de la BD
            const csvLabelNormalized = normalizeLabel(csvLabel);

            console.log(`\n   🔍 Procesando campo CSV: "${csvLabel}"`);
            console.log(`      → Normalizado: "${csvLabelNormalized}"`);
            console.log(`      → Valor: "${value}"`);

            // Buscar el field_id usando el fieldLabelMap
            let fieldId = null;
            let fieldIds = fieldLabelMap[csvLabelNormalized];

            console.log(`      → Buscando en fieldLabelMap["${csvLabelNormalized}"]...`);
            console.log(`      → Resultado directo:`, fieldIds);

            // Si el label existe directamente (sin sufijo)
            if (fieldIds && Array.isArray(fieldIds) && fieldIds.length > 0) {
                // Usar el primer campo del array
                fieldId = fieldIds[0];
                console.log(`      ✅ Label directo encontrado con ${fieldIds.length} campos`);
                console.log(`      → Usando primer campo del array: field_id=${fieldId}`);
                console.log(`      → Array completo:`, fieldIds);
            }
            // Si no se encuentra y termina en " N" (espacio + número), buscar el base label
            else if (!fieldId && /\s+\d+$/.test(csvLabelNormalized)) {
                const baseLabel = csvLabelNormalized.replace(/\s+\d+$/, '');
                console.log(`      → Campo con sufijo numérico detectado`);
                console.log(`      → Base label sin sufijo: "${baseLabel}"`);

                const matchingSuffix = csvLabelNormalized.match(/\s+(\d+)$/);
                const suffixNumber = matchingSuffix ? parseInt(matchingSuffix[1]) : 1;
                console.log(`      → Número de sufijo: ${suffixNumber}`);

                // Buscar el base label en el mapa
                const matchingFieldIds = fieldLabelMap[baseLabel];
                console.log(`      → Buscando fieldLabelMap["${baseLabel}"]...`);
                console.log(`      → Resultado:`, matchingFieldIds);

                if (matchingFieldIds && Array.isArray(matchingFieldIds) && matchingFieldIds.length > 0) {
                    // Usar el índice basado en el sufijo (sufijo 2 = índice 1, sufijo 3 = índice 2, etc.)
                    const index = suffixNumber - 1;
                    console.log(`      → Array tiene ${matchingFieldIds.length} campos`);
                    console.log(`      → Sufijo ${suffixNumber} → usando índice ${index}`);

                    if (index < matchingFieldIds.length) {
                        fieldId = matchingFieldIds[index];
                        console.log(`      ✅ Usando campo en índice ${index}: field_id=${fieldId}`);
                        console.log(`      → Array completo:`, matchingFieldIds);
                    } else {
                        console.log(`      ⚠️ Índice ${index} fuera de rango (array tiene ${matchingFieldIds.length} elementos)`);
                        console.log(`      → Usando último campo disponible: field_id=${matchingFieldIds[matchingFieldIds.length - 1]}`);
                        fieldId = matchingFieldIds[matchingFieldIds.length - 1];
                    }
                } else {
                    console.log(`      ❌ Base label "${baseLabel}" no encontrado en fieldLabelMap`);
                }
            }

            if (!fieldId) {
                console.log(`      ❌ Campo "${csvLabel}" (normalizado: "${csvLabelNormalized}") NO encontrado en fieldLabelMap`);
                console.log(`      📋 Labels disponibles en fieldLabelMap:`, Object.keys(fieldLabelMap));
                continue;
            }

            console.log(`      ✅ Mapeado a field_id=${fieldId}`);

            // Buscar la posición del campo
            const fieldPos = fieldPositions.find(f => f.field_id === fieldId);
            if (!fieldPos) {
                console.log(`   ⚠️ Posición no encontrada para field_id=${fieldId}`);
                continue;
            }

            const pageIndex = fieldPos.page_number - 1;
            const page = pdfDoc.getPage(pageIndex);
            const pageHeight = page.getHeight();

            const xPos = parseFloat(fieldPos.x_position);
            const yPos = parseFloat(fieldPos.y_position);
            const fieldWidth = parseFloat(fieldPos.width);
            const fieldHeight = parseFloat(fieldPos.height);

            // Y en pdf-lib: origen abajo-izquierda. yPos es desde arriba → invertir
            const pdfY = pageHeight - yPos - fieldHeight;
            const fmt2 = fieldPos.field_config ? JSON.parse(fieldPos.field_config) : null;
            const chosenFont2 = resolveFont2(fmt2);
            const chosenColor2 = parseColor2(fmt2 && fmt2.fontColor);
            const { size, displayText } = fitTextInField(chosenFont2, value.toString(), fieldWidth, fieldHeight, fmt2 && fmt2.fontSize);

            const valign2 = fmt2 && fmt2.verticalAlign;
            let textOffsetY = (fieldHeight - size) / 2;
            if (valign2 === 'top') textOffsetY = fieldHeight - size - 2;
            else if (valign2 === 'bottom') textOffsetY = 2;

            const halign2 = fmt2 && fmt2.textAlign;
            let textOffsetX = 2;
            if (halign2 === 'center') {
                const tw = chosenFont2.widthOfTextAtSize(displayText, size);
                textOffsetX = (fieldWidth - tw) / 2;
            } else if (halign2 === 'right') {
                const tw = chosenFont2.widthOfTextAtSize(displayText, size);
                textOffsetX = fieldWidth - tw - 2;
            }

            page.drawText(displayText, {
                x: xPos + textOffsetX,
                y: pdfY + textOffsetY,
                size,
                font: chosenFont2,
                color: chosenColor2,
            });

            console.log(`   ✍️ Escrito "${displayText}" (size=${size.toFixed(1)}) en campo "${csvLabel}" (field_id=${fieldId})`);
            writtenCount++;
        }

        // Resumen del mapeo
        console.log(`\n📊 [PREFILL-RECIPIENT-PDF] RESUMEN del mapeo para ${recipientEmail}:`);
        console.log(`   ✅ Campos escritos exitosamente: ${writtenCount}/${Object.keys(fieldValuesMap).length}`);
        console.log(`   ❌ Campos NO mapeados: ${Object.keys(fieldValuesMap).length - writtenCount}`);

        if (writtenCount === 0) {
            console.log(`\n   ⚠️ ADVERTENCIA: No se escribió ningún valor para ${recipientEmail}`);
            console.log(`   💡 SUGERENCIA: Verifica que los nombres de las columnas del CSV coincidan EXACTAMENTE con los labels de los campos en la base de datos`);
            return null;
        }

        // 4. Guardar el PDF modificado con nombre específico del destinatario
        const pdfBytes = await pdfDoc.save();
        const dir = path.dirname(pdfPath);
        const ext = path.extname(pdfPath);
        const basename = path.basename(pdfPath, ext);

        // Crear nombre seguro del archivo usando timestamp y hash del email
        const emailHash = require('crypto').createHash('md5').update(recipientEmail).digest('hex').substring(0, 8);
        const timestamp = Date.now();
        const newPdfPath = path.join(dir, `${basename}_recipient_${emailHash}_${timestamp}${ext}`);

        fs.writeFileSync(newPdfPath, pdfBytes);
        console.log(`   ✅ PDF personalizado guardado: ${newPdfPath}\n`);

        return newPdfPath;

    } catch (error) {
        console.error(`❌ [PREFILL-RECIPIENT-PDF] Error para ${recipientEmail}:`, error);
        throw error;
    }
}

module.exports = router;
