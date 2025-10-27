const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const processPdf = require('./lib/signatures/process-pdf');
const embedSignatures = require('./lib/signatures/embed-signatures');
const storage = require('./lib/signatures/storage');

const router = express.Router();

// =============================================
// CONFIGURACIÓN DE MULTER PARA PDFs
// =============================================

const pdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `doc-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const signatureStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'signatures');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `sig-${uniqueSuffix}.png`);
    }
});

const uploadPdf = multer({
    storage: pdfStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF'));
        }
    }
});

const uploadSignature = multer({
    storage: signatureStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /png|jpg|jpeg/;
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes PNG, JPG o JPEG'));
        }
    }
});

// =============================================
// ENDPOINTS DE API
// =============================================

/**
 * POST /api/signatures/upload-document
 * Sube un PDF y lo procesa (convierte a imágenes, extrae metadata)
 */
router.post('/upload-document', uploadPdf.single('document'), async (req, res) => {
    console.log('📤 Subiendo documento PDF');
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionó ningún documento'
            });
        }

        const userId = req.body.userId;
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere ID de usuario'
            });
        }

        const filePath = req.file.path;
        const fileName = req.file.originalname;

        // Procesar PDF (convertir a imágenes, extraer info)
        console.log('🔄 Procesando PDF...');
        const pdfData = await processPdf.extractPdfInfo(filePath);

        // Guardar en base de datos
        const documentId = await storage.saveDocument({
            userId,
            fileName,
            filePath: req.file.filename,
            numPages: pdfData.numPages,
            pageWidth: pdfData.pageWidth,
            pageHeight: pdfData.pageHeight,
            previewImages: pdfData.previewImages
        });

        console.log('✅ Documento procesado:', documentId);

        res.json({
            success: true,
            message: 'Documento subido exitosamente',
            document: {
                id: documentId,
                fileName,
                numPages: pdfData.numPages,
                dimensions: {
                    width: pdfData.pageWidth,
                    height: pdfData.pageHeight
                },
                previewImages: pdfData.previewImages
            }
        });

    } catch (error) {
        console.error('❌ Error al subir documento:', error);
        
        // Eliminar archivo si hubo error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: error.message || 'Error al procesar documento'
        });
    }
});

/**
 * POST /api/signatures/save-fields
 * Guarda los campos de firma posicionados en el documento
 */
router.post('/save-fields', async (req, res) => {
    console.log('💾 Guardando campos de firma');
    
    try {
        const { documentId, fields, userId } = req.body;

        if (!documentId || !fields || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos requeridos'
            });
        }

        // Verificar que el documento pertenece al usuario
        const document = await storage.getDocument(documentId, userId);
        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        // Guardar campos en la base de datos
        await storage.saveFields(documentId, fields);

        console.log(`✅ ${fields.length} campos guardados`);

        res.json({
            success: true,
            message: 'Campos guardados exitosamente'
        });

    } catch (error) {
        console.error('❌ Error al guardar campos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al guardar campos'
        });
    }
});

/**
 * POST /api/signatures/upload-signature
 * Sube una imagen de firma (PNG base64 o archivo)
 */
router.post('/upload-signature', uploadSignature.single('signature'), async (req, res) => {
    console.log('✍️ Subiendo firma');
    
    try {
        const { fieldId, signatureData, userId } = req.body;

        if (!fieldId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos requeridos'
            });
        }

        let signaturePath;

        // Si viene como base64 en el body
        if (signatureData && signatureData.startsWith('data:image')) {
            const base64Data = signatureData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            const uploadDir = path.join(__dirname, '..', 'uploads', 'signatures');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            
            const filename = `sig-${Date.now()}-${Math.round(Math.random() * 1E9)}.png`;
            signaturePath = filename;
            const fullPath = path.join(uploadDir, filename);
            
            fs.writeFileSync(fullPath, buffer);
        } 
        // Si viene como archivo multipart
        else if (req.file) {
            signaturePath = req.file.filename;
        } else {
            return res.status(400).json({
                success: false,
                message: 'No se proporcionó firma'
            });
        }

        // Guardar referencia en base de datos
        await storage.saveSignature({
            fieldId,
            userId,
            signaturePath,
            signedAt: new Date()
        });

        console.log('✅ Firma guardada:', signaturePath);

        res.json({
            success: true,
            message: 'Firma guardada exitosamente',
            signaturePath: `/uploads/signatures/${signaturePath}`
        });

    } catch (error) {
        console.error('❌ Error al guardar firma:', error);
        
        // Eliminar archivo si hubo error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            message: 'Error al guardar firma'
        });
    }
});

/**
 * GET /api/signatures/document/:id
 * Obtiene información de un documento y sus campos
 */
router.get('/document/:id', async (req, res) => {
    console.log('📄 Obteniendo documento:', req.params.id);
    
    try {
        const documentId = req.params.id;
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere ID de usuario'
            });
        }

        const document = await storage.getDocumentWithFields(documentId, userId);
        
        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        res.json({
            success: true,
            document
        });

    } catch (error) {
        console.error('❌ Error al obtener documento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener documento'
        });
    }
});

/**
 * POST /api/signatures/generate-signed-pdf
 * Genera el PDF final con todas las firmas incrustadas
 */
router.post('/generate-signed-pdf', async (req, res) => {
    console.log('📑 Generando PDF firmado');
    
    try {
        const { documentId, userId } = req.body;

        if (!documentId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos requeridos'
            });
        }

        // Obtener documento y firmas
        const document = await storage.getDocumentWithSignatures(documentId, userId);
        
        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Documento no encontrado'
            });
        }

        // Verificar que todas las firmas requeridas estén completadas
        const missingSignatures = document.fields.filter(f => 
            f.type === 'signature' && f.required && !f.signature
        );

        if (missingSignatures.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Faltan firmas requeridas'
            });
        }

        // Generar PDF con firmas incrustadas
        console.log('🔄 Incrustando firmas en PDF...');
        const originalPdfPath = path.join(
            __dirname, '..', 'uploads', 'documents', document.filePath
        );

        const signedPdfBuffer = await embedSignatures.embedSignaturesInPdf(
            originalPdfPath,
            document.fields,
            {
                pageWidth: document.pageWidth,
                pageHeight: document.pageHeight
            }
        );

        // Guardar PDF firmado
        const signedFileName = `signed-${Date.now()}-${document.filePath}`;
        const signedPdfPath = path.join(__dirname, '..', 'uploads', 'signed', signedFileName);
        
        const signedDir = path.join(__dirname, '..', 'uploads', 'signed');
        if (!fs.existsSync(signedDir)) {
            fs.mkdirSync(signedDir, { recursive: true });
        }
        
        fs.writeFileSync(signedPdfPath, signedPdfBuffer);

        // Actualizar documento en BD
        await storage.updateDocumentStatus(documentId, 'completed', signedFileName);

        console.log('✅ PDF firmado generado:', signedFileName);

        res.json({
            success: true,
            message: 'PDF firmado generado exitosamente',
            signedPdfUrl: `/uploads/signed/${signedFileName}`,
            fileName: document.fileName.replace('.pdf', '-firmado.pdf')
        });

    } catch (error) {
        console.error('❌ Error al generar PDF firmado:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error al generar PDF firmado'
        });
    }
});

/**
 * GET /api/signatures/my-documents
 * Lista todos los documentos del usuario
 */
router.get('/my-documents', async (req, res) => {
    console.log('📋 Obteniendo documentos del usuario');
    
    try {
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere ID de usuario'
            });
        }

        const documents = await storage.getUserDocuments(userId);

        res.json({
            success: true,
            documents
        });

    } catch (error) {
        console.error('❌ Error al obtener documentos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener documentos'
        });
    }
});

/**
 * DELETE /api/signatures/document/:id
 * Elimina un documento y todos sus archivos asociados
 */
router.delete('/document/:id', async (req, res) => {
    console.log('🗑️ Eliminando documento:', req.params.id);
    
    try {
        const documentId = req.params.id;
        const userId = req.query.userId;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere ID de usuario'
            });
        }

        await storage.deleteDocument(documentId, userId);

        res.json({
            success: true,
            message: 'Documento eliminado exitosamente'
        });

    } catch (error) {
        console.error('❌ Error al eliminar documento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar documento'
        });
    }
});

module.exports = router;
