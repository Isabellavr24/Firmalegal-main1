/**
 * AcroForm Parser
 *
 * Servicio para extraer campos de formularios PDF (AcroForm)
 * usando pdf-lib. Identifica nombres de campos, tipos y propiedades.
 *
 * @module lib/pdf/acroform-parser
 */

const fs = require('fs').promises;
const { PDFDocument } = require('pdf-lib');
const path = require('path');

/**
 * Extrae todos los campos de un PDF con AcroForm
 *
 * @param {string} pdfPath - Ruta absoluta al archivo PDF
 * @returns {Promise<Array<Object>>} Array de objetos con información de campos
 * @throws {Error} Si el PDF no existe, está corrupto o no tiene campos
 *
 * @example
 * const fields = await parseTemplateFields('/path/to/template.pdf');
 * // Retorna: [
 * //   { name: 'nombre', type: 'text', defaultValue: null, required: false },
 * //   { name: 'cedula', type: 'text', defaultValue: null, required: true }
 * // ]
 */
async function parseTemplateFields(pdfPath) {
    try {
        // 1. Validar que el archivo existe
        await fs.access(pdfPath);

        console.log(`[AcroForm Parser] Leyendo PDF: ${pdfPath}`);

        // 2. Leer bytes del PDF
        const pdfBytes = await fs.readFile(pdfPath);

        // 3. Cargar documento con pdf-lib
        const pdfDoc = await PDFDocument.load(pdfBytes, {
            updateMetadata: false,
            ignoreEncryption: true
        });

        // 4. Obtener formulario
        const form = pdfDoc.getForm();
        const fields = form.getFields();

        if (!fields || fields.length === 0) {
            throw new Error('El PDF no contiene campos de formulario (AcroForm). Asegúrate de usar un PDF con campos editables.');
        }

        console.log(`[AcroForm Parser] Encontrados ${fields.length} campos`);

        // 5. Parsear información de cada campo
        const parsedFields = [];

        for (const field of fields) {
            const fieldInfo = extractFieldInfo(field);

            if (fieldInfo) {
                parsedFields.push(fieldInfo);
                console.log(`  - Campo: "${fieldInfo.name}" (${fieldInfo.type})`);
            }
        }

        // 6. Ordenar por nombre para consistencia
        parsedFields.sort((a, b) => a.name.localeCompare(b.name));

        console.log(`[AcroForm Parser] ✓ Parseo exitoso: ${parsedFields.length} campos procesados`);

        return parsedFields;

    } catch (error) {
        console.error('[AcroForm Parser] Error:', error.message);

        if (error.code === 'ENOENT') {
            throw new Error(`El archivo PDF no existe: ${pdfPath}`);
        }

        if (error.message.includes('encrypted')) {
            throw new Error('El PDF está protegido con contraseña. Por favor, sube una versión sin protección.');
        }

        throw error;
    }
}

/**
 * Extrae información detallada de un campo individual
 *
 * @private
 * @param {PDFField} field - Campo de pdf-lib
 * @returns {Object|null} Información del campo o null si no se puede procesar
 */
function extractFieldInfo(field) {
    try {
        const fieldName = field.getName();

        // Determinar tipo de campo
        let fieldType = 'text';
        let defaultValue = null;
        let options = null;

        const constructorName = field.constructor.name;

        switch (constructorName) {
            case 'PDFTextField':
                fieldType = 'text';
                try {
                    defaultValue = field.getText() || null;
                } catch (e) {
                    defaultValue = null;
                }
                break;

            case 'PDFCheckBox':
                fieldType = 'checkbox';
                try {
                    defaultValue = field.isChecked();
                } catch (e) {
                    defaultValue = false;
                }
                break;

            case 'PDFDropdown':
                fieldType = 'dropdown';
                try {
                    options = field.getOptions();
                    defaultValue = field.getSelected();
                } catch (e) {
                    options = [];
                    defaultValue = null;
                }
                break;

            case 'PDFRadioGroup':
                fieldType = 'radio';
                try {
                    options = field.getOptions();
                    defaultValue = field.getSelected();
                } catch (e) {
                    options = [];
                    defaultValue = null;
                }
                break;

            case 'PDFButton':
                // Ignorar botones (no son campos de datos)
                return null;

            default:
                console.warn(`  [!] Tipo de campo desconocido: ${constructorName} para "${fieldName}"`);
                fieldType = 'text'; // Fallback
        }

        // Detectar si es campo de fecha por nombre
        if (fieldType === 'text' && isDateField(fieldName)) {
            fieldType = 'date';
        }

        // Detectar si es numérico por nombre
        if (fieldType === 'text' && isNumberField(fieldName)) {
            fieldType = 'number';
        }

        return {
            name: fieldName,
            type: fieldType,
            defaultValue: defaultValue,
            options: options,
            required: false, // pdf-lib no expone esta propiedad fácilmente
            label: formatFieldLabel(fieldName)
        };

    } catch (error) {
        console.warn(`  [!] Error procesando campo: ${error.message}`);
        return null;
    }
}

/**
 * Detecta si un campo es de tipo fecha por su nombre
 * @private
 */
function isDateField(fieldName) {
    const datePatterns = [
        /fecha/i,
        /date/i,
        /nacimiento/i,
        /ingreso/i,
        /vencimiento/i,
        /inicio/i,
        /fin/i,
        /contrato/i
    ];

    return datePatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Detecta si un campo es numérico por su nombre
 * @private
 */
function isNumberField(fieldName) {
    const numberPatterns = [
        /monto/i,
        /cantidad/i,
        /precio/i,
        /salario/i,
        /sueldo/i,
        /valor/i,
        /numero/i,
        /number/i,
        /cedula/i,
        /dni/i,
        /id/i,
        /telefono/i,
        /celular/i
    ];

    return numberPatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Formatea el nombre de campo para etiqueta amigable
 *
 * @private
 * @param {string} fieldName - Nombre técnico del campo
 * @returns {string} Etiqueta amigable
 *
 * @example
 * formatFieldLabel('nombre_completo') // 'Nombre Completo'
 * formatFieldLabel('CEDULA_ID') // 'Cedula Id'
 */
function formatFieldLabel(fieldName) {
    return fieldName
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Valida que un PDF tenga campos específicos
 *
 * @param {string} pdfPath - Ruta al PDF
 * @param {Array<string>} requiredFields - Nombres de campos requeridos
 * @returns {Promise<Object>} { valid: boolean, missingFields: string[] }
 *
 * @example
 * const validation = await validateRequiredFields('/path/to/pdf', ['nombre', 'cedula']);
 * if (!validation.valid) {
 *   console.error('Faltan campos:', validation.missingFields);
 * }
 */
async function validateRequiredFields(pdfPath, requiredFields) {
    try {
        const fields = await parseTemplateFields(pdfPath);
        const fieldNames = fields.map(f => f.name);

        const missingFields = requiredFields.filter(
            required => !fieldNames.includes(required)
        );

        return {
            valid: missingFields.length === 0,
            missingFields: missingFields,
            foundFields: fieldNames
        };

    } catch (error) {
        throw new Error(`Error validating PDF fields: ${error.message}`);
    }
}

/**
 * Obtiene metadatos adicionales del PDF
 *
 * @param {string} pdfPath - Ruta al PDF
 * @returns {Promise<Object>} Metadatos del PDF
 */
async function getPDFMetadata(pdfPath) {
    try {
        const pdfBytes = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);

        const pageCount = pdfDoc.getPageCount();
        const title = pdfDoc.getTitle() || null;
        const author = pdfDoc.getAuthor() || null;
        const subject = pdfDoc.getSubject() || null;
        const creator = pdfDoc.getCreator() || null;

        return {
            pageCount,
            title,
            author,
            subject,
            creator,
            hasForm: pdfDoc.getForm() ? true : false
        };

    } catch (error) {
        throw new Error(`Error reading PDF metadata: ${error.message}`);
    }
}

module.exports = {
    parseTemplateFields,
    validateRequiredFields,
    getPDFMetadata
};
