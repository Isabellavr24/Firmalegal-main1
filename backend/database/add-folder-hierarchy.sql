-- =============================================
-- ACTUALIZACIÓN: Agregar jerarquía de carpetas
-- Sistema de carpetas multinivel con parent_id
-- =============================================

USE firmalegalonline;

-- Agregar columnas para jerarquía
ALTER TABLE folders
  ADD COLUMN parent_id INT DEFAULT NULL AFTER user_id,
  ADD COLUMN folder_level INT DEFAULT 0 AFTER parent_id,
  ADD COLUMN folder_path VARCHAR(500) DEFAULT NULL AFTER folder_level;

-- Agregar foreign key para parent_id
ALTER TABLE folders
  ADD CONSTRAINT fk_parent_folder
  FOREIGN KEY (parent_id) REFERENCES folders(folder_id) ON DELETE CASCADE;

-- Agregar índice para parent_id
CREATE INDEX idx_parent_id ON folders(parent_id);

-- Actualizar carpetas existentes para que sean nivel 0 (raíz)
UPDATE folders SET folder_level = 0, parent_id = NULL WHERE parent_id IS NULL;

-- =============================================
-- FUNCIÓN: Calcular nivel de carpeta
-- =============================================
DELIMITER //

DROP FUNCTION IF EXISTS calculate_folder_level//

CREATE FUNCTION calculate_folder_level(p_parent_id INT)
RETURNS INT
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_level INT;

  IF p_parent_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT folder_level INTO v_level
  FROM folders
  WHERE folder_id = p_parent_id;

  RETURN IFNULL(v_level, 0) + 1;
END//

DELIMITER ;

-- =============================================
-- FUNCIÓN: Obtener nombre del nivel de carpeta
-- =============================================
DELIMITER //

DROP FUNCTION IF EXISTS get_folder_level_name//

CREATE FUNCTION get_folder_level_name(p_level INT)
RETURNS VARCHAR(50)
DETERMINISTIC
BEGIN
  CASE p_level
    WHEN 0 THEN RETURN 'Carpeta';
    WHEN 1 THEN RETURN 'Subcarpeta';
    WHEN 2 THEN RETURN 'Subcarpeta 2';
    WHEN 3 THEN RETURN 'Subcarpeta 3';
    ELSE RETURN CONCAT('Subcarpeta ', p_level);
  END CASE;
END//

DELIMITER ;

-- =============================================
-- FUNCIÓN: Generar path de carpeta
-- =============================================
DELIMITER //

DROP FUNCTION IF EXISTS generate_folder_path//

CREATE FUNCTION generate_folder_path(p_folder_id INT, p_parent_id INT)
RETURNS VARCHAR(500)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_parent_path VARCHAR(500);

  IF p_parent_id IS NULL THEN
    RETURN CONCAT('/', p_folder_id);
  END IF;

  SELECT folder_path INTO v_parent_path
  FROM folders
  WHERE folder_id = p_parent_id;

  RETURN CONCAT(IFNULL(v_parent_path, ''), '/', p_folder_id);
END//

DELIMITER ;

-- =============================================
-- VISTA: Carpetas con información de jerarquía
-- =============================================
CREATE OR REPLACE VIEW v_folders_hierarchy AS
SELECT
  f.folder_id,
  f.folder_name,
  f.folder_slug,
  f.user_id,
  f.parent_id,
  f.folder_level,
  f.folder_path,
  f.tag,
  f.folder_description,
  f.folder_color,
  f.is_active,
  f.created_at,
  f.updated_at,
  pf.folder_name as parent_folder_name,
  COUNT(d.document_id) as item_count,
  (SELECT COUNT(*) FROM folders sf WHERE sf.parent_id = f.folder_id) as subfolder_count,
  u.first_name,
  u.last_name,
  CONCAT(u.first_name, ' ', u.last_name) as owner_name,
  get_folder_level_name(f.folder_level) as level_name
FROM folders f
LEFT JOIN folders pf ON f.parent_id = pf.folder_id
LEFT JOIN documents d ON f.folder_id = d.folder_id AND d.status = 'active'
LEFT JOIN users u ON f.user_id = u.user_id
WHERE f.is_active = TRUE
GROUP BY f.folder_id;

-- =============================================
-- COMENTARIOS
-- =============================================
-- Estructura de niveles:
-- - folder_level = 0: Carpeta (raíz, creada desde index.html)
-- - folder_level = 1: Subcarpeta (creada dentro de una carpeta)
-- - folder_level = 2: Subcarpeta 2 (creada dentro de una subcarpeta)
-- - folder_level = 3+: Subcarpeta 3, 4, etc.
--
-- parent_id: Referencia al folder_id de la carpeta padre (NULL = raíz)
-- folder_path: Ruta jerárquica completa (ej: /1/5/12 significa carpeta 12 está en 5 que está en 1)
-- =============================================

SELECT '✅ Esquema de jerarquía de carpetas aplicado exitosamente' as status;
