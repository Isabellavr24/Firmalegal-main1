/**
 * CLIENTE PARA MICROSERVICIO PYTHON DE FIRMA DIGITAL
 *
 * Cliente Node.js que se comunica con el microservicio Python (FastAPI)
 * para firmar PDFs con certificados P12 y timestamp TSA usando pyHanko
 *
 * Uso:
 *   const PythonSignerClient = require('./python-signer-client');
 *   const client = new PythonSignerClient();
 *   const signedPdf = await client.signPdf(pdfBuffer, options);
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { PATHS } = require('../../config/paths');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class PythonSignerClient {
    constructor(options = {}) {
        // URL del microservicio Python
        this.serviceUrl = options.serviceUrl || process.env.PYTHON_SIGNER_URL || 'http://127.0.0.1:5001';

        // Configuración de certificado - usar sistema centralizado de rutas
        this.certPath = options.certPath || PATHS.getCertificatePath();

        this.certPassword = options.certPassword || process.env.CERT_PASSWORD;

        // URL del TSA
        this.tsaUrl = options.tsaUrl ||
                     process.env.TSA_URL ||
                     'https://ca.pkiservices.co/tsa/get.aspx?u=pkiservices&p=901301044';

        // Configuración de timeout y retry
        this.timeout = options.timeout || 30000; // 30 segundos
        this.maxRetries = options.maxRetries || 2;

        // Flag para logging detallado
        this.verbose = options.verbose !== undefined ? options.verbose : true;
    }

    /**
     * Firma un PDF usando el microservicio Python
     *
     * @param {Buffer} pdfBuffer - Buffer del PDF a firmar
     * @param {Object} options - Opciones de firma
     * @param {string} options.reason - Razón de la firma
     * @param {string} options.location - Ubicación del firmante
     * @param {string} options.signerName - Nombre del firmante
     * @param {string} options.contactInfo - Información de contacto
     * @param {string} options.fieldName - Nombre del campo de firma
     * @param {boolean} options.visible - Si la firma debe ser visible
     * @param {Array} options.box - Posición de la firma [x1, y1, x2, y2]
     * @param {Array} options.seals - Lista de sellos PKI a dibujar [{page, x, y, width, height}, ...]
     * @returns {Promise<Buffer>} - Buffer del PDF firmado
     * @throws {Error} - Si ocurre algún error durante la firma
     */
    async signPdf(pdfBuffer, options = {}) {
        const startTime = Date.now();

        try {
            if (this.verbose) {
                console.log('\n' + '═'.repeat(70));
                console.log('🐍 ENVIANDO PDF AL MICROSERVICIO PYTHON');
                console.log('═'.repeat(70));
                console.log(`📄 Tamaño PDF: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
                console.log(`🔗 URL: ${this.serviceUrl}/api/sign`);
            }

            // Validar que el certificado exista
            if (!fs.existsSync(this.certPath)) {
                throw new Error(`Certificado no encontrado: ${this.certPath}`);
            }

            // Preparar request
            const requestData = {
                pdf_base64: pdfBuffer.toString('base64'),
                cert_path: this.certPath,
                cert_password: this.certPassword,
                tsa_url: this.tsaUrl,
                reason: options.reason || 'Firma digital',
                location: options.location || 'Colombia',
                signer_name: options.signerName || 'Firmante',
                contact_info: options.contactInfo || '',
                field_name: options.fieldName || 'Signature1',
                visible: options.visible !== undefined ? options.visible : true,
                box: options.box || [10, 10, 210, 60],
                seals: options.seals || null,  // ✅ Agregar sellos PKI
                verification_token: options.verificationToken || null  // ✅ Token seguro para QR (no expone ID)
            };

            if (this.verbose) {
                console.log('\n📋 DATOS DE FIRMA:');
                console.log(`   Firmante: ${requestData.signer_name}`);
                console.log(`   Razón: ${requestData.reason}`);
                console.log(`   Ubicación: ${requestData.location}`);
                console.log(`   Campo: ${requestData.field_name}`);
                console.log(`   Visible: ${requestData.visible ? 'Sí' : 'No'}`);
                if (requestData.seals && requestData.seals.length > 0) {
                    console.log(`   🔐 Sellos PKI: ${requestData.seals.length}`);
                }
            }

            // Realizar petición con retry
            let lastError;
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    if (this.verbose && attempt > 1) {
                        console.log(`\n⚠️  Reintento ${attempt}/${this.maxRetries}...`);
                    }

                    const response = await axios.post(
                        `${this.serviceUrl}/api/sign`,
                        requestData,
                        {
                            timeout: this.timeout,
                            maxContentLength: 100 * 1024 * 1024, // 100MB
                            maxBodyLength: 100 * 1024 * 1024,
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    // Validar respuesta
                    if (!response.data || !response.data.success) {
                        throw new Error('El servicio Python retornó un error en la respuesta');
                    }

                    // Decodificar PDF firmado
                    const signedPdf = Buffer.from(response.data.signed_pdf_base64, 'base64');
                    const elapsedTime = Date.now() - startTime;

                    if (this.verbose) {
                        console.log('\n' + '═'.repeat(70));
                        console.log('✅ PDF FIRMADO EXITOSAMENTE');
                        console.log('═'.repeat(70));
                        console.log(`📊 Original: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
                        console.log(`📊 Firmado: ${(signedPdf.length / 1024).toFixed(2)} KB`);
                        console.log(`📊 Incremento: ${((signedPdf.length - pdfBuffer.length) / 1024).toFixed(2)} KB`);

                        if (response.data.timestamp) {
                            console.log(`⏰ Timestamp: ${response.data.timestamp.time}`);
                            console.log(`🔗 TSA: ${response.data.timestamp.source}`);
                        }

                        console.log(`⏱️  Tiempo total: ${elapsedTime} ms`);
                        console.log(`⏱️  Tiempo Python: ${response.data.processing_time_ms} ms`);
                        console.log('═'.repeat(70) + '\n');
                    }

                    return signedPdf;

                } catch (error) {
                    lastError = error;

                    // Si es el último intento, lanzar el error
                    if (attempt === this.maxRetries) {
                        break;
                    }

                    // Esperar antes de reintentar (exponential backoff)
                    await this._sleep(1000 * attempt);
                }
            }

            // Si llegamos aquí, todos los intentos fallaron
            throw this._processError(lastError);

        } catch (error) {
            if (this.verbose) {
                console.error('\n' + '═'.repeat(70));
                console.error('❌ ERROR EN FIRMA DIGITAL');
                console.error('═'.repeat(70));
                console.error(`Error: ${error.message}`);
                console.error('═'.repeat(70) + '\n');
            }
            throw error;
        }
    }

    /**
     * Verifica la salud del servicio Python
     *
     * @returns {Promise<boolean>} - true si el servicio está disponible
     */
    async healthCheck() {
        try {
            const response = await axios.get(
                `${this.serviceUrl}/health`,
                { timeout: 5000 }
            );

            return response.data && response.data.status === 'ok';
        } catch (error) {
            return false;
        }
    }

    /**
     * Verifica un certificado P12
     *
     * @param {string} certPath - Ruta al certificado (opcional, usa el configurado)
     * @param {string} certPassword - Password del certificado (opcional, usa el configurado)
     * @returns {Promise<Object>} - Información del certificado
     */
    async verifyCertificate(certPath = null, certPassword = null) {
        try {
            const response = await axios.post(
                `${this.serviceUrl}/api/verify-cert`,
                {
                    cert_path: certPath || this.certPath,
                    cert_password: certPassword || this.certPassword
                },
                { timeout: 10000 }
            );

            return response.data;
        } catch (error) {
            throw this._processError(error);
        }
    }

    /**
     * Obtiene información del servicio
     *
     * @returns {Promise<Object>} - Información del servicio
     */
    async getServiceInfo() {
        try {
            const response = await axios.get(
                `${this.serviceUrl}/`,
                { timeout: 5000 }
            );

            return response.data;
        } catch (error) {
            throw this._processError(error);
        }
    }

    /**
     * Procesa errores de axios y retorna un error más descriptivo
     * @private
     */
    _processError(error) {
        if (error.code === 'ECONNREFUSED') {
            return new Error(
                `No se puede conectar al servicio Python en ${this.serviceUrl}. ` +
                'Asegúrate de que el microservicio esté ejecutándose:\n' +
                '  cd backend/python_signer\n' +
                '  python main.py'
            );
        }

        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            return new Error(
                `Timeout conectando al servicio Python (${this.timeout}ms). ` +
                'El servicio puede estar sobrecargado o no responder.'
            );
        }

        if (error.response) {
            // El servidor respondió con un código de error
            const detail = error.response.data?.detail || error.response.data?.error || 'Error desconocido';
            return new Error(`Error del servicio Python: ${detail}`);
        }

        if (error.request) {
            // La petición se hizo pero no hubo respuesta
            return new Error(
                'No se recibió respuesta del servicio Python. ' +
                'Verifica que el servicio esté ejecutándose y sea accesible.'
            );
        }

        // Otro tipo de error
        return error;
    }

    /**
     * Helper para esperar un tiempo
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Configura el modo verbose
     *
     * @param {boolean} enabled - Activar/desactivar logs detallados
     */
    setVerbose(enabled) {
        this.verbose = enabled;
    }
}

module.exports = PythonSignerClient;
