/**
 * PDF SIGNER - Incrusta firma PKCS#7 en PDF manualmente
 * Siguiendo el estándar ISO 32000-1 (PDF Reference)
 */

const fs = require('fs');

class ManualPdfSigner {
    /**
     * Firma un PDF incrustando un PKCS#7 signature
     * 
     * @param {Buffer} pdfBuffer - PDF sin firmar
     * @param {Buffer} p7Buffer - Firma PKCS#7 en DER format
     * @param {Object} options - Opciones de firma
     * @returns {Buffer} - PDF firmado
     */
    static signPdf(pdfBuffer, p7Buffer, options = {}) {
        try {
            console.log('🔧 Incrustando firma PKCS#7 en PDF...');
            
            let pdfString = pdfBuffer.toString('binary');
            
            // PASO 1: Analizar estructura del PDF
            const xrefMatch = pdfString.match(/xref\s*\n\s*0\s+(\d+)/);
            if (!xrefMatch) {
                throw new Error('No se encontró tabla xref');
            }
            
            const objectCount = parseInt(xrefMatch[1]);
            console.log(`   Objetos existentes: ${objectCount}`);
            
            // PASO 1.5: Encontrar la primera página
            const pageMatch = pdfString.match(/(\d+)\s+0\s+obj\s*<<[^>]*\/Type\s*\/Page[^>]*>>/);
            if (!pageMatch) {
                throw new Error('No se encontró página en el PDF');
            }
            const pageObjNum = parseInt(pageMatch[1]);
            console.log(`   Primera página en objeto: ${pageObjNum}`);
            
            // PASO 2: Crear objeto de firma
            const signatureObjNum = objectCount;
            const signatureHex = p7Buffer.toString('hex');
            
            // Reservar espacio para firma (importante para ByteRange)
            const signatureSpaceHex = '0'.repeat(Math.max(signatureHex.length + 2048, 16384));
            
            // Fecha actual en formato PDF
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const min = String(now.getMinutes()).padStart(2, '0');
            const sec = String(now.getSeconds()).padStart(2, '0');
            const pdfDate = `D:${year}${month}${day}${hour}${min}${sec}+00'00'`;
            
            // PASO 3: Crear diccionario de firma según ISO 32000-1
            const signatureDict = `${signatureObjNum} 0 obj
<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/ByteRange [0000000000 0000000000 0000000000 0000000000]
/Contents <${signatureSpaceHex}>
/M (${pdfDate})
/Name (${options.name || 'Digital Signature'})
/Reason (${options.reason || 'Firma Digital'})
/Location (${options.location || 'Colombia'})
${options.contactInfo ? `/ContactInfo (${options.contactInfo})` : ''}
>>
endobj
`;
            
            // PASO 4: Encontrar el catálogo
            const catalogMatch = pdfString.match(/(\d+)\s+0\s+obj\s*<<[^>]*\/Type\s*\/Catalog/);
            if (!catalogMatch) {
                throw new Error('No se encontró el catálogo del PDF');
            }
            
            const catalogNum = parseInt(catalogMatch[1]);
            console.log(`   Catálogo en objeto: ${catalogNum}`);
            
            // PASO 5: Crear AcroForm y signature field
            const acroFormObjNum = signatureObjNum + 1;
            const signatureFieldObjNum = signatureObjNum + 2;
            
            const acroFormDict = `${acroFormObjNum} 0 obj
<<
/Fields [${signatureFieldObjNum} 0 R]
/SigFlags 3
>>
endobj
`;
            
            // Campo de firma CON posición visible en la primera página
            // Rect: [x1 y1 x2 y2] - esquina inferior izquierda de la página
            const signatureField = `${signatureFieldObjNum} 0 obj
<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/V ${signatureObjNum} 0 R
/T (Signature1)
/Rect [10 10 210 60]
/F 132
/P ${pageObjNum} 0 R
/AP <<
  /N ${signatureObjNum + 3} 0 R
>>
>>
endobj
`;

            // PASO 5.5: Crear apariencia visual de la firma
            const appearanceObjNum = signatureObjNum + 3;
            const appearanceStream = `${appearanceObjNum} 0 obj
<<
/Type /XObject
/Subtype /Form
/BBox [0 0 200 50]
/Length 150
>>
stream
q
0.9 0.9 0.9 rg
0 0 200 50 re f
0.2 0.2 0.2 RG
1 w
5 5 190 40 re S
BT
/Helvetica 10 Tf
0 0 0 rg
10 30 Td
(Firmado digitalmente) Tj
0 -15 Td
(${options.name || 'FirmaLegal'}) Tj
ET
Q
endstream
endobj
`;
            
            // PASO 6: Modificar el catálogo para incluir AcroForm
            const catalogRegex = new RegExp(`${catalogNum}\\s+0\\s+obj\\s*<<([^>]*)>>`);
            const catalogContent = pdfString.match(catalogRegex);
            
            if (catalogContent) {
                const newCatalog = `${catalogNum} 0 obj\n<<${catalogContent[1]}\n/AcroForm ${acroFormObjNum} 0 R\n>>`;
                pdfString = pdfString.replace(catalogRegex, newCatalog);
            }
            
            // PASO 6.5: Agregar el signature field a la página como anotación
            const pageRegex = new RegExp(`(${pageObjNum}\\s+0\\s+obj\\s*<<[^>]*)(>>)`);
            const pageContent = pdfString.match(pageRegex);
            
            if (pageContent) {
                // Verificar si ya existe /Annots
                if (pageContent[1].includes('/Annots')) {
                    // Agregar a array existente
                    pdfString = pdfString.replace(
                        new RegExp(`(${pageObjNum}\\s+0\\s+obj\\s*<<[^>]*\/Annots\\s*\\[)([^\\]]*)(\\])`),
                        `$1$2 ${signatureFieldObjNum} 0 R$3`
                    );
                } else {
                    // Crear nuevo array /Annots
                    const newPage = `${pageContent[1]}\n/Annots [${signatureFieldObjNum} 0 R]\n${pageContent[2]}`;
                    pdfString = pdfString.replace(pageRegex, newPage);
                }
                console.log(`   ✅ Campo de firma agregado a la página ${pageObjNum}`);
            }
            
            // PASO 7: Insertar objetos antes del xref
            const xrefIndex = pdfString.indexOf('xref');
            const beforeXref = pdfString.substring(0, xrefIndex);
            const afterXref = pdfString.substring(xrefIndex);
            
            const newObjects = signatureDict + acroFormDict + signatureField + appearanceStream;
            pdfString = beforeXref + newObjects + afterXref;
            
            // PASO 8: Actualizar xref table
            const newObjectCount = appearanceObjNum + 1;
            pdfString = pdfString.replace(
                /xref\s*\n\s*0\s+\d+/,
                `xref\n0 ${newObjectCount}`
            );
            
            // Calcular offsets de los nuevos objetos
            const sig1Offset = beforeXref.length;
            const sig2Offset = sig1Offset + signatureDict.length;
            const sig3Offset = sig2Offset + acroFormDict.length;
            const sig4Offset = sig3Offset + signatureField.length;
            
            // Agregar entradas xref
            const xrefEntries = `\n${String(sig1Offset).padStart(10, '0')} 00000 n \n${String(sig2Offset).padStart(10, '0')} 00000 n \n${String(sig3Offset).padStart(10, '0')} 00000 n \n${String(sig4Offset).padStart(10, '0')} 00000 n `;
            pdfString = pdfString.replace(/trailer/, xrefEntries + 'trailer');
            
            // PASO 9: Actualizar trailer Size
            pdfString = pdfString.replace(
                /\/Size\s+\d+/,
                `/Size ${newObjectCount}`
            );
            
            // PASO 10: Calcular ByteRange DINÁMICAMENTE
            // El ByteRange debe cubrir todo EXCEPTO el contenido de /Contents
            const contentsMatch = pdfString.match(/\/Contents\s*<([0-9a-fA-F]+)>/);
            if (!contentsMatch) {
                throw new Error('No se encontró /Contents en el PDF');
            }
            
            const contentsIndex = pdfString.indexOf(`/Contents <${contentsMatch[1]}`);
            const contentsStart = contentsIndex + '/Contents <'.length;
            const contentsEnd = contentsStart + contentsMatch[1].length;
            
            // ByteRange: [0, inicio_de_firma, fin_de_firma, resto_del_documento]
            const part1Start = 0;
            const part1Length = contentsStart;
            const part2Start = contentsEnd;
            const part2Length = pdfString.length - part2Start;
            
            const byteRange = `[${part1Start} ${part1Length} ${part2Start} ${part2Length}]`;
            
            // Actualizar ByteRange manteniendo el padding
            const byteRangePadded = byteRange.padEnd(60, ' '); // Más espacio para números grandes
            pdfString = pdfString.replace(
                /\/ByteRange\s*\[[^\]]*\]\s*/,
                `/ByteRange ${byteRangePadded}`
            );
            
            console.log(`✅ ByteRange recalculado: ${byteRange}`);
            console.log(`   Parte 1: bytes ${part1Start}-${part1Start + part1Length - 1}`);
            console.log(`   Parte 2: bytes ${part2Start}-${part2Start + part2Length - 1}`);
            
            // PASO 11: Insertar firma real (rellenar el espacio reservado)
            const finalSignatureHex = signatureHex.padEnd(signatureSpaceHex.length, '0');
            pdfString = pdfString.replace(signatureSpaceHex, finalSignatureHex);
            
            console.log(`✅ Firma incrustada: ${p7Buffer.length} bytes`);
            console.log(`✅ Campo visible en Rect [10 10 210 60]`);
            
            return Buffer.from(pdfString, 'binary');
            
        } catch (error) {
            console.error('❌ Error:', error.message);
            throw error;
        }
    }
}

module.exports = ManualPdfSigner;
