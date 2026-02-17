/**
 * PDF SIGNER SIMPLE - Firma Digital con pdf-lib + OpenSSL
 * 
 * SOLUCIÓN AL PROBLEMA:
 * - Usa pdf-lib para manipular el PDF correctamente
 * - OpenSSL solo para crear la firma PKCS#7
 * - Compatible con Adobe Reader
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');
const { PDFDocument, PDFName, PDFHexString, PDFDict, PDFArray, PDFRef } = require('pdf-lib');
require('dotenv').config();

class PDFSignerSimple {
    constructor(options = {}) {
        this.opensslPath = options.opensslPath || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
        this.certPath = options.certPath || process.env.CERT_PATH || './backend/certificates/PKISERVICES-compatible.p12';
        this.certPassword = options.certPassword || process.env.CERT_PASSWORD;
        this.tsaUrl = options.tsaUrl || process.env.TSA_URL;
        this.tempDir = os.tmpdir();
    }

    /**
     * Firmar PDF con PKCS#7 + TSA
     */
    async signPdf(pdfBuffer, options = {}) {
        const tempId = `sign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const tempFiles = {};

        try {
            console.log('🔐 Iniciando firma digital...');

            // PASO 1: Cargar PDF con pdf-lib
            console.log('📋 Paso 1: Cargando PDF...');
            const pdfDoc = await PDFDocument.load(pdfBuffer);
            
            // PASO 2: Agregar campo de firma usando pdf-lib
            console.log('📋 Paso 2: Agregando campo de firma...');
            const signatureName = options.name || 'Signature1';
            const reason = options.reason || 'Documento firmado digitalmente';
            const location = options.location || 'Colombia';
            const contactInfo = options.contactInfo || '';
            
            // PASO 3: Serializar PDF primero (sin campo de firma)
            console.log('📋 Paso 3: Serializando PDF base...');
            let pdfBytes = await pdfDoc.save({ useObjectStreams: false });
            let pdfString = Buffer.from(pdfBytes).toString('binary');
            
            // PASO 3.5: Agregar campo de firma manualmente
            console.log('📋 Paso 3.5: Agregando campo de firma...');
            
            // Buscar último objeto
            const objMatches = pdfString.match(/(\d+) \d+ obj/g);
            const lastObjNum = objMatches ? Math.max(...objMatches.map(m => parseInt(m))) : 5;
            
            const sigObjNum = lastObjNum + 1;
            const widgetObjNum = lastObjNum + 2;
            
            // Buscar primera página
            const pageMatch = pdfString.match(/(\d+) 0 obj[^]*?\/Type\s*\/Page(?!\s*s)/);
            const pageNum = pageMatch ? parseInt(pageMatch[1]) : 1;
            
            // Buscar catálogo (DIFERENTE de Pages)
            const catalogSearchMatch = pdfString.match(/(\d+) 0 obj\s*<<[^]*?\/Type\s*\/Catalog[^]*?\/Pages/);
            const catalogNum = catalogSearchMatch ? parseInt(catalogSearchMatch[1]) : 2;
            
            // Crear placeholder
            const placeholderSize = 16384;
            const placeholder = '0'.repeat(placeholderSize);
            
            // Objeto de firma
            const signatureObj = `
${sigObjNum} 0 obj
<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/Contents <${placeholder}>
/ByteRange [0 0 0 0]
/M (D:${this.getPdfDate()})
/Name (${signatureName})
/Reason (${reason})
/Location (${location})
${contactInfo ? `/ContactInfo (${contactInfo})` : ''}
>>
endobj
`;

            // Widget de firma
            const widgetObj = `
${widgetObjNum} 0 obj
<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/Rect [10 10 250 70]
/V ${sigObjNum} 0 R
/T (${signatureName})
/F 132
/P ${pageNum} 0 R
>>
endobj
`;

            // Insertar objetos antes del xref
            const xrefPos = pdfString.indexOf('xref');
            if (xrefPos === -1) {
                throw new Error('No se encontró xref');
            }
            
            pdfString = pdfString.slice(0, xrefPos) + signatureObj + widgetObj + pdfString.slice(xrefPos);
            
            // Agregar widget a la página
            const pageObjPattern = new RegExp(`${pageNum} 0 obj\\s*<<([^]*?)>>`);
            const pageObjMatch = pdfString.match(pageObjPattern);
            
            if (pageObjMatch) {
                const pageContent = pageObjMatch[1];
                let newPageContent;
                
                if (pageContent.includes('/Annots')) {
                    newPageContent = pageContent.replace(/\/Annots\s*\[([^\]]*)\]/, `/Annots [$1 ${widgetObjNum} 0 R]`);
                } else {
                    newPageContent = pageContent + `/Annots [${widgetObjNum} 0 R]\n`;
                }
                
                pdfString = pdfString.replace(pageObjMatch[0], `${pageNum} 0 obj\n<<${newPageContent}>>`);
            }
            
            // Agregar AcroForm al catálogo (CRÍTICO para Adobe Reader)
            // El catálogo es el objeto con /Type /Catalog (NO confundir con /Type /Pages)
            const catalogObjRegex = /(\d+) 0 obj\s*<<([^]*?)\/Type\s*\/Catalog([^]*?)>>\s*endobj/;
            const catalogObjMatch = pdfString.match(catalogObjRegex);
            
            if (catalogObjMatch) {
                const [fullMatch, objNum, beforeType, afterType] = catalogObjMatch;
                
                if (!fullMatch.includes('/AcroForm')) {
                    // Construir nuevo catálogo con AcroForm
                    const newCatalog = `${objNum} 0 obj\n<<${beforeType}/Type /Catalog${afterType}/AcroForm <</Fields [${widgetObjNum} 0 R] /SigFlags 3>>\n>>\nendobj`;
                    pdfString = pdfString.replace(fullMatch, newCatalog);
                    console.log(`   ✅ AcroForm agregado al catálogo (objeto ${objNum})`);
                } else {
                    console.log('   ℹ️ AcroForm ya existe en el catálogo');
                }
            } else {
                console.warn('   ⚠️ No se pudo encontrar el objeto Catalog');
            }

            // PASO 4: Calcular ByteRange
            console.log('📋 Paso 4: Calculando ByteRange...');
            
            // Buscar /Contents <placeholder>
            const contentsMatch = pdfString.match(/\/Contents\s*<([0-9]+)>/);
            if (!contentsMatch) {
                throw new Error('No se encontró /Contents en el PDF');
            }

            const contentsIndex = pdfString.indexOf(`/Contents <${contentsMatch[1]}`);
            const contentsStart = contentsIndex + '/Contents <'.length;
            const contentsEnd = contentsStart + placeholderSize;

            const byteRange = [
                0,
                contentsStart,
                contentsEnd,
                pdfString.length - contentsEnd
            ];

            console.log(`   ByteRange: [${byteRange.join(' ')}]`);

            // Actualizar ByteRange en el PDF
            pdfString = pdfString.replace(
                /\/ByteRange\s*\[\s*0\s+0\s+0\s+0\s*\]/,
                `/ByteRange [${byteRange.join(' ')}]`
            );

            // Guardar PDF temporal
            tempFiles.withPlaceholder = path.join(this.tempDir, `${tempId}_placeholder.pdf`);
            fs.writeFileSync(tempFiles.withPlaceholder, pdfString, 'binary');

            // PASO 5: Extraer contenido a firmar
            console.log('📋 Paso 5: Extrayendo contenido a firmar...');
            const pdfBuffer2 = Buffer.from(pdfString, 'binary');
            const contentToSign = Buffer.concat([
                pdfBuffer2.slice(byteRange[0], byteRange[0] + byteRange[1]),
                pdfBuffer2.slice(byteRange[2], byteRange[2] + byteRange[3])
            ]);

            tempFiles.content = path.join(this.tempDir, `${tempId}_content.bin`);
            fs.writeFileSync(tempFiles.content, contentToSign);
            console.log(`   Contenido: ${contentToSign.length} bytes`);

            // PASO 6: Extraer certificados
            console.log('📋 Paso 6: Extrayendo certificados...');
            tempFiles.cert = path.join(this.tempDir, `${tempId}_cert.pem`);
            tempFiles.key = path.join(this.tempDir, `${tempId}_key.pem`);
            tempFiles.chain = path.join(this.tempDir, `${tempId}_chain.pem`);
            
            this.extractCertificates(tempFiles);

            // PASO 7: Crear firma PKCS#7
            console.log('📋 Paso 7: Creando firma PKCS#7...');
            tempFiles.signature = path.join(this.tempDir, `${tempId}_sig.der`);
            
            this.createPKCS7Signature(tempFiles.content, tempFiles.cert, tempFiles.key, tempFiles.signature);
            
            const sigBuffer = fs.readFileSync(tempFiles.signature);
            console.log(`   Firma: ${sigBuffer.length} bytes`);

            // PASO 8: Solicitar timestamp TSA (opcional)
            if (this.tsaUrl) {
                console.log('📋 Paso 8: Solicitando timestamp TSA...');
                try {
                    const tsaTimestamp = await this.requestTimestamp(tempFiles.signature);
                    if (tsaTimestamp) {
                        console.log(`   ✅ Timestamp: ${tsaTimestamp.time}`);
                    }
                } catch (tsaError) {
                    console.warn('   ⚠️ Timestamp TSA no disponible:', tsaError.message);
                }
            }

            // PASO 9: Insertar firma en placeholder
            console.log('📋 Paso 9: Insertando firma en PDF...');
            const signatureHex = sigBuffer.toString('hex').toUpperCase();
            
            if (signatureHex.length > placeholderSize) {
                throw new Error(`Firma muy grande: ${signatureHex.length} > ${placeholderSize}`);
            }

            const paddedSignature = signatureHex.padEnd(placeholderSize, '0');
            
            const signedPdf = pdfString.replace(
                new RegExp(`/Contents <${contentsMatch[1]}>`),
                `/Contents <${paddedSignature}>`
            );

            console.log('✅ Firma digital completada\n');
            return Buffer.from(signedPdf, 'binary');

        } catch (error) {
            console.error('❌ Error en firma digital:', error.message);
            throw error;
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    /**
     * Extraer certificados del P12
     */
    extractCertificates(tempFiles) {
        // Certificado principal
        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -clcerts -nokeys -out "${tempFiles.cert}" -passin pass:${this.certPassword}`, {
            stdio: 'pipe'
        });
        
        // Cadena de certificados
        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -cacerts -nokeys -out "${tempFiles.chain}" -passin pass:${this.certPassword}`, {
            stdio: 'pipe'
        });
        
        // Combinar cert + chain
        const certContent = fs.readFileSync(tempFiles.cert, 'utf8');
        const chainContent = fs.readFileSync(tempFiles.chain, 'utf8');
        fs.writeFileSync(tempFiles.cert, certContent + '\n' + chainContent);
        
        // Clave privada
        execSync(`"${this.opensslPath}" pkcs12 -in "${this.certPath}" -nocerts -nodes -out "${tempFiles.key}" -passin pass:${this.certPassword}`, {
            stdio: 'pipe'
        });
    }

    /**
     * Crear firma PKCS#7
     */
    createPKCS7Signature(contentPath, certPath, keyPath, outputPath) {
        execSync(`"${this.opensslPath}" cms -sign -binary -in "${contentPath}" -out "${outputPath}" -outform DER -signer "${certPath}" -inkey "${keyPath}" -noattr`, {
            stdio: 'pipe'
        });
    }

    /**
     * Solicitar timestamp TSA
     */
    async requestTimestamp(signaturePath) {
        const tsaQuery = path.join(this.tempDir, `tsa_${Date.now()}.tsq`);
        const tsaReply = path.join(this.tempDir, `tsa_${Date.now()}.tsr`);
        
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
            throw error;
        }
    }

    /**
     * Obtener fecha en formato PDF
     */
    getPdfDate() {
        const now = new Date();
        return now.toISOString().replace(/[-:]/g, '').slice(0, 14) + "+00'00'";
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
                // Ignorar errores
            }
        }
    }
}

module.exports = PDFSignerSimple;
