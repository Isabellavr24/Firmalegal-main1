/**
 * PDF SIGNATURE EMBEDDER
 * 
 * Incrusta una firma PKCS#7 en un PDF de forma manual
 * Esto es necesario porque pdf-lib no soporta firmas digitales nativamente
 * 
 * Basado en el estándar PDF Reference 1.7 - Digital Signatures
 */

const fs = require('fs');

class PdfSignatureEmbedder {
    /**
     * Incrustar firma PKCS#7 en un PDF
     * 
     * @param {Buffer} pdfBuffer - PDF original
     * @param {Buffer} signatureBuffer - Firma PKCS#7 en DER format
     * @param {Object} options - Opciones de firma
     * @returns {Buffer} - PDF firmado
     */
    static embedSignature(pdfBuffer, signatureBuffer, options = {}) {
        try {
            console.log('🔧 Incrustando firma en PDF...');
            
            // Configuración
            const reason = options.reason || 'Firma Digital';
            const location = options.location || 'Colombia';
            const contactInfo = options.contactInfo || '';
            
            // Convertir buffers a string para manipulación
            let pdfContent = pdfBuffer.toString('latin1');
            
            // PASO 1: Encontrar el trailer del PDF
            const trailerIndex = pdfContent.lastIndexOf('trailer');
            if (trailerIndex === -1) {
                throw new Error('No se encontró el trailer del PDF');
            }
            
            // PASO 2: Encontrar el catálogo y el último objeto
            const xrefMatch = pdfContent.match(/xref\s+\d+\s+(\d+)/);
            if (!xrefMatch) {
                throw new Error('No se encontró la tabla xref');
            }
            
            const lastObjNum = parseInt(xrefMatch[1]);
            const newObjNum = lastObjNum;
            
            // PASO 3: Crear objeto de firma
            const signatureObj = newObjNum;
            const signatureHex = signatureBuffer.toString('hex');
            
            // Crear fecha ISO para PDF
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const sec = String(now.getSeconds()).padStart(2, '0');
            const pdfDate = `D:${year}${month}${day}${hour}${min}${sec}+00'00'`;
            
            // PASO 4: Crear diccionario de firma según PDF Reference
            const signatureDict = `${signatureObj} 0 obj
<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/Contents <${signatureHex}>
/ByteRange [0 /********** /********** /**********]
/M (${pdfDate})
/Reason (${reason})
/Location (${location})
${contactInfo ? `/ContactInfo (${contactInfo})` : ''}
>>
endobj\n`;
            
            // PASO 5: Insertar objeto antes del trailer
            const beforeTrailer = pdfContent.substring(0, trailerIndex);
            const afterTrailer = pdfContent.substring(trailerIndex);
            
            const newPdf = beforeTrailer + signatureDict + afterTrailer;
            
            console.log(`✅ Firma incrustada (objeto ${signatureObj})`);
            console.log(`   Tamaño de firma: ${signatureBuffer.length} bytes`);
            console.log(`   Fecha: ${pdfDate}`);
            
            return Buffer.from(newPdf, 'latin1');
            
        } catch (error) {
            console.error('❌ Error al incrustar firma:', error.message);
            throw error;
        }
    }
    
    /**
     * Calcular ByteRange para la firma
     * 
     * ByteRange indica qué partes del PDF están firmadas:
     * [0, offset_inicio_firma, offset_fin_firma, resto_del_pdf]
     * 
     * @param {Buffer} pdfBuffer - PDF con placeholder
     * @param {number} signatureOffset - Posición de la firma
     * @param {number} signatureLength - Longitud de la firma
     * @returns {Array} - ByteRange [a, b, c, d]
     */
    static calculateByteRange(pdfBuffer, signatureOffset, signatureLength) {
        const part1Start = 0;
        const part1Length = signatureOffset;
        const part2Start = signatureOffset + signatureLength;
        const part2Length = pdfBuffer.length - part2Start;
        
        return [part1Start, part1Length, part2Start, part2Length];
    }
    
    /**
     * Actualizar ByteRange en el PDF firmado
     * 
     * @param {Buffer} pdfBuffer - PDF con firma
     * @returns {Buffer} - PDF con ByteRange actualizado
     */
    static updateByteRange(pdfBuffer) {
        try {
            let pdfContent = pdfBuffer.toString('latin1');
            
            // Buscar el placeholder de ByteRange
            const byteRangeRegex = /\/ByteRange\s*\[0\s+\/\*+\s+\/\*+\s+\/\*+\]/;
            const match = pdfContent.match(byteRangeRegex);
            
            if (!match) {
                console.warn('⚠️ No se encontró ByteRange para actualizar');
                return pdfBuffer;
            }
            
            // Encontrar la firma
            const contentsMatch = pdfContent.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
            if (!contentsMatch) {
                console.warn('⚠️ No se encontró Contents para calcular ByteRange');
                return pdfBuffer;
            }
            
            const signatureHex = contentsMatch[1];
            const signatureLength = signatureHex.length;
            
            // Calcular ByteRange
            const contentsIndex = pdfContent.indexOf(`/Contents <${signatureHex}>`);
            const signatureOffset = contentsIndex + '/Contents <'.length;
            
            const part1Length = signatureOffset;
            const part2Start = signatureOffset + signatureLength;
            const part2Length = pdfBuffer.length - part2Start;
            
            // Crear nuevo ByteRange
            const newByteRange = `/ByteRange [0 ${part1Length} ${part2Start} ${part2Length}]`;
            
            // Reemplazar
            pdfContent = pdfContent.replace(byteRangeRegex, newByteRange);
            
            console.log(`✅ ByteRange actualizado: [0 ${part1Length} ${part2Start} ${part2Length}]`);
            
            return Buffer.from(pdfContent, 'latin1');
            
        } catch (error) {
            console.error('❌ Error actualizando ByteRange:', error.message);
            return pdfBuffer;
        }
    }
}

module.exports = PdfSignatureEmbedder;
