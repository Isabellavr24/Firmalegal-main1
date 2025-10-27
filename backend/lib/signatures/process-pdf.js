const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

/**
 * Extrae información del PDF y genera imágenes de preview
 * Similar a Templates::ProcessDocument en DocuSeal
 * NOTA: Versión simplificada sin pdf2pic (no requiere GraphicsMagick)
 */
class ProcessPdf {
    /**
     * Extrae información básica del PDF
     * @param {string} pdfPath - Ruta al archivo PDF
     * @returns {Object} Información del PDF
     */
    async extractPdfInfo(pdfPath) {
        try {
            console.log('📖 Leyendo PDF:', pdfPath);
            
            // Leer el PDF
            const pdfBuffer = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            
            const numPages = pdfDoc.getPageCount();
            const firstPage = pdfDoc.getPage(0);
            const { width, height } = firstPage.getSize();

            console.log(`📄 PDF: ${numPages} páginas, ${width}x${height}pt`);

            // Generar imágenes de preview (simplificado - retorna array vacío)
            // El frontend puede renderizar el PDF directamente con PDF.js
            const previewImages = [];
            console.log('ℹ️ Previews deshabilitadas (sin pdf2pic). El frontend usa PDF.js para renderizar.');

            return {
                numPages,
                pageWidth: width,
                pageHeight: height,
                previewImages
            };

        } catch (error) {
            console.error('❌ Error al procesar PDF:', error);
            throw new Error('No se pudo procesar el PDF: ' + error.message);
        }
    }

    /**
     * Genera imágenes PNG de cada página del PDF
     * DESHABILITADO: Requiere GraphicsMagick/ImageMagick
     * El frontend usa PDF.js para renderizar directamente
     */
    async generatePreviewImages(pdfPath, numPages) {
        console.log('ℹ️ Preview images deshabilitadas. Usando PDF.js en frontend.');
        return [];
    }

    /**
     * Detecta campos AcroForm en el PDF (campos de formulario existentes)
     * Similar a Templates::FindAcroFields en DocuSeal
     * @param {string} pdfPath - Ruta al PDF
     * @returns {Array} Lista de campos encontrados
     */
    async findAcroFields(pdfPath) {
        try {
            const pdfBuffer = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            
            const detectedFields = [];

            for (const field of fields) {
                const fieldName = field.getName();
                const fieldType = this.mapFieldType(field);
                
                if (fieldType) {
                    // Obtener coordenadas del campo
                    const widgets = field.acroField.getWidgets();
                    
                    for (const widget of widgets) {
                        const rect = widget.getRectangle();
                        const pageIndex = this.getFieldPageIndex(pdfDoc, widget);
                        
                        if (rect && pageIndex !== -1) {
                            const page = pdfDoc.getPage(pageIndex);
                            const { width: pageWidth, height: pageHeight } = page.getSize();
                            
                            // Convertir a coordenadas relativas (0.0 - 1.0)
                            detectedFields.push({
                                name: fieldName,
                                type: fieldType,
                                page: pageIndex + 1,
                                area: {
                                    x: rect.x / pageWidth,
                                    y: (pageHeight - rect.y - rect.height) / pageHeight,
                                    w: rect.width / pageWidth,
                                    h: rect.height / pageHeight
                                }
                            });
                        }
                    }
                }
            }

            console.log(`🔍 ${detectedFields.length} campos AcroForm detectados`);
            return detectedFields;

        } catch (error) {
            console.error('❌ Error al detectar campos:', error);
            return []; // Retornar array vacío si no hay campos
        }
    }

    /**
     * Mapea tipos de campo de PDF a tipos del sistema
     */
    mapFieldType(field) {
        const constructor = field.constructor.name;
        
        const typeMap = {
            'PDFTextField': 'text',
            'PDFCheckBox': 'checkbox',
            'PDFRadioGroup': 'radio',
            'PDFDropdown': 'select',
            'PDFSignature': 'signature'
        };

        return typeMap[constructor] || null;
    }

    /**
     * Obtiene el índice de página donde está el campo
     */
    getFieldPageIndex(pdfDoc, widget) {
        try {
            const pageRef = widget.P();
            const pages = pdfDoc.getPages();
            
            for (let i = 0; i < pages.length; i++) {
                if (pages[i].ref === pageRef) {
                    return i;
                }
            }
        } catch (error) {
            console.warn('⚠️ No se pudo determinar página del campo');
        }
        
        return 0; // Default a primera página
    }

    /**
     * Calcula coordenadas absolutas a partir de relativas
     */
    calculateAbsoluteCoordinates(relativeArea, pageWidth, pageHeight) {
        return {
            x: relativeArea.x * pageWidth,
            y: relativeArea.y * pageHeight,
            w: relativeArea.w * pageWidth,
            h: relativeArea.h * pageHeight
        };
    }
}

module.exports = new ProcessPdf();
