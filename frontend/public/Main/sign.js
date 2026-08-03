// ===== Barra flotante de formato de texto =====
let _activeFormatBar = null;

function hideFormatBar() {
  if (_activeFormatBar) {
    _activeFormatBar.remove();
    _activeFormatBar = null;
  }
}

function showTextFormatBar(fieldEl, fieldId) {
  hideFormatBar();

  const field = fields.find(f => f.id === fieldId);
  const fmt = (field && field.format) || {};

  const bar = document.createElement('div');
  bar.className = 'text-format-bar';
  bar.dataset.fieldId = fieldId;

  // Valores actuales
  const curFont = fmt.fontFamily || 'Arial';
  const curSize = fmt.fontSize || '12';
  const curColor = fmt.fontColor || '#000000';
  const curBold = fmt.isBold ? 'active' : '';
  const curItalic = fmt.isItalic ? 'active' : '';
  const curUnder = fmt.isUnderline ? 'active' : '';
  const curAlign = fmt.textAlign || 'left';
  const curValign = fmt.verticalAlign || 'top';

  bar.innerHTML = `
    <div class="tfb-row">
      <select class="tfb-select tfb-font" title="Fuente">
        <option value="Arial" ${curFont==='Arial'?'selected':''}>Arial</option>
        <option value="Helvetica" ${curFont==='Helvetica'?'selected':''}>Helvetica</option>
        <option value="Times New Roman" ${curFont==='Times New Roman'?'selected':''}>Times New Roman</option>
        <option value="Courier New" ${curFont==='Courier New'?'selected':''}>Courier New</option>
        <option value="Georgia" ${curFont==='Georgia'?'selected':''}>Georgia</option>
        <option value="Verdana" ${curFont==='Verdana'?'selected':''}>Verdana</option>
        <option value="Calibri" ${curFont==='Calibri'?'selected':''}>Calibri</option>
        <option value="Cambria" ${curFont==='Cambria'?'selected':''}>Cambria</option>
        <option value="Palatino Linotype" ${curFont==='Palatino Linotype'?'selected':''}>Palatino Linotype</option>
        <option value="Book Antiqua" ${curFont==='Book Antiqua'?'selected':''}>Book Antiqua</option>
      </select>
      <select class="tfb-select tfb-size" title="Tamaño">
        ${[6,7,8,9,10,11,12,14,16,18,20,22,24,28,32].map(s=>`<option value="${s}" ${curSize==s?'selected':''}>${s}</option>`).join('')}
      </select>
      <input type="color" class="tfb-color" value="${curColor}" title="Color de texto">
      <div class="tfb-sep"></div>
      <button class="tfb-btn ${curBold}" data-fmt="bold" title="Negrita"><b>B</b></button>
      <button class="tfb-btn ${curItalic}" data-fmt="italic" title="Cursiva"><i>I</i></button>
      <button class="tfb-btn ${curUnder}" data-fmt="underline" title="Subrayado"><u>U</u></button>
      <div class="tfb-sep"></div>
      <button class="tfb-btn ${curAlign==='left'?'active':''}" data-align="left" title="Izquierda">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2"/><rect x="1" y="6" width="8" height="2"/><rect x="1" y="10" width="12" height="2"/></svg>
      </button>
      <button class="tfb-btn ${curAlign==='center'?'active':''}" data-align="center" title="Centrar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2"/><rect x="3" y="6" width="8" height="2"/><rect x="1" y="10" width="12" height="2"/></svg>
      </button>
      <button class="tfb-btn ${curAlign==='right'?'active':''}" data-align="right" title="Derecha">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="2" width="12" height="2"/><rect x="5" y="6" width="8" height="2"/><rect x="1" y="10" width="12" height="2"/></svg>
      </button>
      <div class="tfb-sep"></div>
      <button class="tfb-btn ${curValign==='top'?'active':''}" data-valign="top" title="Arriba">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="1" y="1" width="12" height="2"/><rect x="4" y="4" width="6" height="2"/><rect x="4" y="7" width="6" height="2"/></svg>
      </button>
      <button class="tfb-btn ${curValign==='middle'?'active':''}" data-valign="middle" title="Medio">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="4" y="2" width="6" height="2"/><rect x="1" y="6" width="12" height="2"/><rect x="4" y="10" width="6" height="2"/></svg>
      </button>
      <button class="tfb-btn ${curValign==='bottom'?'active':''}" data-valign="bottom" title="Abajo">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="4" y="4" width="6" height="2"/><rect x="4" y="7" width="6" height="2"/><rect x="1" y="11" width="12" height="2"/></svg>
      </button>
      <div class="tfb-sep"></div>
      <button class="tfb-btn tfb-edit-btn" data-action="edit" title="Editar texto">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="tfb-btn tfb-close-btn" data-action="close" title="Cerrar">×</button>
    </div>
    <div class="tfb-preview-row">
      <span class="tfb-preview-label">Vista previa:</span>
      <div class="tfb-preview"></div>
    </div>
  `;

  // Posicionar encima del campo
  const overlay = fieldEl.closest('.page-overlay') || fieldEl.parentElement;
  const overlayRect = overlay.getBoundingClientRect();
  const fieldRect = fieldEl.getBoundingClientRect();

  bar.style.position = 'fixed';
  bar.style.left = Math.max(8, fieldRect.left) + 'px';
  bar.style.top = (fieldRect.top - 8) + 'px';
  bar.style.transform = 'translateY(-100%)';
  bar.style.zIndex = '99999';

  document.body.appendChild(bar);
  _activeFormatBar = bar;

  // Asegurar que no se salga por arriba
  const barRect = bar.getBoundingClientRect();
  if (barRect.top < 8) {
    bar.style.top = (fieldRect.bottom + 8) + 'px';
    bar.style.transform = 'none';
  }
  // Asegurar que no se salga por la derecha
  const barRect2 = bar.getBoundingClientRect();
  if (barRect2.right > window.innerWidth - 8) {
    bar.style.left = Math.max(8, window.innerWidth - barRect2.width - 8) + 'px';
  }

  function updateBarPreview() {
    const preview = bar.querySelector('.tfb-preview');
    if (!preview) return;
    const font = bar.querySelector('.tfb-font').value;
    const size = parseInt(bar.querySelector('.tfb-size').value);
    const color = bar.querySelector('.tfb-color').value;
    const bold = bar.querySelector('[data-fmt="bold"]').classList.contains('active');
    const italic = bar.querySelector('[data-fmt="italic"]').classList.contains('active');
    const under = bar.querySelector('[data-fmt="underline"]').classList.contains('active');
    const align = bar.querySelector('[data-align].active')?.dataset.align || 'left';
    const valign = bar.querySelector('[data-valign].active')?.dataset.valign || 'top';
    const text = (field && field.value) || (field && field.label) || 'Texto de muestra';
    const alignItems = valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start';
    const justifyContent = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    preview.style.fontFamily = font;
    preview.style.fontSize = Math.min(size, 16) + 'px';
    preview.style.color = color;
    preview.style.fontWeight = bold ? 'bold' : 'normal';
    preview.style.fontStyle = italic ? 'italic' : 'normal';
    preview.style.textDecoration = under ? 'underline' : 'none';
    preview.style.display = 'flex';
    preview.style.alignItems = alignItems;
    preview.style.justifyContent = justifyContent;
    preview.style.textAlign = align;
    preview.innerHTML = `<span>${text}</span>`;
  }

  function applyFormatToField() {
    const font = bar.querySelector('.tfb-font').value;
    const size = bar.querySelector('.tfb-size').value;
    const color = bar.querySelector('.tfb-color').value;
    const bold = bar.querySelector('[data-fmt="bold"]').classList.contains('active');
    const italic = bar.querySelector('[data-fmt="italic"]').classList.contains('active');
    const under = bar.querySelector('[data-fmt="underline"]').classList.contains('active');
    const align = bar.querySelector('[data-align].active')?.dataset.align || 'left';
    const valign = bar.querySelector('[data-valign].active')?.dataset.valign || 'top';

    if (!field) return;
    field.format = { fontFamily: font, fontSize: size, fontColor: color, isBold: bold, isItalic: italic, isUnderline: under, textAlign: align, verticalAlign: valign };

    // Actualizar visual del campo si tiene texto
    if (field.value) {
      const fw = bold ? 'bold' : 'normal';
      const fs = italic ? 'italic' : 'normal';
      const td = under ? 'underline' : 'none';
      const ai = valign === 'middle' ? 'center' : valign === 'bottom' ? 'flex-end' : 'flex-start';
      const jc = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
      let fc = fieldEl.querySelector('.field-content');
      if (fc) {
        fc.style.fontFamily = font;
        fc.style.fontSize = size + 'px';
        fc.style.color = color;
        fc.style.fontWeight = fw;
        fc.style.fontStyle = fs;
        fc.style.textDecoration = td;
        fc.style.textAlign = align;
        fc.style.alignItems = ai;
        fc.style.justifyContent = jc;
      }
    }
  }

  // Listeners de controles
  bar.querySelector('.tfb-font').addEventListener('change', () => { applyFormatToField(); updateBarPreview(); });
  bar.querySelector('.tfb-size').addEventListener('change', () => { applyFormatToField(); updateBarPreview(); });
  bar.querySelector('.tfb-color').addEventListener('input', () => { applyFormatToField(); updateBarPreview(); });

  bar.querySelectorAll('[data-fmt]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.classList.toggle('active');
      applyFormatToField();
      updateBarPreview();
    });
  });

  bar.querySelectorAll('[data-align]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      bar.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFormatToField();
      updateBarPreview();
    });
  });

  bar.querySelectorAll('[data-valign]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      bar.querySelectorAll('[data-valign]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFormatToField();
      updateBarPreview();
    });
  });

  bar.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hideFormatBar();
    activeFieldId = fieldId;
    // Sincronizar valores del modal con el formato actual
    const f = fields.find(x => x.id === fieldId);
    if (f && f.format) {
      document.getElementById('fontFamily').value = f.format.fontFamily || 'Arial';
      document.getElementById('fontSize').value = f.format.fontSize || '12';
      document.getElementById('fontColor').value = f.format.fontColor || '#000000';
      const cp = document.getElementById('colorPreview');
      if (cp) cp.style.background = f.format.fontColor || '#000000';
      document.getElementById('boldBtn').classList.toggle('active', !!f.format.isBold);
      document.getElementById('italicBtn').classList.toggle('active', !!f.format.isItalic);
      const ub = document.getElementById('underlineBtn');
      if (ub) ub.classList.toggle('active', !!f.format.isUnderline);
      document.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('active', b.dataset.align === (f.format.textAlign || 'left')));
      document.querySelectorAll('[data-valign]').forEach(b => b.classList.toggle('active', b.dataset.valign === (f.format.verticalAlign || 'top')));
    }
    textModal.classList.add('show');
    textModal.setAttribute('aria-hidden', 'false');
    updateTextPreview();
  });

  bar.querySelector('[data-action="close"]').addEventListener('click', (e) => {
    e.stopPropagation();
    hideFormatBar();
  });

  bar.addEventListener('mousedown', (e) => e.stopPropagation());
  bar.addEventListener('click', (e) => e.stopPropagation());

  updateBarPreview();
}

// Aplica documentTextFormat a todos los campos de texto y actualiza indicadores visuales
function applyDocumentFormat(fmt) {
  documentTextFormat = fmt;
  fields.filter(f => f.type === 'text').forEach(f => { f.format = fmt ? Object.assign({}, fmt) : null; });
  refreshTextFieldFormatIndicators();
  updateFormatButtons();
}

// Refresca el indicador visual (borde + badge) en todos los campos de texto del DOM
function refreshTextFieldFormatIndicators() {
  document.querySelectorAll('.field[data-type="text"]').forEach(el => {
    if (documentTextFormat) {
      el.classList.add('text-formatted');
    } else {
      el.classList.remove('text-formatted');
    }
  });
}

// Actualiza el estado visible de los botones Formatear/Quitar formato
function updateFormatButtons() {
  const fmtBtn = document.getElementById('formatTextBtn');
  const clrBtn = document.getElementById('clearFormatBtn');
  const fmtDateBtn = document.getElementById('formatDateBtn');

  if (documentTextFormat) {
    if (fmtBtn) { fmtBtn.classList.remove('fmt-btn-hidden'); fmtBtn.classList.add('fmt-btn-visible', 'fmt-btn-active'); }
    if (clrBtn) { clrBtn.classList.remove('fmt-btn-hidden'); clrBtn.classList.add('fmt-btn-visible'); }
  } else {
    const hasText = fields.some(f => f.type === 'text');
    if (fmtBtn) {
      fmtBtn.classList.remove('fmt-btn-active');
      if (hasText) { fmtBtn.classList.remove('fmt-btn-hidden'); fmtBtn.classList.add('fmt-btn-visible'); }
      else { fmtBtn.classList.remove('fmt-btn-visible'); fmtBtn.classList.add('fmt-btn-hidden'); }
    }
    if (clrBtn) { clrBtn.classList.remove('fmt-btn-visible'); clrBtn.classList.add('fmt-btn-hidden'); }
  }

  // Botón "Formatear fecha": visible solo si hay campos de fecha en modo prepare
  if (fmtDateBtn) {
    const hasDate = fields.some(f => f.type === 'date');
    if (hasDate && currentMode === 'prepare') {
      fmtDateBtn.classList.remove('fmt-btn-hidden'); fmtDateBtn.classList.add('fmt-btn-visible');
    } else {
      fmtDateBtn.classList.remove('fmt-btn-visible'); fmtDateBtn.classList.add('fmt-btn-hidden');
    }
  }
}

// ===== Toast de confirmación de mapeo =====
let _mapeoToastTimer = null;
function showMapeoToast(label) {
  let toast = document.getElementById('mapeoToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mapeoToast';
    toast.className = 'mapeo-toast';
    document.body.appendChild(toast);
  }
  if (label) {
    toast.innerHTML = `Mapeado a: <span class="mapeo-toast-label">"${label}"</span>`;
    toast.style.background = '#2a0d31';
  } else {
    toast.innerHTML = `Sin mapeo — coloca el campo junto a un texto del PDF`;
    toast.style.background = '#c2185b';
  }
  toast.classList.add('visible');
  clearTimeout(_mapeoToastTimer);
  _mapeoToastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

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

// Formato de texto a nivel de documento (aplica a todos los campos de texto)
let documentTextFormat = null;

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
  const resetTextModalTitle = () => {
    _formattingDateFieldId = null;
    const modalTitle = document.querySelector('#textModal h3');
    if (modalTitle) modalTitle.lastChild.textContent = ' Personalizar Texto';
    hideModal();
  };
  if (textCancelBtn) textCancelBtn.onclick = resetTextModalTitle;
  if (textCloseBtn) textCloseBtn.onclick = resetTextModalTitle;
  if (textOkBtn) textOkBtn.onclick = confirmText;
  
  // Botones de estilo de texto
  const boldBtn = document.getElementById('boldBtn');
  const italicBtn = document.getElementById('italicBtn');
  const underlineBtn = document.getElementById('underlineBtn');
  const alignButtons = document.querySelectorAll('[data-align]');
  const valignButtons = document.querySelectorAll('[data-valign]');

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

  valignButtons.forEach(btn => {
    btn.onclick = function() {
      valignButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      updateTextPreview();
    };
  });
  
  // Vista previa en tiempo real
  const fontFamilySelect = document.getElementById('fontFamily');
  const fontSizeSelect = document.getElementById('fontSize');
  const fontColorInput = document.getElementById('fontColor');

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

  // Botón "Formatear texto" en barra superior
  const formatTextBtn = document.getElementById('formatTextBtn');
  if (formatTextBtn) {
    formatTextBtn.addEventListener('click', () => {
      // Usar el campo de texto activo, o el primero disponible (solo para tener un activeFieldId)
      let field = null;
      if (activeFieldId) field = fields.find(f => f.id === activeFieldId && f.type === 'text');
      if (!field) field = fields.find(f => f.type === 'text');
      if (field) activeFieldId = field.id;
      // Abrir modal con el formato actual del documento (no del campo individual)
      const fmtRef = { format: documentTextFormat };
      openTextFormatModal(fmtRef);
    });
  }

  // Botón "Quitar formato" en barra superior
  const clearFormatBtn = document.getElementById('clearFormatBtn');
  if (clearFormatBtn) {
    clearFormatBtn.addEventListener('click', () => {
      applyDocumentFormat(null);
      toast.info('Formato quitado — los campos usarán el estilo por defecto');
    });
  }

  // Botón "Formatear fecha" en barra superior
  const formatDateBtn = document.getElementById('formatDateBtn');
  if (formatDateBtn) {
    formatDateBtn.addEventListener('click', () => {
      let field = null;
      if (activeFieldId) field = fields.find(f => f.id === activeFieldId && f.type === 'date');
      if (!field) field = fields.find(f => f.type === 'date');
      if (!field) return;
      _formattingDateFieldId = field.id;
      activeFieldId = field.id;
      // Cambiar título del modal a "Personalizar Fecha"
      const modalTitle = document.querySelector('#textModal h3');
      if (modalTitle) modalTitle.lastChild.textContent = ' Personalizar Fecha';
      openTextFormatModal({ format: field.format });
    });
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
        field_id: field.field_id,
        type: field.type,
        page: field.page || 1,
        x: parseFloat(field.x) * VIEWPORT_SCALE,
        y: parseFloat(field.y) * VIEWPORT_SCALE,
        w: parseFloat(field.width) * VIEWPORT_SCALE,
        h: parseFloat(field.height) * VIEWPORT_SCALE,
        label: field.label || null,
        required: field.required !== false,
        signed: false,
        dataUrl: null,
        roleId: field.partId || null,
        roleName: field.roleName || null,
        roleColor: field.roleColor || null,
        format: field.format || null
      };

      fields.push(fieldData);

      // Si este campo tiene formato guardado y aún no tenemos documentTextFormat, tomarlo como referencia
      if (field.type === 'text' && field.format && !documentTextFormat) {
        documentTextFormat = Object.assign({}, field.format);
      }

      const partInfo = field.roleName ? ` - Parte: ${field.roleName}` : '';
      console.log(`   ✓ Campo ${index + 1}: ${field.type} en página ${field.page} (field_id: ${field.field_id})${partInfo}`);

      renderFieldOnPage(fieldData);
    });

    // Actualizar indicadores visuales y botones según el formato cargado
    refreshTextFieldFormatIndicators();
    updateFormatButtons();
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
      labelColor = '#2b0e31';
      fieldLabel = balanzaSvg.replace('currentColor', '#2b0e31').replace(/currentColor/g, '#2b0e31') + ' Firma Definitiva';
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
        <span class="label" style="color:#2b0e31;font-weight:600;">${fieldLabel}</span>
        <button class="delete-btn" title="Eliminar">×</button>
      `;
      el.style.borderColor = '#2b0e31';
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
      
      // Validar tamaño mínimo — el sello PKI requiere más espacio para el texto de acreditación
      const MIN_WIDTH = placingFieldType === 'seal' ? 150 : 50;
      const MIN_HEIGHT = placingFieldType === 'seal' ? 80 : 30;

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
          const HORIZONTAL_TOLERANCE = 20;

          // Función para puntuar candidatos: prioriza solape vertical real, luego distancia horizontal
          const scoreCandidates = (vTolerance) => {
            const result = [];
            for (const t of items) {
              const horizontalOverlap = (t.x + t.w + HORIZONTAL_TOLERANCE > fieldLeft) && (t.x - HORIZONTAL_TOLERANCE < fieldLeft + width);
              const verticalOverlap = (t.y + t.h + vTolerance > fieldTop) && (t.y - vTolerance < fieldTop + height);
              if (horizontalOverlap && verticalOverlap) {
                // Penalización vertical: cuánto se sale del campo en vertical
                const vCenter = fieldTop + height / 2;
                const tCenter = t.y + t.h / 2;
                const vPenalty = Math.max(0, Math.abs(vCenter - tCenter) - height / 2);
                const hDist = Math.max(0, fieldLeft - (t.x + t.w)); // distancia horizontal al borde izq del campo
                // Score: primero el que más solapa verticalmente, luego el más cercano horizontalmente
                const score = vPenalty * 10 + hDist;
                result.push({ ...t, score });
              }
            }
            result.sort((a, b) => a.score - b.score);
            return result;
          };

          // Intento 1: tolerancia cero (mismo renglón exacto)
          let candidates = scoreCandidates(0);
          // Intento 2: tolerancia pequeña si no hay candidatos exactos
          if (!candidates.length) candidates = scoreCandidates(6);
          // Intento 3: tolerancia amplia como fallback final
          if (!candidates.length) candidates = scoreCandidates(15);

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
            // Reunir fragmentos de la misma línea (mismo y ± 4px), ordenados de izq a der
            const LINE_TOLERANCE = 4;
            const sameLineItems = items
              .filter(t => Math.abs(t.y - best.y) <= LINE_TOLERANCE)
              .sort((a, b) => a.x - b.x);

            // --- Estrategia 1: buscar fragmento que termina en ':' antes del campo ---
            // Los labels de formulario casi siempre terminan en ':' (Nombre:, C.C. N°:, etc.)
            const FIELD_MARGIN = 80; // px de margen para buscar label con ':'
            const colonCandidate = [...sameLineItems]
              .reverse()
              .find(t =>
                t.str.trimEnd().endsWith(':') &&
                t.x < fieldLeft &&
                (t.x + t.w) <= fieldLeft + FIELD_MARGIN &&
                !/^_+$/.test(t.str.trim())
              );

            if (colonCandidate) {
              // Expandir hacia la izquierda desde el fragmento con ':' (captura "C.C. N°:")
              const colonIdx = sameLineItems.findIndex(t => t.idx === colonCandidate.idx);
              let start = colonIdx;
              for (let i = colonIdx; i > 0; i--) {
                const g = sameLineItems[i].x - (sameLineItems[i-1].x + sameLineItems[i-1].w);
                if (g >= 20 || /^_+$/.test(sameLineItems[i-1].str.trim())) { start = i; break; }
              }
              const group = sameLineItems.slice(start, colonIdx + 1);
              mappedLabel = group.map(t => t.str).join('').replace(/_+/g, '').replace(/\s+/g, ' ').trim();

            } else {
              // --- Estrategia 2: extracción posicional desde fragmentos largos ---
              // Cuando PDF.js fusiona todo en un fragmento (ej: "Responsable 1 ___ con C.C. n°__ mayores"),
              // estimamos qué palabra del string cae justo antes del fieldLeft usando proporción x/w,
              // y extraemos el segmento de texto entre el último guión bajo anterior y el campo.

              // Fragmentos que CONTIENEN el fieldLeft (el campo está dentro del fragmento)
              const containingFrag = sameLineItems.find(t =>
                t.x < fieldLeft && (t.x + t.w) > fieldLeft - 5 && !/^_+$/.test(t.str.trim())
              );

              if (containingFrag) {
                // El fragmento contiene el campo dentro de su span horizontal.
                const str = containingFrag.str;
                const charW = containingFrag.w / str.length; // ancho promedio por carácter
                const fieldLeftRel = fieldLeft - containingFrag.x; // px desde inicio del fragmento

                // Encontrar todos los rangos de guiones bajos en el string
                const underscoreRanges = [];
                const uRe = /_+/g;
                let um;
                while ((um = uRe.exec(str)) !== null) {
                  const startPx = um.index * charW;
                  const endPx = (um.index + um[0].length) * charW;
                  underscoreRanges.push({ start: um.index, end: um.index + um[0].length, startPx, endPx });
                }

                // Encontrar el rango de guiones que está justo a la izquierda del campo
                // (el campo empieza dentro o justo después de este rango)
                const leftUnder = underscoreRanges
                  .filter(r => r.startPx <= fieldLeftRel + charW * 3)
                  .sort((a, b) => b.startPx - a.startPx)[0];

                if (underscoreRanges.length === 0) {
                  // containingFrag es texto puro sin guiones (ej: "alumno(a)" solapado por el campo).
                  // El label es el grupo de fragmentos de texto consecutivos hasta el containingFrag inclusive,
                  // expandiendo hacia la izquierda mientras no haya guiones ni gap > 30px.
                  const contIdx = sameLineItems.findIndex(t => t === containingFrag);
                  let start = contIdx;
                  for (let i = contIdx; i > 0; i--) {
                    if (/^_+$/.test(sameLineItems[i-1].str.trim())) { start = i; break; }
                    const g = sameLineItems[i].x - (sameLineItems[i-1].x + sameLineItems[i-1].w);
                    if (g >= 30) { start = i; break; }
                    start = i - 1;
                  }
                  const group = sameLineItems.slice(start, contIdx + 1).filter(t => !/^_+$/.test(t.str.trim()));
                  let fullLabel = group[0].str;
                  for (let i = 1; i < group.length; i++) {
                    const gap = group[i].x - (group[i-1].x + group[i-1].w);
                    fullLabel += (gap > 2 ? ' ' : '') + group[i].str;
                  }
                  mappedLabel = fullLabel.replace(/\s+/g, ' ').trim()
                    .replace(/^(y|o|e)\s+/i, '').trim();

                } else if (leftUnder) {
                  // Encontrar el rango de guiones anterior a leftUnder (si existe)
                  const prevUnder = underscoreRanges
                    .filter(r => r.endPx <= leftUnder.startPx - 1)
                    .sort((a, b) => b.endPx - a.endPx)[0];

                  const textStart = prevUnder ? prevUnder.end : 0;
                  const textEnd = leftUnder.start;
                  const segment = str.substring(textStart, textEnd).trim();
                  if (segment.length >= 2) {
                    mappedLabel = segment.replace(/^(y|o|e)\s+/i, '').trim();
                  }

                  // Si el fragmento empieza con guiones y no hay texto útil dentro,
                  // buscar fragmentos de texto inmediatamente anteriores en la línea.
                  if (!mappedLabel) {
                    const contIdx2 = sameLineItems.findIndex(t => t === containingFrag);
                    const prevFrags = sameLineItems
                      .slice(0, contIdx2)
                      .filter(t => !/^_+$/.test(t.str.trim()) && t.str.trim().length >= 2);
                    if (prevFrags.length > 0) {
                      // Tomar grupo contiguo desde el más cercano hacia la izquierda
                      let gStart = prevFrags.length - 1;
                      for (let i = prevFrags.length - 1; i > 0; i--) {
                        const g = prevFrags[i].x - (prevFrags[i-1].x + prevFrags[i-1].w);
                        if (g >= 30) { gStart = i; break; }
                        gStart = i - 1;
                      }
                      const pg = prevFrags.slice(gStart);
                      let lbl = pg[0].str;
                      for (let i = 1; i < pg.length; i++) {
                        const g = pg[i].x - (pg[i-1].x + pg[i-1].w);
                        lbl += (g > 2 ? ' ' : '') + pg[i].str;
                      }
                      mappedLabel = lbl.replace(/\s+/g, ' ').trim()
                        .replace(/^(y|o|e)\s+/i, '').trim();
                    }
                  }
                }

                // Si no se extrajo nada útil, buscar a la derecha del campo
                if (!mappedLabel) {
                  const fieldRight = fieldLeft + width;
                  const afterFrag = sameLineItems.find(t =>
                    t.x >= fieldRight - 5 && t.x <= fieldRight + 80 &&
                    !/^_+$/.test(t.str.trim()) && t.str.trim().length > 1
                  );
                  if (afterFrag) {
                    mappedLabel = afterFrag.str.trim()
                      .replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '').trim();
                  }
                }
              } else {
                // --- Estrategia 3: fragmento virtual (parte antes del primer guión bajo) ---
                // Para fragmentos que terminan antes del campo.
                const virtualItems = [];
                for (const t of sameLineItems) {
                  const uIdx = t.str.search(/_+/);
                  if (uIdx > 0) {
                    const leftPart = t.str.substring(0, uIdx).trimEnd();
                    if (leftPart.length > 0) {
                      const ratio = uIdx / t.str.length;
                      virtualItems.push({ ...t, str: leftPart, w: t.w * ratio });
                    }
                  }
                  virtualItems.push(t);
                }
                virtualItems.sort((a, b) => a.x - b.x);

                // Candidatos a la izquierda: fragmentos sin guiones que terminan antes del campo.
                // Para fragmentos donde w incluye espacio hasta el siguiente elemento,
                // usamos el ancho real estimado (charW * chars_sin_espacios_finales).
                const candidatesLeft = virtualItems.filter(t => {
                  if (/^_+$/.test(t.str.trim())) return false;
                  if (t.x >= fieldLeft) return false;
                  const charW = t.str.length > 0 ? t.w / t.str.length : 0;
                  const textRight = t.x + charW * t.str.trimEnd().length;
                  return textRight <= fieldLeft + 20;
                });

                if (candidatesLeft.length > 0) {
                  const anchor = candidatesLeft.reduce((a, t) =>
                    (t.x + t.w) > (a.x + a.w) ? t : a
                  );
                  const anchorVIdx = virtualItems.findIndex(t => t === anchor);

                  let start = anchorVIdx;
                  for (let i = anchorVIdx; i > 0; i--) {
                    const g = virtualItems[i].x - (virtualItems[i-1].x + virtualItems[i-1].w);
                    if (g >= 30 || /^_+$/.test(virtualItems[i-1].str.trim())) {
                      start = i; break;
                    }
                  }

                  const group = virtualItems.slice(start, anchorVIdx + 1);
                  let fullLabel = group[0].str;
                  for (let i = 1; i < group.length; i++) {
                    const gap = group[i].x - (group[i-1].x + group[i-1].w);
                    fullLabel += (gap > 2 ? ' ' : '') + group[i].str;
                  }
                  mappedLabel = fullLabel
                    .replace(/_+/g, '').replace(/\s+/g, ' ').trim()
                    .replace(/^(y|o|e)\s+/i, '');
                } else {
                  // --- Estrategia 4: el label está a la DERECHA del campo (ej: "_____ Acudientes del alumno(a),")
                  // Buscar el fragmento de texto inmediatamente después del campo, sin guiones bajos.
                  const fieldRight = fieldLeft + width;
                  const candidatesRight = sameLineItems.filter(t =>
                    t.x >= fieldRight - 5 &&
                    t.x <= fieldRight + 80 &&
                    !/^_+$/.test(t.str.trim()) &&
                    t.str.trim().length > 1
                  );
                  if (candidatesRight.length > 0) {
                    const rightAnchor = candidatesRight.reduce((a, t) => t.x < a.x ? t : a);
                    // Tomar el fragmento y limpiar puntuación inicial/final
                    mappedLabel = rightAnchor.str.trim()
                      .replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '')
                      .replace(/^(y|o|e)\s+/i, '').trim();
                  }
                }
              }
            }

            console.log('[MAPEO PDF] Campo texto colocado:', {
              id,
              page: pageData.pageNum,
              coords: { left: fieldLeft, top: fieldTop, width, height },
              label_original: best.str,
              label_limpio: mappedLabel,
              label_coords: { x: best.x, y: best.y, w: best.w, h: best.h },
            });
          } else {
            console.warn('[MAPEO PDF] No se encontró texto alineado al campo:', {
              id,
              page: pageData.pageNum,
              coords: { left: fieldLeft, top: fieldTop, width, height },
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
        labelColor = '#2b0e31'; // Púrpura
        fieldLabel = '<svg style="width:14px;height:14px;vertical-align:middle;" viewBox="0 0 100 100" fill="none" stroke="#2b0e31" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="50" y1="8" x2="50" y2="85"/><rect x="28" y="85" width="44" height="8" rx="2" fill="#2b0e31" stroke="none"/><line x1="12" y1="20" x2="88" y2="20"/><circle cx="50" cy="20" r="4" fill="#2b0e31" stroke="none"/><line x1="20" y1="20" x2="16" y2="48"/><line x1="80" y1="20" x2="84" y2="48"/><path d="M8 48 Q16 60 24 48" fill="#2b0e31" stroke="none"/><path d="M76 48 Q84 60 92 48" fill="#2b0e31" stroke="none"/></svg> Firma Definitiva';
      } else if (roleName && roleColor) {
        fieldLabel = `${labels[placingFieldType]}: ${roleName}`;
        labelColor = roleColor;
      }
      
      const mappedBadge = (placingFieldType === 'text' && mappedLabel && mappedLabel.trim())
        ? `<span class="mapped-label-badge" title="Mapeado a: ${mappedLabel.trim()}">${mappedLabel.trim()}</span>`
        : (placingFieldType === 'text' ? `<span class="mapped-label-badge no-map" title="Sin mapeo — coloca el campo junto a un texto del PDF">Sin mapeo</span>` : '');

      if (placingFieldType === 'text') {
        showMapeoToast(mappedLabel && mappedLabel.trim() ? mappedLabel.trim() : null);
      }

      el.innerHTML = `
        <span class="label" style="color: ${labelColor}; font-weight: ${roleName || placingFieldType === 'seal' || placingFieldType === 'final_signature' ? '600' : '500'};">${fieldLabel}</span>
        ${mappedBadge}
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
        el.style.borderColor = '#2b0e31';
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

      // Para campos de fecha en modo prepare: insertar fecha de hoy automáticamente
      const isDateInPrepare = (placingFieldType === 'date' && currentMode === 'prepare');
      const todayValue = isDateInPrepare ? new Date().toISOString().split('T')[0] : null;

      fields.push({
        id,
        type: placingFieldType,
        page: pageData.pageNum,
        x: left,
        y: top,
        w: width,
        h: height,
        value: isDateInPrepare ? todayValue : null,
        signed: isDateInPrepare,
        label: labelToSave,
        roleId: roleId,
        roleName: roleName,
        roleColor: roleColor,
        format: (placingFieldType === 'text' && documentTextFormat) ? Object.assign({}, documentTextFormat) : null
      });

      // Mostrar la fecha inmediatamente en el campo visual
      if (isDateInPrepare) {
        const formattedDate = new Date(todayValue + 'T00:00:00').toLocaleDateString('es-ES', {year:'numeric', month:'long', day:'numeric'});
        el.classList.add('signed');
        el.innerHTML = `
          <span class="label">Fecha</span>
          <button class="delete-btn" title="Eliminar">×</button>
          <div class="field-content date-content">${formattedDate}</div>
        `;
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteField(id);
        });
        addResizeHandles(el);
      }

      // Aplicar indicador visual si ya hay formato activo
      if (placingFieldType === 'text' && documentTextFormat) {
        el.classList.add('text-formatted');
      }

      // Actualizar botones de formato
      if (placingFieldType === 'text' || placingFieldType === 'date') {
        updateFormatButtons();
      }
      
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
  updateFormatButtons();
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

  // Tamaño mínimo — el sello PKI necesita espacio para el texto de acreditación
  const fieldType = resizingField ? resizingField.dataset.type : '';
  const minWidth = fieldType === 'seal' ? 150 : 30;
  const minHeight = fieldType === 'seal' ? 80 : 30;

  // Calcular nuevas dimensiones según la dirección
  switch (resizeDirection) {
    case 'se': // Esquina inferior derecha
      newWidth = Math.max(minWidth, resizeStartWidth + deltaX);
      newHeight = Math.max(minHeight, resizeStartHeight + deltaY);
      break;

    case 'sw': // Esquina inferior izquierda
      newWidth = Math.max(minWidth, resizeStartWidth - deltaX);
      newHeight = Math.max(minHeight, resizeStartHeight + deltaY);
      if (newWidth > minWidth) newLeft = resizeStartLeft + deltaX;
      break;

    case 'ne': // Esquina superior derecha
      newWidth = Math.max(minWidth, resizeStartWidth + deltaX);
      newHeight = Math.max(minHeight, resizeStartHeight - deltaY);
      if (newHeight > minHeight) newTop = resizeStartTop + deltaY;
      break;

    case 'nw': // Esquina superior izquierda
      newWidth = Math.max(minWidth, resizeStartWidth - deltaX);
      newHeight = Math.max(minHeight, resizeStartHeight - deltaY);
      if (newWidth > minWidth) newLeft = resizeStartLeft + deltaX;
      if (newHeight > minHeight) newTop = resizeStartTop + deltaY;
      break;

    case 'e': // Borde derecho
      newWidth = Math.max(minWidth, resizeStartWidth + deltaX);
      break;

    case 'w': // Borde izquierdo
      newWidth = Math.max(minWidth, resizeStartWidth - deltaX);
      if (newWidth > minWidth) newLeft = resizeStartLeft + deltaX;
      break;

    case 's': // Borde inferior
      newHeight = Math.max(minHeight, resizeStartHeight + deltaY);
      break;

    case 'n': // Borde superior
      newHeight = Math.max(minHeight, resizeStartHeight - deltaY);
      if (newHeight > minHeight) newTop = resizeStartTop + deltaY;
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

  // Actualizar campo activo
  activeFieldId = draggingField.dataset.id;

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

// Abrir modal de formato de texto para un campo dado
function openTextFormatModal(field) {

  if (field.format) {
    document.getElementById('fontFamily').value = field.format.fontFamily || 'Arial';
    document.getElementById('fontSize').value = field.format.fontSize || '12';
    document.getElementById('fontColor').value = field.format.fontColor || '#000000';
    const cp = document.getElementById('colorPreview');
    if (cp) cp.style.background = field.format.fontColor || '#000000';
    document.getElementById('boldBtn').classList.toggle('active', !!field.format.isBold);
    document.getElementById('italicBtn').classList.toggle('active', !!field.format.isItalic);
    const ub = document.getElementById('underlineBtn');
    if (ub) ub.classList.toggle('active', !!field.format.isUnderline);
    document.querySelectorAll('[data-align]').forEach(b =>
      b.classList.toggle('active', b.dataset.align === (field.format.textAlign || 'left')));
    document.querySelectorAll('[data-valign]').forEach(b =>
      b.classList.toggle('active', b.dataset.valign === (field.format.verticalAlign || 'top')));
  } else {
    document.getElementById('fontFamily').value = 'Arial';
    document.getElementById('fontSize').value = '12';
    document.getElementById('fontColor').value = '#000000';
    const cp = document.getElementById('colorPreview');
    if (cp) cp.style.background = '#000000';
    document.getElementById('boldBtn').classList.remove('active');
    document.getElementById('italicBtn').classList.remove('active');
    const ub = document.getElementById('underlineBtn');
    if (ub) ub.classList.remove('active');
    document.querySelectorAll('[data-align]').forEach(b =>
      b.classList.toggle('active', b.dataset.align === 'left'));
    document.querySelectorAll('[data-valign]').forEach(b =>
      b.classList.toggle('active', b.dataset.valign === 'top'));
  }

  updateTextPreview();
  textModal.classList.add('show');
  textModal.setAttribute('aria-hidden', 'false');
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
    // El modal NO se abre al hacer click; solo el botón "Formatear texto" de la barra lo abre.
    return;
  } else if(fieldType === 'date'){
    // En modo prepare, el campo de fecha se formatea desde el botón "Formatear fecha"
    if (currentMode === 'prepare') return;
    dateModal.classList.add('show');
    dateModal.setAttribute('aria-hidden','false');
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

  const fontFamily = document.getElementById('fontFamily').value;
  const fontSize = document.getElementById('fontSize').value;
  const fontColor = document.getElementById('fontColor').value;
  const isBold = document.getElementById('boldBtn')?.classList.contains('active');
  const isItalic = document.getElementById('italicBtn')?.classList.contains('active');
  const isUnderline = document.getElementById('underlineBtn')?.classList.contains('active');
  const textAlign = document.querySelector('[data-align].active')?.dataset.align || 'left';
  const verticalAlign = document.querySelector('[data-valign].active')?.dataset.valign || 'top';

  const fontWeight = isBold ? 'bold' : 'normal';
  const fontStyle = isItalic ? 'italic' : 'normal';
  const textDecoration = isUnderline ? 'underline' : 'none';
  const alignItems = verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const justifyContent = textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start';

  // Calcular tamaño representativo: escalar pt a px del contenedor de preview
  // 1pt ≈ 1.333px; el preview mide 90px de alto; campo típico ~40px → ratio 90/40 = 2.25
  const ptToPx = 1.333;
  const activeField = activeFieldId ? fields.find(f => f.id === activeFieldId) : null;
  const fieldHeightPx = activeField ? (activeField.height || 40) : 40;
  const previewHeightPx = 90;
  const scale = previewHeightPx / fieldHeightPx;
  const rawPx = parseInt(fontSize) * ptToPx;
  const scaledPx = Math.min(Math.round(rawPx * scale), previewHeightPx - 10);

  preview.style.fontFamily = fontFamily;
  preview.style.fontSize = scaledPx + 'px';
  preview.style.color = fontColor;
  preview.style.fontWeight = fontWeight;
  preview.style.fontStyle = fontStyle;
  preview.style.textDecoration = textDecoration;
  preview.style.textAlign = textAlign;
  preview.style.display = 'flex';
  preview.style.alignItems = alignItems;
  preview.style.justifyContent = justifyContent;
  const previewText = _formattingDateFieldId
    ? new Date().toLocaleDateString('es-ES', {year:'numeric', month:'long', day:'numeric'})
    : 'Texto de ejemplo — Juan Pérez';
  preview.innerHTML = `<span>${previewText}</span>`;
}

// Confirmar formato de texto (botón Aplicar del modal)
// Flag para saber si el modal de texto se abrió para formatear una fecha
let _formattingDateFieldId = null;

function confirmText(){
  const fontFamily = document.getElementById('fontFamily').value;
  const fontSize = document.getElementById('fontSize').value;
  const fontColor = document.getElementById('fontColor').value;
  const isBold = document.getElementById('boldBtn').classList.contains('active');
  const isItalic = document.getElementById('italicBtn').classList.contains('active');
  const isUnderline = document.getElementById('underlineBtn')?.classList.contains('active') || false;
  const textAlign = document.querySelector('[data-align].active')?.dataset.align || 'left';
  const verticalAlign = document.querySelector('[data-valign].active')?.dataset.valign || 'top';

  const fmt = { fontFamily, fontSize, fontColor, isBold, isItalic, isUnderline, textAlign, verticalAlign };

  if (_formattingDateFieldId) {
    const field = fields.find(f => f.id === _formattingDateFieldId);
    if (field) {
      field.format = fmt;
      renderDateField(field);
    }
    _formattingDateFieldId = null;
    const modalTitle = document.querySelector('#textModal h3');
    if (modalTitle) modalTitle.lastChild.textContent = ' Personalizar Texto';
    hideModal();
    toast.success('Formato de fecha aplicado');
  } else {
    applyDocumentFormat(fmt);
    hideModal();
    toast.success('Formato aplicado a todos los campos de texto');
  }
}

function renderDateField(field) {
  // Buscar en todos los overlays de todas las páginas
  let el = null;
  for (const pageData of allPages) {
    const found = pageData.overlay.querySelector(`.field[data-id="${field.id}"]`);
    if (found) { el = found; break; }
  }
  if (!el || !field.value) return;
  const formattedDate = new Date(field.value + 'T00:00:00').toLocaleDateString('es-ES', {year:'numeric', month:'long', day:'numeric'});
  const fmt = field.format || {};
  const fs = fmt.fontSize ? `${parseFloat(fmt.fontSize) * 1.333}px` : '12px';
  const ff = fmt.fontFamily || 'Arial';
  const fw = fmt.isBold ? 'bold' : 'normal';
  const fi = fmt.isItalic ? 'italic' : 'normal';
  const td = fmt.isUnderline ? 'underline' : 'none';
  const ta = fmt.textAlign || 'left';
  const va = fmt.verticalAlign || 'middle';
  const color = fmt.fontColor || '#000000';
  const alignItems = va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start';
  el.classList.add('signed', 'text-formatted');
  el.innerHTML = `
    <span class="label">Fecha</span>
    <button class="delete-btn" title="Eliminar">×</button>
    <div class="field-content date-content" style="font-family:${ff};font-size:${fs};font-weight:${fw};font-style:${fi};text-decoration:${td};color:${color};display:flex;align-items:${alignItems};width:100%;height:100%;padding:2px;box-sizing:border-box;overflow:hidden;"><span style="display:block;width:100%;text-align:${ta};">${formattedDate}</span></div>
  `;
  el.addEventListener('mousedown', startDragField);
  el.addEventListener('touchstart', startDragField, {passive: false});
  el.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteField(field.id);
  });
  addResizeHandles(el);
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
      x: parseFloat(f.x) / VIEWPORT_SCALE,
      y: parseFloat(f.y) / VIEWPORT_SCALE,
      width: parseFloat(f.w) / VIEWPORT_SCALE,
      height: parseFloat(f.h) / VIEWPORT_SCALE,
      label: f.label || null,
      required: f.required !== false,
      roleId: f.roleId || null,
      roleName: f.roleName || null,
      format: f.format || null,
      value: f.type === 'date' ? (f.value || null) : null  // Fecha pre-fijada en modo prepare
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
