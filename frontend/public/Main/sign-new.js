// ===== Estado Global =====
let pdfBytes = null;
let pdfDoc = null;
let page = null;
let viewport = null;
let scale = 1.4;
let pdfCanvas, overlay, pageWrap, ctx;
const fields = [];
let placingSignature = false;

// Modal de firma
let sigModal, sigPad, sigCtx;
let drawing = false;
let activeFieldId = null;

// ===== Inicialización =====
window.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Inicializando aplicación de firmas...');
  
  // Verificar que pdfjsLib esté disponible
  if (typeof pdfjsLib === 'undefined') {
    console.error('❌ PDF.js no está cargado');
    alert('Error: Las librerías no se cargaron correctamente. Recarga la página.');
    return;
  }

  // Configurar worker de PDF.js
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js";

  // Inicializar elementos del DOM
  pdfCanvas = document.getElementById('pdfCanvas');
  overlay = document.getElementById('overlay');
  pageWrap = document.getElementById('pageWrap');
  ctx = pdfCanvas.getContext('2d');
  
  sigModal = document.getElementById('sigModal');
  sigPad = document.getElementById('sigPad');
  sigCtx = sigPad.getContext('2d');

  // Inicializar event listeners
  initEventListeners();
  console.log('✅ Aplicación inicializada');
});

// ===== Event Listeners =====
function initEventListeners() {
  // Cargar archivo
  document.getElementById('pdfFile').addEventListener('change', handleFileUpload);
  
  // Herramienta de firma
  document.getElementById('toolSign').addEventListener('click', () => {
    if (!page) {
      alert('Primero sube un PDF');
      return;
    }
    placingSignature = true;
    overlay.style.cursor = 'crosshair';
  });
  
  // Click en overlay para colocar campo
  overlay.addEventListener('click', handleOverlayClick);
  
  // Botones del modal de firma
  document.getElementById('sigClear').onclick = () => {
    sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
  };
  document.getElementById('sigCancel').onclick = hideSig;
  document.getElementById('sigOk').onclick = confirmSignature;
  
  // Guardar PDF
  document.getElementById('saveBtn').addEventListener('click', savePDF);
  
  // Signature pad eventos
  initSignaturePad();
  
  // Tecla ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sigModal.classList.contains('show')) {
      hideSig();
    }
  });
}

// ===== Manejo de Archivos =====
async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const fileType = file.type;
    const fileName = file.name.toLowerCase();
    
    // Verificar que sea PDF
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      await loadPDF(file);
    } else if (fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
      alert('📄 Archivo Word detectado.\n\nPara firmar documentos Word:\n1. Ábrelo en Microsoft Word\n2. Guárdalo como PDF (Archivo → Guardar como → PDF)\n3. Sube el PDF aquí');
      e.target.value = '';
    } else {
      alert('⚠️ Formato no soportado. Solo se aceptan archivos PDF.');
      e.target.value = '';
    }
  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error al cargar el archivo: ' + error.message);
  }
}

// ===== Cargar PDF =====
async function loadPDF(file) {
  console.log('📄 Cargando PDF...');
  
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
  
  console.log('✅ PDF cargado correctamente');
}

// ===== Colocar Campo de Firma =====
function handleOverlayClick(e) {
  if (!placingSignature) return;
  
  const rect = overlay.getBoundingClientRect();
  const w = 220, h = 70;
  const x = e.clientX - rect.left - w / 2;
  const y = e.clientY - rect.top - h / 2;

  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const el = document.createElement('div');
  el.className = 'field signature';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = w + 'px';
  el.style.height = h + 'px';
  el.dataset.id = id;
  el.innerHTML = '<span class="label">Firma</span>';
  el.addEventListener('click', openSignatureModal);
  overlay.appendChild(el);

  fields.push({ id, type: 'signature', page: 1, x, y, w, h, dataUrl: null, signed: false });

  placingSignature = false;
  overlay.style.cursor = 'default';
}

// ===== Modal de Firma =====
function showSig() {
  sigModal.classList.add('show');
  sigModal.setAttribute('aria-hidden', 'false');
  resizeSig();
}

function hideSig() {
  sigModal.classList.remove('show');
  sigModal.setAttribute('aria-hidden', 'true');
}

function resizeSig() {
  const dpr = window.devicePixelRatio || 1;
  sigPad.width = sigPad.clientWidth * dpr;
  sigPad.height = sigPad.clientHeight * dpr;
  sigCtx.setTransform(1, 0, 0, 1, 0, 0);
  sigCtx.scale(dpr, dpr);
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = 'round';
  sigCtx.strokeStyle = '#111';
}

function openSignatureModal(e) {
  e.stopPropagation();
  activeFieldId = e.currentTarget.dataset.id;
  showSig();
}

function confirmSignature() {
  if (!activeFieldId) return;
  
  const field = fields.find(f => f.id === activeFieldId);
  field.dataUrl = sigPad.toDataURL('image/png');
  field.signed = true;

  const el = overlay.querySelector(`.field.signature[data-id="${activeFieldId}"]`);
  el.classList.add('signed');
  el.style.backgroundImage = `url(${field.dataUrl})`;
  el.style.backgroundSize = 'contain';
  el.style.backgroundRepeat = 'no-repeat';
  el.style.backgroundPosition = 'center';

  hideSig();
}

// ===== Signature Pad =====
function initSignaturePad() {
  function startDraw(e) {
    drawing = true;
    sigCtx.beginPath();
    sigCtx.moveTo(...pos(e));
  }
  
  function moveDraw(e) {
    if (!drawing) return;
    sigCtx.lineTo(...pos(e));
    sigCtx.stroke();
  }
  
  function endDraw() {
    drawing = false;
  }
  
  function pos(e) {
    const r = sigPad.getBoundingClientRect();
    const x = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const y = (e.touches?.[0]?.clientY ?? e.clientY) - r.top;
    return [x, y];
  }

  sigPad.addEventListener('mousedown', startDraw);
  sigPad.addEventListener('mousemove', moveDraw);
  sigPad.addEventListener('mouseup', endDraw);
  sigPad.addEventListener('mouseleave', endDraw);
  sigPad.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });
  sigPad.addEventListener('touchmove', (e) => { e.preventDefault(); moveDraw(e); }, { passive: false });
  sigPad.addEventListener('touchend', endDraw);
}

// ===== Guardar PDF =====
async function savePDF() {
  if (!pdfBytes) {
    alert('Sube un PDF primero');
    return;
  }
  
  const sigs = fields.filter(f => f.type === 'signature' && f.signed && f.dataUrl);
  if (sigs.length === 0) {
    alert('No hay firmas colocadas');
    return;
  }

  try {
    console.log('💾 Generando PDF firmado...');
    
    const pdfDocLib = await PDFLib.PDFDocument.load(pdfBytes);

    for (const f of sigs) {
      const pageLib = pdfDocLib.getPages()[f.page - 1];

      const domW = pdfCanvas.width, domH = pdfCanvas.height;
      const pdfW = pageLib.getWidth(), pdfH = pageLib.getHeight();
      const rx = pdfW / domW, ry = pdfH / domH;

      const xPdf = f.x * rx;
      const yPdf = pdfH - (f.y + f.h) * ry;
      const wPdf = f.w * rx;
      const hPdf = f.h * ry;

      const pngBytes = await (await fetch(f.dataUrl)).arrayBuffer();
      const pngEmbed = await pdfDocLib.embedPng(pngBytes);
      pageLib.drawImage(pngEmbed, { x: xPdf, y: yPdf, width: wPdf, height: hPdf });
    }

    const outBytes = await pdfDocLib.save();
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'documento-firmado.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    console.log('✅ PDF firmado descargado');
  } catch (error) {
    console.error('❌ Error al guardar:', error);
    alert('Error al generar PDF: ' + error.message);
  }
}
