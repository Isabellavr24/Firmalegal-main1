const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const PythonSignerClient = require('./python-signer-client');

/**
 * Incrusta firmas e imágenes en el PDF original
 * Similar a Submissions::GenerateResultAttachments en DocuSeal
 * 
 * ACTUALIZACIÓN PROFESIONAL: Usa PDFSignerProfessional con:
 * - Todos los atributos PKCS#7
 * - Información completa del certificado visible en Adobe
 * - Timestamp TSA embebido
 * - Cadena de certificados completa
 */
class EmbedSignatures {
    /**
     * Incrusta todas las firmas en el PDF original
     * @param {string} originalPdfPath - Ruta al PDF original
     * @param {Array} fields - Lista de campos con firmas
     * @param {Object} pageDimensions - Dimensiones de página
     * @returns {Buffer} PDF firmado como buffer
     */
    async embedSignaturesInPdf(originalPdfPath, fields, pageDimensions) {
        try {
            console.log('📑 Iniciando proceso de incrustación de firmas...');
            
            // Cargar PDF original
            const pdfBuffer = fs.readFileSync(originalPdfPath);
            const pdfDoc = await PDFDocument.load(pdfBuffer);

            // Filtrar solo campos de firma que tengan imagen
            const signatureFields = fields.filter(f => 
                f.type === 'signature' && f.signature && f.signature.signaturePath
            );

            console.log(`✍️ Incrustando ${signatureFields.length} firmas...`);

            // Incrustar cada firma
            for (const field of signatureFields) {
                await this.embedSignatureField(pdfDoc, field, pageDimensions);
            }

            // Agregar metadata
            this.addMetadata(pdfDoc);

            // Serializar PDF
            const pdfBytes = await pdfDoc.save();
            
            console.log('✅ PDF con firmas visuales generado exitosamente');
            
            // PASO 2: Agregar firma digital PKCS#7 con certificado
            console.log('🔐 Agregando firma digital con certificado...');
            
            try {
                // Intentar firmar digitalmente con el certificado P12
                const signedPdfBuffer = await this.signPdfWithCertificate(
                    Buffer.from(pdfBytes),
                    signatureFields
                );
                
                return signedPdfBuffer;
            } catch (error) {
                console.warn('⚠️ No se pudo agregar firma digital:', error.message);
                console.warn('⚠️ Devolviendo PDF solo con firmas visuales');
                return Buffer.from(pdfBytes);
            }

        } catch (error) {
            console.error('❌ Error al incrustar firmas:', error);
            throw new Error('Error al generar PDF firmado: ' + error.message);
        }
    }

    /**
     * Incrusta un campo de firma individual
     * Similar a fill_submitter_fields en DocuSeal
     */
    async embedSignatureField(pdfDoc, field, pageDimensions) {
        try {
            // Obtener página (field.page es 1-indexed)
            const pageIndex = (field.page || 1) - 1;
            const page = pdfDoc.getPages()[pageIndex];
            const { width: pdfWidth, height: pdfHeight } = page.getSize();

            // Convertir coordenadas relativas a absolutas
            const area = field.area || { x: field.x, y: field.y, w: field.w, h: field.h };
            
            // Si las coordenadas ya son absolutas (mayores a 1), usar directamente
            const isRelative = area.x <= 1 && area.y <= 1;
            
            const coords = isRelative ? {
                x: area.x * pdfWidth,
                y: area.y * pdfHeight,
                w: area.w * pdfWidth,
                h: area.h * pdfHeight
            } : {
                x: area.x,
                y: area.y,
                w: area.w,
                h: area.h
            };

            // Ajustar Y (PDF usa coordenadas desde abajo)
            const yPdf = pdfHeight - coords.y - coords.h;

            console.log(`📍 Posición: (${coords.x.toFixed(2)}, ${yPdf.toFixed(2)}) - Tamaño: ${coords.w.toFixed(2)}x${coords.h.toFixed(2)}`);

            // Cargar imagen de firma
            const signaturePath = path.join(
                __dirname, '..', '..', '..', 
                'uploads', 'signatures', 
                field.signature.signaturePath
            );

            if (!fs.existsSync(signaturePath)) {
                console.warn(`⚠️ Firma no encontrada: ${signaturePath}`);
                return;
            }

            const signatureBytes = fs.readFileSync(signaturePath);
            
            // Detectar tipo de imagen y embeber
            let signatureImage;
            const ext = path.extname(signaturePath).toLowerCase();
            
            if (ext === '.png') {
                signatureImage = await pdfDoc.embedPng(signatureBytes);
            } else if (ext === '.jpg' || ext === '.jpeg') {
                signatureImage = await pdfDoc.embedJpg(signatureBytes);
            } else {
                console.warn(`⚠️ Formato no soportado: ${ext}`);
                return;
            }

            // Dibujar imagen en el PDF
            page.drawImage(signatureImage, {
                x: coords.x,
                y: yPdf,
                width: coords.w,
                height: coords.h,
                opacity: 1.0
            });

            // Agregar metadata de firma (opcional)
            if (field.signature.metadata) {
                await this.addSignatureMetadata(page, field, coords, yPdf);
            }

            console.log(`✅ Firma incrustada en página ${field.page}`);

        } catch (error) {
            console.error(`❌ Error al incrustar firma en página ${field.page}:`, error);
            throw error;
        }
    }

    /**
     * Agrega metadata visible de la firma (fecha, email, etc.)
     * Similar a with_signature_id en DocuSeal
     */
    async addSignatureMetadata(page, field, coords, yPdf) {
        try {
            const metadata = field.signature.metadata;
            const fontSize = 8;
            const lineHeight = 10;
            const padding = 2;
            
            let yText = yPdf - lineHeight - padding;

            // Texto de firma
            const lines = [];
            
            if (metadata.signerName) {
                lines.push(`Firmado por: ${metadata.signerName}`);
            }
            
            if (metadata.signerEmail) {
                lines.push(metadata.signerEmail);
            }
            
            if (metadata.signedAt) {
                const date = new Date(metadata.signedAt);
                lines.push(date.toLocaleString('es-ES'));
            }

            // Dibujar cada línea
            for (const line of lines) {
                page.drawText(line, {
                    x: coords.x,
                    y: yText,
                    size: fontSize,
                    color: rgb(0.3, 0.3, 0.3)
                });
                
                yText -= lineHeight;
            }

        } catch (error) {
            console.warn('⚠️ Error al agregar metadata:', error);
            // No fallar por metadata
        }
    }

    /**
     * Agrega metadata al PDF (creator, fecha, etc.)
     */
    addMetadata(pdfDoc) {
        try {
            pdfDoc.setTitle('Documento Firmado - Firmalegal');
            pdfDoc.setCreator('Firmalegal (firmalegalonline.com)');
            pdfDoc.setProducer('Firmalegal PDF Signer');
            pdfDoc.setCreationDate(new Date());
            pdfDoc.setModificationDate(new Date());
            
            console.log('📝 Metadata agregada al PDF');
        } catch (error) {
            console.warn('⚠️ Error al agregar metadata general:', error);
        }
    }

    /**
     * Firma digital con certificado X.509 (PKCS#7) + Timestamp TSA
     * NUEVA IMPLEMENTACIÓN: Usa microservicio Python con pyHanko
     *
     * @param {Buffer} pdfBuffer - PDF con firmas visuales
     * @param {Array} signatureFields - Campos de firma (para metadata)
     * @returns {Promise<Buffer>} - PDF firmado digitalmente con timestamp
     */
    async signPdfWithCertificate(pdfBuffer, signatureFields = []) {
        try {
            console.log('\n' + '═'.repeat(70));
            console.log('🔐 INICIANDO FIRMA DIGITAL CON PYTHON/PYHANKO');
            console.log('═'.repeat(70));

            // Verificar que el servicio Python esté disponible
            const pythonSigner = new PythonSignerClient();

            const isAvailable = await pythonSigner.healthCheck();
            if (!isAvailable) {
                throw new Error(
                    'Servicio Python no disponible. ' +
                    'Ejecuta: cd backend/python_signer && python main.py'
                );
            }

            console.log('✅ Servicio Python disponible\n');

            // Obtener información del primer firmante (si existe)
            const firstSigner = signatureFields[0]?.signature?.metadata;

            // Opciones de firma
            const signOptions = {
                signerName: firstSigner?.signerName || 'FirmaLegal',
                reason: 'Documento firmado digitalmente en FirmaLegal Online',
                location: firstSigner?.location || 'Colombia',
                contactInfo: firstSigner?.signerEmail || 'contacto@firmalegal.com',
                fieldName: 'Signature1',
                visible: true,  // Firma digital visible
                box: [10, 40, 210, 90]  // Posición en página (encima del pie de página)
            };

            // Firmar PDF usando microservicio Python
            const signedPdfBuffer = await pythonSigner.signPdf(pdfBuffer, signOptions);

            console.log('\n' + '═'.repeat(70));
            console.log('✅ FIRMA DIGITAL + TIMESTAMP COMPLETADA');
            console.log('═'.repeat(70) + '\n');

            return signedPdfBuffer;

        } catch (error) {
            console.error('❌ Error al firmar digitalmente:', error.message);
            
            // Si falla la firma digital, devolver PDF sin firma digital
            // (mejor tener el documento con firmas visuales que nada)
            throw error;
        }
    }
}

module.exports = new EmbedSignatures();
