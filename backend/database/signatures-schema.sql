-- =============================================
-- TABLAS PARA SISTEMA DE FIRMAS
-- Basado en la arquitectura de DocuSeal
-- =============================================

-- Tabla de documentos (templates en DocuSeal)
CREATE TABLE IF NOT EXISTS signature_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    signed_file_path VARCHAR(255) NULL,
    num_pages INT NOT NULL DEFAULT 1,
    page_width DECIMAL(10, 2) NOT NULL,
    page_height DECIMAL(10, 2) NOT NULL,
    preview_images TEXT NULL COMMENT 'JSON con rutas a imágenes de preview',
    status ENUM('draft', 'pending', 'completed', 'cancelled') DEFAULT 'draft',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_status (user_id, status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de campos de firma (template_fields en DocuSeal)
CREATE TABLE IF NOT EXISTS signature_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    field_id VARCHAR(100) NOT NULL COMMENT 'UUID generado en el frontend',
    field_type ENUM('signature', 'text', 'date', 'checkbox', 'image') DEFAULT 'signature',
    page INT NOT NULL DEFAULT 1,
    x DECIMAL(10, 6) NOT NULL COMMENT 'Coordenada X (puede ser relativa 0-1 o absoluta)',
    y DECIMAL(10, 6) NOT NULL COMMENT 'Coordenada Y (puede ser relativa 0-1 o absoluta)',
    width DECIMAL(10, 6) NOT NULL COMMENT 'Ancho del campo',
    height DECIMAL(10, 6) NOT NULL COMMENT 'Alto del campo',
    required BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES signature_documents(id) ON DELETE CASCADE,
    UNIQUE KEY unique_field (document_id, field_id),
    INDEX idx_document_page (document_id, page)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de firmas (submitter_values en DocuSeal)
CREATE TABLE IF NOT EXISTS signatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    field_id VARCHAR(100) NOT NULL COMMENT 'ID del campo firmado',
    user_id INT NOT NULL COMMENT 'Usuario que firma',
    signature_path VARCHAR(255) NOT NULL COMMENT 'Ruta a la imagen de la firma',
    signature_type ENUM('drawn', 'typed', 'uploaded') DEFAULT 'drawn',
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    signed_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_field_id (field_id),
    INDEX idx_user_signed (user_id, signed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de plantillas de firma guardadas (para reutilizar firmas)
CREATE TABLE IF NOT EXISTS saved_signatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    signature_name VARCHAR(100) DEFAULT 'Mi firma',
    signature_path VARCHAR(255) NOT NULL,
    signature_type ENUM('drawn', 'typed') DEFAULT 'drawn',
    is_default BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user_default (user_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de historial de acciones (auditoría)
CREATE TABLE IF NOT EXISTS signature_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    user_id INT NOT NULL,
    action ENUM('created', 'viewed', 'signed', 'completed', 'downloaded', 'deleted') NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    metadata TEXT NULL COMMENT 'JSON con información adicional',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES signature_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_document_action (document_id, action),
    INDEX idx_user_action (user_id, action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- =============================================

-- Insertar un documento de ejemplo para el usuario admin (user_id = 1)
-- Descomentar si quieres datos de prueba:

/*
INSERT INTO signature_documents (user_id, file_name, file_path, num_pages, page_width, page_height, status)
VALUES (1, 'contrato-ejemplo.pdf', 'doc-1234567890.pdf', 1, 595.0, 842.0, 'draft');

INSERT INTO signature_fields (document_id, field_id, field_type, page, x, y, width, height, required)
VALUES 
(1, 'field-sig-1', 'signature', 1, 0.73, 0.156, 0.207, 0.044, TRUE),
(1, 'field-date-1', 'date', 1, 0.73, 0.205, 0.207, 0.044, TRUE);
*/

-- =============================================
-- CONSULTAS ÚTILES
-- =============================================

-- Ver todos los documentos con sus campos:
-- SELECT d.*, COUNT(sf.id) as num_fields 
-- FROM signature_documents d 
-- LEFT JOIN signature_fields sf ON d.id = sf.document_id 
-- GROUP BY d.id;

-- Ver documentos pendientes de firma:
-- SELECT * FROM signature_documents WHERE status = 'pending';

-- Ver firmas realizadas por un usuario:
-- SELECT s.*, sf.field_type, d.file_name 
-- FROM signatures s
-- JOIN signature_fields sf ON s.field_id = sf.field_id
-- JOIN signature_documents d ON sf.document_id = d.id
-- WHERE s.user_id = 1;
