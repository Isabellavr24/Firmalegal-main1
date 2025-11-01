// ===== Estado =====
let pdfBytes = null;   // ArrayBuffer del PDF original
let pdfDoc   = null;   // PDF.js document
let currentFile = null; // Archivo actual
let currentDocTitle = null; // Título del documento actual

// ✅ Variables para manejo de múltiples páginas
let allPages = []; // Array de objetos página: {pageNum, canvas, overlay, viewport}

let pagesContainer; // Contenedor de todas las páginas
let fields = []; // {id,type:'signature'|'text'|'date',page,x,y,w,h,dataUrl?,value?,signed?}
let placingFieldType = null; // 'signature', 'text', 'date'

// Estado del modo y documento actual
let currentMode = null; // 'prepare' o 'sign'
let currentDocId = null; // ID del documento actual

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
        alert('Error: PDF.js no se cargó. Por favor:\n1. Verifica tu conexión a internet\n2. Recarga la página\n3. Revisa la consola para más detalles');
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
  
  // Inicializar eventos de overlay (colocar campos)
  initOverlayEvents();
  
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
          alert('❌ Error al cargar el documento. Por favor, súbelo manualmente.');
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
      alert('❌ Debes iniciar sesión');
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
    alert(`❌ Error al cargar el documento: ${error.message}`);
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
    existingFields.forEach((field, index) => {
      const fieldData = {
        id: `field-${Date.now()}-${index}`,
        field_id: field.field_id, // ✅ Guardar field_id de la base de datos
        type: field.type,
        page: field.page || 1,
        x: parseFloat(field.x),
        y: parseFloat(field.y),
        w: parseFloat(field.width),
        h: parseFloat(field.height),
        label: field.label || null,
        required: field.required !== false,
        signed: false,
        dataUrl: null
      };

      fields.push(fieldData);
      console.log(`   ✓ Campo ${index + 1}: ${field.type} en página ${field.page} (field_id: ${field.field_id})`);
      
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

    const labels = {signature: 'Firma', text: 'Texto', date: 'Fecha'};
    el.innerHTML = `
      <span class="label">${labels[fieldData.type]}</span>
      <button class="delete-btn" title="Eliminar">×</button>
    `;

    // Agregar event listeners
    el.addEventListener('click', openFieldModal);
    el.addEventListener('mousedown', startDragField);

    // Evento del botón eliminar
    const deleteBtn = el.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteField(fieldData.id, fieldData.page);
    });

    // Agregar al overlay de la página
    pageData.overlay.appendChild(el);

    console.log(`   ✓ Campo renderizado: ${fieldData.type} en (${fieldData.x}, ${fieldData.y})`);

  } catch (error) {
    console.error('❌ Error al renderizar campo:', fieldData, error);
  }
}

// ===== Cargar Archivo (PDF o Word) =====
async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if(!file) return;

  try {
    // Verificar tipo de archivo
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // Guardar referencia al archivo
      currentFile = file;
      
      // ✅ Mostrar loader ANTES de cargar
      showLoadingIndicator();
      
      // Es un PDF, cargar directamente
      await loadPDF(file);
      
      // Actualizar info del documento
      updateDocInfo();
    } else {
      alert('⚠️ Formato no soportado. Por favor sube un archivo PDF.');
      document.getElementById('pdfFile').value = '';
      return;
    }
  } catch (error) {
    console.error('❌ Error al cargar archivo:', error);
    alert('Error al cargar el archivo: ' + error.message);
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
  
  try {
    console.log('📄 Cargando PDF con todas las páginas...');
    
    pdfBytes = await file.arrayBuffer();
    pdfDoc   = await pdfjsLib.getDocument({data: pdfBytes}).promise;
    
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
    initOverlayEvents();
    
    // Generar miniatura de la primera página
    await generateThumbnail();
    
    console.log('✅ PDF cargado completamente:', numPages, 'páginas | DPR:', dpr);
    
  } catch (error) {
    console.error('❌ Error al cargar PDF:', error);
    alert('Error al cargar el PDF. Por favor, intenta con otro archivo.');
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

// ===== Inicializar eventos de overlay (MULTIPÁGINA con DIBUJO) =====
function initOverlayEvents() {
  const toolSign = document.getElementById('toolSign');
  const toolText = document.getElementById('toolText');
  const toolDate = document.getElementById('toolDate');
  
  if (toolSign) {
    toolSign.addEventListener('click', ()=>{
      console.log('🖊️ Click en herramienta de firma');
      if(allPages.length === 0){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'signature';
      // Cambiar cursor en todos los overlays
      allPages.forEach(p => p.overlay.style.cursor = 'crosshair');
      console.log('✅ Modo dibujo de firma activado - Arrastra para dibujar');
    });
    console.log('✅ Event listener para botón de firma agregado');
  }
  
  if (toolText) {
    toolText.addEventListener('click', ()=>{
      console.log('📝 Click en herramienta de texto');
      if(allPages.length === 0){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'text';
      allPages.forEach(p => p.overlay.style.cursor = 'crosshair');
      console.log('✅ Modo dibujo de texto activado - Arrastra para dibujar');
    });
    console.log('✅ Event listener para botón de texto agregado');
  }
  
  if (toolDate) {
    toolDate.addEventListener('click', ()=>{
      console.log('📅 Click en herramienta de fecha');
      if(allPages.length === 0){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'date';
      allPages.forEach(p => p.overlay.style.cursor = 'crosshair');
      console.log('✅ Modo dibujo de fecha activado - Arrastra para dibujar');
    });
    console.log('✅ Event listener para botón de fecha agregado');
  }

  // ✅ Agregar event listeners para DIBUJAR campos en todos los overlays
  allPages.forEach(pageData => {
    // MOUSEDOWN: Iniciar dibujo
    pageData.overlay.addEventListener('mousedown', (e)=>{
      // Solo si hay una herramienta seleccionada
      if(!placingFieldType) return;
      
      // Ignorar si es click en un campo existente
      if(e.target.closest('.field')) return;
      
      console.log(`🎨 Iniciando dibujo de ${placingFieldType} en página ${pageData.pageNum}`);
      
      isDrawingField = true;
      drawingOnPage = pageData;
      
      const rect = pageData.overlay.getBoundingClientRect();
      drawStartX = e.clientX - rect.left;
      drawStartY = e.clientY - rect.top;
      
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
    });
    
    // MOUSEMOVE: Actualizar tamaño del rectángulo mientras dibuja
    pageData.overlay.addEventListener('mousemove', (e)=>{
      if(!isDrawingField || !drawRect || drawingOnPage !== pageData) return;
      
      const rect = pageData.overlay.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      const width = Math.abs(currentX - drawStartX);
      const height = Math.abs(currentY - drawStartY);
      const left = Math.min(currentX, drawStartX);
      const top = Math.min(currentY, drawStartY);
      
      drawRect.style.left = left + 'px';
      drawRect.style.top = top + 'px';
      drawRect.style.width = width + 'px';
      drawRect.style.height = height + 'px';
    });
    
    // MOUSEUP: Finalizar dibujo y crear campo
    pageData.overlay.addEventListener('mouseup', (e)=>{
      if(!isDrawingField || !drawRect || drawingOnPage !== pageData) return;
      
      const rect = pageData.overlay.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
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
      el.dataset.page = pageData.pageNum;
      
      const labels = {signature: 'Firma', text: 'Texto', date: 'Fecha'};
      el.innerHTML = `
        <span class="label">${labels[placingFieldType]}</span>
        <button class="delete-btn" title="Eliminar">×</button>
      `;
      el.addEventListener('click', openFieldModal);
      el.addEventListener('mousedown', startDragField);
      
      // Agregar evento al botón de eliminar
      const deleteBtn = el.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteField(id, pageData.pageNum);
      });
      
      pageData.overlay.appendChild(el);

      fields.push({
        id, 
        type: placingFieldType, 
        page: pageData.pageNum,
        x: left, 
        y: top, 
        w: width, 
        h: height, 
        value: null, 
        signed: false
      });

      // Resetear estado de dibujo
      placingFieldType = null;
      isDrawingField = false;
      drawRect = null;
      drawingOnPage = null;
      allPages.forEach(p => p.overlay.style.cursor = 'default');
      
      console.log(`✅ Campo colocado en página ${pageData.pageNum} con ID:`, id);
    });
  });
  
  console.log('✅ Event listeners de dibujo configurados para', allPages.length, 'páginas');
}

// ===== Eliminar campo =====
function deleteField(fieldId, pageNum){
  // Confirmar eliminación
  if(!confirm('¿Eliminar este campo?')) return;
  
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

// ===== Arrastrar campos =====
let draggingField = null;
let dragStartX = 0;
let dragStartY = 0;
let fieldStartX = 0;
let fieldStartY = 0;
let hasMoved = false;

function startDragField(e){
  // Solo arrastrar con botón izquierdo del mouse
  if(e.button !== 0) return;
  
  // No arrastrar si estamos colocando un nuevo campo
  if(placingFieldType) return;
  
  draggingField = e.currentTarget;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  fieldStartX = parseInt(draggingField.style.left) || 0;
  fieldStartY = parseInt(draggingField.style.top) || 0;
  hasMoved = false;
  
  document.addEventListener('mousemove', dragField);
  document.addEventListener('mouseup', stopDragField);
}

function dragField(e){
  if(!draggingField) return;
  
  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;
  
  // Solo considerar movimiento si se movió más de 5px
  if(Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5){
    hasMoved = true;
    e.stopPropagation();
    
    const newX = fieldStartX + deltaX;
    const newY = fieldStartY + deltaY;
    
    draggingField.style.left = newX + 'px';
    draggingField.style.top = newY + 'px';
  }
}

function stopDragField(e){
  if(!draggingField) return;
  
  // Si se movió, actualizar posición
  if(hasMoved){
    e.stopPropagation();
    e.preventDefault();
    
    const fieldId = draggingField.dataset.id;
    const field = fields.find(f => f.id === fieldId);
    if(field){
      field.x = parseInt(draggingField.style.left) || 0;
      field.y = parseInt(draggingField.style.top) || 0;
    }
    console.log('✅ Campo movido a nueva posición');
    
    // Mantener hasMoved en true por un momento más largo para evitar abrir modal
    setTimeout(() => {
      hasMoved = false;
    }, 200);
  } else {
    hasMoved = false;
  }
  
  draggingField = null;
  document.removeEventListener('mousemove', dragField);
  document.removeEventListener('mouseup', stopDragField);
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
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  
  e.stopPropagation();
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
  el.addEventListener('click', openFieldModal);
  el.addEventListener('mousedown', startDragField);
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

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
  if(!textValue){ alert('Escribe algo de texto'); return; }
  
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
  el.addEventListener('click', openFieldModal);
  el.addEventListener('mousedown', startDragField);
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

  hideModal();
}

// Confirmar fecha
function confirmDate(){
  if(!activeFieldId) return;
  const dateValue = document.getElementById('dateInput').value;
  if(!dateValue){ alert('Selecciona una fecha'); return; }
  
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
  el.addEventListener('click', openFieldModal);
  el.addEventListener('mousedown', startDragField);
  const deleteBtn = el.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(activeFieldId);
  });

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
  if(!pdfBytes){ alert('Sube un PDF'); return; }

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
async function saveFieldsToBackend() {
  console.log('💾 Guardando campos en el backend...');

  if (!currentDocId) {
    alert('❌ Error: No se ha cargado ningún documento');
    return;
  }

  if (fields.length === 0) {
    alert('⚠️ No has colocado ningún campo. Usa las herramientas de la derecha para agregar campos de firma, texto o fecha.');
    return;
  }

  try {
    // ✅ CORREGIDO: Obtener información del usuario (no hay token JWT en este sistema)
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) {
      alert('❌ Debes iniciar sesión');
      window.location.href = '/login.html';
      return;
    }

    const user = JSON.parse(userStr);
    console.log('👤 Usuario actual:', user.email);

    // Preparar datos de los campos
    const fieldsData = fields.map(f => ({
      type: f.type,
      page: f.page || 1,
      x: parseFloat(f.x),
      y: parseFloat(f.y),
      width: parseFloat(f.w),
      height: parseFloat(f.h),
      label: f.label || null,
      required: f.required !== false
    }));

    console.log('📤 Enviando campos al backend:', fieldsData);

    // Mostrar indicador de carga
    const saveBtn = document.getElementById('saveBtn');
    const originalText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) saveBtn.textContent = 'GUARDANDO...';

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
      
      alert(`✅ ${fieldsData.length} campo${fieldsData.length > 1 ? 's' : ''} guardado${fieldsData.length > 1 ? 's' : ''} exitosamente.\n\nRedirigiendo a vista de seguimiento...`);

      // Redirigir a tracking
      const docName = currentDocTitle || 'Documento';
      window.location.href = `/tracking.html?id=${currentDocId}&name=${encodeURIComponent(docName)}`;

    } else {
      throw new Error(data.error || 'Error al guardar campos');
    }

  } catch (error) {
    console.error('❌ Error al guardar campos:', error);
    alert(`❌ Error al guardar campos: ${error.message}`);
  }
}

// ===== Guardar PDF firmado (flujo antiguo) =====
async function saveSignedPDF(){
  const sigs = fields.filter(f=>f.type==='signature' && f.signed && f.dataUrl);
  if(sigs.length===0){ alert('No hay firmas colocadas'); return; }

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
    alert('Error al generar PDF: ' + error.message);
  }
}

// ===== MODAL DE DESTINATARIOS =====
function initRecipientsModal() {
  const sendBtn = document.getElementById('sendBtn');
  const recipientsModal = document.getElementById('recipientsModal');
  const recipientsClose = document.getElementById('recipientsClose');
  const recipientsCancel = document.getElementById('recipientsCancel');
  const recipientsAdd = document.getElementById('recipientsAdd');
  const recipientsTabs = document.querySelectorAll('.recipients-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Abrir modal al hacer clic en ENVIAR
  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      console.log('📧 Abriendo modal de destinatarios...');
      if (recipientsModal) {
        recipientsModal.setAttribute('aria-hidden', 'false');
        recipientsModal.style.display = 'flex';
      }
    });
  }

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

      console.log(`📑 Pestaña cambiada a: ${tabName}`);
    });
  });

  // Agregar destinatarios
  if (recipientsAdd) {
    recipientsAdd.addEventListener('click', function() {
      console.log('✅ Agregando destinatarios...');

      // Obtener el tab activo
      const activeTab = document.querySelector('.recipients-tab.active');
      const tabType = activeTab ? activeTab.getAttribute('data-tab') : 'email';

      let recipients = [];

      if (tabType === 'email') {
        const emailInput = document.getElementById('emailInput');
        if (emailInput && emailInput.value.trim()) {
          recipients = emailInput.value.split('\n').filter(e => e.trim());
          console.log('📧 Destinatarios por email:', recipients);
        }
      } else if (tabType === 'phone') {
        const phoneInput = document.getElementById('phoneInput');
        if (phoneInput && phoneInput.value.trim()) {
          recipients = phoneInput.value.split('\n').filter(p => p.trim());
          console.log('📱 Destinatarios por teléfono:', recipients);
        }
      } else if (tabType === 'detailed') {
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

      if (recipients.length > 0) {
        alert(`✅ ${recipients.length} destinatario(s) agregado(s) correctamente`);
        closeRecipientsModal();

        // Aquí puedes agregar la lógica para enviar el documento
        // Por ejemplo: sendDocumentToRecipients(recipients);
      } else {
        alert('⚠️ Por favor ingresa al menos un destinatario');
      }
    });
  }

  console.log('✅ Modal de destinatarios inicializado');
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
