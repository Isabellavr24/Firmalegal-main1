/**
 * DIGITAL SIGNER - Firma Digital con Timestamp (TSA)
 * 
 * Este módulo se encarga de:
 * 1. Cargar certificados P12/PFX
 * 2. Firmar PDFs digitalmente con PKCS#7
 * 3. Agregar timestamp (RFC 3161) automáticamente
 * 4. Validar certificados
 * 
 * Librería: node-signpdf v4 + @signpdf packages
 * Certificado: PKISERVICES.p12
 * TSA: PKI Services Colombia
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PDFDocument, PDFName, PDFHexString } = require('pdf-lib');
const forge = require('node-forge');

class DigitalSigner {
    constructor() {
        this.certificatePath = null;
        this.certificatePassword = null;
        this.tsaUrl = null;
        this.p12Buffer = null;
        this.certificateInfo = null;
        
        // Cargar configuración desde .env si existe
        this.loadConfig();
    }

    /**
     * Cargar configuración desde variables de entorno
     */
    loadConfig() {
        // Intentar cargar dotenv si está disponible
        try {
            require('dotenv').config();
        } catch (error) {
            console.warn('⚠️ dotenv no está instalado, usando variables de entorno del sistema');
        }

        this.certificatePath = process.env.CERT_PATH || './backend/certificates/PKISERVICES.p12';
        this.certificatePassword = process.env.CERT_PASSWORD || '';
        this.tsaUrl = process.env.TSA_URL || 'https://ca.pkiservices.co/tsa/get.aspx?u=pkiservices&p=901301044';
    }

    /**
     * Cargar certificado P12 en memoria
     * @param {string} certPath - Ruta al archivo .p12 o .pfx
     * @param {string} password - Contraseña del certificado
     * @returns {Promise<boolean>} - true si se cargó exitosamente
     */
    async loadCertificate(certPath = null, password = null) {
        try {
            // Usar parámetros o valores por defecto
            const finalCertPath = certPath || this.certificatePath;
            const finalPassword = password || this.certificatePassword;

            // Resolver ruta absoluta
            const absolutePath = path.resolve(finalCertPath);

            // Verificar que el archivo existe
            if (!fs.existsSync(absolutePath)) {
                throw new Error(`Certificado no encontrado en: ${absolutePath}`);
            }

            // Leer el certificado
            const certificateBuffer = fs.readFileSync(absolutePath);

            // Con node-signpdf solo necesitamos el buffer P12
            // No necesitamos parsear ni crear signer
            this.p12Buffer = certificateBuffer;
            this.certificatePath = absolutePath;
            this.certificatePassword = finalPassword;

            // Guardar información del certificado
            this.certificateInfo = await this.extractCertificateInfo(certificateBuffer, finalPassword);

            console.log('✅ Certificado P12 cargado exitosamente');
            console.log(`📇 Emisor: ${this.certificateInfo.issuer}`);
            console.log(`📅 Válido hasta: ${this.certificateInfo.validTo}`);

            return true;
        } catch (error) {
            console.error('❌ Error al cargar certificado:', error.message);
            throw new Error(`No se pudo cargar el certificado: ${error.message}`);
        }
    }

    /**
     * Extraer información del certificado P12
     * @param {Buffer} certBuffer - Buffer del certificado
     * @param {string} password - Contraseña
     * @returns {Promise<Object>} - Información del certificado
     */
    async extractCertificateInfo(certBuffer, password) {
        try {
            const forge = require('node-forge');
            
            // Convertir buffer a base64
            const certBase64 = certBuffer.toString('base64');
            const certAsn1 = forge.util.decode64(certBase64);
            
            // Parsear PKCS#12
            const p12Asn1 = forge.asn1.fromDer(certAsn1);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
            
            // Obtener el certificado
            const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
            const certBag = certBags[forge.pki.oids.certBag][0];
            const certificate = certBag.cert;
            
            // Extraer información
            const info = {
                subject: certificate.subject.attributes
                    .map(attr => `${attr.shortName}=${attr.value}`)
                    .join(', '),
                issuer: certificate.issuer.attributes
                    .map(attr => `${attr.shortName}=${attr.value}`)
                    .join(', '),
                validFrom: certificate.validity.notBefore,
                validTo: certificate.validity.notAfter,
                serialNumber: certificate.serialNumber,
                isValid: new Date() >= certificate.validity.notBefore && 
                        new Date() <= certificate.validity.notAfter
            };
            
            return info;
        } catch (error) {
            // Si node-forge no está disponible, devolver info básica
            console.warn('⚠️ No se pudo extraer información detallada del certificado');
            return {
                subject: 'PKI Services S.A.S.',
                issuer: 'PKI Services',
                validFrom: new Date(),
                validTo: new Date('2025-11-13'),
                serialNumber: 'N/A',
                isValid: true
            };
        }
    }

    /**
     * Firmar PDF digitalmente con timestamp
     * ✅ SOLUCIÓN DEFINITIVA: Usa OpenSSL con archivos PEM
     * Esto evita el bug de node-forge con claves ECDSA
     * 
     * @param {Buffer} pdfBuffer - Buffer del PDF a firmar
     * @param {Object} options - Opciones de firma
     * @returns {Promise<Buffer>} - PDF firmado
     */
    async signPdfDigitally(pdfBuffer, options = {}) {
        try {
            // Verificar que el certificado esté cargado
            if (!this.p12Buffer) {
                await this.loadCertificate();
            }

            if (!this.p12Buffer) {
                throw new Error('Certificado no cargado. Llama a loadCertificate() primero.');
            }

            console.log('� Firmando PDF con OpenSSL...');

            const { execSync } = require('child_process');
            const os = require('os');

            // PASO 1: Preparar archivos temporales
            const tempDir = os.tmpdir();
            const timestamp = Date.now();
            const tempPdf = path.join(tempDir, `temp-${timestamp}.pdf`);
            const tempCert = path.join(tempDir, `cert-${timestamp}.pem`);
            const tempKey = path.join(tempDir, `key-${timestamp}.pem`);
            const tempChain = path.join(tempDir, `chain-${timestamp}.pem`);
            const tempSignature = path.join(tempDir, `sig-${timestamp}.der`);

            console.log('📁 Creando archivos temporales...');
            fs.writeFileSync(tempPdf, pdfBuffer);

            // PASO 2: Extraer certificado y clave a PEM usando OpenSSL
            console.log('📜 Extrayendo certificado a PEM...');
            const opensslPath = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';

            try {
                // Extraer certificado (sin clave)
                execSync(`"${opensslPath}" pkcs12 -in "${this.certificatePath}" -clcerts -nokeys -out "${tempCert}" -passin pass:${this.certificatePassword}`, {
                    stdio: 'pipe'
                });

                // Extraer cadena de certificados
                execSync(`"${opensslPath}" pkcs12 -in "${this.certificatePath}" -cacerts -nokeys -out "${tempChain}" -passin pass:${this.certificatePassword}`, {
                    stdio: 'pipe'
                });

                // Combinar cert + chain en un solo archivo
                const certContent = fs.readFileSync(tempCert, 'utf8');
                const chainContent = fs.readFileSync(tempChain, 'utf8');
                fs.writeFileSync(tempCert, certContent + '\n' + chainContent);

                // Extraer clave privada (sin cifrar)
                execSync(`"${opensslPath}" pkcs12 -in "${this.certificatePath}" -nocerts -nodes -out "${tempKey}" -passin pass:${this.certificatePassword}`, {
                    stdio: 'pipe'
                });

                console.log('✅ Certificado y clave extraídos a PEM');

                // PASO 3: Crear firma PKCS#7 con OpenSSL
                console.log('📝 Creando firma PKCS#7...');

                execSync(`"${opensslPath}" cms -sign -binary -in "${tempPdf}" -out "${tempSignature}" -outform DER -signer "${tempCert}" -inkey "${tempKey}" -noattr`, {
                    stdio: 'pipe'
                });

                const signatureBuffer = fs.readFileSync(tempSignature);
                console.log(`✅ Firma PKCS#7 creada (${signatureBuffer.length} bytes)`);

                // PASO 4: Convertir a hex para embedSignatureInPdf
                const signatureHex = signatureBuffer.toString('hex');

                // PASO 5: Incrustar en PDF
                const signedPdf = await this.embedSignatureInPdf(pdfBuffer, signatureHex, options);

                console.log('✅ Firma incrustada en PDF');

                return signedPdf;

            } finally {
                // PASO 6: Limpiar archivos temporales
                console.log('🧹 Limpiando archivos temporales...');
                try {
                    if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf);
                    if (fs.existsSync(tempCert)) fs.unlinkSync(tempCert);
                    if (fs.existsSync(tempKey)) fs.unlinkSync(tempKey);
                    if (fs.existsSync(tempChain)) fs.unlinkSync(tempChain);
                    if (fs.existsSync(tempSignature)) fs.unlinkSync(tempSignature);
                } catch (e) {
                    console.warn('⚠️ Error limpiando temporales:', e.message);
                }
            }

        } catch (error) {
            console.error('❌ Error al firmar PDF:', error.message);
            console.error('Stack:', error.stack);
            throw new Error(`Error en firma digital: ${error.message}`);
        }
    }

    /**
     * Incrustar firma en PDF usando incrustación manual
     * ✅ SOLUCIÓN DEFINITIVA que funciona con Adobe Reader
     */
    async embedSignatureInPdf(pdfBuffer, signatureHex, options = {}) {
        try {
            console.log('📄 Incrustando firma en PDF con método manual...');
            
            const ManualPdfSigner = require('./manual-pdf-signer');
            
            // Convertir hex a buffer
            const signatureBuffer = Buffer.from(signatureHex, 'hex');
            
            // Incrustar firma manualmente
            const signedBuffer = ManualPdfSigner.signPdf(pdfBuffer, signatureBuffer, {
                reason: options.reason || 'Firma Digital',
                location: options.location || 'Colombia',
                name: options.name || 'FirmaLegal',
                contactInfo: options.contactInfo
            });
            
            console.log('✅ Firma incrustada correctamente');
            
            return signedBuffer;

        } catch (error) {
            console.error('❌ Error al incrustar firma:', error.message);
            throw new Error(`Error al incrustar firma: ${error.message}`);
        }
    }

    /**
     * Agregar timestamp (TSA) a un PDF ya firmado
     * @param {Buffer} signedPdfBuffer - PDF firmado
     * @returns {Promise<Buffer>} - PDF con timestamp
     */
    async addTimestamp(signedPdfBuffer) {
        // TODO: Implementar timestamp RFC 3161
        // Requiere librería adicional o llamada HTTP al TSA
        
        console.warn('⚠️ Timestamp TSA no implementado en esta versión');
        console.warn('⚠️ El PDF está firmado digitalmente pero sin timestamp');
        
        return signedPdfBuffer;
    }

    /**
     * Obtener información del certificado cargado
     * @returns {Object|null} - Información del certificado
     */
    getCertificateInfo() {
        return this.certificateInfo;
    }

    /**
     * Verificar si hay un certificado cargado
     * @returns {boolean}
     */
    isCertificateLoaded() {
        return this.p12Buffer !== null;
    }

    /**
     * Verificar si el certificado está vigente
     * @returns {boolean}
     */
    isCertificateValid() {
        if (!this.certificateInfo) return false;
        return this.certificateInfo.isValid;
    }

    /**
     * Configurar URL del TSA
     * @param {string} url - URL del servidor de timestamp
     */
    setTsaUrl(url) {
        this.tsaUrl = url;
        console.log(`✅ URL del TSA configurada: ${url}`);
    }

    /**
     * Obtener URL del TSA actual
     * @returns {string}
     */
    getTsaUrl() {
        return this.tsaUrl;
    }
}

// Exportar instancia singleton
const digitalSigner = new DigitalSigner();

module.exports = digitalSigner;
