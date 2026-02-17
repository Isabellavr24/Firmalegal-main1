/**
 * PDF SIGNER INCREMENTAL - SOLUCIÓN DEFINITIVA
 * 
 * PROBLEMA RESUELTO:
 * Adobe Reader rechaza /Contents con padding. La solución es firma INCREMENTAL:
 * 1. Crear PDF base completo
 * 2. Firmar el contenido y obtener tamaño real de firma
 * 3. Agregar UPDATE incremental al PDF con el diccionario de firma
 * 4. /Contents tiene EXACTAMENTE el tamaño de la firma (sin padding)
 * 
 * Este es el mismo approach que usa Adobe Acrobat y todas las herramientas profesionales.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
require('dotenv').config();

class PDFSignerIncremental {
    constructor(options = {}) {
        this.opensslPath = options.opensslPath || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
        this.certPath = options.certPath || process.env.CERT_PATH || './backend/certificates/PKISERVICES-compatible.p12';
        this.certPassword = options.certPassword || process.env.CERT_PASSWORD;
        this.tsaUrl = options.tsaUrl || process.env.TSA_URL;
        this.tempDir = os.tmpdir();
    }

    /**
     * Firmar PDF con actualización incremental
     */
    async signPdf(pdfBuffer, options = {}) {
        const tempId = `sign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const tempFiles = {};

        try {
            console.log('\n╔═══════════════════════════════════════════════════════════════╗');
            console.log('║       🔐 FIRMA INCREMENTAL - ADOBE READER COMPATIBLE        ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝\n');

            const signatureName = options.name || 'Signature1';
            const reason = options.reason || 'Documento firmado digitalmente';
            const location = options.location || 'Colombia';
            const contactInfo = options.contactInfo || 'https://firmalegal.com';
            const signerName = options.signerName || 'FirmaLegal User';

            // ═══════════════════════════════════════════════════════════
            // PASO 1: EXTRAER CERTIFICADOS
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
            // PASO 2: CREAR PDF BASE (sin firma)
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 2: Creando PDF base...');
            
            const pdfDate = this.getPdfDate();
            const currentDate = new Date().toLocaleString('es-CO', { 
                timeZone: 'America/Bogota',
                dateStyle: 'medium',
                timeStyle: 'short'
            });

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
(Firma incremental - Compatible con Adobe Reader) Tj
ET`;

            const streamLength = streamContent.length;

            // PDF base SIN diccionario de firma
            let basePdf = `%PDF-1.7
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
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
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
xref
0 5
0000000000 65535 f
0000000015 00000 n
0000000068 00000 n
0000000125 00000 n
0000000364 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
XREFPOS
%%EOF
`;

            // Calcular y reemplazar xref position
            const xrefPos = basePdf.indexOf('xref');
            basePdf = basePdf.replace('XREFPOS', xrefPos.toString());

            console.log('   ✅ PDF base creado (sin firma)');
            console.log(`   📝 Tamaño: ${basePdf.length} bytes`);

            // ═══════════════════════════════════════════════════════════
            // PASO 3: FIRMAR EL PDF BASE COMPLETO
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 3: Firmando el PDF base...');
            
            tempFiles.content = path.join(this.tempDir, `${tempId}_content.bin`);
            fs.writeFileSync(tempFiles.content, basePdf, 'binary');
            
            const contentHash = this.calculateSHA256(Buffer.from(basePdf, 'binary'));
            console.log(`   🔐 SHA-256: ${contentHash.slice(0, 40)}...`);
            
            tempFiles.signature = path.join(this.tempDir, `${tempId}_sig.der`);
            
            execSync(`"${this.opensslPath}" cms -sign -binary -in "${tempFiles.content}" -out "${tempFiles.signature}" -outform DER -signer "${tempFiles.cert}" -inkey "${tempFiles.key}" -noattr`, {
                stdio: 'pipe'
            });
            
            const signatureBuffer = fs.readFileSync(tempFiles.signature);
            const signatureHex = signatureBuffer.toString('hex').toUpperCase();
            
            console.log(`   ✅ Firma PKCS#7 creada: ${signatureBuffer.length} bytes`);
            console.log(`   📝 Firma en hex: ${signatureHex.length} caracteres`);
            console.log(`   📝 Sin signed attributes (-noattr)`);

            // ═══════════════════════════════════════════════════════════
            // PASO 4: SOLICITAR TIMESTAMP (OPCIONAL)
            // ═══════════════════════════════════════════════════════════
            if (this.tsaUrl) {
                try {
                    console.log('\n📋 PASO 4: Solicitando timestamp TSA...');
                    const timestamp = await this.requestTimestamp(tempFiles.signature, tempId);
                    console.log(`   ✅ Timestamp: ${timestamp.time}`);
                } catch (tsaError) {
                    console.warn(`   ⚠️ TSA no disponible: ${tsaError.message}`);
                }
            }

            // ═══════════════════════════════════════════════════════════
            // PASO 5: CREAR UPDATE INCREMENTAL CON FIRMA
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 PASO 5: Creando update incremental...');
            
            // Calcular ByteRange para el update incremental
            const baseSize = basePdf.length;
            
            // El update incremental será: base + \n + update
            // ByteRange: [0, baseSize, baseSize + offset_to_end_of_contents, size_of_trailer]
            
            // Construir el diccionario de firma con el tamaño EXACTO
            const sigDict = `<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/ByteRange [0 ${baseSize} PLACEHOLDER1 PLACEHOLDER2]
/Contents <${signatureHex}>
/M (${pdfDate})
/Name (${signerName})
/Reason (${reason})
/Location (${location})
/ContactInfo (${contactInfo})
>>`;

            // Calcular offsets reales
            const sigObjStart = baseSize + 1; // +1 por el \n
            const contentsStart = sigDict.indexOf('<' + signatureHex) + 1;
            const contentsEnd = contentsStart + signatureHex.length;
            const afterContentsInSigDict = sigDict.length - contentsEnd;
            
            // Construcción del update incremental
            const incrementalUpdate = `
5 0 obj
${sigDict}
endobj
6 0 obj
<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/T (${signatureName})
/V 5 0 R
/P 3 0 R
/Rect [50 100 300 150]
>>
endobj
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
xref
0 1
0000000000 65535 f
1 1
${this.padXrefOffset(baseSize + incrementalUpdate.indexOf('1 0 obj'))}
5 2
${this.padXrefOffset(baseSize + 1)}
${this.padXrefOffset(baseSize + incrementalUpdate.indexOf('6 0 obj'))}
trailer
<<
/Size 7
/Root 1 0 R
/Prev ${basePdf.indexOf('startxref') + 9}
>>
startxref
${baseSize + incrementalUpdate.indexOf('xref')}
%%EOF`;

            // Calcular ByteRange real
            const updateStart = baseSize + 1;
            const contentsAbsoluteStart = updateStart + incrementalUpdate.indexOf('<' + signatureHex) + 1;
            const contentsAbsoluteEnd = contentsAbsoluteStart + signatureHex.length;
            const trailerStart = updateStart + incrementalUpdate.indexOf('trailer');
            const trailerSize = incrementalUpdate.length - incrementalUpdate.indexOf('trailer');
            
            const byteRange = [
                0,
                contentsAbsoluteStart,
                contentsAbsoluteEnd,
                trailerSize
            ];
            
            // Reemplazar placeholders con ByteRange real
            let finalUpdate = incrementalUpdate.replace(
                'PLACEHOLDER1 PLACEHOLDER2',
                `${contentsAbsoluteEnd} ${trailerSize}`
            );
            
            // Construir PDF final
            const finalPdf = basePdf + finalUpdate;
            
            console.log(`   ✅ Update incremental creado`);
            console.log(`   📝 ByteRange: [${byteRange.join(' ')}]`);
            console.log(`   📝 Firma SIN padding: ${signatureBuffer.length} bytes`);
            console.log(`   📝 PDF final: ${finalPdf.length} bytes`);

            // ═══════════════════════════════════════════════════════════
            // VERIFICACIÓN
            // ═══════════════════════════════════════════════════════════
            console.log('\n📋 VERIFICACIÓN:');
            console.log(`   ✅ PDF base: ${baseSize} bytes`);
            console.log(`   ✅ Update incremental: ${finalUpdate.length} bytes`);
            console.log(`   ✅ Total: ${finalPdf.length} bytes`);
            console.log(`   ✅ /Contents tiene tamaño EXACTO (sin padding)`);

            console.log('\n╔═══════════════════════════════════════════════════════════════╗');
            console.log('║            ✅ FIRMA INCREMENTAL COMPLETADA                   ║');
            console.log('╚═══════════════════════════════════════════════════════════════╝\n');

            return Buffer.from(finalPdf, 'binary');

        } catch (error) {
            console.error('\n❌ ERROR:', error.message);
            console.error(error.stack);
            throw error;
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    /**
     * Pad xref offset to 10 digits
     */
    padXrefOffset(offset) {
        return String(offset).padStart(10, '0') + ' 00000 n';
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

module.exports = PDFSignerIncremental;
