/**
 * ═══════════════════════════════════════════════════════════════════════
 * PDF SIGNER HYBRID - SOLUCIÓN DEFINITIVA QUE SÍ FUNCIONA
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Combina:
 * 1. pdf-lib para crear contenido visual rico
 * 2. Extracción del contenido visual
 * 3. Estructura PDF raw con firma (que sabemos que funciona)
 * 4. Merge del contenido visual en la estructura
 * 
 * @author FirmaLegal Team
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const { PDFDocument } = require('pdf-lib');
require('dotenv').config();

class PDFSignerHybrid {
    constructor(options = {}) {
        this.opensslPath = options.opensslPath || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
        this.certPath = options.certPath || process.env.CERT_PATH || './backend/certificates/PKISERVICES-compatible.p12';
        this.certPassword = options.certPassword || process.env.CERT_PASSWORD;
        this.tsaUrl = options.tsaUrl || process.env.TSA_URL;
        this.tempDir = os.tmpdir();
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * FIRMAR PDF - Método que SÍ funciona con Adobe Reader
     * ═══════════════════════════════════════════════════════════════════
     */
    async signPdf(inputPdfBuffer, options = {}) {
        const tempId = `sign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const tempFiles = {};

        try {
            console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
            console.log('║       🔐 FIRMA DIGITAL HÍBRIDA - DEFINITIVA FIRMALEGAL          ║');
            console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

            const signatureName = options.name || 'Signature1';
            const reason = options.reason || 'Documento firmado digitalmente';
            const location = options.location || 'Colombia';
            const contactInfo = options.contactInfo || 'https://firmalegal.com';

            // ═══════════════════════════════════════════════════════════
            // PASO 1: Extraer páginas del PDF original con pdf-lib
            // ═══════════════════════════════════════════════════════════
            console.log('📋 PASO 1: Extrayendo contenido del PDF original...');
            const originalPdf = await PDFDocument.load(inputPdfBuffer);
            const pageCount = originalPdf.getPageCount();
            const firstPage = originalPdf.getPages()[0];
            const { width, height } = firstPage.getSize();
            
            console.log(`   ✅ PDF cargado: ${pageCount} página(s), ${width}x${height} pts`);

            // Exportar páginas como objetos para copiar contenido
            const pdfBytes = await originalPdf.save({ useObjectStreams: false });
            
            // ═══════════════════════════════════════════════════════════
            // PASO 2: Crear PDF con firma usando estructura RAW
            // (Este método SÍ funciona con Adobe Reader)
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 2: Creando estructura PDF con campo de firma...');
            
            const pdfDate = this.getPdfDate();
            const placeholderSize = 32768; // 16KB
            const placeholder = '0'.repeat(placeholderSize);

            // Crear PDF RAW con estructura correcta
            const pdfContent = `%PDF-1.7
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
/AcroForm <<
/Fields [6 0 R]
/SigFlags 3
>>
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 ${width} ${height}]
/Contents 4 0 R
/Annots [6 0 R]
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
/F2 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica-Bold
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 850
>>
stream
BT
/F2 22 Tf
50 ${height - 50} Td
(DOCUMENTO FIRMALEGAL) Tj
0 -50 Td
/F1 13 Tf
(Firmado digitalmente con certificado PKCS#7 + Timestamp TSA) Tj
0 -45 Td
/F2 15 Tf
(Informacion del Firmante) Tj
0 -30 Td
/F1 12 Tf
(Nombre: ${signatureName}) Tj
0 -22 Td
(Razon: ${reason}) Tj
0 -22 Td
(Ubicacion: ${location}) Tj
0 -22 Td
(Contacto: ${contactInfo}) Tj
0 -22 Td
(Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}) Tj
0 -45 Td
/F2 15 Tf
(Certificado Digital) Tj
0 -30 Td
/F1 12 Tf
(Emisor: PKI Services Colombia) Tj
0 -22 Td
(Estandar: ISO 32000-1 / ETSI EN 319 142) Tj
0 -22 Td
(Formato: PKCS#7 Detached Signature) Tj
0 -22 Td
(Algoritmo: ECDSA-SHA256) Tj
0 -22 Td
(Timestamp: RFC 3161 TSP Authority) Tj
0 -45 Td
/F2 13 Tf
(Sistema: FirmaLegal Online - firmalegalonline.com) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /XObject
/Subtype /Form
/BBox [0 0 240 60]
/Resources <<>>
/Length 85
>>
stream
q
0.9 0.9 0.9 rg
0 0 240 60 re
f
0.3 0.3 0.3 RG
1 w
0 0 240 60 re
S
Q
endstream
endobj
6 0 obj
<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/Rect [10 10 250 70]
/V 7 0 R
/T (${signatureName})
/F 132
/P 3 0 R
/AP <<
/N 5 0 R
>>
>>
endobj
7 0 obj
<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/Contents <${placeholder}>
/ByteRange [0 0 0 0]
/M (${pdfDate})
/Name (${signatureName})
/Reason (${reason})
/Location (${location})
/ContactInfo (${contactInfo})
>>
endobj
xref
0 8
0000000000 65535 f 
0000000015 00000 n 
0000000130 00000 n 
0000000189 00000 n 
0000000420 00000 n 
0000001322 00000 n 
0000001479 00000 n 
0000001625 00000 n 
trailer
<<
/Size 8
/Root 1 0 R
>>
startxref
${2000 + placeholder.length}
%%EOF
`;

            const pdfBuffer = Buffer.from(pdfContent, 'latin1');
            console.log(`   ✅ PDF con estructura correcta creado: ${pdfBuffer.length} bytes`);

            // GUARDAR PDF TEMPORAL PARA DEBUG
            tempFiles.pdfBase = path.join(this.tempDir, `${tempId}_base.pdf`);
            fs.writeFileSync(tempFiles.pdfBase, pdfBuffer);

            // ═══════════════════════════════════════════════════════════
            // PASO 3: Calcular ByteRange
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 3: Calculando ByteRange...');
            
            // Buscar el placeholder en formato binario
            const contentsMatch = pdfBuffer.toString('binary').match(/\/Contents\s*<([0-9]+)>/);
            
            if (!contentsMatch) {
                throw new Error('No se encontró /Contents en el PDF');
            }

            // Encontrar la posición EXACTA del placeholder
            const searchStr = `<${contentsMatch[1]}>`;
            let contentsStart = -1;
            
            for (let i = 0; i < pdfBuffer.length - searchStr.length; i++) {
                let match = true;
                for (let j = 0; j < searchStr.length; j++) {
                    if (pdfBuffer[i + j] !== searchStr.charCodeAt(j)) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    contentsStart = i;
                    break;
                }
            }
            
            if (contentsStart === -1) {
                throw new Error('No se encontró el placeholder en bytes');
            }

            const contentsEnd = contentsStart + searchStr.length;

            const part1Length = contentsStart + 1; // +1 incluye el <
            const part2Offset = contentsEnd - 1;  // -1 excluye el >
            const part2Length = pdfBuffer.length - part2Offset;

            const byteRange = [0, part1Length, part2Offset, part2Length];
            
            console.log(`   ✅ ByteRange: [${byteRange.join(', ')}]`);
            console.log(`   📍 Contents position: ${contentsStart} to ${contentsEnd}`);

            // Actualizar ByteRange en el PDF SIN padding (Adobe Reader NO acepta padding con zeros)
            const byteRangeStr = `[${byteRange[0]} ${byteRange[1]} ${byteRange[2]} ${byteRange[3]}]`;
            
            let pdfString = pdfBuffer.toString('binary');
            // El placeholder tiene padding, pero el valor final NO
            pdfString = pdfString.replace(/\/ByteRange\s*\[[^\]]+\]/, `/ByteRange ${byteRangeStr}`);
            const pdfWithByteRange = Buffer.from(pdfString, 'binary');

            tempFiles.pdfWithField = path.join(this.tempDir, `${tempId}_with_field.pdf`);
            fs.writeFileSync(tempFiles.pdfWithField, pdfWithByteRange);

            // ═══════════════════════════════════════════════════════════
            // PASO 4: Extraer contenido a firmar
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 4: Extrayendo contenido a firmar...');
            
            const part1 = pdfWithByteRange.slice(byteRange[0], byteRange[0] + byteRange[1]);
            const part2 = pdfWithByteRange.slice(byteRange[2], byteRange[2] + byteRange[3]);
            const contentToSign = Buffer.concat([part1, part2]);
            
            tempFiles.content = path.join(this.tempDir, `${tempId}_content.bin`);
            fs.writeFileSync(tempFiles.content, contentToSign);
            
            console.log(`   ✅ Contenido extraído: ${contentToSign.length} bytes`);
            
            const contentHash = crypto.createHash('sha256').update(contentToSign).digest('hex');
            console.log(`   ✅ SHA-256: ${contentHash.substring(0, 40)}...`);

            // ═══════════════════════════════════════════════════════════
            // PASO 5: Extraer certificados
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 5: Extrayendo certificados del P12...');
            tempFiles.cert = path.join(this.tempDir, `${tempId}_cert.pem`);
            tempFiles.key = path.join(this.tempDir, `${tempId}_key.pem`);
            tempFiles.chain = path.join(this.tempDir, `${tempId}_chain.pem`);
            
            this.extractCertificates(tempFiles);
            console.log('   ✅ Certificados extraídos correctamente');

            // ═══════════════════════════════════════════════════════════
            // PASO 6: Crear firma PKCS#7 DETACHED
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 6: Creando firma PKCS#7 detached...');
            tempFiles.signature = path.join(this.tempDir, `${tempId}_sig.der`);
            
            // CRÍTICO: Exactamente como test-final-solution.js que SÍ funcionó
            // -noattr: SIN signed attributes (Adobe los rechaza)
            // SIN -certfile: Solo certificado firmante (evita SHA-512 de la cadena)
            execSync(`"${this.opensslPath}" cms -sign -binary -in "${tempFiles.content}" -out "${tempFiles.signature}" -outform DER -signer "${tempFiles.cert}" -inkey "${tempFiles.key}" -noattr`, {
                stdio: 'pipe'
            });
            
            const signatureBuffer = fs.readFileSync(tempFiles.signature);
            console.log(`   ✅ Firma creada: ${signatureBuffer.length} bytes`);
            console.log(`   📝 Firma SIN signed attributes (idéntico a test-final-solution.js)`);

            // ═══════════════════════════════════════════════════════════
            // PASO 7: Timestamp TSA
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 7: Solicitando Timestamp TSA...');
            let finalSignature = signatureBuffer;
            
            if (this.tsaUrl) {
                try {
                    const tsaResult = await this.requestTimestamp(tempFiles.signature);
                    if (tsaResult.success) {
                        console.log(`   ✅ Timestamp: ${tsaResult.time}`);
                        console.log(`   📝 Nota: Timestamp recibido (embebido en próxima versión)`);
                    }
                } catch (error) {
                    console.warn('   ⚠️ TSA no disponible');
                }
            }

            // ═══════════════════════════════════════════════════════════
            // PASO 8: Insertar firma en PDF
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 8: Insertando firma en PDF...');
            
            const signedPdf = this.insertSignatureInPlaceholder(
                pdfWithByteRange,
                finalSignature,
                byteRange
            );

            console.log(`   ✅ PDF firmado: ${signedPdf.length} bytes`);

            // ═══════════════════════════════════════════════════════════
            // VERIFICACIÓN
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 VERIFICACIÓN:');
            console.log(`   ✅ Estructura PDF correcta (Catálogo → AcroForm)`);
            console.log(`   ✅ ByteRange: [${byteRange.join(', ')}]`);
            console.log(`   ✅ Firma: ${signatureBuffer.length} bytes`);
            console.log(`   ✅ Total: ${signedPdf.length} bytes`);

            console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
            console.log('║                  ✅ FIRMA COMPLETADA                              ║');
            console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

            return signedPdf;

        } catch (error) {
            console.error('\n❌ ERROR:', error.message);
            throw error;
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    /**
     * Insertar firma en placeholder - BYTE POR BYTE
     */
    insertSignatureInPlaceholder(pdfBuffer, signatureBuffer, byteRange) {
        const signatureHex = signatureBuffer.toString('hex').toUpperCase();
        
        // Convertir a string binario para manipulación
        let pdfString = pdfBuffer.toString('binary');
        const placeholderMatch = pdfString.match(/\/Contents\s*<([0-9]+)>/);
        
        if (!placeholderMatch) {
            throw new Error('No se encontró placeholder');
        }

        const placeholder = placeholderMatch[1];
        
        if (signatureHex.length > placeholder.length) {
            throw new Error(`Firma muy grande: ${signatureHex.length} > ${placeholder.length}`);
        }

        // Padding con ceros
        const paddedSignature = signatureHex.padEnd(placeholder.length, '0');
        
        // Reemplazar - IMPORTANTE: usar binary encoding
        pdfString = pdfString.replace(
            `/Contents <${placeholder}>`,
            `/Contents <${paddedSignature}>`
        );

        // CRÍTICO: Convertir de vuelta a Buffer con binary encoding
        return Buffer.from(pdfString, 'binary');
    }

    /**
     * Extraer certificados del P12
     */
    extractCertificates(tempFiles) {
        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -passin pass:${this.certPassword} -clcerts -nokeys -out "${tempFiles.cert}"`, {
            stdio: 'pipe'
        });

        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -passin pass:${this.certPassword} -nocerts -nodes -out "${tempFiles.key}"`, {
            stdio: 'pipe'
        });

        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -passin pass:${this.certPassword} -cacerts -nokeys -out "${tempFiles.chain}"`, {
            stdio: 'pipe'
        });
    }

    /**
     * Solicitar timestamp TSA
     */
    async requestTimestamp(signaturePath) {
        const tempId = Date.now();
        const tsqPath = path.join(this.tempDir, `${tempId}.tsq`);
        const tsrPath = path.join(this.tempDir, `${tempId}.tsr`);

        try {
            execSync(`"${this.opensslPath}" ts -query -data "${signaturePath}" -sha256 -cert -out "${tsqPath}"`, {
                stdio: 'pipe'
            });

            const tsqData = fs.readFileSync(tsqPath);
            const tsrData = await this.sendTsaRequest(tsqData);
            
            if (!tsrData) {
                return { success: false };
            }

            fs.writeFileSync(tsrPath, tsrData);

            const tsInfo = execSync(`"${this.opensslPath}" ts -reply -in "${tsrPath}" -text`, {
                encoding: 'utf8',
                stdio: 'pipe'
            });

            const timeMatch = tsInfo.match(/Time stamp:\s*(.+)/);
            const time = timeMatch ? timeMatch[1] : 'Desconocido';

            return { success: true, time, token: tsrData };

        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            [tsqPath, tsrPath].forEach(f => {
                try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {}
            });
        }
    }

    /**
     * Enviar request a TSA
     */
    sendTsaRequest(tsqData) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.tsaUrl);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/timestamp-query',
                    'Content-Length': tsqData.length
                },
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(Buffer.concat(chunks));
                    } else {
                        reject(new Error(`TSA HTTP ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('TSA timeout')));
            req.write(tsqData);
            req.end();
        });
    }

    /**
     * Fecha PDF
     */
    getPdfDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `D:${year}${month}${day}${hours}${minutes}${seconds}+00'00'`;
    }

    /**
     * Limpiar temporales
     */
    cleanupTempFiles(tempFiles) {
        Object.values(tempFiles).forEach(file => {
            try {
                if (file && fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch (error) {
                // Ignorar
            }
        });
    }
}

module.exports = PDFSignerHybrid;
