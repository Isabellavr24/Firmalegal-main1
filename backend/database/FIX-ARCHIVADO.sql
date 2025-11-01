-- =============================================
-- SCRIPT DE CORRECCIÓN: Sistema de Archivado
-- Fecha: 31 de octubre de 2025
-- =============================================

-- Problema: Documentos archivados tenían status='deleted' en lugar de 'archived'
-- Solución: Cambiar todos los documentos 'deleted' a 'archived'

-- =============================================
-- 1. VERIFICAR ESTADO ACTUAL
-- =============================================
SELECT 
    'ANTES DE LA CORRECCIÓN' as etapa,
    status,
    COUNT(*) as total,
    GROUP_CONCAT(CONCAT('ID:', document_id, ' - ', title) SEPARATOR '; ') as documentos
FROM documents
GROUP BY status;

-- =============================================
-- 2. CORREGIR DOCUMENTOS CON STATUS INCORRECTO
-- =============================================

-- Cambiar todos los documentos con status='deleted' a 'archived'
UPDATE documents 
SET 
    status = 'archived',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'deleted';

-- =============================================
-- 3. VERIFICAR CORRECCIÓN
-- =============================================
SELECT 
    'DESPUÉS DE LA CORRECCIÓN' as etapa,
    status,
    COUNT(*) as total,
    GROUP_CONCAT(CONCAT('ID:', document_id, ' - ', title) SEPARATOR '; ') as documentos
FROM documents
GROUP BY status;

-- =============================================
-- 4. MOSTRAR DOCUMENTOS ARCHIVADOS
-- =============================================
SELECT 
    document_id,
    title,
    file_name,
    status,
    folder_id,
    owner_id,
    created_at,
    updated_at
FROM documents
WHERE status = 'archived'
ORDER BY updated_at DESC;

-- =============================================
-- 5. VALIDAR QUE NO QUEDEN DOCUMENTOS 'DELETED'
-- =============================================
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ CORRECCIÓN EXITOSA: No hay documentos con status=deleted'
        ELSE CONCAT('⚠️ ATENCIÓN: Aún quedan ', COUNT(*), ' documentos con status=deleted')
    END as resultado
FROM documents
WHERE status = 'deleted';

-- =============================================
-- CONSULTAS ÚTILES ADICIONALES
-- =============================================

-- Ver todos los documentos de un usuario específico
-- Cambia '1' por el user_id que desees consultar
/*
SELECT 
    d.document_id,
    d.title,
    d.status,
    d.folder_id,
    f.folder_name,
    d.created_at,
    d.updated_at
FROM documents d
LEFT JOIN folders f ON d.folder_id = f.folder_id
WHERE d.owner_id = 1
ORDER BY d.status, d.updated_at DESC;
*/

-- Contar documentos por estado para todos los usuarios
/*
SELECT 
    u.user_id,
    CONCAT(u.first_name, ' ', u.last_name) as usuario,
    d.status,
    COUNT(*) as total_documentos
FROM documents d
INNER JOIN users u ON d.owner_id = u.user_id
GROUP BY u.user_id, usuario, d.status
ORDER BY u.user_id, d.status;
*/

-- =============================================
-- NOTAS IMPORTANTES
-- =============================================
/*
ESTADOS DE DOCUMENTOS:
- 'active'   : Documentos activos (visibles en carpetas y "Mis Plantillas")
- 'archived' : Documentos archivados (visibles solo en "Archivadas")
- 'deleted'  : Ya NO SE USA (eliminado permanentemente de la BD)

FLUJO CORRECTO:
1. Documento creado → status = 'active'
2. Usuario archiva → status = 'archived'
3. Usuario restaura desde archivados → status = 'active'
4. Usuario elimina permanentemente → DELETE FROM documents (ya no existe)

IMPORTANTE:
- El botón "Archivar" ahora cambia el status a 'archived' (no 'deleted')
- El endpoint DELETE /api/documents/:id elimina definitivamente el registro
- El endpoint PUT /api/documents/:id puede cambiar el status entre 'active' y 'archived'
*/
