-- Resetear el recipient 17 para poder volver a completar el documento

-- Ver estado actual
SELECT 
    recipient_id,
    document_id,
    email,
    status,
    completed_at
FROM document_recipients 
WHERE recipient_id = 17;

-- Eliminar valores completados anteriormente
DELETE FROM field_values WHERE recipient_id = 17;

-- Resetear estado del recipient a 'sent'
UPDATE document_recipients 
SET status = 'sent',
    completed_at = NULL,
    opened_at = NULL
WHERE recipient_id = 17;

-- Verificar cambios
SELECT 
    recipient_id,
    document_id,
    email,
    status,
    completed_at
FROM document_recipients 
WHERE recipient_id = 17;

SELECT 'Recipient reseteado correctamente. Ahora puedes volver a completar el documento.' as mensaje;
