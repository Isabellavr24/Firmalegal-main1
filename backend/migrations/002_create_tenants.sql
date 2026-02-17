-- ==========================================
-- MIGRACIÓN: Crear tabla de inquilinos (Tenants)
-- ==========================================

-- Tabla de inquilinos
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_name VARCHAR(100) NOT NULL,
    tenant_slug VARCHAR(100) NOT NULL UNIQUE,
    tenant_email VARCHAR(255),
    tenant_color VARCHAR(7) DEFAULT '#7c3aed',
    logo_url VARCHAR(500),
    lang VARCHAR(10) DEFAULT 'es',
    timezone VARCHAR(60) DEFAULT 'America/Bogota',
    inherit_storage BOOLEAN DEFAULT TRUE,
    inherit_brand BOOLEAN DEFAULT TRUE,
    owner_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de miembros del inquilino (usuarios que pertenecen al inquilino)
CREATE TABLE IF NOT EXISTS tenant_members (
    member_id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'member') DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_tenant_user (tenant_id, user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar tenant_id a folders para asociar carpetas a un inquilino
ALTER TABLE folders ADD COLUMN IF NOT EXISTS tenant_id INT DEFAULT NULL AFTER user_id;

-- Agregar tenant_id a documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id INT DEFAULT NULL AFTER owner_id;

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_folders_tenant ON folders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
