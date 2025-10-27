const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

/**
 * Incrusta firmas e imágenes en el PDF original
 * Similar a Submissions::GenerateResultAttachments en DocuSeal
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
            
            console.log('✅ PDF firmado generado exitosamente');
            return Buffer.from(pdfBytes);

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
     * Firma digital con certificado X.509 (opcional - requiere node-signpdf)
     * Similar a maybe_sign_pdf en DocuSeal
     */
    async signPdfWithCertificate(pdfBuffer, certificatePath, password) {
        // Implementación futura con node-signpdf
        // Por ahora solo retorna el PDF sin firma digital
        console.log('ℹ️ Firma digital con certificado no implementada aún');
        return pdfBuffer;
    }
}

module.exports = new EmbedSignatures();
