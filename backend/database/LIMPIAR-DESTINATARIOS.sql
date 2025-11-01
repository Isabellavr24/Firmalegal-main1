-- =============================================
-- LIMPIAR DESTINATARIOS Y VALORES DE CAMPOS
-- =============================================
-- Este script elimina todos los destinatarios y sus valores completados
-- Útil para comenzar con pruebas limpias

-- 1. Eliminar valores completados por destinatarios
DELETE FROM field_values;

-- 2. Eliminar todos los destinatarios
DELETE FROM document_recipients;

-- 3. Verificar que se eliminaron correctamente
SELECT 'Destinatarios restantes:' as mensaje, COUNT(*) as cantidad FROM document_recipients;
SELECT 'Valores de campos restantes:' as mensaje, COUNT(*) as cantidad FROM field_values;

-- =============================================
-- RESULTADO ESPERADO
-- =============================================
-- Ambas tablas deberían mostrar 0 registros

SELECT '✅ Base de datos limpiada correctamente' as estado;
