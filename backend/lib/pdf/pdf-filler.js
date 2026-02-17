/**
 * PDF Filler Service
 *
 * Rellena campos de formularios PDF (AcroForm) con valores específicos.
 * Usado principalmente en envíos masivos para generar PDFs personalizados
 * a partir de datos de Excel/CSV.
 *
 * @module lib/pdf/pdf-filler
 */

const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, rgb, StandardFonts } = require('pdf-lib');
const { PATHS } = require('../../config/paths');

/**
 * Rellena un PDF usando coordenadas visuales (estilo DocuSeal)
 *
 * @param {string} templatePath - Ruta al PDF plantilla
 * @param {Array} fields - Array de campos con coordenadas y valores
 * @param {number} jobId - ID del trabajo masivo
 * @param {number} rowNumber - Número de fila del Excel
 * @returns {Promise<string>} Ruta al PDF generado
 *
 * @example
 * const filledPdfPath = await fillPDFWithCoordinates(
 *   '/uploads/templates/contrato.pdf',
 *   [
 *     { field_key: 'nombre', value: 'Juan Pérez', page_number: 1, position_x: 100, position_y: 500, width: 200, height: 30, font_size: 12 }
 *   ],
 *   123,
 *   1
 * );
 */
async function fillPDFWithCoordinates(templatePath, fields, jobId, rowNumber) {
    try {
        console.log(`[PDF Filler Coords] Iniciando rellenado para job ${jobId}, fila ${rowNumber}`);
        console.log(`[PDF Filler Coords] Template: ${templatePath}`);
        console.log(`[PDF Filler Coords] Campos a escribir: ${fields.length}`);

        // 1. Validar que el template existe
        await fs.access(templatePath);

        // 2. Leer template
        const templateBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(templateBytes);

        // 3. Cargar fuente estándar
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // 4. Escribir cada campo en sus coordenadas
        let filledCount = 0;

        for (const field of fields) {
            try {
                if (!field.value || field.position_x === null || field.position_y === null) {
                    console.warn(`  [!] Campo "${field.field_key}" sin valor o coordenadas, omitiendo...`);
                    continue;
                }

                const pageNumber = field.page_number || 1;
                const page = pdfDoc.getPages()[pageNumber - 1]; // Las páginas empiezan en 0

                if (!page) {
                    console.warn(`  [!] Página ${pageNumber} no existe en el PDF`);
                    continue;
                }

                const { height: pageHeight } = page.getSize();
                const fontSize = field.font_size || 12;
                const textValue = String(field.value).trim();

                // Convertir coordenadas: PDF.js usa top-left, pdf-lib usa bottom-left
                const yCoord = pageHeight - field.position_y - (field.height || fontSize);

                // Dibujar texto
                page.drawText(textValue, {
                    x: field.position_x,
                    y: yCoord,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0),
                    maxWidth: field.width || 200
                });

                filledCount++;
                console.log(`  ✓ ${field.field_key} = "${textValue}" en página ${pageNumber} (${field.position_x}, ${field.position_y})`);

            } catch (fieldError) {
                console.error(`  ✗ Error en campo "${field.field_key}": ${fieldError.message}`);
            }
        }

        // 5. Crear directorio de salida
        const outputDir = path.join(PATHS.UPLOADS_DIR, 'filled_pdfs', String(jobId));
        await fs.mkdir(outputDir, { recursive: true });

        // 6. Generar nombre de archivo
        const outputFilename = `row_${String(rowNumber).padStart(5, '0')}.pdf`;
        const outputPath = path.join(outputDir, outputFilename);

        // 7. Guardar PDF rellenado
        const filledPdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, filledPdfBytes);

        // 8. Obtener tamaño del archivo
        const stats = await fs.stat(outputPath);
        const fileSizeKB = (stats.size / 1024).toFixed(2);

        console.log(`[PDF Filler Coords] ✓ PDF guardado: ${outputPath} (${fileSizeKB} KB)`);
        console.log(`[PDF Filler Coords] Resumen: ${filledCount} campos escritos de ${fields.length}`);

        return outputPath;

    } catch (error) {
        console.error('[PDF Filler Coords] Error crítico:', error);
        throw new Error(`Failed to fill PDF with coordinates: ${error.message}`);
    }
}

/**
 * Rellena un PDF plantilla con valores específicos
 *
 * @param {string} templatePath - Ruta al PDF plantilla con campos AcroForm
 * @param {Object} fieldValues - Objeto con valores { field_key: valor }
 * @param {number} jobId - ID del trabajo masivo (para organizar archivos)
 * @param {number} rowNumber - Número de fila del Excel (para nombre de archivo)
 * @param {Object} options - Opciones adicionales
 * @param {boolean} options.flatten - Aplanar formulario (hacer no editable)
 * @param {boolean} options.keepOriginal - Mantener archivo original
 * @param {Array} options.coordinateFields - Si se provee, usar coordenadas en lugar de AcroForm
 * @returns {Promise<string>} Ruta al PDF generado
 *
 * @example
 * const filledPdfPath = await fillPDFTemplate(
 *   '/uploads/templates/contrato.pdf',
 *   { nombre: 'Juan Pérez', cedula: '12345678', monto: '$1000' },
 *   123,
 *   1
 * );
 */
async function fillPDFTemplate(templatePath, fieldValues, jobId, rowNumber, options = {}) {
    try {
        const {
            flatten = false,
            keepOriginal = false,
            coordinateFields = null
        } = options;

        // Si hay campos con coordenadas, usar método visual
        if (coordinateFields && Array.isArray(coordinateFields)) {
            console.log(`[PDF Filler] Detectado modo coordenadas, usando fillPDFWithCoordinates`);
            return await fillPDFWithCoordinates(templatePath, coordinateFields, jobId, rowNumber);
        }

        console.log(`[PDF Filler] Iniciando rellenado para job ${jobId}, fila ${rowNumber}`);
        console.log(`[PDF Filler] Template: ${templatePath}`);
        console.log(`[PDF Filler] Campos a rellenar: ${Object.keys(fieldValues).length}`);

        // 1. Validar que el template existe
        await fs.access(templatePath);

        // 2. Leer template
        const templateBytes = await fs.readFile(templatePath);
        const pdfDoc = await PDFDocument.load(templateBytes);

        // 3. Obtener formulario
        const form = pdfDoc.getForm();
        const availableFields = form.getFields().map(f => f.getName());

        console.log(`[PDF Filler] Campos disponibles en PDF: ${availableFields.length}`);

        // 4. Rellenar cada campo
        let filledCount = 0;
        let skippedCount = 0;
        const errors = [];

        for (const [fieldKey, value] of Object.entries(fieldValues)) {
            try {
                // Verificar que el campo existe en el PDF
                if (!availableFields.includes(fieldKey)) {
                    console.warn(`  [!] Campo "${fieldKey}" no existe en el PDF, omitiendo...`);
                    skippedCount++;
                    continue;
                }

                // Obtener campo y rellenarlo según su tipo
                const field = form.getField(fieldKey);
                const filled = await fillField(field, value, fieldKey);

                if (filled) {
                    filledCount++;
                    console.log(`  ✓ ${fieldKey} = "${value}"`);
                } else {
                    skippedCount++;
                }

            } catch (fieldError) {
                errors.push({
                    field: fieldKey,
                    value: value,
                    error: fieldError.message
                });
                console.error(`  ✗ Error en campo "${fieldKey}": ${fieldError.message}`);
            }
        }

        // 5. Aplanar formulario si se solicita
        if (flatten) {
            try {
                form.flatten();
                console.log(`[PDF Filler] Formulario aplanado (campos no editables)`);
            } catch (flattenError) {
                console.warn(`[PDF Filler] No se pudo aplanar formulario: ${flattenError.message}`);
            }
        }

        // 6. Crear directorio de salida
        const outputDir = path.join(PATHS.UPLOADS_DIR, 'filled_pdfs', String(jobId));
        await fs.mkdir(outputDir, { recursive: true });

        // 7. Generar nombre de archivo
        const outputFilename = `row_${String(rowNumber).padStart(5, '0')}.pdf`;
        const outputPath = path.join(outputDir, outputFilename);

        // 8. Guardar PDF rellenado
        const filledPdfBytes = await pdfDoc.save();
        await fs.writeFile(outputPath, filledPdfBytes);

        // 9. Obtener tamaño del archivo
        const stats = await fs.stat(outputPath);
        const fileSizeKB = (stats.size / 1024).toFixed(2);

        console.log(`[PDF Filler] ✓ PDF guardado: ${outputPath} (${fileSizeKB} KB)`);
        console.log(`[PDF Filler] Resumen: ${filledCount} campos rellenados, ${skippedCount} omitidos, ${errors.length} errores`);

        if (errors.length > 0) {
            console.warn(`[PDF Filler] Errores durante rellenado:`, errors);
        }

        return outputPath;

    } catch (error) {
        console.error('[PDF Filler] Error crítico:', error);
        throw new Error(`Failed to fill PDF template: ${error.message}`);
    }
}

/**
 * Rellena un campo individual según su tipo
 *
 * @private
 * @param {PDFField} field - Campo de pdf-lib
 * @param {any} value - Valor a asignar
 * @param {string} fieldName - Nombre del campo (para logging)
 * @returns {Promise<boolean>} true si se rellenó exitosamente
 */
async function fillField(field, value, fieldName) {
    const constructorName = field.constructor.name;

    try {
        switch (constructorName) {
            case 'PDFTextField':
                return fillTextField(field, value);

            case 'PDFCheckBox':
                return fillCheckBox(field, value);

            case 'PDFDropdown':
                return fillDropdown(field, value);

            case 'PDFRadioGroup':
                return fillRadioGroup(field, value);

            default:
                console.warn(`  [!] Tipo de campo no soportado: ${constructorName} para "${fieldName}"`);
                return false;
        }
    } catch (error) {
        throw new Error(`Error filling ${constructorName}: ${error.message}`);
    }
}

/**
 * Rellena un campo de texto
 * @private
 */
function fillTextField(field, value) {
    if (value === null || value === undefined) {
        field.setText('');
        return true;
    }

    // Convertir a string y limpiar
    let textValue = String(value).trim();

    // Limitar longitud si el campo tiene restricción
    try {
        const maxLength = field.getMaxLength();
        if (maxLength && textValue.length > maxLength) {
            console.warn(`  [!] Valor truncado: "${textValue}" (max: ${maxLength})`);
            textValue = textValue.substring(0, maxLength);
        }
    } catch (e) {
        // Si no se puede obtener maxLength, continuar
    }

    field.setText(textValue);
    return true;
}

/**
 * Rellena un checkbox
 * @private
 */
function fillCheckBox(field, value) {
    // Valores truthy/falsy
    const truthyValues = [true, 'true', '1', 'sí', 'si', 'yes', 'y', 'x', 'checked'];
    const isChecked = truthyValues.includes(String(value).toLowerCase());

    if (isChecked) {
        field.check();
    } else {
        field.uncheck();
    }

    return true;
}

/**
 * Rellena un dropdown
 * @private
 */
function fillDropdown(field, value) {
    if (!value) {
        return false;
    }

    const options = field.getOptions();
    const stringValue = String(value).trim();

    // Buscar coincidencia exacta o parcial (case-insensitive)
    const matchedOption = options.find(opt =>
        opt.toLowerCase() === stringValue.toLowerCase() ||
        opt.toLowerCase().includes(stringValue.toLowerCase())
    );

    if (matchedOption) {
        field.select(matchedOption);
        return true;
    } else {
        console.warn(`  [!] Opción "${stringValue}" no encontrada. Opciones: ${options.join(', ')}`);
        return false;
    }
}

/**
 * Rellena un radio group
 * @private
 */
function fillRadioGroup(field, value) {
    if (!value) {
        return false;
    }

    const options = field.getOptions();
    const stringValue = String(value).trim();

    const matchedOption = options.find(opt =>
        opt.toLowerCase() === stringValue.toLowerCase()
    );

    if (matchedOption) {
        field.select(matchedOption);
        return true;
    } else {
        console.warn(`  [!] Opción de radio "${stringValue}" no encontrada. Opciones: ${options.join(', ')}`);
        return false;
    }
}

/**
 * Transforma un valor según regla específica
 *
 * @param {any} value - Valor original
 * @param {string} transformRule - Regla: 'direct', 'uppercase', 'lowercase', 'date_format', 'currency'
 * @param {Object} params - Parámetros adicionales para la transformación
 * @returns {any} Valor transformado
 *
 * @example
 * transformValue('juan perez', 'uppercase') // 'JUAN PEREZ'
 * transformValue('2024-01-15', 'date_format', { format: 'DD/MM/YYYY' }) // '15/01/2024'
 */
function transformValue(value, transformRule = 'direct', params = {}) {
    if (value === null || value === undefined) {
        return '';
    }

    switch (transformRule) {
        case 'uppercase':
            return String(value).toUpperCase();

        case 'lowercase':
            return String(value).toLowerCase();

        case 'capitalize':
            return String(value)
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

        case 'currency':
            // Formato de moneda
            const amount = parseFloat(value);
            if (isNaN(amount)) return value;
            return new Intl.NumberFormat('es-ES', {
                style: 'currency',
                currency: params.currency || 'USD'
            }).format(amount);

        case 'date_format':
            // Conversión de formato de fecha (básico)
            try {
                const date = new Date(value);
                if (isNaN(date.getTime())) return value;

                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();

                const format = params.format || 'DD/MM/YYYY';
                return format
                    .replace('DD', day)
                    .replace('MM', month)
                    .replace('YYYY', year);
            } catch (e) {
                return value;
            }

        case 'trim':
            return String(value).trim();

        case 'direct':
        default:
            return value;
    }
}

/**
 * Rellena múltiples PDFs en lote
 *
 * @param {string} templatePath - Ruta al template
 * @param {Array<Object>} rowsData - Array de objetos con datos de filas
 * @param {number} jobId - ID del trabajo masivo
 * @param {Object} options - Opciones
 * @returns {Promise<Array<string>>} Array de rutas a PDFs generados
 */
async function fillPDFBatch(templatePath, rowsData, jobId, options = {}) {
    const results = [];

    console.log(`[PDF Filler Batch] Procesando ${rowsData.length} documentos...`);

    for (let i = 0; i < rowsData.length; i++) {
        const rowNumber = i + 1;
        const fieldValues = rowsData[i];

        try {
            const outputPath = await fillPDFTemplate(
                templatePath,
                fieldValues,
                jobId,
                rowNumber,
                options
            );

            results.push({
                rowNumber,
                success: true,
                path: outputPath
            });

        } catch (error) {
            console.error(`[PDF Filler Batch] Error en fila ${rowNumber}:`, error.message);
            results.push({
                rowNumber,
                success: false,
                error: error.message
            });
        }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[PDF Filler Batch] ✓ Completado: ${successful} exitosos, ${failed} fallidos`);

    return results;
}

module.exports = {
    fillPDFTemplate,
    fillPDFWithCoordinates,
    fillPDFBatch,
    transformValue
};
