-- =============================================
-- TABLA DE DESTINATARIOS DE FIRMAS
-- Para tracking de quién debe firmar cada documento
-- =============================================

-- Agregar columna a signature_documents para vincular con documents
ALTER TABLE signature_documents
ADD COLUMN document_id INT NULL COMMENT 'ID del documento original en la tabla documents',
ADD FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
ADD INDEX idx_document_id (document_id);

-- Tabla de destinatarios (recipients)
CREATE TABLE IF NOT EXISTS signature_recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signature_document_id INT NOT NULL COMMENT 'ID del documento de firma',
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NULL,
    token VARCHAR(255) NOT NULL UNIQUE COMMENT 'Token único para acceso al documento',
    status ENUM('PENDIENTE', 'ENVIADO', 'ABIERTO', 'COMPLETADO') DEFAULT 'PENDIENTE',
    sent_at DATETIME NULL COMMENT 'Fecha en que se envió el email',
    opened_at DATETIME NULL COMMENT 'Fecha en que abrió el link',
    signed_at DATETIME NULL COMMENT 'Fecha en que firmó',
    signature_data TEXT NULL COMMENT 'JSON con los valores de los campos firmados',
    ip_address VARCHAR(45) NULL COMMENT 'IP desde donde firmó',
    user_agent TEXT NULL COMMENT 'User agent del navegador',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (signature_document_id) REFERENCES signature_documents(id) ON DELETE CASCADE,
    INDEX idx_signature_doc (signature_document_id),
    INDEX idx_token (token),
    INDEX idx_status (status),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- CONSULTAS ÚTILES
-- =============================================

-- Ver todos los destinatarios de un documento con su estado:
-- SELECT
--     sd.file_name,
--     sr.email,
--     sr.name,
--     sr.status,
--     sr.sent_at,
--     sr.signed_at
-- FROM signature_recipients sr
-- JOIN signature_documents sd ON sr.signature_document_id = sd.id
-- WHERE sd.id = 1;

-- Contar destinatarios por estado:
-- SELECT
--     sd.file_name,
--     COUNT(*) as total,
--     SUM(CASE WHEN sr.status = 'COMPLETADO' THEN 1 ELSE 0 END) as completados,
--     SUM(CASE WHEN sr.status = 'PENDIENTE' THEN 1 ELSE 0 END) as pendientes
-- FROM signature_documents sd
-- LEFT JOIN signature_recipients sr ON sd.id = sr.signature_document_id
-- GROUP BY sd.id;
