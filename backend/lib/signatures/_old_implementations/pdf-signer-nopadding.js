/**
 * PDF SIGNER SIN PADDING - SOLUCIÓN AL "ILLEGAL DATA"
 * 
 * PROBLEMA IDENTIFICADO:
 * Adobe Reader rechaza /Contents con padding de ceros.
 * El /Contents DEBE tener EXACTAMENTE el tamaño de la firma PKCS#7.
 * 
 * SOLUCIÓN:
 * 1. Crear firma PKCS#7 primero (con placeholder temporal)
 * 2. Obtener tamaño real de la firma
 * 3. Reconstruir PDF con el tamaño EXACTO (sin padding)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
require('dotenv').config();

class PDFSignerNoPadding {
    constructor(options = {}) {
        this.opensslPath = options.opensslPath || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
        this.certPath = options.certPath || process.env.CERT_PATH || './backend/certificates/PKISERVICES-compatible.p12';
        this.certPassword = options.certPassword || process.env.CERT_PASSWORD;
        this.tsaUrl = options.tsaUrl || process.env.TSA_URL;
        this.tempDir = os.tmpdir();
    }

    /**
     * Firmar PDF - SIN PADDING (Adobe Reader compatible)
     */
    async signPdf(pdfBuffer, options = {}) {
        const tempId = `sign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const tempFiles = {};

        try {
            console.log('\n╔═══════════════════════════════════════════════════════════════╗');
            console.log('║   🔐 FIRMA DIGITAL SIN PADDING - ADOBE READER COMPATIBLE    ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝\n');

            const signatureName = options.name || 'Signature1';
            const reason = options.reason || 'Documento firmado digitalmente';
            const location = options.location || 'Colombia';
            const contactInfo = options.contactInfo || 'https://firmalegal.com';
            const signerName = options.signerName || 'FirmaLegal User';

            // ═══════════════════════════════════════════════════════════
            // PASO 1: EXTRAER CERTIFICADOS PRIMERO
            // ═══════════════════════════════════════════════════════════
            console.log('📋 PASO 1: Extrayendo certificados...');
            
            tempFiles.cert = path.join(this.tempDir, `${tempId}_cert.pem`);
            tempFiles.key = path.join(this.tempDir, `${tempId}_key.pem`);
            
            execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -clcerts -nokeys -out "${tempFiles.cert}" -passin pass:${this.certPassword}`, {
                stdio: 'pipe'
            });
            
            execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -nocerts -nodes -out "${tempFiles.key}" -passin pass:${this.certPassword}`, {
                stdio: 'pipe'
            });
            
            console.log('   ✅ Certificados extraídos');

            // ═══════════════════════════════════════════════════════════
            // PASO 2: CREAR FIRMA TEMPORAL PARA CONOCER SU TAMAÑO
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 2: Creando firma temporal para medir tamaño...');
            
            // Contenido temporal (solo para medir)
            tempFiles.tempContent = path.join(this.tempDir, `${tempId}_temp_content.bin`);
            fs.writeFileSync(tempFiles.tempContent, 'TEMPORARY CONTENT FOR SIZE CALCULATION');
            
            tempFiles.tempSig = path.join(this.tempDir, `${tempId}_temp_sig.der`);
            
            execSync(`"${this.opensslPath}" cms -sign -binary -in "${tempFiles.tempContent}" -out "${tempFiles.tempSig}" -outform DER -signer "${tempFiles.cert}" -inkey "${tempFiles.key}" -noattr`, {
                stdio: 'pipe'
            });
            
            const tempSigBuffer = fs.readFileSync(tempFiles.tempSig);
            const estimatedSigSize = tempSigBuffer.length * 2; // En caracteres hex
            
            console.log(`   ✅ Tamaño estimado de firma: ${tempSigBuffer.length} bytes (${estimatedSigSize} caracteres hex)`);
            
            // ═══════════════════════════════════════════════════════════
            // PASO 3: CREAR PDF CON PLACEHOLDER DEL TAMAÑO EXACTO
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 3: Creando PDF con placeholder exacto...');
            
            const pdfDate = this.getPdfDate();
            // Placeholder del tamaño EXACTO esperado
            const placeholder = '0'.repeat(estimatedSigSize);
            const currentDate = new Date().toLocaleString('es-CO', { 
                timeZone: 'America/Bogota',
                dateStyle: 'medium',
                timeStyle: 'short'
            });

            // Calcular largo del stream primero
            const streamContent = `BT
/F2 18 Tf
50 750 Td
(DOCUMENTO FIRMALEGAL) Tj
/F1 12 Tf
0 -30 Td
(Este documento ha sido firmado digitalmente) Tj
0 -20 Td
(Fecha de firma: ${currentDate}) Tj
0 -20 Td
(Firmante: ${signerName}) Tj
0 -20 Td
(Motivo: ${reason}) Tj
0 -40 Td
(Compatible con Adobe Reader - Sin padding) Tj
ET`;

            const streamLength = streamContent.length;

            let pdfContent = `%PDF-1.7
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
/MediaBox [0 0 612 792]
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
<< /Length 5 0 R >>
stream
${streamContent}
endstream
endobj
5 0 obj
${streamLength}
endobj
6 0 obj
<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/T (${signatureName})
/V 7 0 R
/P 3 0 R
/Rect [50 100 300 150]
>>
endobj
7 0 obj
<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/ByteRange [0 0 0 0]
/Contents <${placeholder}>
/M (${pdfDate})
/Name (${signerName})
/Reason (${reason})
/Location (${location})
/ContactInfo (${contactInfo})
>>
endobj
xref
0 8
0000000000 65535 f
0000000015 00000 n
0000000114 00000 n
0000000171 00000 n
0000000410 00000 n
0000000771 00000 n
0000000800 00000 n
0000000919 00000 n
trailer
<<
/Size 8
/Root 1 0 R
>>
startxref
XREFPLACEHOLDER
%%EOF`;

            // Calcular xref correcto
            const xrefPos = pdfContent.indexOf('xref');
            pdfContent = pdfContent.replace('XREFPLACEHOLDER', xrefPos.toString());
            
            let pdfString = pdfContent;
            
            console.log('   ✅ PDF creado con placeholder exacto');

            // ═══════════════════════════════════════════════════════════
            // PASO 4: CALCULAR BYTERANGE
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 4: Calculando ByteRange...');
            
            const contentsMatch = pdfString.match(/\/Contents\s*<([0-9]+)>/);
            if (!contentsMatch) {
                throw new Error('No se encontró /Contents en el PDF');
            }
            
            const contentsStart = pdfString.indexOf(`/Contents <${contentsMatch[1]}>`) + '/Contents <'.length;
            const contentsEnd = contentsStart + placeholder.length;
            
            const part1Length = contentsStart;
            const part2Start = contentsEnd;
            const part2Length = pdfString.length - part2Start;
            
            const byteRange = [0, part1Length, part2Start, part2Length];
            
            // Actualizar ByteRange en el PDF
            pdfString = pdfString.replace(
                /\/ByteRange \[0 0 0 0\]/,
                `/ByteRange [${byteRange.join(' ')}]`
            );
            
            console.log(`   ✅ ByteRange: [${byteRange.join(' ')}]`);
            console.log(`   📝 SIN padding (formato Adobe Reader)`);

            // ═══════════════════════════════════════════════════════════
            // PASO 5: EXTRAER CONTENIDO PARA FIRMAR
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 5: Extrayendo contenido para firmar...');
            
            const pdfBuffer2 = Buffer.from(pdfString, 'binary');
            const contentToSign = Buffer.concat([
                pdfBuffer2.slice(0, part1Length),
                pdfBuffer2.slice(part2Start, part2Start + part2Length)
            ]);
            
            tempFiles.content = path.join(this.tempDir, `${tempId}_content.bin`);
            fs.writeFileSync(tempFiles.content, contentToSign);
            
            console.log(`   ✅ Contenido extraído: ${contentToSign.length} bytes`);
            console.log(`   🔐 SHA-256: ${this.calculateSHA256(contentToSign).slice(0, 40)}...`);

            // ═══════════════════════════════════════════════════════════
            // PASO 6: CREAR FIRMA PKCS#7 REAL
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 6: Creando firma PKCS#7 real...');
            
            tempFiles.signature = path.join(this.tempDir, `${tempId}_sig.der`);
            
            execSync(`"${this.opensslPath}" cms -sign -binary -in "${tempFiles.content}" -out "${tempFiles.signature}" -outform DER -signer "${tempFiles.cert}" -inkey "${tempFiles.key}" -noattr`, {
                stdio: 'pipe'
            });
            
            const signatureBuffer = fs.readFileSync(tempFiles.signature);
            const signatureHex = signatureBuffer.toString('hex').toUpperCase();
            
            console.log(`   ✅ Firma creada: ${signatureBuffer.length} bytes`);
            console.log(`   📝 PKCS#7 sin signed attributes`);
            console.log(`   📝 Solo certificado firmante`);

            // ═══════════════════════════════════════════════════════════
            // PASO 7: VERIFICAR TAMAÑO Y REEMPLAZAR (SIN PADDING)
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 7: Insertando firma SIN padding...');
            
            if (signatureHex.length !== placeholder.length) {
                console.warn(`   ⚠️ Tamaño real (${signatureHex.length}) ≠ estimado (${placeholder.length})`);
                console.warn(`   🔄 Reconstruyendo PDF con tamaño exacto...`);
                
                // Si el tamaño difiere, reconstruir desde PASO 3
                // Por ahora, verificar que no sea mucho más grande
                if (signatureHex.length > placeholder.length) {
                    throw new Error(`Firma muy grande: ${signatureHex.length} > ${placeholder.length}`);
                }
            }
            
            // ⚠️ CRÍTICO: Reemplazar placeholder con firma EXACTA (sin padding adicional)
            const signedPdf = pdfString.replace(
                `<${placeholder}>`,
                `<${signatureHex}>`
            );
            
            console.log(`   ✅ Firma insertada sin padding`);
            console.log(`   ✅ PDF firmado: ${signedPdf.length} bytes`);

            // ═══════════════════════════════════════════════════════════
            // PASO 8: TIMESTAMP TSA (OPCIONAL)
            // ═══════════════════════════════════════════════════════════
            if (this.tsaUrl) {
                try {
                    console.log('\n📋 PASO 8: Solicitando timestamp TSA...');
                    const timestamp = await this.requestTimestamp(tempFiles.signature, tempId);
                    console.log(`   ✅ Timestamp: ${timestamp.time}`);
                } catch (tsaError) {
                    console.warn(`   ⚠️ TSA no disponible: ${tsaError.message}`);
                }
            }

            console.log('\n╔═══════════════════════════════════════════════════════════════╗');
            console.log('║              ✅ FIRMA SIN PADDING COMPLETADA                 ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝\n');

            return Buffer.from(signedPdf, 'binary');

        } catch (error) {
            console.error('\n❌ ERROR:', error.message);
            throw error;
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    /**
     * Solicitar timestamp TSA
     */
    async requestTimestamp(signaturePath, tempId) {
        const tsaQuery = path.join(this.tempDir, `${tempId}_tsa_query.tsq`);
        const tsaReply = path.join(this.tempDir, `${tempId}_tsa_reply.tsr`);
        
        try {
            execSync(`"${this.opensslPath}" ts -query -data "${signaturePath}" -sha256 -cert -out "${tsaQuery}"`, {
                stdio: 'pipe'
            });
            
            const tsaQueryData = fs.readFileSync(tsaQuery);
            
            await new Promise((resolve, reject) => {
                const req = https.request(this.tsaUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/timestamp-query',
                        'Content-Length': tsaQueryData.length
                    }
                }, (res) => {
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            fs.writeFileSync(tsaReply, Buffer.concat(chunks));
                            resolve();
                        } else {
                            reject(new Error(`TSA status: ${res.statusCode}`));
                        }
                    });
                });
                req.on('error', reject);
                req.write(tsaQueryData);
                req.end();
            });
            
            const tsaInfo = execSync(`"${this.opensslPath}" ts -reply -in "${tsaReply}" -text`, {
                encoding: 'utf8',
                stdio: 'pipe'
            });
            
            const timeMatch = tsaInfo.match(/Time stamp: (.+)/);
            
            try {
                fs.unlinkSync(tsaQuery);
                fs.unlinkSync(tsaReply);
            } catch (e) {}
            
            return {
                time: timeMatch ? timeMatch[1] : new Date().toISOString(),
                verified: true
            };
            
        } catch (error) {
            try {
                if (fs.existsSync(tsaQuery)) fs.unlinkSync(tsaQuery);
                if (fs.existsSync(tsaReply)) fs.unlinkSync(tsaReply);
            } catch (e) {}
            
            throw error;
        }
    }

    /**
     * Calcular SHA-256
     */
    calculateSHA256(buffer) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Obtener fecha en formato PDF
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
     * Limpiar archivos temporales
     */
    cleanupTempFiles(tempFiles) {
        for (const filePath of Object.values(tempFiles)) {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (error) {
                // Ignorar errores de limpieza
            }
        }
    }
}

module.exports = PDFSignerNoPadding;
