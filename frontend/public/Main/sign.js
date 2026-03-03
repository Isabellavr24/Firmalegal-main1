// ===== Utilidad Touch/Mouse =====
function getEventPoint(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

// ===== Estado =====
let pdfBytes = null;   // ArrayBuffer del PDF original
let pdfDoc   = null;   // PDF.js document
let currentFile = null; // Archivo actual
let currentDocTitle = null; // Título del documento actual

// ✅ Variables para manejo de múltiples páginas
let allPages = []; // Array de objetos página: {pageNum, canvas, overlay, viewport}

let pagesContainer; // Contenedor de todas las páginas
let fields = []; // {id,type:'signature'|'text'|'date'|'seal',page,x,y,w,h,dataUrl?,value?,signed?}
let placingFieldType = null; // 'signature', 'text', 'date', 'seal', 'final_signature'

// Estado del modo y documento actual
let currentMode = null; // 'prepare' o 'sign'
let currentDocId = null; // ID del documento actual
let _pdfModified = false; // true cuando se agregaron páginas via SUBIR PDF

// ✅ Detectar tipo de documento (normal o pagaré)
const urlParams = new URLSearchParams(window.location.search);
const documentType = urlParams.get('documentType') || urlParams.get('type') || 'normal';
const isPagareMode = documentType === 'pagare';
console.log(`📋 sign.js - Modo: ${isPagareMode ? 'PAGARÉ' : 'NORMAL'}`);

// Esperar a que el DOM y las librerías estén listas
window.addEventListener('DOMContentLoaded', function() {
  console.log('🔄 DOM cargado, verificando librerías...');
  
  // Función para intentar inicializar
  function tryInit(attempt = 1) {
    console.log(`🔍 Intento ${attempt} de cargar PDF.js...`);
    console.log('🔍 typeof pdfjsLib:', typeof pdfjsLib);
    console.log('🔍 window.pdfjsLib:', window.pdfjsLib);
    
    // Verificar que pdfjsLib esté disponible
    if (typeof pdfjsLib === 'undefined' && typeof window.pdfjsLib === 'undefined') {
      if (attempt < 10) {
        console.warn(`⏳ PDF.js aún no está listo, reintentando en 300ms...`);
        setTimeout(() => tryInit(attempt + 1), 300);
        return;
      } else {
        console.error('❌ PDF.js no está cargado después de 10 intentos');
        toast.error('Error: PDF.js no se cargó. Por favor:\n• Verifica tu conexión a internet\n• Recarga la página\n• Revisa la consola para más detalles', 6000);
        return;
      }
    }

    console.log('✅ Inicializando aplicación de firmas...');

    // ✅ Inicializar elementos del DOM (nuevo sistema multipágina)
    pagesContainer = document.getElementById('pagesContainer');
    
    if (!pagesContainer) {
      console.error('❌ No se encontró el contenedor de páginas');
      return;
    }

    // Inicializar event listeners
    initEventListeners();
  }
  
  // Iniciar después de un delay para asegurar que los scripts CDN carguen
  setTimeout(tryInit, 500);
});

// ===== Inicializar Event Listeners =====
function initEventListeners() {
  console.log('🔧 Inicializando event listeners...');
  
  // Cargar PDF
  const pdfFileInput = document.getElementById('pdfFile');
  if (pdfFileInput) {
    pdfFileInput.addEventListener('change', handleFileUpload);
    console.log('✅ Event listener para cargar PDF agregado');
  }
  
  // Inicializar botones de herramientas (solo una vez)
  initToolButtons();
  
  // Modal de firma
  const sigClearBtn = document.getElementById('sigClear');
  const sigCancelBtn = document.getElementById('sigCancel');
  const sigOkBtn = document.getElementById('sigOk');
  const sigCloseBtn = document.getElementById('sigClose');
  
  if (sigClearBtn) sigClearBtn.onclick = ()=>{ sigCtx.clearRect(0,0,sigPad.width,sigPad.height); };
  if (sigCancelBtn) sigCancelBtn.onclick = hideModal;
  if (sigCloseBtn) sigCloseBtn.onclick = hideModal;
  if (sigOkBtn) sigOkBtn.onclick = confirmSignature;
  
  // Modal de texto
  const textCancelBtn = document.getElementById('textCancel');
  const textOkBtn = document.getElementById('textOk');
  const textCloseBtn = document.getElementById('textClose');
  if (textCancelBtn) textCancelBtn.onclick = hideModal;
  if (textCloseBtn) textCloseBtn.onclick = hideModal;
  if (textOkBtn) textOkBtn.onclick = confirmText;
  
  // Botones de estilo de texto
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const alignButtons = document.querySelectorAll('[data-align]');
  
  if (boldBtn) {
    boldBtn.onclick = function() {
      this.classList.toggle('active');
      updateTextPreview();
    };
  }
  
  if (italicBtn) {
    italicBtn.onclick = function() {
      this.classList.toggle('active');
      updateTextPreview();
    };
  }
  
  if (underlineBtn) {
    underlineBtn.onclick = function() {
      this.classList.toggle('active');
      updateTextPreview();
    };
  }
  
  alignButtons.forEach(btn => {
    btn.onclick = function() {
      alignButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      updateTextPreview();
    };
  });
  
  // Vista previa en tiempo real
  const textInput = document.getElementById('textInput');
  const fontFamilySelect = document.getElementById('fontFamily');
  const fontSizeSelect = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');
  
  if (textInput) textInput.addEventListener('input', updateTextPreview);
  if (fontFamilySelect) fontFamilySelect.addEventListener('change', updateTextPreview);
  if (fontSizeSelect) fontSizeSelect.addEventListener('change', updateTextPreview);
  if (fontColorInput) {
    fontColorInput.addEventListener('input', function() {
      const preview = document.getElementById('colorPreview');
      if (preview) preview.style.background = this.value;
      updateTextPreview();
    });
  }
  
  // Modal de fecha
  const dateCancelBtn = document.getElementById('dateCancel');
  const dateOkBtn = document.getElementById('dateOk');
  const dateCloseBtn = document.getElementById('dateClose');
  if (dateCancelBtn) dateCancelBtn.onclick = hideModal;
  if (dateCloseBtn) dateCloseBtn.onclick = hideModal;
  if (dateOkBtn) dateOkBtn.onclick = confirmDate;
  
  // Guardar PDF
  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', savePDF);
    console.log('✅ Event listener para guardar PDF agregado');
  }
  
  // Eventos del signature pad
  initSignaturePad();
  
  // Tecla ESC para cerrar modal
  window.addEventListener('keydown', (e)=>{
    if(e.key==='Escape') hideModal();
  });
  
  console.log('✅ Todos los event listeners inicializados');

  // Verificar si hay un documento pendiente desde index.html
  checkPendingDocument();
}

// ===== Verificar y cargar documento pendiente =====
function checkPendingDocument() {
  // Primero verificar si hay parámetros en la URL
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get('mode');
  const docId = urlParams.get('id') || urlParams.get('doc_id'); // ✅ Soportar ambos formatos
  const recipientId = urlParams.get('recipient'); // ✅ Detectar parámetro recipient

  if (docId) {
    console.log(`🔍 Document ID detectado: ${docId}`);
    currentDocId = docId;

    // ✅ Si hay recipientId, es modo de visualización desde tracking
    if (recipientId) {
      console.log(`👁️ Modo VISUALIZACIÓN: Ver documento enviado a destinatario ${recipientId}`);
      currentMode = 'view';
      loadDocumentFromServer(docId);
      return;
    }

    // Si hay mode especificado
    if (mode) {
      console.log(`🔍 Modo detectado: ${mode}`);
      currentMode = mode;

      if (mode === 'prepare') {
        console.log('📝 Modo PREPARE: Cargar documento para colocar campos');
        loadDocumentFromServer(docId);
        return; // No verificar sessionStorage si cargamos desde URL
      } else if (mode === 'sign') {
        console.log('✍️ Modo SIGN: Cargar documento para firmar (pendiente implementar)');
        // TODO: Implementar en Sprint 4
        return;
      }
    }

    // Si solo hay docId sin mode ni recipient, asumir modo prepare
    console.log('📝 Solo ID detectado, cargando en modo PREPARE');
    currentMode = 'prepare';
    loadDocumentFromServer(docId);
    return;
  }

  // Si no hay parámetros en la URL, verificar sessionStorage (flujo antiguo)
  console.log('🔍 Verificando documento pendiente en sessionStorage...');
  const pendingDoc = sessionStorage.getItem('pendingDocument');

  if (pendingDoc) {
    console.log('📄 Documento pendiente detectado, cargando automáticamente...');

    try {
      const docData = JSON.parse(pendingDoc);
      console.log('📋 Datos del documento:', {
        name: docData.name,
        fileName: docData.fileName,
        fileType: docData.fileType,
        dataLength: docData.fileData?.length
      });

      // Actualizar info del documento en UI
      const docNameEl = document.querySelector('.doc-name');
      const docMetaEl = document.querySelector('.doc-meta');

      // ✅ Guardar título para uso posterior
      currentDocTitle = docData.name;

      if (docNameEl) docNameEl.textContent = currentDocTitle;
      if (docMetaEl) docMetaEl.textContent = docData.fileName;

      // Actualizar título de la barra
      const barTitle = document.querySelector('.bar strong');
      if (barTitle) barTitle.textContent = currentDocTitle;

      // Convertir base64 a Blob y cargar el PDF
      fetch(docData.fileData)
        .then(res => res.blob())
        .then(blob => {
          console.log('✅ PDF convertido a Blob, cargando...');

          // Crear un File object desde el Blob
          const file = new File([blob], docData.fileName, { type: docData.fileType });

          // ✅ Guardar referencia al archivo
          currentFile = file;

          // ✅ Mostrar loader ANTES de cargar
          showLoadingIndicator();
          
          // Cargar el PDF usando la función existente
          loadPDF(file);

          // Limpiar sessionStorage después de cargar
          sessionStorage.removeItem('pendingDocument');
          console.log('✅ PDF cargado exitosamente desde index.html');
        })
        .catch(error => {
          console.error('❌ Error al cargar PDF desde sessionStorage:', error);
          toast.error('Error al cargar el documento. Por favor, súbelo manualmente.');
          sessionStorage.removeItem('pendingDocument');
          hideLoadingIndicator();
        });

    } catch (error) {
      console.error('❌ Error al parsear documento pendiente:', error);
      sessionStorage.removeItem('pendingDocument');
      hideLoadingIndicator();
    }
  } else {
    console.log('ℹ️ No hay documento pendiente en sessionStorage');
    // ✅ Ocultar loader si no hay documento que cargar
    hideLoadingIndicator();
  }
}

// ===== Cargar documento desde el servidor =====
async function loadDocumentFromServer(docId) {
  try {
    console.log(`📥 Cargando documento ${docId} desde el servidor...`);

    // Obtener información del usuario
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      toast.warning('Debes iniciar sesión para continuar');
      window.location.href = '/login.html';
      return;
    }

    const user = JSON.parse(userStr);

    // Obtener información del documento
    const docInfoResponse = await fetch(`/api/documents/${docId}?user_id=${user.user_id}`);
    if (!docInfoResponse.ok) {
      throw new Error('No se pudo obtener información del documento');
    }

    const response = await docInfoResponse.json();
    console.log('📋 Información del documento:', response);
    
    // ✅ CORREGIDO: Acceder a response.data en lugar de response directamente
    const docInfo = response.data;
    console.log('📝 Título del documento:', docInfo.title);
    console.log('📄 Nombre del archivo:', docInfo.file_name);

    // ✅ Guardar título y archivo para uso posterior
    currentDocTitle = docInfo.title || 'Sin título';
    console.log('✅ currentDocTitle guardado:', currentDocTitle);
    
    // Actualizar UI con info del documento
    const docNameEl = document.querySelector('.doc-name');
    const docMetaEl = document.querySelector('.doc-meta');

    console.log('🔍 Elementos encontrados:', { docNameEl, docMetaEl });

    if (docNameEl) {
      docNameEl.textContent = currentDocTitle;
      console.log('✅ doc-name actualizado a:', currentDocTitle);
    }
    if (docMetaEl) {
      docMetaEl.textContent = docInfo.file_name || 'documento.pdf';
      console.log('✅ doc-meta actualizado a:', docInfo.file_name);
    }

    // Actualizar título de la barra
    const barTitle = document.querySelector('.bar strong');
    console.log('🔍 Elemento barra encontrado:', barTitle);
    if (barTitle) {
      barTitle.textContent = currentDocTitle;
      console.log('✅ Título de barra actualizado a:', currentDocTitle);
    }

    // Descargar el archivo PDF
    const fileResponse = await fetch(`/api/documents/${docId}/file?user_id=${user.user_id}`);
    if (!fileResponse.ok) {
      throw new Error('No se pudo descargar el archivo PDF');
    }

    const blob = await fileResponse.blob();
    console.log('✅ PDF descargado, tamaño:', blob.size, 'bytes');

    // Crear un File object desde el Blob
    const file = new File([blob], docInfo.file_name || 'documento.pdf', { type: 'application/pdf' });
    
    // ✅ Guardar referencia al archivo
    currentFile = file;
    console.log('✅ currentFile guardado:', currentFile.name);

    // ✅ Mostrar loader ANTES de cargar
    showLoadingIndicator();
    
    // Cargar el PDF usando la función existente
    await loadPDF(file);
    
    // ✅ Actualizar info del documento (incluyendo tamaño y páginas)
    console.log('🔄 Llamando a updateDocInfo() después de cargar PDF');
    console.log('   Valores antes de updateDocInfo:');
    console.log('   - currentDocTitle:', currentDocTitle);
    console.log('   - currentFile:', currentFile?.name);
    updateDocInfo();
    
    // ✅ Cargar campos existentes desde el servidor
    await loadExistingFields(docId);
    
    console.log('✅ PDF cargado exitosamente en modo PREPARE');

  } catch (error) {
    console.error('❌ Error al cargar documento desde servidor:', error);
    toast.error(`Error al cargar el documento: ${error.message}`);
    hideLoadingIndicator();
  }
}

// ===== Cargar campos existentes desde el servidor =====
async function loadExistingFields(docId) {
  try {
    console.log(`📥 Cargando campos existentes para documento ${docId}...`);

    // Obtener información del usuario
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      console.warn('⚠️ No hay usuario autenticado, no se cargarán campos');
      return;
    }

    const user = JSON.parse(userStr);

    // Obtener campos del documento
    const response = await fetch(`/api/documents/${docId}/fields?user_id=${user.user_id}`);
    if (!response.ok) {
      console.warn('⚠️ No se pudieron obtener los campos del documento');
      return;
    }

    const data = await response.json();
    
    if (!data.success || !data.data || !data.data.fields) {
      console.log('ℹ️ El documento no tiene campos guardados');
      return;
    }

    const existingFields = data.data.fields;
    console.log(`✅ ${existingFields.length} campo(s) encontrado(s):`, existingFields);

    // Limpiar campos actuales (vaciar el array sin reasignar)
    fields.length = 0;
    console.log('🧹 Array de campos limpiado');

    // Convertir campos del servidor al formato interno y renderizar
    // ✅ IMPORTANTE: Los campos vienen en coordenadas PDF reales, necesitamos convertirlas a viewport escalado
    const VIEWPORT_SCALE = 1.4; // Debe coincidir con baseScale en loadPDF()
    
    existingFields.forEach((field, index) => {
      const fieldData = {
        id: `field-${Date.now()}-${index}`,
        field_id: field.field_id, // ✅ Guardar field_id de la base de datos
        type: field.type,
        page: field.page || 1,
        // Convertir de coordenadas PDF (reales) a coordenadas viewport (escaladas)
        x: parseFloat(field.x) * VIEWPORT_SCALE,
        y: parseFloat(field.y) * VIEWPORT_SCALE,
        w: parseFloat(field.width) * VIEWPORT_SCALE,
        h: parseFloat(field.height) * VIEWPORT_SCALE,
        label: field.label || null,
        required: field.required !== false,
        signed: false,
        dataUrl: null,
        roleId: field.partId || null, // 🔥 NUEVO
        roleName: field.roleName || null, // 🔥 NUEVO
        roleColor: field.roleColor || null // 🔥 NUEVO
      };

      fields.push(fieldData);
      
      const partInfo = field.roleName ? ` - Parte: ${field.roleName}` : '';
      console.log(`   ✓ Campo ${index + 1}: ${field.type} en página ${field.page} (field_id: ${field.field_id})${partInfo}`);
      
      // Renderizar el campo visualmente en el PDF
      renderFieldOnPage(fieldData);
    });

    console.log(`✅ ${fields.length} campo(s) renderizado(s) en el PDF`);

  } catch (error) {
    console.error('❌ Error al cargar campos existentes:', error);
    // No lanzar error, solo loguearlo - el documento puede no tener campos aún
  }
}

// ===== Renderizar un campo en el PDF =====
function renderFieldOnPage(fieldData) {
  try {
    // Buscar la página donde debe renderizarse
    const pageData = allPages.find(p => p.pageNum === fieldData.page);
    
    if (!pageData) {
      console.warn(`⚠️ No se encontró la página ${fieldData.page} para renderizar el campo`);
      return;
    }

    // Crear elemento visual del campo
    const el = document.createElement('div');
    el.className = `field ${fieldData.type}`;
    el.style.left = fieldData.x + 'px';
    el.style.top = fieldData.y + 'px';
    el.style.width = fieldData.w + 'px';
    el.style.height = fieldData.h + 'px';
    el.dataset.id = fieldData.id;
    el.dataset.type = fieldData.type;
    el.dataset.page = fieldData.page;
    
    // ✅ Agregar field_id si existe (para cargar valores completados)
    if (fieldData.field_id) {
      el.dataset.fieldId = fieldData.field_id;
    }

    const labels = {signature: 'Firma', text: 'Texto', date: 'Fecha', seal: 'Sello PKI', final_signature: 'Firma Definitiva'};

    // Determinar label con parte asignada
    let fieldLabel = labels[fieldData.type] || fieldData.type;
    let labelColor = '#374151'; // Color por defecto

    const balanzaSvg = '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="50" y1="8" x2="50" y2="85"/><rect x="28" y="85" width="44" height="8" rx="2" fill="currentColor" stroke="none"/><line x1="12" y1="20" x2="88" y2="20"/><circle cx="50" cy="20" r="4" fill="currentColor" stroke="none"/><line x1="20" y1="20" x2="16" y2="48"/><line x1="80" y1="20" x2="84" y2="48"/><path d="M8 48 Q16 60 24 48" fill="currentColor" stroke="none"/><path d="M76 48 Q84 60 92 48" fill="currentColor" stroke="none"/></svg>';

    if (fieldData.type === 'seal') {
      labelColor = '#10b981';
      fieldLabel = '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Sello PKI';
    } else if (fieldData.type === 'final_signature') {
      labelColor = '#9333ea';
      fieldLabel = balanzaSvg.replace('currentColor', '#9333ea').replace(/currentColor/g, '#9333ea') + ' Firma Definitiva';
    } else if (fieldData.roleName && fieldData.roleColor) {
      fieldLabel = `${labels[fieldData.type]}: ${fieldData.roleName}`;
      labelColor = fieldData.roleColor;
    }

    // Renderizado especial para sellos
    if (fieldData.type === 'seal') {
      el.innerHTML = `
        <div class="seal-preview">
          <span class="seal-icon"><svg style="width:18px;height:18px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <span class="seal-label">${labels[fieldData.type]}</span>
          <span class="seal-dimensions">${Math.round(fieldData.w)}×${Math.round(fieldData.h)}</span>
        </div>
        <button class="delete-btn" title="Eliminar">×</button>
      `;
      el.style.borderColor = '#10b981';
      el.style.borderWidth = '3px';
      el.style.borderStyle = 'solid';
      el.style.background = 'rgba(16, 185, 129, 0.05)';
    } else if (fieldData.type === 'final_signature') {
      el.innerHTML = `
        <span class="label" style="color:#9333ea;font-weight:600;">${fieldLabel}</span>
        <button class="delete-btn" title="Eliminar">×</button>
      `;
      el.style.borderColor = '#9333ea';
      el.style.borderWidth = '3px';
      el.style.borderStyle = 'solid';
      el.style.background = 'rgba(147, 51, 234, 0.05)';
      el.dataset.noModal = 'true';
    } else {
      el.innerHTML = `
        <span class="label" style="color: ${labelColor}; font-weight: ${fieldData.roleName ? '600' : '500'};">${fieldLabel}</span>
        <button class="delete-btn" title="Eliminar">×</button>
      `;
      if (fieldData.roleColor) {
        el.style.borderColor = fieldData.roleColor;
        el.style.borderWidth = '3px';
        el.style.borderStyle = 'solid';
      }
    }

    // Agregar event listeners
    // ✅ CAMBIO: No usar 'click', solo mousedown para manejar tanto drag como click
    el.addEventListener('mousedown', startDragField);
    el.addEventListener('touchstart', startDragField, {passive: false});

    // Los sellos NO abren modal (no son interactivos)
    // El modal se abrirá desde stopDragField si no hubo movimiento
    if (fieldData.type === 'seal') {
      el.dataset.noModal = 'true'; // Marcar que los sellos no abren modal
    }

    // Evento del botón eliminar
    const deleteBtn = el.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteField(fieldData.id, fieldData.page);
    });

    // Agregar al overlay de la página
    pageData.overlay.appendChild(el);

    // 🔥 NUEVO: Agregar manejadores de redimensionamiento
    addResizeHandles(el);

    console.log(`   ✓ Campo renderizado: ${fieldData.type} en (${fieldData.x}, ${fieldData.y})`);

  } catch (error) {
    console.error('❌ Error al renderizar campo:', fieldData, error);
  }
}

// ===== Cargar Archivo (PDF o Word) =====
async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if(!file) return;

  // Reset input so same file can be selected again
  document.getElementById('pdfFile').value = '';

  try {
    // Verificar tipo de archivo
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    // 🔒 VALIDACIÓN ESTRICTA: Solo permitir PDFs
    const isValidPDF = fileType === 'application/pdf' && fileName.endsWith('.pdf');

    if (!isValidPDF) {
      toast.error('❌ Solo se permiten archivos PDF. Por favor selecciona un archivo .pdf válido.');
      return;
    }

    showLoadingIndicator();

    // Si ya hay un PDF cargado, AGREGAR al final en lugar de reemplazar
    if (pdfBytes) {
      try {
        const { PDFDocument } = PDFLib;
        const newFileBytes = await file.arrayBuffer();

        const basePdf = await PDFDocument.load(pdfBytes);
        const appendPdf = await PDFDocument.load(newFileBytes);
        const appendPageCount = appendPdf.getPageCount();

        const appendedPages = await basePdf.copyPages(appendPdf, appendPdf.getPageIndices());
        appendedPages.forEach(p => basePdf.addPage(p));

        const mergedBytes = await basePdf.save();
        const mergedBuffer = mergedBytes.buffer.slice(mergedBytes.byteOffset, mergedBytes.byteOffset + mergedBytes.byteLength);

        // Preservar campos existentes (están en páginas que no cambiaron)
        const savedFields = [...fields];

        await loadPDF(mergedBuffer);

        // Restaurar campos de las páginas anteriores
        savedFields.forEach(f => fields.push(f));
        savedFields.forEach(f => renderFieldOnPage(f));

        _pdfModified = true;
        updateDocInfo();
        toast.success(`✅ PDF agregado al final (${appendPageCount} pág.)`);
      } catch (mergeErr) {
        console.error('❌ Error al combinar PDFs:', mergeErr);
        toast.error('Error al agregar el PDF: ' + mergeErr.message);
        hideLoadingIndicator();
      }
      return;
    }

    // No hay PDF previo → cargar normalmente
    currentFile = file;
    await loadPDF(file);
    updateDocInfo();
  } catch (error) {
    console.error('❌ Error al cargar archivo:', error);
    toast.error('Error al cargar el archivo: ' + error.message);
    hideLoadingIndicator();
  }
}

// ===== Actualizar información del documento =====
function updateDocInfo() {
  console.log('🔄 updateDocInfo() llamado');
  console.log('   currentFile:', currentFile?.name);
  console.log('   currentDocTitle:', currentDocTitle);
  
  const docInfo = document.getElementById('docInfo');
  if (!docInfo || !currentFile) {
    console.log('⚠️ updateDocInfo cancelado: docInfo o currentFile no existe');
    return;
  }
  
  const fileName = currentFile.name;
  const fileSize = (currentFile.size / 1024).toFixed(1); // KB
  const fileSizeStr = fileSize > 1024 ? (fileSize / 1024).toFixed(1) + ' MB' : fileSize + ' KB';
  
  // ✅ Usar el título guardado si existe, sino usar el nombre del archivo
  const displayTitle = currentDocTitle || fileName.replace(/\.[^.]+$/, '');
  console.log('📝 displayTitle calculado:', displayTitle);
  
  docInfo.innerHTML = `
    <div class="doc-name" title="${displayTitle}">${displayTitle}</div>
    <div class="doc-meta">${fileSizeStr} • ${pdfDoc?.numPages || 1} página${pdfDoc?.numPages > 1 ? 's' : ''}</div>
  `;
  
  console.log('✅ docInfo.innerHTML actualizado');
  
  // También actualizar el título de la barra
  const barTitle = document.querySelector('.bar strong');
  if (barTitle) {
    barTitle.textContent = displayTitle;
    console.log('✅ Título de barra actualizado a:', displayTitle);
  }
}

// ===== Cargar PDF (TODAS LAS PÁGINAS) =====
async function loadPDF(file) {
  // NOTA: showLoadingIndicator() debe llamarse ANTES de esta función
  // Acepta un File object o directamente un ArrayBuffer

  try {
    console.log('📄 Cargando PDF con todas las páginas...');

    const rawBytes = (file instanceof ArrayBuffer) ? file : await file.arrayBuffer();
    // Guardar copia antes de pasar a pdfjs (getDocument puede transferir/detach el buffer)
    pdfBytes = rawBytes.slice(0);
    pdfDoc   = await pdfjsLib.getDocument({data: rawBytes}).promise;
    
    const numPages = pdfDoc.numPages;
    console.log(`📚 PDF tiene ${numPages} página(s)`);
    
    // Limpiar páginas anteriores
    pagesContainer.innerHTML = '';
    allPages = [];
    fields.length = 0;
    
    // ✅ Configuración de renderizado
    const baseScale = 1.4;
    const dpr = window.devicePixelRatio || 1;
    
    // ✅ Renderizar TODAS las páginas
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      console.log(`📄 Renderizando página ${pageNum}/${numPages}...`);
      
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: baseScale });
      
      // Crear contenedor para esta página
      const pageWrap = document.createElement('div');
      pageWrap.className = 'canvas-wrap';
      pageWrap.setAttribute('data-page', pageNum);
      
      // Crear canvas para esta página
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.setAttribute('data-page', pageNum);
      
      // Configurar tamaño LÓGICO (visual)
      canvas.style.width = viewport.width + 'px';
      canvas.style.height = viewport.height + 'px';
      
      // Configurar tamaño REAL (píxeles físicos para nitidez)
      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      
      // Crear overlay para esta página
      const overlay = document.createElement('div');
      overlay.className = 'page-overlay';
      overlay.setAttribute('data-page', pageNum);
      overlay.style.width = viewport.width + 'px';
      overlay.style.height = viewport.height + 'px';
      
      // Crear indicador de número de página
      const pageLabel = document.createElement('div');
      pageLabel.className = 'page-number';
      pageLabel.textContent = `Página ${pageNum} de ${numPages}`;
      
      // Ensamblar la estructura
      pageWrap.appendChild(canvas);
      pageWrap.appendChild(overlay);
      pageWrap.appendChild(pageLabel);
      pagesContainer.appendChild(pageWrap);
      
      // Renderizar la página en el canvas
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;
      
      // Guardar referencia a esta página
      allPages.push({
        pageNum: pageNum,
        canvas: canvas,
        overlay: overlay,
        viewport: viewport,
        pageWrap: pageWrap
      });
      
      console.log(`✅ Página ${pageNum} renderizada`);
    }
    
    // Configurar eventos de overlay para todas las páginas
    initPageOverlays();
    
    // Generar miniatura de la primera página
    await generateThumbnail();
    
    console.log('✅ PDF cargado completamente:', numPages, 'páginas | DPR:', dpr);
    
  } catch (error) {
    console.error('❌ Error al cargar PDF:', error);
    toast.error('Error al cargar el PDF. Por favor, intenta con otro archivo.');
  } finally {
    hideLoadingIndicator();
  }
}

// ===== Generar miniatura del PDF =====
// ===== Generar miniatura del PDF =====
async function generateThumbnail() {
  const thumbContainer = document.querySelector('.thumb');
  if (!thumbContainer || !pdfDoc || allPages.length === 0) return;
  
  try {
    // Usar la primera página para la miniatura
    const firstPage = await pdfDoc.getPage(1);
    
    // Crear un canvas temporal para la miniatura
    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d');
    
    // Calcular escala para la miniatura
    const thumbScale = 2.0;
    const thumbViewport = firstPage.getViewport({ scale: thumbScale });
    
    // Usar devicePixelRatio para máxima calidad
    const dpr = window.devicePixelRatio || 2;
    
    // Configurar canvas con máxima resolución
    thumbCanvas.width = thumbViewport.width * dpr;
    thumbCanvas.height = thumbViewport.height * dpr;
    
    // Escalar el contexto
    thumbCtx.scale(dpr, dpr);
    
    // Renderizar con máxima calidad
    await firstPage.render({
      canvasContext: thumbCtx,
      viewport: thumbViewport,
      intent: 'display'
    }).promise;
    
    // Aplicar filtros CSS para mejorar nitidez
    thumbCanvas.style.width = '100%';
    thumbCanvas.style.height = 'auto';
    thumbCanvas.style.borderRadius = '8px';
    thumbCanvas.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)';
    thumbCanvas.style.imageRendering = 'high-quality';
    thumbCanvas.style.imageRendering = '-webkit-optimize-contrast';
    
    // Limpiar el contenedor y agregar el canvas
    thumbContainer.innerHTML = '';
    thumbContainer.appendChild(thumbCanvas);
    
    console.log('✅ Miniatura generada de la primera página');
  } catch (error) {
    console.error('❌ Error al generar miniatura:', error);
  }
}

// ===== Colocar campos =====
// Inicializar eventos de overlay dentro de la función init
// ===== Variables para dibujar campos tipo DocuSeal =====
let isDrawingField = false;
let drawStartX = 0;
let drawStartY = 0;
let drawRect = null;
let drawingOnPage = null;

// ===== Función helper para activar/desactivar herramientas con comportamiento toggle =====
function toggleTool(toolId, fieldType) {
  const toolElement = document.getElementById(toolId);
  
  // Si el botón ya está activo, desactivarlo
  if (toolElement && toolElement.classList.contains('active')) {
    console.log(`🔄 Desactivando herramienta: ${toolId}`);
    toolElement.classList.remove('active');
    placingFieldType = null;
    console.log(`🔍 placingFieldType después de desactivar:`, placingFieldType);
    // Restaurar cursor normal en todos los overlays
    allPages.forEach(p => p.overlay.style.cursor = 'default');
    return false; // Retorna false indicando que se desactivó
  }
  
  // Si no estaba activo, desactivar todas las demás y activar esta
  console.log(`✅ Activando herramienta: ${toolId}`);
  document.querySelectorAll('.tool').forEach(t => t.classList.remove('active'));
  if (toolElement) {
    toolElement.classList.add('active');
  }
  placingFieldType = fieldType;
  console.log(`🔍 placingFieldType después de activar:`, placingFieldType);
  // Cambiar cursor en todos los overlays
  allPages.forEach(p => p.overlay.style.cursor = 'crosshair');
  return true; // Retorna true indicando que se activó
}

// ===== Inicializar botones de herramientas (SE LLAMA SOLO UNA VEZ) =====
function initToolButtons() {
  const toolSign = document.getElementById('toolSign');
  const toolText = document.getElementById('toolText');
  const toolDate = document.getElementById('toolDate');
  const toolSeal = document.getElementById('toolSeal');

  if (toolSign) {
    toolSign.addEventListener('click', ()=>{
      console.log('🖊️ Click en herramienta de firma');
      if(allPages.length === 0){ toast.warning('Primero sube un PDF'); return; }
      
      const activated = toggleTool('toolSign', 'signature');
      if (activated) {
        console.log('✅ Modo dibujo de firma activado - Arrastra para dibujar');
      } else {
        console.log('⏸️ Modo dibujo de firma desactivado');
      }
    });
    console.log('✅ Event listener para botón de firma agregado');
  }

  if (toolText) {
    toolText.addEventListener('click', ()=>{
      console.log('📝 Click en herramienta de texto');
      if(allPages.length === 0){ toast.warning('Primero sube un PDF'); return; }
      
      const activated = toggleTool('toolText', 'text');
      if (activated) {
        console.log('✅ Modo dibujo de texto activado - Arrastra para dibujar');
      } else {
        console.log('⏸️ Modo dibujo de texto desactivado');
      }
    });
    console.log('✅ Event listener para botón de texto agregado');
  }

  if (toolDate) {
    toolDate.addEventListener('click', ()=>{
      console.log('📅 Click en herramienta de fecha');
      if(allPages.length === 0){ toast.warning('Primero sube un PDF'); return; }
      
      const activated = toggleTool('toolDate', 'date');
      if (activated) {
        console.log('✅ Modo dibujo de fecha activado - Arrastra para dibujar');
      } else {
        console.log('⏸️ Modo dibujo de fecha desactivado');
      }
    });
    console.log('✅ Event listener para botón de fecha agregado');
  }

  if (toolSeal) {
    toolSeal.addEventListener('click', ()=>{
      console.log('🔐 Click en herramienta de sello');
      if(allPages.length === 0){ toast.warning('Primero sube un PDF'); return; }

      const activated = toggleTool('toolSeal', 'seal');
      if (activated) {
        console.log('✅ Modo dibujo de sello activado - Arrastra para dibujar');
      } else {
        console.log('⏸️ Modo dibujo de sello desactivado');
      }
    });
    console.log('✅ Event listener para botón de sello agregado');
  }

  // ✅ Herramienta de Firma Definitiva (solo pagarés)
  const toolFinalSignature = document.getElementById('toolFinalSignature');

  if (isPagareMode && toolFinalSignature) {
    // Mostrar la herramienta solo en modo pagaré
    toolFinalSignature.style.display = 'flex';
    console.log('✅ Herramienta Firma Definitiva visible (modo pagaré)');

    toolFinalSignature.addEventListener('click', ()=>{
      console.log('⚖️ Click en herramienta de Firma Definitiva');
      if(allPages.length === 0){ toast.warning('Primero sube un PDF'); return; }

      const activated = toggleTool('toolFinalSignature', 'final_signature');
      if (activated) {
        console.log('✅ Modo dibujo de Firma Definitiva activado - Arrastra para dibujar');
        toast.info('Firma Definitiva', 'Esta firma sellará todos los documentos cuando firmen todos los viewers');
      } else {
        console.log('⏸️ Modo dibujo de Firma Definitiva desactivado');
      }
    });
    console.log('✅ Event listener para botón de Firma Definitiva agregado');
  }
}

// ===== Inicializar event listeners de overlays (SE LLAMA CADA VEZ QUE SE CARGA UN PDF) =====
function initPageOverlays() {

  console.log(`🎨 Configurando event listeners de dibujo para ${allPages.length} página(s)...`);
  
  // ✅ Agregar event listeners para DIBUJAR campos en todos los overlays
  allPages.forEach(pageData => {
    console.log(`📍 Configurando eventos para página ${pageData.pageNum}, overlay:`, pageData.overlay);
    
    // Handler de inicio de dibujo (mouse + touch)
    function handleDrawStart(e) {
      // Solo si hay una herramienta seleccionada
      if(!placingFieldType) return;
      // Ignorar si es click en un campo existente
      if(e.target.closest('.field')) return;

      e.preventDefault();
      const pt = getEventPoint(e);

      console.log(`🎨 Iniciando dibujo de ${placingFieldType} en página ${pageData.pageNum}`);

      isDrawingField = true;
      drawingOnPage = pageData;
      pageData.overlay.classList.add('drawing-mode');

      const rect = pageData.overlay.getBoundingClientRect();
      drawStartX = pt.clientX - rect.left;
      drawStartY = pt.clientY - rect.top;

      // Crear rectángulo visual temporal
      drawRect = document.createElement('div');
      drawRect.className = `field ${placingFieldType} drawing-field`;
      drawRect.style.left = drawStartX + 'px';
      drawRect.style.top = drawStartY + 'px';
      drawRect.style.width = '0px';
      drawRect.style.height = '0px';
      drawRect.style.border = '2px dashed #2a0d31';
      drawRect.style.background = 'rgba(42, 13, 49, 0.1)';
      drawRect.style.pointerEvents = 'none';

      pageData.overlay.appendChild(drawRect);
    }

    // Handler de movimiento de dibujo (mouse + touch)
    function handleDrawMove(e) {
      if(!isDrawingField || !drawRect || drawingOnPage !== pageData) return;
      e.preventDefault();

      const pt = getEventPoint(e);
      const rect = pageData.overlay.getBoundingClientRect();
      const currentX = pt.clientX - rect.left;
      const currentY = pt.clientY - rect.top;

      const width = Math.abs(currentX - drawStartX);
      const height = Math.abs(currentY - drawStartY);
      const left = Math.min(currentX, drawStartX);
      const top = Math.min(currentY, drawStartY);

      drawRect.style.left = left + 'px';
      drawRect.style.top = top + 'px';
      drawRect.style.width = width + 'px';
      drawRect.style.height = height + 'px';
    }

    // Handler de fin de dibujo (mouse + touch)
    async function handleDrawEnd(e) {
      if(!isDrawingField || !drawRect || drawingOnPage !== pageData) return;

      const pt = getEventPoint(e);
      const rect = pageData.overlay.getBoundingClientRect();
      const currentX = pt.clientX - rect.left;
      const currentY = pt.clientY - rect.top;
      
      const width = Math.abs(currentX - drawStartX);
      const height = Math.abs(currentY - drawStartY);
      const left = Math.min(currentX, drawStartX);
      const top = Math.min(currentY, drawStartY);
      
      // Remover rectángulo temporal
      drawRect.remove();
      
      // Validar tamaño mínimo
      const MIN_WIDTH = 50;
      const MIN_HEIGHT = 30;
      
      if(width < MIN_WIDTH || height < MIN_HEIGHT) {
        console.log(`⚠️ Campo muy pequeño (${width}x${height}), mínimo: ${MIN_WIDTH}x${MIN_HEIGHT}`);
        isDrawingField = false;
        drawRect = null;
        drawingOnPage = null;
        return;
      }
      
      console.log(`✅ Campo dibujado: ${width}x${height}px en página ${pageData.pageNum}`);
      
      // Crear campo real
      const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      const el = document.createElement('div');
      el.className = `field ${placingFieldType}`;
      el.style.left = left + 'px';
      el.style.top = top + 'px';
      el.style.width = width + 'px';
      el.style.height = height + 'px';
      el.dataset.id = id;
      el.dataset.type = placingFieldType;

      // === MAPEO DE LABELS DESDE PDF ===
      // ✅ CRÍTICO: Hacer el mapeo de forma SÍNCRONA antes de crear el campo
      let mappedLabel = null;
      if (placingFieldType === 'text') {
        // Ejecutar extracción de label de forma asíncrona pero esperar el resultado
        try {
          const page = await pdfDoc.getPage(pageData.pageNum);
          const viewport = pageData.viewport;
          const textContent = await page.getTextContent();
          // Convertir los items a una lista de objetos con bbox en viewport y filtrar solo vacíos reales
          const items = textContent.items
            .map((item, idx) => {
              const x_pdf = item.transform[4];
              const y_pdf = item.transform[5];
              const ptToPx = viewport.transform[0];
              const x = x_pdf * ptToPx;
              const y = viewport.height - (y_pdf * ptToPx) - (item.height * ptToPx);
              const w = item.width * ptToPx;
              const h = item.height * ptToPx;
              return {
                str: item.str,
                x, y, w, h,
                idx
              };
            })
            .filter(t => {
              // Solo filtrar vacíos reales
              return t.str && t.str.trim().length > 0;
            });
          // Coordenadas del campo (viewport)
          const fieldLeft = left;
          const fieldTop = top;
          // Permitir mapeo si el campo y el texto se solapan horizontalmente y verticalmente, con mayor tolerancia
          const VERTICAL_TOLERANCE = 15; // px de margen extra arriba y abajo
          const HORIZONTAL_TOLERANCE = 20; // px de margen extra a la izquierda y derecha
          // Buscar todos los candidatos válidos ordenados por distancia
          let candidates = [];
          for (const t of items) {
            const horizontalOverlap = (t.x + t.w + HORIZONTAL_TOLERANCE > fieldLeft) && (t.x - HORIZONTAL_TOLERANCE < fieldLeft + width);
            const verticalOverlap = (t.y + t.h + VERTICAL_TOLERANCE > fieldTop) && (t.y - VERTICAL_TOLERANCE < fieldTop + height);
            if (horizontalOverlap && verticalOverlap) {
              const dist = Math.abs(fieldLeft - (t.x + t.w));
              candidates.push({ ...t, dist });
            }
          }
          // Ordenar candidatos por distancia (más pegado primero)
          candidates.sort((a, b) => a.dist - b.dist);
          // Buscar el primer candidato que NO sea solo guiones bajos
          let best = null;
          for (const cand of candidates) {
            if (!/^_+$/.test(cand.str.trim())) {
              best = cand;
              break;
            }
          }
          // Si todos son guiones bajos, usar el primero
          if (!best && candidates.length > 0) {
            best = candidates[0];
          }
          if (best) {
            // ✅ LIMPIAR guiones bajos y espacios extras del label
            mappedLabel = best.str
              .replace(/_+/g, '')  // Eliminar todos los guiones bajos
              .replace(/\s+/g, ' ') // Normalizar espacios múltiples a uno solo
              .trim();              // Eliminar espacios al inicio y final

            console.log('[MAPEO PDF] Campo texto colocado:', {
              id,
              page: pageData.pageNum,
              coords: { left: fieldLeft, top: fieldTop, width, height },
              label_original: best.str,
              label_limpio: mappedLabel,
              label_coords: { x: best.x, y: best.y, w: best.w, h: best.h },
              distancia: best.dist,
              solape_vertical: true,
              solape_horizontal: true,
              tolerancia_vertical: VERTICAL_TOLERANCE,
              tolerancia_horizontal: HORIZONTAL_TOLERANCE
            });
          } else {
            console.warn('[MAPEO PDF] No se encontró texto alineado (con solape vertical y horizontal, y tolerancia) al campo:', {
              id,
              page: pageData.pageNum,
              coords: { left: fieldLeft, top: fieldTop, width, height },
              tolerancia_vertical: VERTICAL_TOLERANCE,
              tolerancia_horizontal: HORIZONTAL_TOLERANCE
            });
          }
        } catch (err) {
          console.error('[MAPEO PDF] Error extrayendo texto PDF:', err);
        }
      }

      el.dataset.page = pageData.pageNum;
      
      // 🔥 NUEVO: Obtener información de la parte/rol actual
      let roleId = null;
      let roleName = null;
      let roleColor = null;
      
      // ⚠️ IMPORTANTE: El sello y la firma definitiva NUNCA se asignan a una parte
      // El sello es omnipresente y se genera al final por PKI
      // La firma definitiva es del dueño del documento (cierra el ciclo)
      if (placingFieldType !== 'seal' && placingFieldType !== 'final_signature') {
        // Intentar obtener del sistema de roles (puede ser rolesSystem o rolesFieldSelector)
        if (window.rolesSystem && typeof window.rolesSystem.getCurrentRole === 'function') {
          const currentRole = window.rolesSystem.getCurrentRole();
          if (currentRole) {
            roleId = currentRole.id || currentRole.roleId;
            roleName = currentRole.name;
            roleColor = currentRole.color;
          }
        } else if (window.rolesFieldSelector && typeof window.rolesFieldSelector.getCurrentRole === 'function') {
          const currentRole = window.rolesFieldSelector.getCurrentRole();
          if (currentRole) {
            roleId = currentRole.roleId;
            roleName = currentRole.name;
            roleColor = currentRole.color;
          }
        }
      }

      const labels = {signature: 'Firma', text: 'Texto', date: 'Fecha', seal: 'Sello PKI', final_signature: 'Firma Definitiva'};

      // 🔥 NUEVO: Determinar label con parte asignada
      let fieldLabel = labels[placingFieldType];
      let labelColor = '#374151'; // Color por defecto

      // El sello siempre tiene estilo especial verde
      if (placingFieldType === 'seal') {
        labelColor = '#10b981';
        fieldLabel = '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Sello PKI';
      } else if (placingFieldType === 'final_signature') {
        // Firma definitiva: estilo especial morado/dorado para el dueño
        labelColor = '#9333ea'; // Púrpura
        fieldLabel = '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 100 100" fill="none" stroke="#9333ea" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="50" y1="8" x2="50" y2="85"/><rect x="28" y="85" width="44" height="8" rx="2" fill="#9333ea" stroke="none"/><line x1="12" y1="20" x2="88" y2="20"/><circle cx="50" cy="20" r="4" fill="#9333ea" stroke="none"/><line x1="20" y1="20" x2="16" y2="48"/><line x1="80" y1="20" x2="84" y2="48"/><path d="M8 48 Q16 60 24 48" fill="#9333ea" stroke="none"/><path d="M76 48 Q84 60 92 48" fill="#9333ea" stroke="none"/></svg> Firma Definitiva';
      } else if (roleName && roleColor) {
        fieldLabel = `${labels[placingFieldType]}: ${roleName}`;
        labelColor = roleColor;
      }
      
      el.innerHTML = `
        <span class="label" style="color: ${labelColor}; font-weight: ${roleName || placingFieldType === 'seal' || placingFieldType === 'final_signature' ? '600' : '500'};">${fieldLabel}</span>
        <button class="delete-btn" title="Eliminar">×</button>
      `;

      // 🔥 NUEVO: Aplicar borde de color
      if (placingFieldType === 'seal') {
        // Sello PKI: borde verde especial
        el.style.borderColor = '#10b981';
        el.style.borderWidth = '3px';
        el.style.borderStyle = 'solid';
        el.style.background = 'rgba(16, 185, 129, 0.05)';
      } else if (placingFieldType === 'final_signature') {
        // Firma Definitiva: borde púrpura especial
        el.style.borderColor = '#9333ea';
        el.style.borderWidth = '3px';
        el.style.borderStyle = 'solid';
        el.style.background = 'rgba(147, 51, 234, 0.05)';
      } else if (roleColor) {
        // Campos con parte asignada: borde del color de la parte
        el.style.borderColor = roleColor;
        el.style.borderWidth = '3px';
        el.style.borderStyle = 'solid';
      }

      // ✅ Solo mousedown para manejar drag y click
      el.addEventListener('mousedown', startDragField);
    el.addEventListener('touchstart', startDragField, {passive: false});

      // Marcar si es sello o firma definitiva para evitar modal
      if (placingFieldType === 'seal' || placingFieldType === 'final_signature') {
        el.dataset.noModal = 'true';
      }

      // Agregar evento al botón de eliminar
      const deleteBtn = el.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteField(id, pageData.pageNum);
      });
      
      pageData.overlay.appendChild(el);

      // 🔥 NUEVO: Agregar manejadores de redimensionamiento
      addResizeHandles(el);

      // Guardar el label real mapeado si existe (solo para campos de texto)
      let labelToSave = null;
      if (placingFieldType === 'text' && mappedLabel && mappedLabel.trim().length > 0) {
        labelToSave = mappedLabel.trim();
      } else if (placingFieldType === 'signature') {
        labelToSave = 'Firma';
      } else if (placingFieldType === 'seal') {
        labelToSave = 'Sello PKI';
      } else if (placingFieldType === 'final_signature') {
        labelToSave = 'Firma Definitiva';
      } else if (placingFieldType === 'date') {
        labelToSave = 'Fecha';
      }

      fields.push({
        id,
        type: placingFieldType,
        page: pageData.pageNum,
        x: left,
        y: top,
        w: width,
        h: height,
        value: null,
        signed: false,
        label: labelToSave,
        roleId: roleId, // 🔥 NUEVO
        roleName: roleName, // 🔥 NUEVO
        roleColor: roleColor // 🔥 NUEVO
      });
      
      // Log con información de parte
      const partInfo = roleName ? ` - Asignado a: ${roleName}` : '';
      console.log(`✅ Campo colocado en página ${pageData.pageNum} con ID: ${id}${partInfo}`);
      
      // 🔥 NUEVO: Guardar partes automáticamente si existe el sistema de roles
      if (roleName) {
        if (window.rolesFieldSelector && typeof window.rolesFieldSelector.autoSaveParts === 'function') {
          window.rolesFieldSelector.autoSaveParts();
        } else if (window.rolesSystem && typeof window.rolesSystem.autoSaveParts === 'function') {
          window.rolesSystem.autoSaveParts();
        }
      }
      
      // Resetear estado de dibujo PERO mantener la herramienta activa
      // Esto permite dibujar múltiples campos del mismo tipo sin reactivar el botón
      // placingFieldType se mantiene con su valor actual para permitir dibujar más campos
      isDrawingField = false;
      drawRect = null;
      drawingOnPage = null;
      pageData.overlay.classList.remove('drawing-mode');
      // El cursor se mantiene como crosshair para indicar que sigue en modo dibujo
      console.log(`🔄 Campo creado, herramienta ${placingFieldType} sigue activa para dibujar más campos`);
    }

    // Registrar eventos mouse + touch para dibujo
    pageData.overlay.addEventListener('mousedown', handleDrawStart);
    pageData.overlay.addEventListener('mousemove', handleDrawMove);
    pageData.overlay.addEventListener('mouseup', handleDrawEnd);
    pageData.overlay.addEventListener('touchstart', handleDrawStart, {passive: false});
    pageData.overlay.addEventListener('touchmove', handleDrawMove, {passive: false});
    pageData.overlay.addEventListener('touchend', handleDrawEnd);
  });

  console.log('✅ Event listeners de dibujo configurados para', allPages.length, 'páginas');
}

// ===== Eliminar campo =====
async function deleteField(fieldId, pageNum){
  // Confirmar eliminación con modal moderno
  const confirmed = await toast.confirm('¿Eliminar este campo?', {
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    type: 'error'
  });

  if (!confirmed) return;

  // Buscar la página correcta
  const pageData = allPages.find(p => p.pageNum === pageNum);
  if (!pageData) return;
  
  // Eliminar del DOM
  const el = pageData.overlay.querySelector(`.field[data-id="${fieldId}"]`);
  if(el) el.remove();
  
  // Eliminar del array
  const index = fields.findIndex(f => f.id === fieldId);
  if(index > -1) fields.splice(index, 1);
  
  console.log('🗑️ Campo eliminado:', fieldId);
}

// ===== Redimensionamiento de campos =====
let resizingField = null;
let resizeDirection = null;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartWidth = 0;
let resizeStartHeight = 0;
let resizeStartLeft = 0;
let resizeStartTop = 0;

// Función para agregar manejadores de redimensionamiento a un campo
function addResizeHandles(fieldElement) {
  // No agregar manejadores si ya existen
  if (fieldElement.querySelector('.resize-handle')) return;

  const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  directions.forEach(dir => {
    const handle = document.createElement('div');
    handle.className = `resize-handle ${dir}`;
    handle.dataset.direction = dir;

    // Prevenir que el handle active el drag del campo
    handle.addEventListener('mousedown', startResize);
    handle.addEventListener('touchstart', startResize, {passive: false});

    fieldElement.appendChild(handle);
  });
}

function startResize(e) {
  e.stopPropagation();
  e.preventDefault();

  // Solo con botón izquierdo (mouse) o touch
  if (e.button && e.button !== 0) return;

  const pt = getEventPoint(e);
  resizingField = e.target.closest('.field');
  resizeDirection = e.target.dataset.direction;

  resizeStartX = pt.clientX;
  resizeStartY = pt.clientY;

  // Usar el tamaño actual del style (sin bordes) en lugar de offsetWidth/Height
  resizeStartWidth = parseInt(resizingField.style.width) || resizingField.offsetWidth;
  resizeStartHeight = parseInt(resizingField.style.height) || resizingField.offsetHeight;
  resizeStartLeft = parseInt(resizingField.style.left) || 0;
  resizeStartTop = parseInt(resizingField.style.top) || 0;

  document.addEventListener('mousemove', doResize);
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('touchmove', doResize, {passive: false});
  document.addEventListener('touchend', stopResize);

  // Cambiar cursor del body
  document.body.style.cursor = window.getComputedStyle(e.target).cursor;
}

function doResize(e) {
  if (!resizingField || !resizeDirection) return;
  e.preventDefault();

  const pt = getEventPoint(e);
  const deltaX = pt.clientX - resizeStartX;
  const deltaY = pt.clientY - resizeStartY;

  let newWidth = resizeStartWidth;
  let newHeight = resizeStartHeight;
  let newLeft = resizeStartLeft;
  let newTop = resizeStartTop;

  // Tamaño mínimo
  const minSize = 30;

  // Calcular nuevas dimensiones según la dirección
  switch (resizeDirection) {
    case 'se': // Esquina inferior derecha
      newWidth = Math.max(minSize, resizeStartWidth + deltaX);
      newHeight = Math.max(minSize, resizeStartHeight + deltaY);
      break;

    case 'sw': // Esquina inferior izquierda
      newWidth = Math.max(minSize, resizeStartWidth - deltaX);
      newHeight = Math.max(minSize, resizeStartHeight + deltaY);
      if (newWidth > minSize) newLeft = resizeStartLeft + deltaX;
      break;

    case 'ne': // Esquina superior derecha
      newWidth = Math.max(minSize, resizeStartWidth + deltaX);
      newHeight = Math.max(minSize, resizeStartHeight - deltaY);
      if (newHeight > minSize) newTop = resizeStartTop + deltaY;
      break;

    case 'nw': // Esquina superior izquierda
      newWidth = Math.max(minSize, resizeStartWidth - deltaX);
      newHeight = Math.max(minSize, resizeStartHeight - deltaY);
      if (newWidth > minSize) newLeft = resizeStartLeft + deltaX;
      if (newHeight > minSize) newTop = resizeStartTop + deltaY;
      break;

    case 'e': // Borde derecho
      newWidth = Math.max(minSize, resizeStartWidth + deltaX);
      break;

    case 'w': // Borde izquierdo
      newWidth = Math.max(minSize, resizeStartWidth - deltaX);
      if (newWidth > minSize) newLeft = resizeStartLeft + deltaX;
      break;

    case 's': // Borde inferior
      newHeight = Math.max(minSize, resizeStartHeight + deltaY);
      break;

    case 'n': // Borde superior
      newHeight = Math.max(minSize, resizeStartHeight - deltaY);
      if (newHeight > minSize) newTop = resizeStartTop + deltaY;
      break;
  }

  // Aplicar nuevas dimensiones
  resizingField.style.width = newWidth + 'px';
  resizingField.style.height = newHeight + 'px';
  resizingField.style.left = newLeft + 'px';
  resizingField.style.top = newTop + 'px';
}

function stopResize() {
  if (!resizingField) return;

  // Actualizar el campo en el array fields
  const fieldId = resizingField.dataset.id;
  const field = fields.find(f => f.id === fieldId);

  if (field) {
    field.w = parseInt(resizingField.style.width) || field.w;
    field.h = parseInt(resizingField.style.height) || field.h;
    field.x = parseInt(resizingField.style.left) || field.x;
    field.y = parseInt(resizingField.style.top) || field.y;

    console.log('✅ Campo redimensionado:', {
      id: fieldId,
      width: field.w,
      height: field.h,
      x: field.x,
      y: field.y
    });
  }

  // Limpiar
  document.body.style.cursor = 'default';
  resizingField = null;
  resizeDirection = null;

  document.removeEventListener('mousemove', doResize);
  document.removeEventListener('mouseup', stopResize);
  document.removeEventListener('touchmove', doResize);
  document.removeEventListener('touchend', stopResize);
}

// ===== Arrastrar campos =====
let draggingField = null;
let dragStartX = 0;
let dragStartY = 0;
let fieldStartX = 0;
let fieldStartY = 0;
let hasMoved = false;

function startDragField(e){
  // Solo arrastrar con botón izquierdo del mouse o touch
  if(e.button && e.button !== 0) return;

  // Solo bloquear drag si estamos DIBUJANDO un campo nuevo
  if(isDrawingField) return;

  // Si el click fue en el botón de eliminar o resize handle, no iniciar drag
  if(e.target.classList.contains('delete-btn') || e.target.classList.contains('resize-handle')) return;

  const pt = getEventPoint(e);
  draggingField = e.currentTarget;
  dragStartX = pt.clientX;
  dragStartY = pt.clientY;
  fieldStartX = parseInt(draggingField.style.left) || 0;
  fieldStartY = parseInt(draggingField.style.top) || 0;
  hasMoved = false;

  // Prevenir selección de texto mientras se arrastra
  e.preventDefault();

  document.addEventListener('mousemove', dragField);
  document.addEventListener('mouseup', stopDragField);
  document.addEventListener('touchmove', dragField, {passive: false});
  document.addEventListener('touchend', stopDragField);
}

function dragField(e){
  if(!draggingField) return;
  e.preventDefault();

  const pt = getEventPoint(e);
  const deltaX = pt.clientX - dragStartX;
  const deltaY = pt.clientY - dragStartY;

  // Solo considerar movimiento si se movió más de 3px (reducido para mejor responsividad)
  if(Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3){
    if(!hasMoved){
      hasMoved = true;
      // Cambiar cursor mientras se arrastra
      draggingField.style.cursor = 'grabbing';
      document.body.style.cursor = 'grabbing';
    }
    e.stopPropagation();
    e.preventDefault();

    const newX = fieldStartX + deltaX;
    const newY = fieldStartY + deltaY;

    draggingField.style.left = newX + 'px';
    draggingField.style.top = newY + 'px';
  }
}

function stopDragField(e){
  if(!draggingField) return;

  // Restaurar cursor
  if(draggingField){
    draggingField.style.cursor = 'move';
  }
  document.body.style.cursor = 'default';

  const fieldElement = draggingField;

  // Si se movió, actualizar posición
  if(hasMoved){
    if(e.stopPropagation) e.stopPropagation();
    if(e.preventDefault) e.preventDefault();

    const fieldId = draggingField.dataset.id;
    const field = fields.find(f => f.id === fieldId);
    if(field){
      field.x = parseInt(draggingField.style.left) || 0;
      field.y = parseInt(draggingField.style.top) || 0;
    }
    console.log('✅ Campo movido a nueva posición:', field?.x, field?.y);

    // Mantener hasMoved en true por un momento para evitar abrir modal
    setTimeout(() => {
      hasMoved = false;
    }, 200);
  } else {
    // ✅ NUEVO: Si NO se movió, abrir modal (comportamiento de click)
    if(!fieldElement.dataset.noModal && !placingFieldType){
      e.stopPropagation();
      e.preventDefault();

      // Esperar un tick para asegurar que el evento mouseup termine
      setTimeout(() => {
        openFieldModal({ currentTarget: fieldElement, stopPropagation: () => {} });
      }, 0);
    }
    hasMoved = false;
  }

  draggingField = null;
  document.removeEventListener('mousemove', dragField);
  document.removeEventListener('mouseup', stopDragField);
  document.removeEventListener('touchmove', dragField);
  document.removeEventListener('touchend', stopDragField);
}

// ===== Modales =====
const sigModal = document.getElementById('sigModal');
const textModal = document.getElementById('textModal');
const dateModal = document.getElementById('dateModal');
const sigPad   = document.getElementById('sigPad');
const sigCtx   = sigPad.getContext('2d');
let drawing    = false;
let activeFieldId = null;

// Funciones para mostrar/ocultar modales
function hideModal(){ 
  sigModal.classList.remove('show'); 
  sigModal.setAttribute('aria-hidden','true'); 
  textModal.classList.remove('show'); 
  textModal.setAttribute('aria-hidden','true'); 
  dateModal.classList.remove('show'); 
  dateModal.setAttribute('aria-hidden','true'); 
}

// Abrir modal según tipo de campo
function openFieldModal(e){
  // Si acabamos de arrastrar, no abrir modal
  if(hasMoved) {
    console.log('⚠️ Campo arrastrado, no se abre modal');
    if(e && e.stopPropagation) e.stopPropagation();
    if(e && e.preventDefault) e.preventDefault();
    return;
  }

  if(e && e.stopPropagation) e.stopPropagation();
  const fieldEl = e.currentTarget;
  activeFieldId = fieldEl.dataset.id;
  const fieldType = fieldEl.dataset.type;
  const field = fields.find(f => f.id === activeFieldId);
  
  console.log('🔓 Abriendo modal para campo:', fieldType);
  
  if(fieldType === 'signature'){
    sigModal.classList.add('show'); 
    sigModal.setAttribute('aria-hidden','false'); 
    resizeSig();
    
    // Si ya tiene firma, mostrarla
    if(field && field.value){
      const img = new Image();
      img.onload = function(){
        sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
        sigCtx.drawImage(img, 0, 0, sigPad.clientWidth, sigPad.clientHeight);
      };
      img.src = field.value;
    } else {
      sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
    }
  } else if(fieldType === 'text'){
    textModal.classList.add('show'); 
    textModal.setAttribute('aria-hidden','false'); 
    
    // Si ya tiene texto, mostrarlo
    document.getElementById('textInput').value = field && field.value ? field.value : '';
    
    // Restaurar opciones de formato si existen
    if(field && field.format) {
      document.getElementById('fontFamily').value = field.format.fontFamily || 'Arial';
      document.getElementById('fontSize').value = field.format.fontSize || '12';
      document.getElementById('fontColor').value = field.format.fontColor || '#000000';
      
      // Actualizar preview de color
      const colorPreview = document.getElementById('colorPreview');
      if(colorPreview) colorPreview.style.background = field.format.fontColor || '#000000';
      
      // Restaurar negrita/cursiva/subrayado
      const boldBtn = document.getElementById('boldBtn');
      const italicBtn = document.getElementById('italicBtn');
      const underlineBtn = document.getElementById('underlineBtn');
      
      if(field.format.isBold) boldBtn.classList.add('active');
      else boldBtn.classList.remove('active');
      if(field.format.isItalic) italicBtn.classList.add('active');
      else italicBtn.classList.remove('active');
      if(field.format.isUnderline && underlineBtn) underlineBtn.classList.add('active');
      else if(underlineBtn) underlineBtn.classList.remove('active');
      
      // Restaurar alineación
      const alignButtons = document.querySelectorAll('[data-align]');
      alignButtons.forEach(btn => {
        if(btn.dataset.align === field.format.textAlign) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } else {
      // Valores por defecto
      document.getElementById('fontFamily').value = 'Arial';
      document.getElementById('fontSize').value = '12';
      document.getElementById('fontColor').value = '#000000';
      
      const colorPreview = document.getElementById('colorPreview');
      if(colorPreview) colorPreview.style.background = '#000000';
      
      document.getElementById('boldBtn').classList.remove('active');
      document.getElementById('italicBtn').classList.remove('active');
      const underlineBtn = document.getElementById('underlineBtn');
      if(underlineBtn) underlineBtn.classList.remove('active');
      
      const alignButtons = document.querySelectorAll('[data-align]');
      alignButtons.forEach(btn => {
        if(btn.dataset.align === 'left') btn.classList.add('active');
        else btn.classList.remove('active');
      });
    }
    
    // Actualizar vista previa
    updateTextPreview();
    
    document.getElementById('textInput').focus();
  } else if(fieldType === 'date'){
    dateModal.classList.add('show'); 
    dateModal.setAttribute('aria-hidden','false'); 
    // Si ya tiene fecha, mostrarla, si no usar hoy
    const dateValue = field && field.value ? field.value : new Date().toISOString().split('T')[0];
    document.getElementById('dateInput').value = dateValue;
    document.getElementById('dateInput').focus();
  }
}

function resizeSig(){
  const dpr = window.devicePixelRatio || 1;
  sigPad.width  = sigPad.clientWidth  * dpr;
  sigPad.height = sigPad.clientHeight * dpr;
  sigCtx.setTransform(1,0,0,1,0,0);
  sigCtx.scale(dpr,dpr);
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.strokeStyle = '#111';
}

// Confirmar firma
function confirmSignature(){
  if(!activeFieldId) return;
  
  // 🔒 En modo preparación, solo permitir colocar el campo, NO firmarlo
  if (currentMode === 'prepare') {
    ToastManager.info('Campo de firma colocado', 'El campo se guardará cuando presiones GUARDAR');
    hideModal();
    return;
  }
  
  const field = fields.find(f=>f.id===activeFieldId);
  field.value = sigPad.toDataURL('image/png');
  field.signed  = true;

  const el = overlay.querySelector(`.field[data-id="${activeFieldId}"]`);
  el.classList.add('signed');
  
  // Limpiar contenido previo y agregar label + botón eliminar + imagen de fondo
  el.innerHTML = `
    <span class="label">Firma</span>
    <button class="delete-btn" title="Eliminar">×</button>
  `;
  el.style.backgroundImage = `url(${field.value})`;
  el.style.backgroundSize  = 'contain';
  el.style.backgroundRepeat= 'no-repeat';
  el.style.backgroundPosition = 'center';

  // Re-agregar event listeners
  // ✅ Solo mousedown para manejar drag y click
  el.addEventListener('mousedown', startDragField);
    el.addEventListener('touchstart', startDragField, {passive: false});
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

  // 🔥 NUEVO: Re-agregar manejadores de redimensionamiento
  addResizeHandles(el);

  hideModal();
}

// Actualizar vista previa de texto
function updateTextPreview() {
  const preview = document.getElementById('textPreview');
  if (!preview) return;
  
  const textValue = document.getElementById('textInput').value.trim();
  const fontFamily = document.getElementById('fontFamily').value;
  const fontSize = document.getElementById('fontSize').value;
  const fontColor = document.getElementById('fontColor').value;
  const isBold = document.getElementById('boldBtn')?.classList.contains('active');
  const isItalic = document.getElementById('italicBtn')?.classList.contains('active');
  const isUnderline = document.getElementById('underlineBtn')?.classList.contains('active');
  const textAlign = document.querySelector('[data-align].active')?.dataset.align || 'left';
  
  if (!textValue) {
    preview.textContent = 'Tu texto aparecerá aquí...';
    preview.style.cssText = 'color:#666;font-size:14px;font-family:inherit;';
    return;
  }
  
  const fontWeight = isBold ? 'bold' : 'normal';
  const fontStyle = isItalic ? 'italic' : 'normal';
  const textDecoration = isUnderline ? 'underline' : 'none';
  
  preview.textContent = textValue;
  preview.style.fontFamily = fontFamily;
  preview.style.fontSize = fontSize + 'px';
  preview.style.color = fontColor;
  preview.style.fontWeight = fontWeight;
  preview.style.fontStyle = fontStyle;
  preview.style.textDecoration = textDecoration;
  preview.style.textAlign = textAlign;
  preview.style.justifyContent = textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start';
}

// Confirmar texto
function confirmText(){
  if(!activeFieldId) return;
  const textValue = document.getElementById('textInput').value.trim();
  if(!textValue){ toast.warning('Escribe algo de texto'); return; }
  
  // 🔒 En modo preparación, solo permitir colocar el campo, NO llenarlo
  if (currentMode === 'prepare') {
    ToastManager.info('Campo de texto colocado', 'El campo se guardará cuando presiones GUARDAR');
    hideModal();
    return;
  }
  
  // Obtener opciones de formato
  const fontFamily = document.getElementById('fontFamily').value;
  const fontSize = document.getElementById('fontSize').value;
  const fontColor = document.getElementById('fontColor').value;
  const isBold = document.getElementById('boldBtn').classList.contains('active');
  const isItalic = document.getElementById('italicBtn').classList.contains('active');
  const isUnderline = document.getElementById('underlineBtn')?.classList.contains('active') || false;
  const textAlign = document.querySelector('[data-align].active')?.dataset.align || 'left';
  
  const field = fields.find(f=>f.id===activeFieldId);
  field.value = textValue;
  field.signed = true;
  
  // Guardar opciones de formato en el field
  field.format = {
    fontFamily,
    fontSize,
    fontColor,
    isBold,
    isItalic,
    isUnderline,
    textAlign
  };

  const el = overlay.querySelector(`.field[data-id="${activeFieldId}"]`);
  el.classList.add('signed');
  
  // Construir estilo dinámico
  const fontWeight = isBold ? 'bold' : 'normal';
  const fontStyle = isItalic ? 'italic' : 'normal';
  const textDecoration = isUnderline ? 'underline' : 'none';
  
  el.innerHTML = `
    <span class="label">Texto</span>
    <button class="delete-btn" title="Eliminar">×</button>
    <div class="field-content" style="
      font-family: ${fontFamily};
      font-size: ${fontSize}px;
      color: ${fontColor};
      font-weight: ${fontWeight};
      font-style: ${fontStyle};
      text-decoration: ${textDecoration};
      text-align: ${textAlign};
      width: 100%;
      height: 100%;
      overflow: hidden;
      word-wrap: break-word;
      word-break: break-word;
      display: flex;
      align-items: center;
      justify-content: ${textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start'};
      box-sizing: border-box;
      padding: 2px;
    ">${textValue}</div>
  `;

  // Re-agregar event listeners
  // ✅ Solo mousedown para manejar drag y click
  el.addEventListener('mousedown', startDragField);
    el.addEventListener('touchstart', startDragField, {passive: false});
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

  // 🔥 NUEVO: Re-agregar manejadores de redimensionamiento
  addResizeHandles(el);

  hideModal();
}

// Confirmar fecha
function confirmDate(){
  if(!activeFieldId) return;
  const dateValue = document.getElementById('dateInput').value;
  if(!dateValue){ toast.warning('Selecciona una fecha'); return; }
  
  // 🔒 En modo preparación, solo permitir colocar el campo, NO seleccionar fecha
  if (currentMode === 'prepare') {
    ToastManager.info('Campo de fecha colocado', 'El campo se guardará cuando presiones GUARDAR');
    hideModal();
    return;
  }
  
  const field = fields.find(f=>f.id===activeFieldId);
  field.value = dateValue;
  field.signed = true;

  const el = overlay.querySelector(`.field[data-id="${activeFieldId}"]`);
  el.classList.add('signed');
  const formattedDate = new Date(dateValue + 'T00:00:00').toLocaleDateString('es-ES', {year:'numeric', month:'long', day:'numeric'});
  el.innerHTML = `
    <span class="label">Fecha</span>
    <button class="delete-btn" title="Eliminar">×</button>
    <div class="field-content">${formattedDate}</div>
  `;

  // Re-agregar event listeners
  // ✅ Solo mousedown para manejar drag y click
  el.addEventListener('mousedown', startDragField);
    el.addEventListener('touchstart', startDragField, {passive: false});
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

  // 🔥 NUEVO: Re-agregar manejadores de redimensionamiento
  addResizeHandles(el);

  hideModal();
}

// ===== Signature Pad Events =====
function initSignaturePad(){
  function startDraw(e){ drawing = true; sigCtx.beginPath(); sigCtx.moveTo(...pos(e)); }
  function moveDraw(e){ if(!drawing) return; sigCtx.lineTo(...pos(e)); sigCtx.stroke(); }
  function endDraw(){ drawing = false; }

  function pos(e){
    const r = sigPad.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
    return [x,y];
  }

  sigPad.addEventListener('mousedown', startDraw);
  sigPad.addEventListener('mousemove', moveDraw);
  sigPad.addEventListener('mouseup',   endDraw);
  sigPad.addEventListener('mouseleave',endDraw);
  sigPad.addEventListener('touchstart', (e)=>{e.preventDefault(); startDraw(e);},{passive:false});
  sigPad.addEventListener('touchmove',  (e)=>{e.preventDefault(); moveDraw(e);},{passive:false});
  sigPad.addEventListener('touchend',   endDraw);
}

// ===== Guardar PDF =====
async function savePDF(){
  if(!pdfBytes){ toast.warning('Sube un PDF primero'); return; }

  // Verificar el modo actual
  if (currentMode === 'prepare') {
    // Modo PREPARE: Guardar campos en el backend (sin firmar)
    await saveFieldsToBackend();
  } else {
    // Modo por defecto: Guardar PDF firmado (flujo antiguo)
    await saveSignedPDF();
  }
}

// ===== Guardar campos en el backend (modo PREPARE) =====
async function saveFieldsToBackend(skipRedirect = false) {
  console.log('💾 Guardando campos en el backend...');
  console.log('🔍 skipRedirect:', skipRedirect);

  if (!currentDocId) {
    toast.error('No se ha cargado ningún documento');
    return;
  }

  if (fields.length === 0) {
    toast.warning('No has colocado ningún campo. Usa las herramientas de la derecha para agregar campos de firma, texto o fecha.');
    return;
  }

  // ✅ VALIDAR QUE TODOS LOS CAMPOS ESTÉN DENTRO DE LOS LÍMITES DEL PDF
  const invalidFields = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const pageData = allPages.find(p => p.pageNum === f.page);
    
    if (!pageData) {
      invalidFields.push(`Campo ${i + 1} (${f.type}): Página ${f.page} no existe`);
      continue;
    }

    const pageHeight = pageData.viewport.height;
    const pageWidth = pageData.viewport.width;

    const fieldBottom = parseFloat(f.y) + parseFloat(f.h);
    const fieldRight = parseFloat(f.x) + parseFloat(f.w);

    // Validar que el campo esté completamente dentro del PDF
    if (parseFloat(f.x) < 0 || parseFloat(f.y) < 0) {
      invalidFields.push(`Campo ${i + 1} (${f.type}) en página ${f.page}: Está fuera del límite superior/izquierdo`);
    } else if (fieldRight > pageWidth) {
      invalidFields.push(`Campo ${i + 1} (${f.type}) en página ${f.page}: Se sale por el borde derecho (${fieldRight.toFixed(0)} > ${pageWidth.toFixed(0)})`);
    } else if (fieldBottom > pageHeight) {
      invalidFields.push(`Campo ${i + 1} (${f.type}) en página ${f.page}: Se sale por el borde inferior (${fieldBottom.toFixed(0)} > ${pageHeight.toFixed(0)})`);
    }
  }

  if (invalidFields.length > 0) {
    toast.warning(`CAMPOS FUERA DE LÍMITES\n\nLos siguientes campos están posicionados fuera del área visible del PDF:\n\n${invalidFields.join('\n')}\n\nPor favor, ajusta las posiciones de los campos antes de guardar.`, 8000);
    console.error('❌ Campos inválidos:', invalidFields);
    return;
  }

  try {
    // ✅ CORREGIDO: Obtener información del usuario (no hay token JWT en este sistema)
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      toast.warning('Debes iniciar sesión para continuar');
      window.location.href = '/login.html';
      return;
    }

    const user = JSON.parse(userStr);
    console.log('👤 Usuario actual:', user.email);

    // 🔥 PASO 1: Guardar roles/partes en la BD si existen
    if (window.rolesSystem && window.rolesSystem.roles && window.rolesSystem.roles.length > 0) {
      console.log('📋 Guardando roles/partes del documento...');
      // ✅ CORREGIDO: Usar endpoint /parts en lugar de /roles
      const partsResponse = await fetch(`/api/documents/${currentDocId}/parts?user_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: window.rolesSystem.roles.map((r, idx) => ({
            name: r.name,
            color: r.color,
            order: idx + 1
          }))
        })
      });
      if (!partsResponse.ok) {
        const errorData = await partsResponse.json();
        throw new Error(errorData.error || 'Error al guardar partes');
      }
      const partsData = await partsResponse.json();
      console.log('✅ Partes guardadas:', partsData);

      // ✅ CORREGIDO: Actualizar partId pero mantener roleId como order_position
      window.rolesSystem.roles.forEach((role, index) => {
        if (partsData.parts[index]) {
          role.partId = partsData.parts[index].partId;  // Guardar part_id real
          role.roleId = partsData.parts[index].order;   // roleId = order_position (1, 2, 3...)
        }
      });
    }

    // Preparar datos de los campos
    // ✅ IMPORTANTE: Convertir coordenadas de viewport escalado a coordenadas PDF reales
    // El viewport usa scale=1.4, pero el PDF usa coordenadas reales (612x792 puntos)
    const VIEWPORT_SCALE = 1.4; // Debe coincidir con baseScale en loadPDF()
    
    const fieldsData = fields.map(f => ({
      type: f.type,
      page: f.page || 1,
      // Convertir de coordenadas viewport (escaladas) a coordenadas PDF (reales)
      x: parseFloat(f.x) / VIEWPORT_SCALE,
      y: parseFloat(f.y) / VIEWPORT_SCALE,
      width: parseFloat(f.w) / VIEWPORT_SCALE,
      height: parseFloat(f.h) / VIEWPORT_SCALE,
      label: f.label || null,
      required: f.required !== false,
      roleId: f.roleId || null, // 🔥 NUEVO: Incluir roleId (será el part_id)
      roleName: f.roleName || null // 🔥 NUEVO: Incluir nombre de la parte para referencia
    }));

    console.log('📤 Enviando campos al backend:', fieldsData);
    console.log('🏷️ [SAVE] Labels que se envían al backend:');
    fieldsData.forEach((field, index) => {
      console.log(`   Campo ${index + 1}: tipo="${field.type}" label="${field.label}" page=${field.page}`);
    });

    // Mostrar indicador de carga
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) saveBtn.textContent = 'GUARDANDO...';

    // ✅ Si el PDF fue modificado (se agregaron páginas), subir el nuevo PDF al servidor primero
    if (_pdfModified && currentDocId && pdfBytes) {
      console.log('📤 Subiendo PDF modificado al servidor...');
      if (saveBtn) saveBtn.textContent = 'SUBIENDO PDF...';
      const fileUploadRes = await fetch(`/api/documents/${currentDocId}/file?user_id=${user.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pdfBytes
      });
      if (!fileUploadRes.ok) {
        const errData = await fileUploadRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al subir el PDF modificado');
      }
      _pdfModified = false;
      console.log('✅ PDF modificado subido al servidor');
      if (saveBtn) saveBtn.textContent = 'GUARDANDO...';
    }

    // ✅ CORREGIDO: Enviar user_id en lugar de token JWT
    const response = await fetch(`/api/documents/${currentDocId}/fields?user_id=${user.user_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: fieldsData
      })
    });

    const data = await response.json();

    if (saveBtn) saveBtn.textContent = originalText;

    if (data.ok && data.success) {
      console.log('✅ Campos guardados exitosamente:', data);
      
      toast.success(`${fieldsData.length} campo${fieldsData.length > 1 ? 's' : ''} guardado${fieldsData.length > 1 ? 's' : ''} exitosamente. Abriendo personalizaci\u00f3n...`);

      // Solo redirigir si NO se especificó skipRedirect
      if (!skipRedirect) {
        // Redirigir a tracking con parámetros para abrir modal de personalización
        setTimeout(() => {
          const docName = currentDocTitle || 'Documento';
          // 🔥 NUEVO: Agregar parámetros para pre-seleccionar plantilla y abrir modal
          window.location.href = `/tracking.html?id=${currentDocId}&name=${encodeURIComponent(docName)}&openPersonalize=true&templateId=${currentDocId}&type=${documentType}`;
        }, 1500);
      } else {
        console.log('✅ Campos guardados - NO redirigiendo (skipRedirect=true)');
      }

    } else {
      throw new Error(data.error || 'Error al guardar campos');
    }

  } catch (error) {
    console.error('❌ Error al guardar campos:', error);
    toast.error(`Error al guardar campos: ${error.message}`);
  }
}

// ===== Guardar PDF firmado (flujo antiguo) =====
async function saveSignedPDF(){
  const sigs = fields.filter(f=>f.type==='signature' && f.signed && f.dataUrl);
  if(sigs.length===0){ toast.warning('No hay firmas colocadas'); return; }

  try {
    const pdfDocLib = await PDFLib.PDFDocument.load(pdfBytes);

    for(const f of sigs){
      const pageLib = pdfDocLib.getPages()[f.page-1];

      const domW = pdfCanvas.width, domH = pdfCanvas.height;
      const pdfW = pageLib.getWidth(), pdfH = pageLib.getHeight();
      const rx = pdfW / domW, ry = pdfH / domH;

      const xPdf = f.x * rx;
      const yPdf = pdfH - (f.y + f.h) * ry;
      const wPdf = f.w * rx;
      const hPdf = f.h * ry;

      const pngBytes = await (await fetch(f.dataUrl)).arrayBuffer();
      const pngEmbed = await pdfDocLib.embedPng(pngBytes);
      pageLib.drawImage(pngEmbed, {x:xPdf, y:yPdf, width:wPdf, height:hPdf});
    }

    const outBytes = await pdfDocLib.save();
    const blob = new Blob([outBytes], {type:'application/pdf'});
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'documento-firmado.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    console.log('✅ PDF firmado descargado');
  } catch(error){
    console.error('❌ Error al guardar:', error);
    toast.error('Error al generar PDF: ' + error.message);
  }
}

// ===== MODAL DE DESTINATARIOS =====
function initRecipientsModal() {
  // ❌ ELIMINADO: const sendBtn = document.getElementById('sendBtn');
  // El botón ENVIAR ha sido eliminado - todos los envíos se hacen desde tracking.html
  const recipientsModal = document.getElementById('recipientsModal');
  const recipientsClose = document.getElementById('recipientsClose');
  const recipientsCancel = document.getElementById('recipientsCancel');
  const recipientsAdd = document.getElementById('recipientsAdd');
  const recipientsTabs = document.querySelectorAll('.recipients-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Cerrar modal
  function closeRecipientsModal() {
    if (recipientsModal) {
      recipientsModal.setAttribute('aria-hidden', 'true');
      recipientsModal.style.display = 'none';
    }
  }

  if (recipientsClose) recipientsClose.addEventListener('click', closeRecipientsModal);
  if (recipientsCancel) recipientsCancel.addEventListener('click', closeRecipientsModal);

  // Cerrar modal al hacer clic fuera
  if (recipientsModal) {
    recipientsModal.addEventListener('click', function(e) {
      if (e.target === recipientsModal) {
        closeRecipientsModal();
      }
    });
  }

  // Manejar pestañas
  recipientsTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');

      // Remover active de todas las pestañas
      recipientsTabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      // Activar pestaña seleccionada
      this.classList.add('active');
      const selectedContent = document.getElementById(`tab-${tabName}`);
      if (selectedContent) {
        selectedContent.classList.add('active');
      }

      // Si es la pestaña Detallado, renderizar formulario de roles
      if (tabName === 'detailed' && window.rolesSystem && typeof window.rolesSystem.renderRecipientsForm === 'function') {
        window.rolesSystem.renderRecipientsForm();
        console.log('✅ Formulario de roles renderizado en pestaña Detallado');
      }

      console.log(`📑 Pestaña cambiada a: ${tabName}`);
    });
  });

  // Agregar destinatarios
  if (recipientsAdd) {
    recipientsAdd.addEventListener('click', async function() {
      console.log('✅ [RECIPIENTS-ADD] Botón clickeado - Iniciando proceso...');

      // Obtener el tab activo
      const activeTab = document.querySelector('.recipients-tab.active');
      console.log('🔍 [RECIPIENTS-ADD] Tab activo:', activeTab);
      const tabType = activeTab ? activeTab.getAttribute('data-tab') : 'email';
      console.log('🔍 [RECIPIENTS-ADD] Tipo de tab:', tabType);

      // Verificar estado de bulkRecipientsSign
      console.log('🔍 [RECIPIENTS-ADD] window.bulkRecipientsSign:', window.bulkRecipientsSign);
      console.log('🔍 [RECIPIENTS-ADD] Cantidad:', window.bulkRecipientsSign?.length);

      // 🔥 NUEVO: Si hay destinatarios cargados desde CSV/XLSX, usar envío masivo
      if (tabType === 'upload' && window.bulkRecipientsSign && window.bulkRecipientsSign.length > 0) {
        console.log('📤 [RECIPIENTS-ADD] Detectado envío masivo con CSV/XLSX - Continuando...');

        // 🔥 IMPORTANTE: Guardar los campos antes de enviar el CSV (SIN redirigir)
        console.log('💾 Guardando campos del documento antes de enviar...');
        try {
          await saveFieldsToBackend(true); // skipRedirect = true
          console.log('✅ Campos guardados exitosamente');
        } catch (error) {
          console.error('❌ Error al guardar campos:', error);
          alert('Error al guardar los campos del documento. Por favor intenta de nuevo.');
          return;
        }

        // 🔥 NUEVO: Recargar los campos para obtener los field_id actualizados desde la BD
        console.log('🔄 [RECIPIENTS-ADD] Recargando campos actualizados desde la BD...');
        console.log('🔍 [RECIPIENTS-ADD] window.currentTemplateDataSign existe:', !!window.currentTemplateDataSign);
        try {
          const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
          const reloadResponse = await fetch(`/api/templates/${currentDocId}?user_id=${user.user_id}`);
          console.log('🔍 [RECIPIENTS-ADD] Response status:', reloadResponse.status);
          if (reloadResponse.ok) {
            const reloadedData = await reloadResponse.json();
            console.log('🔍 [RECIPIENTS-ADD] Response data:', reloadedData);
            if (reloadedData.success && reloadedData.data && reloadedData.data.fields) {
              // Actualizar currentTemplateDataSign con los nuevos field_id
              if (window.currentTemplateDataSign) {
                window.currentTemplateDataSign.fields = reloadedData.data.fields;
                console.log('✅ [RECIPIENTS-ADD] Campos actualizados con nuevos field_id:', reloadedData.data.fields.length);
                console.log('🔍 [RECIPIENTS-ADD] Primeros field_id:', reloadedData.data.fields.slice(0, 3).map(f => f.id));
              } else {
                console.warn('⚠️ [RECIPIENTS-ADD] window.currentTemplateDataSign no existe, no se pueden actualizar campos');
              }
            } else {
              console.warn('⚠️ [RECIPIENTS-ADD] Respuesta no tiene estructura esperada:', reloadedData);
            }
          } else {
            console.error('❌ [RECIPIENTS-ADD] Error al recargar campos, status:', reloadResponse.status);
          }
        } catch (reloadError) {
          console.error('❌ [RECIPIENTS-ADD] Error al recargar campos:', reloadError);
          // No es crítico, continuar
        }

        await window.sendBulkEmailsSign();
        return;
      }

      let recipients = [];

      if (tabType === 'email') {
        // Primero verificar si hay roles activos (formulario con inputs por rol)
        const roleInputs = document.querySelectorAll('.role-email-input');
        
        if (roleInputs.length > 0) {
          // Hay roles activos - usar el método del sistema de roles
          console.log('🎯 Detectados roles activos, obteniendo destinatarios con roleId...');
          if (window.rolesSystem && typeof window.rolesSystem.getRecipientsFromForm === 'function') {
            recipients = window.rolesSystem.getRecipientsFromForm();
            console.log('👥 Destinatarios con roles:', recipients);
          }
        } else {
          // No hay roles - usar textarea simple
          const emailInput = document.getElementById('emailInput');
          if (emailInput && emailInput.value.trim()) {
            recipients = emailInput.value.split('\n').filter(e => e.trim());
            console.log('📧 Destinatarios por email:', recipients);
          }
        }
      } else if (tabType === 'phone') {
        const phoneInput = document.getElementById('phoneInput');
        if (phoneInput && phoneInput.value.trim()) {
          recipients = phoneInput.value.split('\n').filter(p => p.trim());
          console.log('📱 Destinatarios por teléfono:', recipients);
        }
      } else if (tabType === 'detailed') {
        // Usar el método del sistema de roles para obtener destinatarios
        if (window.rolesSystem && typeof window.rolesSystem.getRecipientsFromForm === 'function') {
          recipients = window.rolesSystem.getRecipientsFromForm();
          console.log('👥 Destinatarios con roles:', recipients);
        } else {
          // Fallback a formulario antiguo
          const nameInput = document.querySelector('.detailed-form input[type="text"]');
          const emailInput = document.querySelector('.detailed-form input[type="email"]');
          const phoneInput = document.querySelector('.detailed-form input[type="tel"]');

          if (nameInput && emailInput && nameInput.value.trim() && emailInput.value.trim()) {
            recipients.push({
              name: nameInput.value.trim(),
              email: emailInput.value.trim(),
              phone: phoneInput.value.trim()
            });
            console.log('👤 Destinatario detallado:', recipients[0]);
          }
        }
      }

      if (recipients.length > 0) {
        // Enviar documento con destinatarios
        sendDocumentToRecipients(recipients, closeRecipientsModal);
      } else {
        toast.warning('Por favor ingresa al menos un destinatario');
      }
    });
  }

  console.log('✅ Modal de destinatarios inicializado');
}

// ===== ENVIAR DOCUMENTO A DESTINATARIOS =====
async function sendDocumentToRecipients(recipients, closeModalCallback) {
  try {
    console.log('📤 Enviando documento a destinatarios...', recipients);

    // Obtener document_id de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const documentId = urlParams.get('id');

    if (!documentId) {
      toast.error('No se encontró el ID del documento');
      return;
    }

    // Obtener usuario actual
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user || !user.user_id) {
      toast.error('Usuario no autenticado');
      return;
    }

    // Deshabilitar botón durante el envío
    const addBtn = document.getElementById('recipientsAdd');
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Guardando campos...';
    }

    // Paso 0: Guardar campos en la BD antes de enviar
    console.log('💾 Guardando campos del documento...');
    console.log('🔍 [DEBUG] Campos disponibles:', fields);
    console.log('🔍 [DEBUG] Cantidad de campos:', fields.length);
    
    if (fields && fields.length > 0) {
      // 🔥 IMPORTANTE: Convertir coordenadas de viewport escalado a coordenadas PDF reales
      // El viewport usa scale=1.4, pero el PDF usa coordenadas reales (612x792 puntos)
      const VIEWPORT_SCALE = 1.4; // Debe coincidir con baseScale en loadPDF()
      
      // Transformar campos del formato interno (w,h,x,y) al formato que espera el backend (width,height,x_position,y_position)
      const fieldsForBackend = fields.map(f => ({
        type: f.type,
        page: f.page,
        // Convertir de coordenadas viewport (escaladas) a coordenadas PDF (reales)
        x: parseFloat(f.x) / VIEWPORT_SCALE,
        y: parseFloat(f.y) / VIEWPORT_SCALE,
        width: parseFloat(f.w) / VIEWPORT_SCALE,  // 🔥 Mapear w → width y dividir por escala
        height: parseFloat(f.h) / VIEWPORT_SCALE, // 🔥 Mapear h → height y dividir por escala
        label: f.label || null,
        required: f.required !== false,
        roleId: f.roleId,
        roleName: f.roleName
      }));
      
      console.log('🔍 [DEBUG] Campos transformados para backend (con escala 1.4):', fieldsForBackend);
      
      const saveResponse = await fetch(`/api/documents/${documentId}/fields?user_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fieldsForBackend })
      });
      
      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || 'Error al guardar campos');
      }
      
      console.log('✅ Campos guardados exitosamente');
    } else {
      throw new Error('No hay campos colocados en el documento. Por favor, coloca al menos un campo de firma.');
    }

    if (addBtn) {
      addBtn.textContent = 'Guardando roles...';
    }

    // Paso 1: Guardar roles/partes si existen
    if (window.rolesSystem && window.rolesSystem.roles.length > 0) {
      console.log('📋 Guardando partes antes de enviar...');
      // ✅ CORREGIDO: Usar endpoint /parts en lugar de /roles
      const partsResponse = await fetch(`/api/documents/${documentId}/parts?user_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parts: window.rolesSystem.roles.map((role, index) => ({
            name: role.name,
            order: index + 1,
            color: role.color
          }))
        })
      });
      if (!partsResponse.ok) {
        const errorData = await partsResponse.json();
        throw new Error(errorData.error || 'Error al guardar partes');
      }
      const partsData = await partsResponse.json();
      console.log('✅ Partes guardadas:', partsData);

      // ✅ CORREGIDO: Actualizar partId pero mantener roleId como order_position
      window.rolesSystem.roles.forEach((role, index) => {
        if (partsData.parts[index]) {
          role.partId = partsData.parts[index].partId;  // Guardar part_id real
          role.roleId = partsData.parts[index].order;   // roleId = order_position (1, 2, 3...)
        }
      });
    }

    if (addBtn) {
      addBtn.textContent = 'Enviando emails...';
    }

    // Paso 2: Formatear destinatarios según tipo
    let formattedRecipients = [];

    if (Array.isArray(recipients) && recipients.length > 0) {
      // Si son destinatarios con roles (objetos con roleId)
      if (recipients[0].roleId !== undefined) {
        formattedRecipients = recipients.map(r => ({
          email: r.email,
          roleId: r.roleId
        }));
      }
      // Si son solo strings (emails simples)
      else if (typeof recipients[0] === 'string') {
        formattedRecipients = recipients.map(email => ({ email }));
      }
      // Si son objetos con name, email, phone
      else {
        formattedRecipients = recipients;
      }
    }

    console.log('📧 Enviando a:', formattedRecipients);

    // Paso 3: Enviar documento
    const response = await fetch(`/api/documents/${documentId}/send?user_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients: formattedRecipients })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Error al enviar documento');
    }

    console.log('✅ Documento enviado exitosamente:', data);
    toast.success(`Documento enviado a ${formattedRecipients.length} destinatario(s)`);

    // Cerrar modal
    if (typeof closeModalCallback === 'function') {
      closeModalCallback();
    }

    // Redirigir a tracking para ver el estado de las firmas
    console.log('🔄 Redirigiendo a tracking...');
    window.location.href = `/tracking.html?id=${documentId}`;

  } catch (error) {
    console.error('❌ Error al enviar documento:', error);
    toast.error(`Error: ${error.message}`);
  } finally {
    // Restaurar botón
    const addBtn = document.getElementById('recipientsAdd');
    if (addBtn) {
      addBtn.disabled = false;
      addBtn.textContent = 'AGREGAR DESTINATARIOS';
    }
  }
}

// ===== Indicador de carga =====
function showLoadingIndicator() {
  // Usar el loader del HTML (ya visible por defecto)
  const loader = document.getElementById('initialLoader');
  if (loader) {
    loader.classList.remove('hidden');
  }
}

function hideLoadingIndicator() {
  const loader = document.getElementById('initialLoader');
  if (loader) {
    loader.classList.add('hidden');
  }
  
  // También ocultar el loader dinámico si existe (backward compatibility)
  const dynamicLoader = document.getElementById('pdfLoader');
  if (dynamicLoader) {
    dynamicLoader.style.display = 'none';
  }
}

// Llamar a la inicialización del modal cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', function() {
  // Esperar un poco para asegurar que todo esté cargado
  setTimeout(initRecipientsModal, 1000);
});
