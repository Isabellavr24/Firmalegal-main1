-- =============================================
-- VERIFICAR TOKEN Y DESTINATARIOS
-- =============================================
-- Este script te ayuda a verificar los tokens de destinatarios

-- 1. Ver todos los destinatarios con sus tokens
SELECT 
    dr.recipient_id,
    dr.document_id,
    dr.email,
    dr.name,
    dr.token,
    dr.status,
    dr.sent_at,
    d.title as document_title,
    d.file_name
FROM document_recipients dr
LEFT JOIN documents d ON dr.document_id = d.document_id
ORDER BY dr.sent_at DESC
LIMIT 10;

-- 2. Buscar un token específico (reemplaza 'TU_TOKEN_AQUI' con el token de la URL)
-- SELECT * FROM document_recipients WHERE token = 'TU_TOKEN_AQUI';

-- 3. Contar destinatarios totales
SELECT 'Total de destinatarios:' as mensaje, COUNT(*) as cantidad FROM document_recipients;

-- 4. Ver destinatarios con sus documentos y propietarios
SELECT 
    dr.recipient_id,
    dr.email,
    dr.status,
    d.title,
    d.file_path,
    u.first_name,
    u.last_name
FROM document_recipients dr
INNER JOIN documents d ON dr.document_id = d.document_id
INNER JOIN users u ON d.owner_id = u.user_id
ORDER BY dr.sent_at DESC
LIMIT 5;
