-- =============================================
-- TABLA: email_config
-- Configuración de email por usuario (SendGrid)
-- =============================================

CREATE TABLE IF NOT EXISTS email_config (
    config_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    -- Configuración de SendGrid
    provider VARCHAR(50) DEFAULT 'sendgrid' COMMENT 'Proveedor: sendgrid, smtp, etc.',
    sendgrid_api_key TEXT COMMENT 'API Key de SendGrid (encriptada)',

    -- Email remitente
    email_from VARCHAR(255) NOT NULL COMMENT 'Email remitente (ej: user@pkiservices.co)',
    email_from_name VARCHAR(255) DEFAULT 'FirmaLegal Online' COMMENT 'Nombre del remitente',

    -- Estado
    is_active BOOLEAN DEFAULT TRUE COMMENT 'Configuración activa',
    is_verified BOOLEAN DEFAULT FALSE COMMENT 'Email verificado en SendGrid',

    -- Auditoría
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE KEY unique_user_email (user_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,

    INDEX idx_user_id (user_id),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Configuración de email por usuario para envío de notificaciones';

-- =============================================
-- DATOS INICIALES (OPCIONAL)
-- =============================================
-- Puedes descomentar esto después de obtener tu API Key de SendGrid
/*
INSERT INTO email_config (user_id, provider, sendgrid_api_key, email_from, email_from_name, is_verified)
VALUES (
    1, -- user_id del Superadministrador
    'sendgrid',
    'SG.tu-api-key-aqui',
    'j27931178@gmail.com',
    'Juan Diego - FirmaLegal',
    FALSE
);
*/

-- =============================================
-- CONSULTAS ÚTILES
-- =============================================

-- Ver configuración de un usuario
-- SELECT * FROM email_config WHERE user_id = 1;

-- Verificar si un usuario tiene email configurado
-- SELECT
--     u.user_id,
--     u.email,
--     u.first_name,
--     ec.email_from,
--     ec.is_verified,
--     ec.provider
-- FROM users u
-- LEFT JOIN email_config ec ON u.user_id = ec.user_id
-- WHERE u.user_id = 1;
