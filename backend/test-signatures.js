/**
 * SCRIPT DE PRUEBA DEL SISTEMA DE FIRMAS
 * Ejecutar en la consola del navegador (F12) o desde Node.js con fetch
 */

// ===== CONFIGURACIÓN =====
const API_URL = 'http://localhost:3000/api/signatures';
const TEST_USER_ID = 1; // ID del usuario de prueba

// ===== TEST 1: Subir documento =====
async function testUploadDocument() {
    console.log('\n📤 TEST 1: Subir documento PDF');
    
    // Seleccionar un archivo desde el input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf';
    
    return new Promise((resolve, reject) => {
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return reject('No se seleccionó archivo');
            
            const formData = new FormData();
            formData.append('document', file);
            formData.append('userId', TEST_USER_ID);
            
            try {
                const response = await fetch(`${API_URL}/upload-document`, {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                console.log('✅ Documento subido:', data);
                resolve(data.document);
            } catch (error) {
                console.error('❌ Error:', error);
                reject(error);
            }
        };
        
        fileInput.click();
    });
}

// ===== TEST 2: Guardar campos =====
async function testSaveFields(documentId) {
    console.log('\n💾 TEST 2: Guardar campos de firma');
    
    const fields = [
        {
            id: 'field-sig-1',
            type: 'signature',
            page: 1,
            x: 100,
            y: 200,
            w: 200,
            h: 60,
            required: true
        },
        {
            id: 'field-date-1',
            type: 'date',
            page: 1,
            x: 100,
            y: 280,
            w: 150,
            h: 30,
            required: true
        }
    ];
    
    try {
        const response = await fetch(`${API_URL}/save-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId,
                userId: TEST_USER_ID,
                fields
            })
        });
        
        const data = await response.json();
        console.log('✅ Campos guardados:', data);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== TEST 3: Subir firma (mock base64) =====
async function testUploadSignature(fieldId) {
    console.log('\n✍️ TEST 3: Subir firma');
    
    // Mock de firma (pequeño PNG transparente en base64)
    const mockSignatureBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    try {
        const response = await fetch(`${API_URL}/upload-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fieldId,
                userId: TEST_USER_ID,
                signatureData: mockSignatureBase64
            })
        });
        
        const data = await response.json();
        console.log('✅ Firma subida:', data);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== TEST 4: Generar PDF firmado =====
async function testGenerateSignedPdf(documentId) {
    console.log('\n📑 TEST 4: Generar PDF firmado');
    
    try {
        const response = await fetch(`${API_URL}/generate-signed-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId,
                userId: TEST_USER_ID
            })
        });
        
        const data = await response.json();
        console.log('✅ PDF firmado generado:', data);
        
        // Abrir PDF en nueva ventana
        if (data.success) {
            window.open(data.signedPdfUrl, '_blank');
        }
        
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== TEST 5: Obtener documento =====
async function testGetDocument(documentId) {
    console.log('\n📄 TEST 5: Obtener documento');
    
    try {
        const response = await fetch(
            `${API_URL}/document/${documentId}?userId=${TEST_USER_ID}`
        );
        
        const data = await response.json();
        console.log('✅ Documento obtenido:', data);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== TEST 6: Listar documentos =====
async function testListDocuments() {
    console.log('\n📋 TEST 6: Listar mis documentos');
    
    try {
        const response = await fetch(
            `${API_URL}/my-documents?userId=${TEST_USER_ID}`
        );
        
        const data = await response.json();
        console.log('✅ Documentos:', data);
        console.table(data.documents);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== TEST 7: Eliminar documento =====
async function testDeleteDocument(documentId) {
    console.log('\n🗑️ TEST 7: Eliminar documento');
    
    const confirmed = confirm(`¿Eliminar documento ${documentId}?`);
    if (!confirmed) return;
    
    try {
        const response = await fetch(
            `${API_URL}/document/${documentId}?userId=${TEST_USER_ID}`,
            { method: 'DELETE' }
        );
        
        const data = await response.json();
        console.log('✅ Documento eliminado:', data);
        return data;
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// ===== EJECUTAR TODOS LOS TESTS =====
async function runAllTests() {
    console.log('🚀 Iniciando tests del sistema de firmas...\n');
    
    try {
        // Test 1: Subir documento
        const document = await testUploadDocument();
        const documentId = document.id;
        
        // Test 2: Guardar campos
        await testSaveFields(documentId);
        
        // Test 3: Subir firma para el primer campo
        await testUploadSignature('field-sig-1');
        
        // Test 4: Generar PDF firmado
        await testGenerateSignedPdf(documentId);
        
        // Test 5: Obtener documento
        await testGetDocument(documentId);
        
        // Test 6: Listar todos los documentos
        await testListDocuments();
        
        console.log('\n✅ ¡Todos los tests completados exitosamente!');
        
        // Opcional: Test 7 (descomentar para eliminar)
        // await testDeleteDocument(documentId);
        
    } catch (error) {
        console.error('\n❌ Tests fallidos:', error);
    }
}

// ===== TESTS INDIVIDUALES =====

// Ejecutar en consola del navegador:
// testListDocuments()
// testGetDocument(1)
// testDeleteDocument(1)

// O ejecutar todos:
// runAllTests()

console.log(`
🧪 TESTS DISPONIBLES:

1. runAllTests()              - Ejecutar todos los tests
2. testUploadDocument()       - Subir un PDF
3. testSaveFields(docId)      - Guardar campos
4. testUploadSignature(fieldId) - Subir firma
5. testGenerateSignedPdf(docId) - Generar PDF firmado
6. testGetDocument(docId)     - Obtener documento
7. testListDocuments()        - Listar mis documentos
8. testDeleteDocument(docId)  - Eliminar documento

Ejemplo:
  await testListDocuments()
  await testGetDocument(1)
`);

// Auto-exportar funciones al objeto window (navegador)
if (typeof window !== 'undefined') {
    window.signatureTests = {
        runAllTests,
        testUploadDocument,
        testSaveFields,
        testUploadSignature,
        testGenerateSignedPdf,
        testGetDocument,
        testListDocuments,
        testDeleteDocument
    };
}
