/**
 * =============================================
 * BULK JOB WORKER
 * Procesa trabajos masivos:
 * - Lee Excel fila por fila
 * - Rellena PDF con datos mapeados
 * - Pasa el PDF al flujo de firma existente
 * =============================================
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { fillPDFTemplate, transformValue } = require('../lib/pdf/pdf-filler');
const { query } = require('../lib/db-utils');

/**
 * Procesa un bulk job completo
 * Esta función es llamada por Bull queue
 */
async function processBulkJob(job, db) {
    const { bulkJobId, userId } = job.data;

    console.log(`\n🚀 [BULK-WORKER] Iniciando job ${bulkJobId}`);

    try {
        // 1. Cargar configuración del job
        const jobs = await query(db,
            `SELECT bj.*, d.file_path as template_pdf_path, d.name as template_name
             FROM bulk_jobs bj
             JOIN documents d ON bj.template_id = d.document_id
             WHERE bj.id = ?`,
            [bulkJobId]
        );

        if (jobs.length === 0) {
            throw new Error(`Job ${bulkJobId} no encontrado`);
        }

        const jobData = jobs[0];

        console.log(`📄 Plantilla: ${jobData.template_name}`);
        console.log(`📊 Excel: ${jobData.excel_file_path}`);
        console.log(`📋 Total filas: ${jobData.total_rows}`);

        // 2. Cargar mapeos con coordenadas
        const mappings = await query(db,
            `SELECT bm.*,
                    tf.field_key,
                    tf.field_type,
                    tf.page_number,
                    tf.position_x,
                    tf.position_y,
                    tf.width,
                    tf.height,
                    tf.font_size
             FROM bulk_mappings bm
             JOIN template_fields tf ON bm.template_field_id = tf.id
             WHERE bm.bulk_job_id = ?`,
            [bulkJobId]
        );

        if (mappings.length === 0) {
            throw new Error('No hay mapeos configurados');
        }

        console.log(`🗺️  Mapeos cargados: ${mappings.length}`);

        // Detectar si usa coordenadas visuales
        const hasCoordinates = mappings.some(m => m.position_x !== null && m.position_y !== null);
        console.log(`📍 Modo de llenado: ${hasCoordinates ? 'Coordenadas visuales' : 'AcroForm'}`);

        // Crear objeto { field_key: { columnName, transformRule, coordinates } }
        const mappingMap = {};
        mappings.forEach(m => {
            mappingMap[m.field_key] = {
                columnName: m.excel_column_name,
                transformRule: m.transform_rule || 'direct',
                fieldType: m.field_type,
                page_number: m.page_number,
                position_x: m.position_x,
                position_y: m.position_y,
                width: m.width,
                height: m.height,
                font_size: m.font_size
            };
        });

        // 3. Leer Excel
        const workbook = XLSX.readFile(jobData.excel_file_path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        console.log(`📊 Excel parseado: ${rows.length} filas`);

        // 4. PROCESAR CADA FILA
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i];
            const rowNumber = i + 1;

            console.log(`\n[${rowNumber}/${rows.length}] Procesando fila ${rowNumber}...`);

            try {
                // 4.1 Construir objeto de valores { field_key: valor }
                const fieldValues = buildFieldValues(rowData, mappingMap);

                console.log(`  📝 Campos mapeados:`, fieldValues);

                // 4.2 *** GENERAR PDF PERSONALIZADO ***
                let filledPdfPath;

                if (hasCoordinates) {
                    // Construir array de campos con coordenadas y valores
                    const coordinateFields = Object.keys(fieldValues).map(fieldKey => {
                        const mapping = mappingMap[fieldKey];
                        return {
                            field_key: fieldKey,
                            value: fieldValues[fieldKey],
                            page_number: mapping.page_number,
                            position_x: mapping.position_x,
                            position_y: mapping.position_y,
                            width: mapping.width,
                            height: mapping.height,
                            font_size: mapping.font_size
                        };
                    });

                    filledPdfPath = await fillPDFTemplate(
                        jobData.template_pdf_path,
                        fieldValues,
                        bulkJobId,
                        rowNumber,
                        { flatten: false, coordinateFields }
                    );
                } else {
                    // Modo AcroForm tradicional
                    filledPdfPath = await fillPDFTemplate(
                        jobData.template_pdf_path,
                        fieldValues,
                        bulkJobId,
                        rowNumber,
                        { flatten: false }
                    );
                }

                console.log(`  ✅ PDF generado: ${filledPdfPath}`);

                // 4.3 Crear documento en BD
                const docResult = await query(db,
                    `INSERT INTO documents
                     (name, file_path, filled_pdf_path, bulk_job_id, excel_row_number, uploaded_by, is_template, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
                    [
                        `${jobData.template_name} - Fila ${rowNumber}`,
                        filledPdfPath, // file_path apunta al PDF rellenado
                        filledPdfPath,
                        bulkJobId,
                        rowNumber,
                        userId
                    ]
                );

                const documentId = docResult.insertId;

                console.log(`  💾 Documento creado: ID ${documentId}`);

                // 4.4 *** AQUÍ SE CONECTA CON TU FLUJO EXISTENTE ***
                await createRecipientAndSendEmail(documentId, rowData, jobData, db, userId);

                successCount++;

                // Actualizar progreso
                await query(db,
                    `UPDATE bulk_jobs
                     SET processed_rows = ?, successful_rows = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [rowNumber, successCount, bulkJobId]
                );

            } catch (rowError) {
                console.error(`  ✗ Error en fila ${rowNumber}:`, rowError.message);

                failedCount++;

                // Registrar error
                await query(db,
                    `INSERT INTO bulk_job_errors
                     (bulk_job_id, row_number, row_data, error_type, error_message, stack_trace, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        bulkJobId,
                        rowNumber,
                        JSON.stringify(rowData),
                        rowError.name || 'ProcessingError',
                        rowError.message,
                        rowError.stack
                    ]
                );

                // Actualizar progreso con error
                await query(db,
                    `UPDATE bulk_jobs
                     SET processed_rows = ?, failed_rows = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [rowNumber, failedCount, bulkJobId]
                );

                // Continuar con siguiente fila (no detener todo el job)
                continue;
            }

            // Pequeña pausa para no sobrecargar
            await sleep(100);
        }

        // 5. Marcar job como completado
        await query(db,
            `UPDATE bulk_jobs
             SET status = 'completed', completed_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [bulkJobId]
        );

        console.log(`\n✅ [BULK-WORKER] Job ${bulkJobId} completado`);
        console.log(`   ✓ Exitosos: ${successCount}`);
        console.log(`   ✗ Fallidos: ${failedCount}`);

        return {
            success: true,
            bulkJobId,
            successCount,
            failedCount
        };

    } catch (error) {
        console.error(`\n❌ [BULK-WORKER] Error fatal en job ${bulkJobId}:`, error);

        // Marcar job como fallido
        await query(db,
            `UPDATE bulk_jobs
             SET status = 'failed', error_message = ?, updated_at = NOW()
             WHERE id = ?`,
            [error.message, bulkJobId]
        );

        throw error;
    }
}

/**
 * Construye objeto de valores mapeados
 * @param {Object} rowData - Fila del Excel
 * @param {Object} mappingMap - { field_key: { columnName, transformRule } }
 * @returns {Object} { field_key: valor_transformado }
 */
function buildFieldValues(rowData, mappingMap) {
    const fieldValues = {};

    for (const [fieldKey, mapping] of Object.entries(mappingMap)) {
        const columnName = mapping.columnName;
        const rawValue = rowData[columnName];

        // Aplicar transformación
        const transformedValue = transformValue(
            rawValue,
            mapping.transformRule,
            {}
        );

        fieldValues[fieldKey] = transformedValue;
    }

    return fieldValues;
}

/**
 * Crear destinatario y enviar email
 * ESTA FUNCIÓN DEBE INTEGRARSE CON TU SISTEMA EXISTENTE
 */
async function createRecipientAndSendEmail(documentId, rowData, jobData, db, userId) {
    // IMPORTANTE: Adapta esto a tu lógica existente

    // 1. Buscar email del destinatario en el Excel
    // (ajusta según tus columnas)
    const recipientEmail = rowData.email || rowData.Email || rowData.correo || rowData.Correo;
    const recipientName = rowData.name || rowData.nombre || rowData.Nombre || rowData['Nombre Completo'] || 'Destinatario';

    if (!recipientEmail) {
        throw new Error('No se encontró columna de email en el Excel. Asegúrate de tener una columna llamada "email", "Email", "correo" o "Correo"');
    }

    // 2. Generar token único
    const token = crypto.randomBytes(32).toString('hex');

    // 3. Insertar destinatario
    const recipientResult = await query(db,
        `INSERT INTO document_recipients
         (document_id, email, name, token, status, created_at)
         VALUES (?, ?, ?, ?, 'sent', NOW())`,
        [documentId, recipientEmail, recipientName, token]
    );

    const recipientId = recipientResult.insertId;

    console.log(`  📧 Destinatario creado: ${recipientEmail} (ID: ${recipientId})`);

    // 4. *** AQUÍ INTEGRAS TU FLUJO ACTUAL ***

    // OPCIÓN 1: Si usas python_signer para firma inmediata
    // const PythonSignerClient = require('../lib/signatures/python-signer-client');
    // const pythonSigner = new PythonSignerClient();
    // const signedPdfPath = await pythonSigner.signDocument({
    //     inputPdf: filledPdfPath,
    //     certificatePath: process.env.CERT_PATH,
    //     certificatePassword: process.env.CERT_PASSWORD,
    //     reason: 'Firma automática',
    //     location: 'Sistema FirmaLegal'
    // });

    // OPCIÓN 2: Si el usuario firma después (más común)
    // Solo enviar email con enlace de firma
    // const { sendSignatureRequestEmail } = require('../lib/email/mailer-dynamic');
    // await sendSignatureRequestEmail({
    //     to: recipientEmail,
    //     name: recipientName,
    //     token: token,
    //     documentName: jobData.template_name,
    //     senderName: 'Tu Empresa'
    // });

    // Por ahora, solo log (REEMPLAZA ESTO CON TU LÓGICA)
    const signUrl = `${process.env.APP_URL || 'http://localhost:3000'}/public-sign.html?token=${token}`;
    console.log(`  📧 Email pendiente: ${recipientEmail}`);
    console.log(`  🔗 Link de firma: ${signUrl}`);

    // OPCIONAL: Si quieres encolar el email en tu sistema existente
    // const Queue = require('bull');
    // const emailQueue = new Queue('bulk-emails', {
    //     redis: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT }
    // });
    // await emailQueue.add({
    //     recipientId,
    //     email: recipientEmail,
    //     name: recipientName,
    //     token,
    //     documentId
    // });

    return recipientId;
}

/**
 * Utilidad: sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    processBulkJob
};
