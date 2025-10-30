-- =============================================
-- LIMPIEZA COMPLETA - EMPEZAR DESDE CERO
-- Elimina TODOS los datos pero mantiene las tablas
-- =============================================

USE firmalegalonline;

-- Deshabilitar verificación de claves foráneas temporalmente
SET FOREIGN_KEY_CHECKS = 0;

-- 1. VACIAR TABLA activity_log
TRUNCATE TABLE activity_log;

-- 2. VACIAR TABLA documents (documentos dependen de folders)
TRUNCATE TABLE documents;

-- 3. VACIAR TABLA shared_access
TRUNCATE TABLE shared_access;

-- 4. VACIAR TABLA folders
TRUNCATE TABLE folders;

-- Rehabilitar verificación de claves foráneas
SET FOREIGN_KEY_CHECKS = 1;

-- 5. VERIFICAR QUE TODO ESTÉ VACÍO
SELECT 'activity_log' as tabla, COUNT(*) as registros FROM activity_log
UNION ALL
SELECT 'documents', COUNT(*) FROM documents
UNION ALL
SELECT 'shared_access', COUNT(*) FROM shared_access
UNION ALL
SELECT 'folders', COUNT(*) FROM folders;

-- 6. RESETEAR AUTO_INCREMENT (opcional, para empezar desde ID=1)
ALTER TABLE activity_log AUTO_INCREMENT = 1;
ALTER TABLE documents AUTO_INCREMENT = 1;
ALTER TABLE shared_access AUTO_INCREMENT = 1;
ALTER TABLE folders AUTO_INCREMENT = 1;

SELECT '✅ LIMPIEZA COMPLETADA - Todas las tablas vacías' as resultado;
SELECT '🎯 Ahora puedes crear carpetas desde la aplicación' as instruccion;
