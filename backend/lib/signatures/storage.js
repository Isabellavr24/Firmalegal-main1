const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * Maneja el almacenamiento de documentos, campos y firmas en la BD
 * Similar a los modelos de Rails en DocuSeal
 */
class Storage {
    constructor() {
        // Usar pool de conexiones para mejor rendimiento
        this.pool = null;
    }

    /**
     * Inicializa el pool de conexiones
     */
    async initPool() {
        if (!this.pool) {
            this.pool = mysql.createPool({
                host: 'localhost',
                port: 3306,
                user: 'root',
                password: '',
                database: 'firmalegalonline',
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
            console.log('🔗 Pool de conexiones MySQL inicializado');
        }
        return this.pool;
    }

    /**
     * Guarda un nuevo documento en la BD
     */
    async saveDocument(data) {
        const pool = await this.initPool();
        
        try {
            const [result] = await pool.execute(
                `INSERT INTO signature_documents 
                (user_id, file_name, file_path, num_pages, page_width, page_height, preview_images, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NOW(), NOW())`,
                [
                    data.userId,
                    data.fileName,
                    data.filePath,
                    data.numPages,
                    data.pageWidth,
                    data.pageHeight,
                    JSON.stringify(data.previewImages)
                ]
            );

            console.log(`💾 Documento guardado con ID: ${result.insertId}`);
            return result.insertId;

        } catch (error) {
            console.error('❌ Error al guardar documento:', error);
            throw error;
        }
    }

    /**
     * Obtiene un documento por ID
     */
    async getDocument(documentId, userId) {
        const pool = await this.initPool();
        
        try {
            const [rows] = await pool.execute(
                `SELECT * FROM signature_documents 
                WHERE id = ? AND user_id = ?`,
                [documentId, userId]
            );

            if (rows.length === 0) return null;

            const doc = rows[0];
            // Parsear JSON
            if (doc.preview_images) {
                doc.previewImages = JSON.parse(doc.preview_images);
            }

            return doc;

        } catch (error) {
            console.error('❌ Error al obtener documento:', error);
            throw error;
        }
    }

    /**
     * Guarda campos de firma en la BD
     */
    async saveFields(documentId, fields) {
        const pool = await this.initPool();
        
        try {
            // Eliminar campos existentes del documento
            await pool.execute(
                'DELETE FROM signature_fields WHERE document_id = ?',
                [documentId]
            );

            // Insertar nuevos campos
            for (const field of fields) {
                await pool.execute(
                    `INSERT INTO signature_fields 
                    (document_id, field_id, field_type, page, x, y, width, height, required, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        documentId,
                        field.id,
                        field.type,
                        field.page || 1,
                        field.x,
                        field.y,
                        field.w || field.width,
                        field.h || field.height,
                        field.required || false
                    ]
                );
            }

            console.log(`💾 ${fields.length} campos guardados`);

        } catch (error) {
            console.error('❌ Error al guardar campos:', error);
            throw error;
        }
    }

    /**
     * Guarda una firma
     */
    async saveSignature(data) {
        const pool = await this.initPool();
        
        try {
            const [result] = await pool.execute(
                `INSERT INTO signatures 
                (field_id, user_id, signature_path, signed_at)
                VALUES (?, ?, ?, ?)`,
                [
                    data.fieldId,
                    data.userId,
                    data.signaturePath,
                    data.signedAt
                ]
            );

            console.log(`✍️ Firma guardada con ID: ${result.insertId}`);
            return result.insertId;

        } catch (error) {
            console.error('❌ Error al guardar firma:', error);
            throw error;
        }
    }

    /**
     * Obtiene un documento con sus campos
     */
    async getDocumentWithFields(documentId, userId) {
        const pool = await this.initPool();
        
        try {
            // Obtener documento
            const doc = await this.getDocument(documentId, userId);
            if (!doc) return null;

            // Obtener campos
            const [fields] = await pool.execute(
                `SELECT * FROM signature_fields 
                WHERE document_id = ? 
                ORDER BY page, y`,
                [documentId]
            );

            doc.fields = fields.map(f => ({
                id: f.field_id,
                type: f.field_type,
                page: f.page,
                x: parseFloat(f.x),
                y: parseFloat(f.y),
                w: parseFloat(f.width),
                h: parseFloat(f.height),
                required: f.required
            }));

            return doc;

        } catch (error) {
            console.error('❌ Error al obtener documento con campos:', error);
            throw error;
        }
    }

    /**
     * Obtiene un documento con sus campos Y firmas
     */
    async getDocumentWithSignatures(documentId, userId) {
        const pool = await this.initPool();
        
        try {
            const doc = await this.getDocumentWithFields(documentId, userId);
            if (!doc) return null;

            // Obtener firmas para cada campo
            for (const field of doc.fields) {
                const [signatures] = await pool.execute(
                    `SELECT s.* FROM signatures s
                    INNER JOIN signature_fields sf ON s.field_id = sf.field_id
                    WHERE sf.field_id = ? AND sf.document_id = ?
                    ORDER BY s.signed_at DESC
                    LIMIT 1`,
                    [field.id, documentId]
                );

                if (signatures.length > 0) {
                    field.signature = {
                        signaturePath: signatures[0].signature_path,
                        signedAt: signatures[0].signed_at,
                        userId: signatures[0].user_id,
                        metadata: {
                            signedAt: signatures[0].signed_at
                        }
                    };
                }
            }

            return doc;

        } catch (error) {
            console.error('❌ Error al obtener documento con firmas:', error);
            throw error;
        }
    }

    /**
     * Actualiza el estado del documento
     */
    async updateDocumentStatus(documentId, status, signedFilePath = null) {
        const pool = await this.initPool();
        
        try {
            let query = 'UPDATE signature_documents SET status = ?, updated_at = NOW()';
            let params = [status];

            if (signedFilePath) {
                query += ', signed_file_path = ?';
                params.push(signedFilePath);
            }

            query += ' WHERE id = ?';
            params.push(documentId);

            await pool.execute(query, params);

            console.log(`📝 Estado del documento ${documentId} actualizado: ${status}`);

        } catch (error) {
            console.error('❌ Error al actualizar estado:', error);
            throw error;
        }
    }

    /**
     * Obtiene todos los documentos de un usuario
     */
    async getUserDocuments(userId) {
        const pool = await this.initPool();
        
        try {
            const [rows] = await pool.execute(
                `SELECT 
                    id, file_name, num_pages, status, 
                    created_at, updated_at, signed_file_path
                FROM signature_documents 
                WHERE user_id = ? 
                ORDER BY created_at DESC`,
                [userId]
            );

            return rows.map(doc => ({
                id: doc.id,
                fileName: doc.file_name,
                numPages: doc.num_pages,
                status: doc.status,
                createdAt: doc.created_at,
                updatedAt: doc.updated_at,
                signedFilePath: doc.signed_file_path
            }));

        } catch (error) {
            console.error('❌ Error al obtener documentos del usuario:', error);
            throw error;
        }
    }

    /**
     * Elimina un documento y todos sus archivos asociados
     */
    async deleteDocument(documentId, userId) {
        const pool = await this.initPool();
        
        try {
            // Obtener documento para eliminar archivos
            const doc = await this.getDocumentWithSignatures(documentId, userId);
            if (!doc) {
                throw new Error('Documento no encontrado');
            }

            // Eliminar archivo original
            const originalPath = path.join(
                __dirname, '..', '..', '..', 
                'uploads', 'documents', 
                doc.file_path
            );
            if (fs.existsSync(originalPath)) {
                fs.unlinkSync(originalPath);
            }

            // Eliminar archivo firmado si existe
            if (doc.signed_file_path) {
                const signedPath = path.join(
                    __dirname, '..', '..', '..', 
                    'uploads', 'signed', 
                    doc.signed_file_path
                );
                if (fs.existsSync(signedPath)) {
                    fs.unlinkSync(signedPath);
                }
            }

            // Eliminar firmas físicas
            for (const field of doc.fields) {
                if (field.signature && field.signature.signaturePath) {
                    const sigPath = path.join(
                        __dirname, '..', '..', '..', 
                        'uploads', 'signatures', 
                        field.signature.signaturePath
                    );
                    if (fs.existsSync(sigPath)) {
                        fs.unlinkSync(sigPath);
                    }
                }
            }

            // Eliminar de BD (las foreign keys se encargan del resto)
            await pool.execute(
                'DELETE FROM signature_documents WHERE id = ? AND user_id = ?',
                [documentId, userId]
            );

            console.log(`🗑️ Documento ${documentId} eliminado completamente`);

        } catch (error) {
            console.error('❌ Error al eliminar documento:', error);
            throw error;
        }
    }

    /**
     * Cierra el pool de conexiones
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('🔌 Pool de conexiones cerrado');
        }
    }
}

module.exports = new Storage();
