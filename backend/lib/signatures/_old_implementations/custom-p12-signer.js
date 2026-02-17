/**
 * CUSTOM P12 SIGNER
 * 
 * Versión personalizada que maneja correctamente certificados P12
 * con cadenas completas (Certificate + Sub CA + Root CA)
 * 
 * Basado en node-forge para parsing robusto del PKCS#12
 */

const forge = require('node-forge');

class CustomP12Signer {
    constructor(p12Buffer, options = {}) {
        this.p12Buffer = p12Buffer;
        this.passphrase = options.passphrase || '';
        this.certificate = null;
        this.privateKey = null;
        this.certificateChain = [];
        
        this._parseP12();
    }

    /**
     * Parsear el archivo P12 con node-forge
     */
    _parseP12() {
        try {
            // Convertir buffer a base64
            const p12Base64 = this.p12Buffer.toString('base64');
            const p12Der = forge.util.decode64(p12Base64);
            
            // Parsear PKCS#12
            const p12Asn1 = forge.asn1.fromDer(p12Der);
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, this.passphrase);
            
            // Obtener certificados
            const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
            const certBagsList = certBags[forge.pki.oids.certBag];
            
            if (!certBagsList || certBagsList.length === 0) {
                throw new Error('No se encontraron certificados en el archivo P12');
            }
            
            console.log(`📋 Encontrados ${certBagsList.length} certificados en el P12`);
            
            // Debug: ver estructura de los bags
            for (let i = 0; i < certBagsList.length; i++) {
                console.log(`   Bag ${i + 1}:`, {
                    keys: Object.keys(certBagsList[i]),
                    certType: typeof certBagsList[i].cert,
                    certIsNull: certBagsList[i].cert === null,
                    hasLocalKeyId: certBagsList[i].attributes ? !!certBagsList[i].attributes.localKeyId : false
                });
            }
            
            // Estrategia: El certificado con localKeyId Y que coincida con la clave privada es el principal
            // Los demás son la cadena (CA intermedia, Root CA)
            let mainCert = null;
            let mainCertIndex = -1;
            
            // Primero, buscar el que tenga localKeyId (es el más común)
            for (let i = 0; i < certBagsList.length; i++) {
                const bag = certBagsList[i];
                
                // Los bags tienen cert (puede ser null) y asn1
                // Si cert es null, parsear desde asn1
                let cert = bag.cert;
                if (!cert && bag.asn1) {
                    cert = forge.pki.certificateFromAsn1(bag.asn1);
                }
                
                if (cert && bag.attributes && bag.attributes.localKeyId) {
                    mainCert = cert;
                    mainCertIndex = i;
                    const cn = cert.subject.getField('CN');
                    console.log(`   ✓ Certificado ${i + 1}: ${cn ? cn.value : 'Unknown'} (con localKeyId - PRINCIPAL)`);
                    break; // El primero con localKeyId es el principal
                } else if (cert) {
                    const cn = cert.subject ? cert.subject.getField('CN') : null;
                    console.log(`   - Certificado ${i + 1}: ${cn ? cn.value : 'Unknown'} (sin localKeyId - cadena)`);
                }
            }
            
            // Si no encontramos uno con localKeyId, usar el primero que tenga cert
            if (!mainCert) {
                for (let i = 0; i < certBagsList.length; i++) {
                    let cert = certBagsList[i].cert;
                    if (!cert && certBagsList[i].asn1) {
                        cert = forge.pki.certificateFromAsn1(certBagsList[i].asn1);
                    }
                    if (cert) {
                        mainCert = cert;
                        mainCertIndex = i;
                        console.log(`   ⚠️ Usando el certificado ${i + 1} como principal`);
                        break;
                    }
                }
            }
            
            if (!mainCert) {
                throw new Error('No se pudo encontrar el certificado principal');
            }
            
            this.certificate = mainCert;
            
            // Agregar todos los certificados a la cadena (incluyendo el principal)
            for (let i = 0; i < certBagsList.length; i++) {
                let cert = certBagsList[i].cert;
                if (!cert && certBagsList[i].asn1) {
                    cert = forge.pki.certificateFromAsn1(certBagsList[i].asn1);
                }
                if (cert) {
                    this.certificateChain.push(cert);
                }
            }
            
            // Obtener clave privada
            const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
            let keyBagsList = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
            
            // Si no hay pkcs8ShroudedKeyBag, intentar con keyBag
            if (!keyBagsList || keyBagsList.length === 0) {
                const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });
                keyBagsList = keyBags2[forge.pki.oids.keyBag];
            }
            
            if (!keyBagsList || keyBagsList.length === 0) {
                throw new Error('No se encontró la clave privada en el archivo P12');
            }
            
            this.privateKey = keyBagsList[0].key;
            
            // Verificar el tipo de clave
            if (this.privateKey) {
                console.log(`✅ Clave privada encontrada (tipo: ${this.privateKey.type || 'unknown'})`);
            }
            
            console.log(`✅ P12 parseado: ${this.certificateChain.length} certificados en la cadena`);
            
        } catch (error) {
            console.error('❌ Error al parsear P12:', error.message);
            throw new Error(`No se pudo parsear el certificado P12: ${error.message}`);
        }
    }

    /**
     * Firmar datos (requerido por SignPdf)
     */
    async sign(data) {
        try {
            if (!this.privateKey) {
                throw new Error('Clave privada no disponible');
            }

            // Crear objeto de firma con node-forge
            const md = forge.md.sha256.create();
            md.update(data.toString('binary'));
            
            // Firmar con la clave privada
            const signature = this.privateKey.sign(md);
            
            return Buffer.from(signature, 'binary');
            
        } catch (error) {
            throw new Error(`Error al firmar: ${error.message}`);
        }
    }

    /**
     * Obtener certificado en formato PEM
     */
    getCertificatePem() {
        if (!this.certificate) {
            throw new Error('Certificado no disponible');
        }
        return forge.pki.certificateToPem(this.certificate);
    }

    /**
     * Obtener cadena de certificados en formato PEM
     */
    getCertificateChainPem() {
        return this.certificateChain.map(cert => forge.pki.certificateToPem(cert));
    }

    /**
     * Obtener certificado en formato DER (requerido por node-signpdf)
     */
    getCertificate() {
        if (!this.certificate) {
            throw new Error('Certificado no disponible');
        }
        
        // Convertir a DER
        const certAsn1 = forge.pki.certificateToAsn1(this.certificate);
        const certDer = forge.asn1.toDer(certAsn1);
        
        return Buffer.from(certDer.getBytes(), 'binary');
    }

    /**
     * Obtener toda la cadena de certificados en formato DER
     */
    getCertificates() {
        return this.certificateChain.map(cert => {
            const certAsn1 = forge.pki.certificateToAsn1(cert);
            const certDer = forge.asn1.toDer(certAsn1);
            return Buffer.from(certDer.getBytes(), 'binary');
        });
    }

    /**
     * Crear estructura PKCS#7 para la firma
     */
    createPKCS7Signature(data, detached = true) {
        try {
            // Crear mensaje PKCS#7
            const p7 = forge.pkcs7.createSignedData();
            
            // Agregar contenido (si no es detached)
            if (!detached) {
                p7.content = forge.util.createBuffer(data.toString('binary'));
            }
            
            // Agregar certificados a la cadena
            for (const cert of this.certificateChain) {
                p7.addCertificate(cert);
            }
            
            // Agregar firmante
            p7.addSigner({
                key: this.privateKey,
                certificate: this.certificate,
                digestAlgorithm: forge.pki.oids.sha256,
                authenticatedAttributes: [
                    {
                        type: forge.pki.oids.contentType,
                        value: forge.pki.oids.data
                    },
                    {
                        type: forge.pki.oids.messageDigest
                    },
                    {
                        type: forge.pki.oids.signingTime,
                        value: new Date()
                    }
                ]
            });
            
            // Firmar
            p7.sign({ detached: detached });
            
            // Convertir a DER
            const p7Asn1 = p7.toAsn1();
            const p7Der = forge.asn1.toDer(p7Asn1);
            
            return Buffer.from(p7Der.getBytes(), 'binary');
            
        } catch (error) {
            throw new Error(`Error al crear PKCS#7: ${error.message}`);
        }
    }
}

module.exports = CustomP12Signer;
