/**
 * EJEMPLO DE INTEGRACIÓN CON BACKEND
 * Este archivo muestra cómo conectar sign.js con el sistema de firmas backend
 * Copiar las funciones necesarias a sign.js original
 */

// ===== CONFIGURACIÓN =====
const API_BASE_URL = '/api/signatures';
let currentDocumentId = null;
let currentUserId = null; // Obtener del localStorage o sesión

// Función helper para obtener userId actual
function getCurrentUserId() {
    // Obtener del localStorage (guardado al hacer login)
    const userData = localStorage.getItem('userData');
    if (userData) {
        const user = JSON.parse(userData);
        return user.user_id;
    }
    // O desde una variable global si existe
    return window.currentUser?.user_id || null;
}

// ===== MODIFICACIONES PARA sign.js =====

/**
 * 1. MODIFICAR: Cargar PDF
 * Reemplazar el evento 'change' existente
 */
document.getElementById('pdfFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        currentUserId = getCurrentUserId();
        if (!currentUserId) {
            alert('Debes iniciar sesión primero');
            window.location.href = '/login.html';
            return;
        }

        // Mostrar loading
        showLoading('Subiendo documento...');

        // 1. Subir PDF al backend
        const formData = new FormData();
        formData.append('document', file);
        formData.append('userId', currentUserId);

        const response = await fetch(`${API_BASE_URL}/upload-document`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || 'Error al subir documento');
        }

        // Guardar ID del documento
        currentDocumentId = data.document.id;
        console.log('✅ Documento subido con ID:', currentDocumentId);

        // 2. Renderizar PDF localmente (código original)
        pdfBytes = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        page = await pdfDoc.getPage(1);
        viewport = page.getViewport({ scale });

        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        pageWrap.style.width = viewport.width + 'px';
        pageWrap.style.height = viewport.height + 'px';

        const renderCtx = { canvasContext: ctx, viewport };
        await page.render(renderCtx).promise;

        overlay.innerHTML = '';
        fields.length = 0;

        hideLoading();
        showSuccess('Documento cargado correctamente');

    } catch (error) {
        console.error('❌ Error:', error);
        hideLoading();
        showError(error.message);
    }
});

/**
 * 2. MODIFICAR: Guardar documento con firmas
 * Reemplazar el evento 'click' del botón saveBtn
 */
document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!pdfBytes) {
        alert('Sube un PDF primero');
        return;
    }

    if (!currentDocumentId) {
        alert('Error: No hay documento cargado');
        return;
    }

    const sigs = fields.filter(f => f.type === 'signature' && f.signed && f.dataUrl);
    if (sigs.length === 0) {
        alert('No hay firmas colocadas');
        return;
    }

    try {
        showLoading('Guardando documento firmado...');

        // 1. Guardar campos en el backend
        console.log('💾 Guardando campos...');
        const saveFieldsResponse = await fetch(`${API_BASE_URL}/save-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId: currentDocumentId,
                userId: currentUserId,
                fields: fields.map(f => ({
                    id: f.id,
                    type: f.type,
                    page: f.page,
                    x: f.x,
                    y: f.y,
                    w: f.w,
                    h: f.h,
                    required: true
                }))
            })
        });

        const fieldsData = await saveFieldsResponse.json();
        if (!fieldsData.success) {
            throw new Error(fieldsData.message || 'Error al guardar campos');
        }

        // 2. Subir cada firma al backend
        console.log('✍️ Subiendo firmas...');
        for (const field of sigs) {
            const uploadSigResponse = await fetch(`${API_BASE_URL}/upload-signature`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fieldId: field.id,
                    userId: currentUserId,
                    signatureData: field.dataUrl
                })
            });

            const sigData = await uploadSigResponse.json();
            if (!sigData.success) {
                throw new Error(`Error al subir firma: ${sigData.message}`);
            }
        }

        // 3. Generar PDF firmado en el backend
        console.log('📑 Generando PDF firmado...');
        const generateResponse = await fetch(`${API_BASE_URL}/generate-signed-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                documentId: currentDocumentId,
                userId: currentUserId
            })
        });

        const pdfData = await generateResponse.json();
        if (!pdfData.success) {
            throw new Error(pdfData.message || 'Error al generar PDF');
        }

        hideLoading();
        showSuccess('PDF firmado generado correctamente');

        // 4. Descargar PDF firmado
        console.log('📥 Descargando PDF...');
        const link = document.createElement('a');
        link.href = pdfData.signedPdfUrl;
        link.download = pdfData.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (error) {
        console.error('❌ Error al guardar:', error);
        hideLoading();
        showError(error.message);
    }
});

/**
 * 3. NUEVO: Botón "Enviar" (opcional)
 * Para enviar documento a otros usuarios para firma
 */
document.getElementById('sendBtn').addEventListener('click', async () => {
    if (!currentDocumentId) {
        alert('Primero carga y configura un documento');
        return;
    }

    const email = prompt('Ingresa el email del destinatario:');
    if (!email) return;

    try {
        showLoading('Enviando documento...');

        // TODO: Implementar endpoint de envío
        // const response = await fetch(`${API_BASE_URL}/send-document`, {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         documentId: currentDocumentId,
        //         recipientEmail: email,
        //         userId: currentUserId
        //     })
        // });

        hideLoading();
        showSuccess(`Documento enviado a ${email}`);

    } catch (error) {
        console.error('❌ Error:', error);
        hideLoading();
        showError(error.message);
    }
});

// ===== FUNCIONES HELPER DE UI =====

function showLoading(message = 'Procesando...') {
    // Crear overlay de loading si no existe
    let loadingEl = document.getElementById('loadingOverlay');
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'loadingOverlay';
        loadingEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            flex-direction: column;
            color: white;
            font-size: 18px;
        `;
        loadingEl.innerHTML = `
            <div style="margin-bottom: 20px;">⏳</div>
            <div id="loadingMessage">${message}</div>
        `;
        document.body.appendChild(loadingEl);
    } else {
        document.getElementById('loadingMessage').textContent = message;
        loadingEl.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingEl = document.getElementById('loadingOverlay');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    // Crear notificación temporal
    const notif = document.createElement('div');
    notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    notif.textContent = message;

    // Agregar animación CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notif);

    // Auto-remover después de 4 segundos
    setTimeout(() => {
        notif.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => notif.remove(), 300);
    }, 4000);
}

// ===== CARGAR DOCUMENTO EXISTENTE (opcional) =====

/**
 * Función para cargar un documento existente desde el backend
 * Útil para editar o continuar un documento guardado
 */
async function loadExistingDocument(documentId) {
    try {
        showLoading('Cargando documento...');

        const response = await fetch(
            `${API_BASE_URL}/document/${documentId}?userId=${getCurrentUserId()}`
        );
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message);
        }

        const doc = data.document;
        currentDocumentId = doc.id;

        // Cargar PDF desde el servidor
        const pdfResponse = await fetch(`/uploads/documents/${doc.file_path}`);
        const pdfArrayBuffer = await pdfResponse.arrayBuffer();
        
        pdfBytes = pdfArrayBuffer;
        pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        page = await pdfDoc.getPage(1);
        viewport = page.getViewport({ scale });

        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        pageWrap.style.width = viewport.width + 'px';
        pageWrap.style.height = viewport.height + 'px';

        const renderCtx = { canvasContext: ctx, viewport };
        await page.render(renderCtx).promise;

        // Cargar campos existentes
        fields.length = 0;
        overlay.innerHTML = '';

        for (const field of doc.fields) {
            const el = document.createElement('div');
            el.className = 'field signature';
            el.style.left = field.x + 'px';
            el.style.top = field.y + 'px';
            el.style.width = field.w + 'px';
            el.style.height = field.h + 'px';
            el.dataset.id = field.id;
            el.innerHTML = '<span class="label">Firma</span>';
            el.addEventListener('click', openSignatureModal);
            overlay.appendChild(el);

            fields.push({
                id: field.id,
                type: field.type,
                page: field.page,
                x: field.x,
                y: field.y,
                w: field.w,
                h: field.h,
                dataUrl: null,
                signed: false
            });
        }

        hideLoading();
        showSuccess('Documento cargado correctamente');

    } catch (error) {
        console.error('❌ Error:', error);
        hideLoading();
        showError(error.message);
    }
}

// ===== EJEMPLO DE USO AL CARGAR LA PÁGINA =====

// Si hay un documentId en la URL, cargarlo
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const documentId = urlParams.get('documentId');
    
    if (documentId) {
        loadExistingDocument(documentId);
    }
});

// ===== EXPORTAR FUNCIONES (si usas módulos) =====
// export { getCurrentUserId, showLoading, hideLoading, loadExistingDocument };
