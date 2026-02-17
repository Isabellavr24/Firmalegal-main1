const fs = require('fs').promises;
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Embebe los valores completados (firmas, texto, fechas) en el PDF
 * @param {string} originalPdfPath - Ruta al PDF original
 * @param {Array} fields - Array de campos con sus posiciones
 * @param {Array} values - Array de valores completados
 * @returns {Promise<Uint8Array>} - PDF modificado como buffer
 */
async function embedValuesInPdf(originalPdfPath, fields, values) {
    try {
        console.log('📄 Cargando PDF original:', originalPdfPath);
        
        // Leer el PDF original
        const existingPdfBytes = await fs.readFile(originalPdfPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        console.log(`📊 PDF tiene ${pdfDoc.getPageCount()} página(s)`);
        
        // Crear un mapa de valores por field_id
        const valuesMap = {};
        values.forEach(value => {
            valuesMap[value.field_id] = value;
        });
        
        console.log(`🔍 Procesando ${fields.length} campo(s)...`);
        
        // Procesar cada campo
        for (const field of fields) {
            const value = valuesMap[field.field_id || field.id];
            
            if (!value) {
                console.log(`   ⚠️ Campo ${field.field_id} sin valor, saltando...`);
                continue;
            }
            
            // Obtener la página (field.page es 1-indexed)
            const pageIndex = (field.page || 1) - 1;
            const page = pdfDoc.getPages()[pageIndex];
            const { height } = page.getSize();
            
            // Convertir coordenadas: PDF usa origen en esquina inferior izquierda
            const pdfX = parseFloat(field.x);
            const pdfY = height - parseFloat(field.y) - parseFloat(field.h);
            const pdfWidth = parseFloat(field.w);
            const pdfHeight = parseFloat(field.h);
            
            console.log(`   📍 Campo ${field.field_id} (${field.type}) en página ${field.page}:`, {
                x: pdfX.toFixed(2),
                y: pdfY.toFixed(2),
                w: pdfWidth.toFixed(2),
                h: pdfHeight.toFixed(2)
            });
            
            // Procesar según el tipo de valor
            switch (value.value_type) {
                case 'signature_image':
                    await embedSignature(pdfDoc, page, value, pdfX, pdfY, pdfWidth, pdfHeight);
                    break;
                    
                case 'text':
                    await embedText(pdfDoc, page, value, pdfX, pdfY, pdfWidth, pdfHeight);
                    break;
                    
                case 'date':
                    await embedDate(pdfDoc, page, value, pdfX, pdfY, pdfWidth, pdfHeight);
                    break;
                    
                default:
                    console.log(`   ⚠️ Tipo de valor desconocido: ${value.value_type}`);
            }
        }
        
        // Generar el PDF modificado
        console.log('✅ Generando PDF modificado...');
        const pdfBytes = await pdfDoc.save();
        
        console.log(`✅ PDF generado: ${pdfBytes.length} bytes`);
        return pdfBytes;
        
    } catch (error) {
        console.error('❌ Error embebiendo valores en PDF:', error);
        throw error;
    }
}

/**
 * Embebe una firma (imagen) en el PDF
 */
async function embedSignature(pdfDoc, page, value, x, y, width, height) {
    try {
        if (!value.signature_path) {
            console.log('   ⚠️ Firma sin imagen, saltando...');
            return;
        }
        
        // El signature_path es una cadena base64: "data:image/png;base64,iVBORw0KG..."
        const base64Data = value.signature_path.split(',')[1];
        const imageBytes = Buffer.from(base64Data, 'base64');
        
        // Determinar el tipo de imagen
        let image;
        if (value.signature_path.startsWith('data:image/png')) {
            image = await pdfDoc.embedPng(imageBytes);
        } else if (value.signature_path.startsWith('data:image/jpg') || value.signature_path.startsWith('data:image/jpeg')) {
            image = await pdfDoc.embedJpg(imageBytes);
        } else {
            // Por defecto intentar PNG
            image = await pdfDoc.embedPng(imageBytes);
        }
        
        // Calcular dimensiones manteniendo aspecto
        const imgDims = image.scale(1);
        const scale = Math.min(width / imgDims.width, height / imgDims.height);
        const scaledWidth = imgDims.width * scale;
        const scaledHeight = imgDims.height * scale;
        
        // Centrar la imagen en el campo
        const offsetX = (width - scaledWidth) / 2;
        const offsetY = (height - scaledHeight) / 2;
        
        page.drawImage(image, {
            x: x + offsetX,
            y: y + offsetY,
            width: scaledWidth,
            height: scaledHeight,
        });
        
        console.log(`   ✅ Firma embebida (${scaledWidth.toFixed(0)}x${scaledHeight.toFixed(0)})`);
        
    } catch (error) {
        console.error('   ❌ Error embebiendo firma:', error.message);
    }
}

/**
 * Embebe texto formateado en el PDF
 */
async function embedText(pdfDoc, page, value, x, y, width, height) {
    try {
        if (!value.text_value) {
            console.log('   ⚠️ Campo de texto vacío, saltando...');
            return;
        }
        
        // Parsear el JSON del texto
        let textData;
        try {
            textData = JSON.parse(value.text_value);
        } catch (e) {
            // Si no es JSON, usar el texto directamente
            textData = { text: value.text_value, fontSize: 12, fontColor: '#000000' };
        }
        
        const text = textData.text || '';
        const fontSize = parseInt(textData.fontSize) || 12;
        const fontColor = hexToRgb(textData.fontColor || '#000000');
        
        // Cargar fuente (pdf-lib solo soporta fuentes estándar)
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Calcular posición vertical centrada
        const textHeight = font.heightAtSize(fontSize);
        const offsetY = (height - textHeight) / 2;
        
        // Determinar alineación
        let textX = x + 4; // Padding izquierdo
        const textAlign = textData.textAlign || 'left';
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        
        if (textAlign === 'center') {
            textX = x + (width - textWidth) / 2;
        } else if (textAlign === 'right') {
            textX = x + width - textWidth - 4;
        }
        
        page.drawText(text, {
            x: textX,
            y: y + offsetY,
            size: fontSize,
            font: font,
            color: rgb(fontColor.r, fontColor.g, fontColor.b),
        });
        
        console.log(`   ✅ Texto embebido: "${text}" (${fontSize}px)`);
        
    } catch (error) {
        console.error('   ❌ Error embebiendo texto:', error.message);
    }
}

/**
 * Embebe una fecha formateada en el PDF
 */
async function embedDate(pdfDoc, page, value, x, y, width, height) {
    try {
        if (!value.date_value) {
            console.log('   ⚠️ Campo de fecha vacío, saltando...');
            return;
        }
        
        // Formatear la fecha en español
        const [year, month, day] = value.date_value.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        const formattedDate = date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const fontSize = 14;
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Calcular posición centrada
        const textWidth = font.widthOfTextAtSize(formattedDate, fontSize);
        const textHeight = font.heightAtSize(fontSize);
        const textX = x + (width - textWidth) / 2;
        const textY = y + (height - textHeight) / 2;
        
        page.drawText(formattedDate, {
            x: textX,
            y: textY,
            size: fontSize,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
        });
        
        console.log(`   ✅ Fecha embebida: "${formattedDate}"`);
        
    } catch (error) {
        console.error('   ❌ Error embebiendo fecha:', error.message);
    }
}

/**
 * Convierte color hexadecimal a RGB
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
}

module.exports = {
    embedValuesInPdf
};
