-- =============================================
-- TABLAS PARA SISTEMA DE CAMPOS DE DOCUMENTOS
-- Sprint 3: Preparación y envío de documentos
-- =============================================

-- Tabla para almacenar campos colocados en documentos
CREATE TABLE IF NOT EXISTS document_fields (
    field_id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    field_type ENUM('signature', 'text', 'date') NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    x_position DECIMAL(10,2) NOT NULL,
    y_position DECIMAL(10,2) NOT NULL,
    width DECIMAL(10,2) NOT NULL,
    height DECIMAL(10,2) NOT NULL,
    required BOOLEAN DEFAULT TRUE,
    field_label VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    
    INDEX idx_document (document_id),
    INDEX idx_field_type (field_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para destinatarios de documentos
CREATE TABLE IF NOT EXISTS document_recipients (
    recipient_id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    token VARCHAR(255) UNIQUE NOT NULL,
    status ENUM('sent', 'opened', 'completed', 'rejected') DEFAULT 'sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    opened_at DATETIME,
    completed_at DATETIME,
    rejected_at DATETIME,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    
    INDEX idx_token (token),
    INDEX idx_document (document_id),
    INDEX idx_status (status),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para valores completados por destinatarios
CREATE TABLE IF NOT EXISTS field_values (
    value_id INT AUTO_INCREMENT PRIMARY KEY,
    field_id INT NOT NULL,
    recipient_id INT NOT NULL,
    value_type ENUM('text', 'signature_image', 'date') NOT NULL,
    text_value TEXT,
    signature_path VARCHAR(500),
    date_value DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (field_id) REFERENCES document_fields(field_id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES document_recipients(recipient_id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_field_recipient (field_id, recipient_id),
    INDEX idx_recipient (recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- COMENTARIOS Y NOTAS
-- =============================================

/*
ESTRUCTURA:

1. document_fields: Campos colocados en el PDF durante la preparación
   - Posiciones absolutas (x, y, width, height)
   - Tipo: signature, text, date
   - Página del documento

2. document_recipients: Destinatarios que recibirán el documento
   - Token único para acceso público
   - Estados: sent → opened → completed/rejected
   - Tracking de IPs y timestamps

3. field_values: Valores completados por cada destinatario
   - Relación field + recipient
   - Soporta texto, imágenes de firma, fechas

VERSIÓN BÁSICA (Sprint 3.1):
- Todos los campos son para todos los destinatarios
- No hay firma secuencial (todos firman al mismo tiempo)
- Tokens no expiran (implementar en v3.2)
*/
