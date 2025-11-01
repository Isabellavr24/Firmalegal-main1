-- Ver valores guardados para el recipient 17

SELECT 
    fv.value_id,
    fv.field_id,
    fv.recipient_id,
    fv.value_type,
    fv.text_value,
    CASE 
        WHEN fv.signature_path IS NOT NULL THEN CONCAT(LEFT(fv.signature_path, 50), '...')
        ELSE NULL
    END as signature_preview,
    fv.date_value,
    fv.created_at,
    df.field_type,
    df.field_label
FROM field_values fv
INNER JOIN document_fields df ON fv.field_id = df.field_id
WHERE fv.recipient_id = 17
ORDER BY fv.field_id;

-- Si no hay resultados, ejecuta esto para ver los document_fields
SELECT 
    field_id,
    document_id,
    field_type,
    field_label
FROM document_fields 
WHERE document_id = 13
ORDER BY field_id;
