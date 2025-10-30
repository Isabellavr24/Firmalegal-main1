-- =============================================
-- ESQUEMA DE BASE DE DATOS: CARPETAS Y DOCUMENTOS
-- Sistema multiusuario con sesiones individuales
-- =============================================

USE firmalegalonline;

-- =============================================
-- TABLA: folders (carpetas por usuario)
-- =============================================
CREATE TABLE IF NOT EXISTS folders (
  folder_id INT PRIMARY KEY AUTO_INCREMENT,
  folder_name VARCHAR(255) NOT NULL,
  folder_slug VARCHAR(255) NOT NULL,           -- URL-friendly (ej: "pki-services")
  user_id INT NOT NULL,                         -- Dueño de la carpeta
  tag VARCHAR(50) DEFAULT 'mine',               -- 'mine', 'shared', 'archived'
  folder_description TEXT,                      -- Descripción opcional
  folder_color VARCHAR(7) DEFAULT '#2b0e31',    -- Color visual (hex)
  is_active BOOLEAN DEFAULT TRUE,               -- Soft delete
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_tag (tag),
  INDEX idx_slug (folder_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- TABLA: documents (documentos/plantillas)
-- =============================================
CREATE TABLE IF NOT EXISTS documents (
  document_id INT PRIMARY KEY AUTO_INCREMENT,
  folder_id INT,                                -- Carpeta contenedora (NULL = sin carpeta)
  title VARCHAR(255) NOT NULL,                  -- Nombre del documento
  file_name VARCHAR(255) NOT NULL,              -- Nombre original del archivo
  file_path VARCHAR(500) NOT NULL,              -- Ruta física en servidor
  file_type VARCHAR(100),                       -- MIME type (application/pdf, etc)
  file_size BIGINT,                             -- Tamaño en bytes
  owner_id INT NOT NULL,                        -- Usuario que lo subió
  is_template BOOLEAN DEFAULT TRUE,             -- ¿Es plantilla reutilizable?
  status VARCHAR(50) DEFAULT 'active',          -- 'active', 'archived', 'deleted'
  google_drive_url TEXT,                        -- URL de Google Drive (si aplica)

  -- Metadatos adicionales
  tags JSON,                                    -- Tags libres: ["contrato", "legal"]
  metadata JSON,                                -- Info extra (páginas, dimensiones, etc)

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE SET NULL,
  FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_folder_id (folder_id),
  INDEX idx_owner_id (owner_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- TABLA: shared_access (permisos compartidos)
-- Permite compartir carpetas entre usuarios
-- =============================================
CREATE TABLE IF NOT EXISTS shared_access (
  share_id INT PRIMARY KEY AUTO_INCREMENT,
  folder_id INT NOT NULL,                       -- Carpeta compartida
  owner_id INT NOT NULL,                        -- Usuario que comparte
  shared_with_user_id INT NOT NULL,             -- Usuario receptor
  permission_level VARCHAR(50) DEFAULT 'view',  -- 'view', 'edit', 'admin'
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,                    -- Fecha de expiración (NULL = permanente)

  FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_shared_with (shared_with_user_id),
  INDEX idx_folder_id (folder_id),
  UNIQUE KEY unique_share (folder_id, shared_with_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- TABLA: activity_log (trazabilidad completa)
-- =============================================
CREATE TABLE IF NOT EXISTS activity_log (
  log_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,                                  -- Usuario que realizó la acción
  action VARCHAR(100) NOT NULL,                 -- 'create_folder', 'upload_document', etc
  entity_type VARCHAR(50),                      -- 'folder', 'document', 'user'
  entity_id INT,                                -- ID del elemento afectado
  details JSON,                                 -- Información adicional
  ip_address VARCHAR(45),                       -- IPv4 o IPv6
  user_agent TEXT,                              -- Navegador/dispositivo
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- VISTAS ÚTILES
-- =============================================

-- Vista: Carpetas con contador de documentos
CREATE OR REPLACE VIEW v_folders_with_counts AS
SELECT
  f.folder_id,
  f.folder_name,
  f.folder_slug,
  f.user_id,
  f.tag,
  f.folder_description,
  f.folder_color,
  f.is_active,
  f.created_at,
  f.updated_at,
  COUNT(d.document_id) as item_count,
  u.first_name,
  u.last_name,
  CONCAT(u.first_name, ' ', u.last_name) as owner_name
FROM folders f
LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
LEFT JOIN users u ON f.user_id = u.user_id
WHERE f.is_active = TRUE
GROUP BY f.folder_id;

-- Vista: Documentos con información del dueño y carpeta
CREATE OR REPLACE VIEW v_documents_full AS
SELECT
  d.document_id,
  d.folder_id,
  d.title,
  d.file_name,
  d.file_path,
  d.file_type,
  d.file_size,
  d.owner_id,
  d.is_template,
  d.status,
  d.google_drive_url,
  d.tags,
  d.created_at,
  d.updated_at,
  u.first_name,
  u.last_name,
  CONCAT(u.first_name, ' ', u.last_name) as owner_name,
  f.folder_name,
  f.folder_slug
FROM documents d
LEFT JOIN users u ON d.owner_id = u.user_id
LEFT JOIN folders f ON d.folder_id = f.folder_id;

-- =============================================
-- DATOS DE PRUEBA (opcional)
-- =============================================

-- Insertar carpetas de prueba para usuario PKI Services (user_id = 1)
INSERT INTO folders (folder_name, folder_slug, user_id, tag, folder_description) VALUES
('Contratos Legales', 'contratos-legales', 1, 'mine', 'Plantillas de contratos y acuerdos legales'),
('Documentos Corporativos', 'documentos-corporativos', 1, 'mine', 'Documentación oficial de la empresa');

-- Insertar carpetas para usuario ARRIETA HERRERA (user_id = 2)
INSERT INTO folders (folder_name, folder_slug, user_id, tag) VALUES
('Mis Proyectos', 'mis-proyectos', 2, 'mine'),
('Archivados', 'archivados', 2, 'archived');

-- Insertar documentos de ejemplo para PKI Services
INSERT INTO documents (folder_id, title, file_name, file_path, file_type, owner_id, file_size) VALUES
(1, 'Contrato de Arrendamiento', 'contrato-arrendamiento.pdf', '/uploads/documents/contrato-arrendamiento.pdf', 'application/pdf', 1, 102400),
(1, 'Acuerdo de Confidencialidad', 'nda-template.pdf', '/uploads/documents/nda-template.pdf', 'application/pdf', 1, 87320);

-- =============================================
-- FUNCIONES ÚTILES
-- =============================================

-- Función para generar slug único
DELIMITER //

CREATE FUNCTION generate_folder_slug(folder_name VARCHAR(255), user_id INT)
RETURNS VARCHAR(255)
DETERMINISTIC
BEGIN
  DECLARE base_slug VARCHAR(255);
  DECLARE final_slug VARCHAR(255);
  DECLARE counter INT DEFAULT 0;
  DECLARE slug_exists INT;

  -- Generar slug base
  SET base_slug = LOWER(folder_name);
  SET base_slug = REPLACE(base_slug, ' ', '-');
  SET base_slug = REPLACE(base_slug, 'á', 'a');
  SET base_slug = REPLACE(base_slug, 'é', 'e');
  SET base_slug = REPLACE(base_slug, 'í', 'i');
  SET base_slug = REPLACE(base_slug, 'ó', 'o');
  SET base_slug = REPLACE(base_slug, 'ú', 'u');
  SET base_slug = REPLACE(base_slug, 'ñ', 'n');

  -- Verificar si existe
  SET final_slug = base_slug;

  check_loop: LOOP
    SELECT COUNT(*) INTO slug_exists
    FROM folders
    WHERE folder_slug = final_slug AND folders.user_id = generate_folder_slug.user_id;

    IF slug_exists = 0 THEN
      LEAVE check_loop;
    END IF;

    SET counter = counter + 1;
    SET final_slug = CONCAT(base_slug, '-', counter);
  END LOOP;

  RETURN final_slug;
END//

DELIMITER ;

-- =============================================
-- ÍNDICES ADICIONALES PARA PERFORMANCE
-- =============================================

-- Índice compuesto para búsquedas comunes
CREATE INDEX idx_user_tag_active ON folders(user_id, tag, is_active);
CREATE INDEX idx_folder_status ON documents(folder_id, status);
CREATE INDEX idx_owner_template ON documents(owner_id, is_template);

-- Índice full-text para búsqueda de títulos
-- ALTER TABLE documents ADD FULLTEXT INDEX ft_title (title);
-- ALTER TABLE folders ADD FULLTEXT INDEX ft_folder_name (folder_name);

-- =============================================
-- COMENTARIOS FINALES
-- =============================================
-- Este esquema permite:
-- 1. Carpetas privadas por usuario (user_id)
-- 2. Compartir carpetas con otros usuarios (shared_access)
-- 3. Documentos asociados a carpetas
-- 4. Tags flexibles (mine, shared, archived)
-- 5. Soft delete (is_active, status)
-- 6. Trazabilidad completa (activity_log)
-- 7. Soporte para Google Drive
-- 8. Metadatos extensibles (JSON)
