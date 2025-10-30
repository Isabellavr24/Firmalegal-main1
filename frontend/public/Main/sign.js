// ===== Estado =====
let pdfBytes = null;   // ArrayBuffer del PDF original
let pdfDoc   = null;   // PDF.js document
let page     = null;   // primera página
let viewport = null;
let scale    = 1.4;
let currentFile = null; // Archivo actual

let pdfCanvas, overlay, pageWrap, ctx;
const fields = []; // {id,type:'signature'|'text'|'date',page,x,y,w,h,dataUrl?,value?,signed?}
let placingFieldType = null; // 'signature', 'text', 'date'

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

    // Inicializar elementos del DOM
    pdfCanvas = document.getElementById('pdfCanvas');
    overlay   = document.getElementById('overlay');
    pageWrap  = document.getElementById('pageWrap');
    ctx       = pdfCanvas.getContext('2d');

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

      if (docNameEl) docNameEl.textContent = docData.name;
      if (docMetaEl) docMetaEl.textContent = docData.fileName;

      // Actualizar título de la barra
      const barTitle = document.querySelector('.bar strong');
      if (barTitle) barTitle.textContent = docData.name;

      // Convertir base64 a Blob y cargar el PDF
      fetch(docData.fileData)
        .then(res => res.blob())
        .then(blob => {
          console.log('✅ PDF convertido a Blob, cargando...');

          // Crear un File object desde el Blob
          const file = new File([blob], docData.fileName, { type: docData.fileType });

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
        });

    } catch (error) {
      console.error('❌ Error al parsear documento pendiente:', error);
      sessionStorage.removeItem('pendingDocument');
    }
  } else {
    console.log('ℹ️ No hay documento pendiente en sessionStorage');
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
  }
}

// ===== Actualizar información del documento =====
function updateDocInfo() {
  const docInfo = document.getElementById('docInfo');
  if (!docInfo || !currentFile) return;
  
  const fileName = currentFile.name;
  const fileSize = (currentFile.size / 1024).toFixed(1); // KB
  const fileSizeStr = fileSize > 1024 ? (fileSize / 1024).toFixed(1) + ' MB' : fileSize + ' KB';
  
  docInfo.innerHTML = `
    <div class="doc-name" title="${fileName}">${fileName}</div>
    <div class="doc-meta">${fileSizeStr} • ${pdfDoc?.numPages || 1} página${pdfDoc?.numPages > 1 ? 's' : ''}</div>
  `;
}

// ===== Cargar PDF =====
async function loadPDF(file) {
  pdfBytes = await file.arrayBuffer();
  pdfDoc   = await pdfjsLib.getDocument({data: pdfBytes}).promise;
  page     = await pdfDoc.getPage(1);
  viewport = page.getViewport({ scale });

  pdfCanvas.width  = viewport.width;
  pdfCanvas.height = viewport.height;
  pageWrap.style.width  = viewport.width + 'px';
  pageWrap.style.height = viewport.height + 'px';

  const renderCtx = { canvasContext: ctx, viewport };
  await page.render(renderCtx).promise;

  overlay.innerHTML = '';
  fields.length = 0;
  
  // Generar miniatura
  await generateThumbnail();
  
  console.log('✅ PDF cargado correctamente');
}

// ===== Generar miniatura del PDF =====
async function generateThumbnail() {
  const thumbContainer = document.querySelector('.thumb');
  if (!thumbContainer || !page) return;
  
  // Crear un canvas temporal para la miniatura
  const thumbCanvas = document.createElement('canvas');
  const thumbCtx = thumbCanvas.getContext('2d');
  
  // Calcular escala mucho más alta para mejor calidad (escala 2.0 = muy alta calidad)
  const thumbScale = 2.0; // Aumentado significativamente para mejor legibilidad
  const thumbViewport = page.getViewport({ scale: thumbScale });
  
  // Usar devicePixelRatio para máxima calidad
  const dpr = window.devicePixelRatio || 2;
  
  // Configurar canvas con máxima resolución
  thumbCanvas.width = thumbViewport.width * dpr;
  thumbCanvas.height = thumbViewport.height * dpr;
  
  // Escalar el contexto
  thumbCtx.scale(dpr, dpr);
  
  // Renderizar con máxima calidad
  await page.render({
    canvasContext: thumbCtx,
    viewport: thumbViewport,
    intent: 'display' // Optimizar para visualización
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
  
  console.log('✅ Miniatura generada en máxima resolución (escala 2.0)');
}

// ===== Colocar campos =====
// Inicializar eventos de overlay dentro de la función init
function initOverlayEvents() {
  const toolSign = document.getElementById('toolSign');
  const toolText = document.getElementById('toolText');
  const toolDate = document.getElementById('toolDate');
  
  if (toolSign) {
    toolSign.addEventListener('click', ()=>{
      console.log('🖊️ Click en herramienta de firma');
      if(!page){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'signature';
      overlay.style.cursor = 'crosshair';
      console.log('✅ Modo colocación de firma activado');
    });
    console.log('✅ Event listener para botón de firma agregado');
  }
  
  if (toolText) {
    toolText.addEventListener('click', ()=>{
      console.log('📝 Click en herramienta de texto');
      if(!page){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'text';
      overlay.style.cursor = 'crosshair';
      console.log('✅ Modo colocación de texto activado');
    });
    console.log('✅ Event listener para botón de texto agregado');
  }
  
  if (toolDate) {
    toolDate.addEventListener('click', ()=>{
      console.log('📅 Click en herramienta de fecha');
      if(!page){ alert('Primero sube un PDF'); return; }
      placingFieldType = 'date';
      overlay.style.cursor = 'crosshair';
      console.log('✅ Modo colocación de fecha activado');
    });
    console.log('✅ Event listener para botón de fecha agregado');
  }

  overlay.addEventListener('click', (e)=>{
    console.log('👆 Click detectado en overlay');
    console.log('   - placingFieldType:', placingFieldType);
    
    if(!placingFieldType) {
      console.log('⚠️ Click en overlay pero no hay herramienta seleccionada');
      return;
    }
    
    // Prevenir propagación si es un field existente
    if(e.target.closest('.field')) {
      console.log('⚠️ Click en un field existente, ignorando');
      return;
    }
    
    console.log('📍 Colocando campo de', placingFieldType);
    const rect = overlay.getBoundingClientRect();
    const w = placingFieldType === 'signature' ? 220 : (placingFieldType === 'date' ? 180 : 250);
    const h = 70;
    const x = e.clientX - rect.left - w/2;
    const y = e.clientY - rect.top  - h/2;

    const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const el = document.createElement('div');
    el.className = `field ${placingFieldType}`;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.width  = w + 'px';
    el.style.height = h + 'px';
    el.dataset.id = id;
    el.dataset.type = placingFieldType;
    
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
      deleteField(id);
    });
    
    overlay.appendChild(el);

    fields.push({id, type:placingFieldType, page:1, x, y, w, h, value:null, signed:false});

    placingFieldType = null;
    overlay.style.cursor = 'default';
    console.log('✅ Campo colocado con ID:', id);
  });
  
  console.log('✅ Event listeners de overlay configurados');
}

// ===== Eliminar campo =====
function deleteField(fieldId){
  // Confirmar eliminación
  if(!confirm('¿Eliminar este campo?')) return;
  
  // Eliminar del DOM
  const el = overlay.querySelector(`.field[data-id="${fieldId}"]`);
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

// Llamar a la inicialización del modal cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', function() {
  // Esperar un poco para asegurar que todo esté cargado
  setTimeout(initRecipientsModal, 1000);
});
