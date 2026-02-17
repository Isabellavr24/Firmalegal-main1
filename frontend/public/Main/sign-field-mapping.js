/*************************************************************
 * SISTEMA DE MAPEO DE CAMPOS - sign.html
 * Funcionalidades de llenado manual y CSV completo
 *************************************************************/

// ===== VARIABLES GLOBALES =====
let currentTemplateDataSign = null;
window.currentTemplateDataSign = null; // Exponer globalmente para acceso desde sign.js

// ===== CARGAR DATOS DE PLANTILLA AL ABRIR TAB "SUBIR LISTA" =====
async function loadTemplateInfoForUploadSign() {
  try {
    console.log('📥 [SIGN] Cargando información de plantilla para subir lista...');

    // Obtener document ID de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const documentId = urlParams.get('id');

    if (!documentId) {
      console.warn('⚠️ [SIGN] No hay documentId en URL');
      return;
    }

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!user.user_id) {
      console.error('❌ [SIGN] Usuario no autenticado');
      return;
    }

    console.log('🌐 [SIGN] Obteniendo datos del documento:', documentId);

    // ✅ PASO 1: Obtener campos y partes del template
    const response = await fetch(`/api/templates/${documentId}?user_id=${user.user_id}`);

    if (!response.ok) {
      throw new Error('Error al obtener datos de la plantilla');
    }

    const templateData = await response.json();

    console.log('🔍 [SIGN] Response completo de API:', templateData);
    console.log('🔍 [SIGN] templateData.data:', templateData.data);
    console.log('🔍 [SIGN] templateData.data?.fields:', templateData.data?.fields);
    console.log('🔍 [SIGN] templateData.data?.parts:', templateData.data?.parts);

    const allFields = templateData.data?.fields || [];
    const parts = templateData.data?.parts || [];

    console.log('📦 [SIGN] Datos obtenidos:', {
      fields: allFields.length,
      parts: parts.length
    });
    console.log('📦 [SIGN] allFields completo:', allFields);
    console.log('📦 [SIGN] parts completo:', parts);

    // ✅ PASO 2: SIEMPRE extraer labels FRESCOS del PDF (no usar los guardados)
    console.log('🔄 [SIGN] Extrayendo labels FRESCOS del PDF actual...');
    try {
      const labelResponse = await fetch(`/api/templates/${documentId}/extract-labels`);
      const labelResult = await labelResponse.json();

      if (labelResult.success && labelResult.data.labels) {
        const freshLabels = labelResult.data.labels;
        console.log('✅ [SIGN] Labels frescos extraídos:', freshLabels);

        // ✅ REEMPLAZAR labels guardados con labels frescos del PDF
        allFields.forEach(field => {
          // Solo actualizar campos de texto
          if (field.type === 'text' || field.type === 'date' || field.type === 'number') {
            const freshLabel = freshLabels[field.id];
            if (freshLabel) {
              console.log(`🔄 [SIGN] Campo ${field.id}: "${field.field_label}" → "${freshLabel}"`);
              field.field_label = freshLabel;  // SOBRESCRIBIR con label fresco
            }
          }
        });
      }
    } catch (error) {
      console.warn('⚠️ [SIGN] No se pudieron extraer labels frescos, usando guardados:', error);
    }

    // Crear objeto de plantilla
    currentTemplateDataSign = {
      id: documentId,
      document_id: documentId,
      title: urlParams.get('name') || 'Documento',
      fields: allFields,
      parts: parts
    };
    window.currentTemplateDataSign = currentTemplateDataSign; // Sincronizar con variable global

    // Actualizar UI
    updateUploadListUISign(currentTemplateDataSign);

    console.log('✅ [SIGN] Plantilla cargada correctamente');

  } catch (error) {
    console.error('❌ [SIGN] Error cargando plantilla:', error);
    safeToast('error', 'Error', 'No se pudo cargar la información de la plantilla', 5000);
  }
}

// ===== ACTUALIZAR UI DEL TAB "SUBIR LISTA" =====
function updateUploadListUISign(template) {
  const templateNameDisplay = document.getElementById('templateNameDisplaySign');
  const templateIdDisplay = document.getElementById('templateIdDisplaySign');
  const templateFieldsInfo = document.getElementById('templateFieldsInfoSign');
  const sendModeSelector = document.getElementById('sendModeSelectorSign');

  if (!templateNameDisplay || !sendModeSelector) {
    console.warn('⚠️ [SIGN] Elementos UI no encontrados');
    return;
  }

  // Actualizar nombre e ID de la plantilla
  templateNameDisplay.textContent = template.title || 'Sin nombre';
  if (templateIdDisplay) {
    templateIdDisplay.textContent = `ID: ${template.id}`;
  }

  // Filtrar solo campos de texto (no signature ni seal)
  const textFields = template.fields.filter(f =>
    f.type === 'text' || f.type === 'date' || f.type === 'number'
  );

  console.log(`📝 [SIGN] Campos de texto detectados: ${textFields.length} de ${template.fields.length} totales`);

  // Mostrar info de campos detectados
  if (templateFieldsInfo) {
    templateFieldsInfo.style.display = 'block';
    const fieldsCount = document.getElementById('fieldsCountSign');
    const fieldsList = document.getElementById('fieldsListSign');
    if (fieldsCount) fieldsCount.textContent = textFields.length;
    if (fieldsList) {
      fieldsList.innerHTML = textFields.map(f => {
        // ✅ PRIORIDAD: field_label viene del endpoint /api/templates/${id}
        const fieldName = f.field_label || f.label || f.field_key || f.name || `Campo ${f.id}`;
        return `<span style="display: inline-block; background: #e0e7ff; color: #4338ca; padding: 4px 8px; border-radius: 4px; margin: 4px 4px 0 0; font-size: 12px;">${fieldName}</span>`;
      }).join('');
    }
  }

  if (textFields.length === 0) {
    // Sin campos de texto → Ocultar selector
    console.log('⚠️ [SIGN] No hay campos de texto, ocultando selector');
    sendModeSelector.style.display = 'none';
  } else {
    // Con campos de texto → Mostrar selector
    console.log('✅ [SIGN] Hay campos de texto, mostrando selector');
    sendModeSelector.style.display = 'block';
  }
}

// ===== GENERAR CSV MODO MANUAL (solo partes) =====
function generateCSVManualSign(template) {
  console.log('🔍 [SIGN] Generando CSV manual (solo partes)...');
  console.log('👥 [SIGN] Partes:', template.parts);

  // Headers base: Parte, Email, Nombre
  const headers = ['Parte', 'Email', 'Nombre'];

  // Generar CSV
  const csvRows = [];
  csvRows.push(headers.join(','));

  // Agregar filas con los nombres de las partes + celdas vacías
  template.parts.forEach(part => {
    csvRows.push(`${part.name},,`);  // Parte, Email vacío, Nombre vacío
  });

  console.log('📄 [SIGN] CSV manual generado:');
  console.log(csvRows.join('\n'));

  return csvRows.join('\n');
}

// ===== GENERAR CSV MODO COMPLETO (partes + campos) =====
// ✅ COPIADO EXACTAMENTE DE tracking.js
async function generateCSVFullSign(template) {
  console.log('🔍 [SIGN] Generando CSV completo...');
  console.log('📊 [SIGN] Template recibido:', template);
  console.log('👥 [SIGN] Partes:', template.parts);
  console.log('📋 [SIGN] Campos totales:', template.fields);

  // 1. Headers base: Parte, Email, Nombre
  const headers = ['Parte', 'Email', 'Nombre'];

  console.log('✅ [SIGN] Headers base agregados:', headers);

  // 2. Filtrar campos de texto (usando field_type como tracking.js)
  const textFields = template.fields.filter(f =>
    f.field_type === 'text' || f.field_type === 'date' || f.field_type === 'number' ||
    f.type === 'text' || f.type === 'date' || f.type === 'number'
  );

  console.log(`📝 [SIGN] Campos de texto filtrados: ${textFields.length}`, textFields);

  // 3. Obtener labels extraídos del PDF (igual que tracking.js)
  let labels = {};
  const templateId = template.document_id || template.id;
  try {
    console.log(`🌐 [SIGN] Obteniendo labels del PDF para template ${templateId}...`);
    const labelResponse = await fetch(`/api/templates/${templateId}/extract-labels`);
    const labelResult = await labelResponse.json();
    labels = labelResult.success ? labelResult.data.labels : {};
    console.log('🏷️ [SIGN] Labels extraídos del PDF - objeto completo:', labels);
    console.log('🏷️ [SIGN] Cantidad de labels:', Object.keys(labels).length);
    console.log('🏷️ [SIGN] IDs de campos con labels:', Object.keys(labels));
    console.log('🏷️ [SIGN] Valores de labels:', Object.values(labels));
  } catch (error) {
    console.warn('⚠️ [SIGN] No se pudieron extraer labels del PDF:', error);
  }

  // 4. Agregar columnas de campos con sus labels reales (IGUAL QUE TRACKING.JS)
  textFields.forEach(field => {
    console.log('═'.repeat(50));
    console.log('🔍 [SIGN] Procesando campo completo:', JSON.stringify(field, null, 2));
    console.log('   - field.id:', field.id);
    console.log('   - field.field_id:', field.field_id);
    console.log('   - labels[field.id]:', labels[field.id]);
    console.log('   - field.field_label:', field.field_label);
    console.log('   - field.field_key:', field.field_key);
    console.log('   - field.name:', field.name);
    console.log('   - field.type:', field.type);
    console.log('   - field.field_type:', field.field_type);

    // ✅ IGUAL QUE TRACKING.JS: label extraído del PDF PRIMERO
    const label = labels[field.id] ||
                  field.field_label ||
                  field.field_key ||
                  field.name ||
                  `Campo ${field.id}`;

    console.log('   ✅ [SIGN] Label final seleccionado:', label);
    console.log('   ✅ [SIGN] Condición que ganó:',
      labels[field.id] ? 'labels[field.id]' :
      field.field_label ? 'field_label' :
      field.field_key ? 'field_key' :
      field.name ? 'name' : 'fallback'
    );
    headers.push(label);
  });

  console.log('✅ [SIGN] Headers finales:', headers);
  console.log(`📊 [SIGN] Total de columnas: 3 (base) + ${textFields.length} campos = ${headers.length} total`);

  // 5. Generar CSV
  const csvRows = [];
  csvRows.push(headers.join(','));

  // 6. Agregar filas con los nombres de las partes + celdas vacías para emails/campos
  template.parts.forEach(part => {
    const row = [part.name, '', ''];  // Parte, Email vacío, Nombre vacío
    // Agregar celdas vacías para cada campo de texto
    for (let i = 0; i < textFields.length; i++) {
      row.push('');
    }
    csvRows.push(row.join(','));
  });

  const csvContent = csvRows.join('\n');
  console.log('📄 [SIGN] CSV generado:');
  console.log(csvContent);

  return csvContent;
}

// ===== DESCARGAR PLANTILLA CSV SEGÚN MODO ACTIVO =====
async function downloadTemplateSign() {
  console.log('🚀 [SIGN] Iniciando descarga de plantilla CSV...');

  try {
    // ✅ PASO 1: SIEMPRE obtener datos FRESCOS del documento actual
    const urlParams = new URLSearchParams(window.location.search);
    const documentId = urlParams.get('id');

    if (!documentId) {
      console.error('❌ [SIGN] No hay documentId en URL');
      safeToast('error', 'Error', 'No se encontró el ID del documento', 5000);
      return;
    }

    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (!user.user_id) {
      console.error('❌ [SIGN] Usuario no autenticado');
      safeToast('error', 'Error', 'Usuario no autenticado', 5000);
      return;
    }

    console.log('🔄 [SIGN] Obteniendo datos FRESCOS del documento:', documentId);

    // Obtener template con campos y partes ACTUALES
    const response = await fetch(`/api/templates/${documentId}?user_id=${user.user_id}`);

    if (!response.ok) {
      throw new Error('Error al obtener datos de la plantilla');
    }

    const templateData = await response.json();
    const freshTemplate = {
      id: documentId,
      document_id: documentId,
      title: templateData.data.title || urlParams.get('name') || 'Documento',
      fields: templateData.data.fields || [],
      parts: templateData.data.parts || []
    };

    console.log('✅ [SIGN] Datos FRESCOS obtenidos:');
    console.log('   - Partes:', freshTemplate.parts.length, freshTemplate.parts);
    console.log('   - Campos:', freshTemplate.fields.length);

    // ✅ PASO 2: Detectar modo activo
    const manualBtn = document.getElementById('modeManualBtnSign');
    const csvBtn = document.getElementById('modeCsvBtnSign');

    console.log('🔍 [SIGN] Botones encontrados:');
    console.log('   - modeManualBtnSign:', manualBtn);
    console.log('   - modeCsvBtnSign:', csvBtn);
    console.log('   - modeManualBtnSign.classList:', manualBtn?.classList);
    console.log('   - modeCsvBtnSign.classList:', csvBtn?.classList);

    let csvContent = '';
    let fileName = '';

    if (manualBtn && manualBtn.classList.contains('active')) {
      console.log('✅ [SIGN] Modo MANUAL activo');
      // Modo manual: solo partes (Nombre y Email por cada parte)
      csvContent = generateCSVManualSign(freshTemplate);  // ✅ Usar datos FRESCOS
      fileName = `plantilla_firmantes_${documentId}.csv`;
    } else if (csvBtn && csvBtn.classList.contains('active')) {
      console.log('✅ [SIGN] Modo CSV COMPLETO activo');
      // Modo CSV completo: partes + campos de texto con labels (async)
      csvContent = await generateCSVFullSign(freshTemplate);  // ✅ Usar datos FRESCOS
      fileName = `plantilla_completa_${documentId}.csv`;
    } else {
      console.error('❌ [SIGN] Ningún modo está activo');
      safeToast('error', 'Error', 'Selecciona un modo (Manual o CSV)', 5000);
      return;
    }

    console.log('📄 [SIGN] CSV Content generado:', csvContent);
    console.log('📝 [SIGN] Nombre del archivo:', fileName);

    // ✅ PASO 3: Crear blob y descargar
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`✅ [SIGN] Plantilla descargada: ${fileName}`);
    safeToast('success', 'Descarga completa', `Plantilla ${fileName} descargada exitosamente`, 5000);

  } catch (error) {
    console.error('❌ [SIGN] Error generando plantilla:', error);
    safeToast('error', 'Error', 'No se pudo generar la plantilla CSV: ' + error.message, 5000);
  }
}

// ===== ABRIR MODAL DE LLENADO DINÁMICO =====
function openDynamicFillModalSign() {
  console.log('🚀 [SIGN] openDynamicFillModalSign() INICIADO');
  console.log('🔍 [SIGN] window.bulkRecipientsSign AL INICIO de openDynamicFillModalSign:', window.bulkRecipientsSign);
  console.log('🔍 [SIGN] Cantidad AL INICIO de openDynamicFillModalSign:', window.bulkRecipientsSign?.length);

  if (!currentTemplateDataSign || !currentTemplateDataSign.fields) {
    safeToast('error', 'Sin plantilla', 'No hay plantilla cargada', 5000);
    return;
  }

  // Filtrar solo campos de texto
  const textFields = currentTemplateDataSign.fields.filter(f => {
    const fieldType = f.type || f.field_type || '';
    return fieldType === 'text';
  });

  if (textFields.length === 0) {
    safeToast('warning', 'Sin campos', 'La plantilla no tiene campos de texto', 5000);
    return;
  }

  const templateId = currentTemplateDataSign.document_id || currentTemplateDataSign.id;

  // Intentar extraer etiquetas del PDF
  fetch(`/api/templates/${templateId}/extract-labels`)
    .then(res => res.json())
    .then(labelResult => {
      console.log('🔍 [SIGN] window.bulkRecipientsSign ANTES de generar formulario:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad ANTES de generar formulario:', window.bulkRecipientsSign?.length);

      const labels = labelResult.success ? labelResult.data.labels : {};
      console.log('🏷️ [SIGN] Etiquetas extraídas:', labels);

      // Generar formulario dinámico con etiquetas
      const container = document.getElementById('dynamicFieldsContainerSign');
      container.innerHTML = textFields.map(field => {
        // ✅ Usar la etiqueta en este orden de prioridad:
        // 1. field_label ya guardado en BD (viene de /api/templates/${id})
        // 2. Label extraído del PDF en este request
        // 3. Fallbacks
        const fieldLabel = field.field_label || labels[field.id] || labels[field.field_id] || field.label || field.field_key || field.name || `Campo ${field.id}`;

        return `
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
              ${fieldLabel}:
            </label>
            <input
              type="text"
              id="field_${field.id}"
              data-field-id="${field.id}"
              class="dynamic-field-input-sign"
              style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px;"
              placeholder="Ingresa ${fieldLabel}"
            />
          </div>
        `;
      }).join('');

      // Mostrar modal
      const modal = document.getElementById('dynamicFillModalSign');
      modal.style.display = 'flex';
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');

      console.log('🔍 [SIGN] window.bulkRecipientsSign DESPUÉS de abrir modal (success path):', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad DESPUÉS de abrir modal (success path):', window.bulkRecipientsSign?.length);
    })
    .catch(error => {
      console.error('Error extrayendo etiquetas:', error);
      console.log('🔍 [SIGN] window.bulkRecipientsSign en CATCH block:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad en CATCH block:', window.bulkRecipientsSign?.length);
      // ✅ Si falla, usar etiquetas por defecto (field_label ya viene de BD)
      const container = document.getElementById('dynamicFieldsContainerSign');
      container.innerHTML = textFields.map(field => {
        const fieldName = field.field_label || field.label || field.field_key || field.name || `Campo ${field.id}`;
        const cleanName = fieldName.replace(/text_\d+/g, '').trim() || fieldName;

        return `
          <div style="margin-bottom: 16px;">
            <label style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">
              ${cleanName}:
            </label>
            <input
              type="text"
              id="field_${field.id}"
              data-field-id="${field.id}"
              class="dynamic-field-input-sign"
              style="width: 100%; padding: 10px; border: 1px solid #D1D5DB; border-radius: 6px; font-size: 14px;"
              placeholder="Ingresa ${cleanName}"
            />
          </div>
        `;
      }).join('');

      const modal = document.getElementById('dynamicFillModalSign');
      modal.style.display = 'flex';
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');

      console.log('🔍 [SIGN] window.bulkRecipientsSign DESPUÉS de abrir modal (error path):', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad DESPUÉS de abrir modal (error path):', window.bulkRecipientsSign?.length);
    });

  console.log('🏁 [SIGN] openDynamicFillModalSign() FINALIZANDO');
  console.log('🔍 [SIGN] window.bulkRecipientsSign AL FINAL de openDynamicFillModalSign:', window.bulkRecipientsSign);
  console.log('🔍 [SIGN] Cantidad AL FINAL de openDynamicFillModalSign:', window.bulkRecipientsSign?.length);
}

// ===== CERRAR MODAL DE LLENADO DINÁMICO =====
function closeDynamicFillModalSign() {
  const modal = document.getElementById('dynamicFillModalSign');
  modal.style.display = 'none';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

// ===== GUARDAR VALORES DE CAMPOS DINÁMICOS =====
async function saveDynamicFieldsSign() {
  console.log('💾 [SIGN] saveDynamicFieldsSign() INICIADO');
  console.log('🔍 [SIGN] window.bulkRecipientsSign AL INICIO de saveDynamicFieldsSign:', window.bulkRecipientsSign);
  console.log('🔍 [SIGN] Cantidad AL INICIO de saveDynamicFieldsSign:', window.bulkRecipientsSign?.length);

  const inputs = document.querySelectorAll('.dynamic-field-input-sign');
  const fieldData = {};

  inputs.forEach(input => {
    const fieldId = input.dataset.fieldId;
    const value = input.value.trim();
    if (value) {
      fieldData[fieldId] = value;
    }
  });

  if (Object.keys(fieldData).length === 0) {
    safeToast('warning', 'Campos vacíos', 'Por favor llena al menos un campo', 5000);
    return;
  }

  console.log('📝 [SIGN] Datos de campos:', fieldData);
  console.log('📄 [SIGN] Plantilla:', currentTemplateDataSign.id);
  console.log('🔍 [SIGN] window.bulkRecipientsSign ANTES de enviar al backend:', window.bulkRecipientsSign);
  console.log('🔍 [SIGN] Cantidad ANTES de enviar al backend:', window.bulkRecipientsSign?.length);

  try {
    // Obtener user_id del usuario actual
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userId = user.user_id;

    if (!userId) {
      throw new Error('No se pudo obtener el ID de usuario');
    }

    const templateId = currentTemplateDataSign.document_id || currentTemplateDataSign.id;

    // Enviar datos al backend para guardar en la plantilla
    const response = await fetch(`/api/documents/fill-template?user_id=${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templateId: templateId,
        fieldData: fieldData
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error en el servidor');
    }

    const result = await response.json();

    console.log('🔍 [SIGN] window.bulkRecipientsSign DESPUÉS de recibir respuesta del backend:', window.bulkRecipientsSign);
    console.log('🔍 [SIGN] Cantidad DESPUÉS de recibir respuesta del backend:', window.bulkRecipientsSign?.length);

    if (result.success) {
      console.log('🔍 [SIGN] window.bulkRecipientsSign ANTES de cerrar modal:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad ANTES de cerrar modal:', window.bulkRecipientsSign?.length);

      safeToast('success', 'Guardado exitoso', 'Valores guardados en la plantilla correctamente', 5000);
      closeDynamicFillModalSign();

      console.log('🔍 [SIGN] window.bulkRecipientsSign DESPUÉS de cerrar modal:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad DESPUÉS de cerrar modal:', window.bulkRecipientsSign?.length);

      // 🔥 IMPORTANTE: NO recargar plantilla aquí para no perder window.bulkRecipientsSign
      // Los valores ya están guardados en la BD, no necesitamos recargar la UI
      console.log('✅ [SIGN] Valores guardados, manteniendo estado de destinatarios CSV');
      console.log('🔍 [SIGN] window.bulkRecipientsSign después de guardar:', window.bulkRecipientsSign);
    } else {
      throw new Error(result.error || 'Error desconocido');
    }
  } catch (error) {
    console.error('❌ [SIGN] Error guardando valores:', error);
    safeToast('error', 'Error al guardar', error.message, 6000);
  }
}

// ===== INICIALIZACIÓN DE EVENTOS =====
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 [SIGN] Inicializando sistema de mapeo de campos...');

  // Event listeners para cambiar entre modos
  const modeManualBtn = document.getElementById('modeManualBtnSign');
  const modeCsvBtn = document.getElementById('modeCsvBtnSign');

  if (modeManualBtn) {
    modeManualBtn.addEventListener('click', function() {
      // Agregar clase 'active' al botón manual y quitársela al CSV
      this.classList.add('active');
      modeCsvBtn.classList.remove('active');

      // Activar botón manual (estilos visuales)
      this.style.background = '#16a34a';
      this.style.color = 'white';
      modeCsvBtn.style.background = 'white';
      modeCsvBtn.style.color = '#16a34a';

      // Mostrar contenido manual
      document.getElementById('manualModeContentSign').style.display = 'block';
      document.getElementById('csvModeContentSign').style.display = 'none';

      console.log('📝 [SIGN] Modo MANUAL activado');
    });
  }

  if (modeCsvBtn) {
    modeCsvBtn.addEventListener('click', function() {
      // Agregar clase 'active' al botón CSV y quitársela al manual
      this.classList.add('active');
      modeManualBtn.classList.remove('active');

      // Activar botón CSV (estilos visuales)
      this.style.background = '#16a34a';
      this.style.color = 'white';
      modeManualBtn.style.background = 'white';
      modeManualBtn.style.color = '#16a34a';

      // Mostrar contenido CSV
      document.getElementById('manualModeContentSign').style.display = 'none';
      document.getElementById('csvModeContentSign').style.display = 'block';

      console.log('📊 [SIGN] Modo CSV activado');
    });
  }

  // Botón para asignar valores a campos de texto (modo manual)
  const fillFieldsBtn = document.getElementById('fillFieldsManualBtnSign');
  if (fillFieldsBtn) {
    fillFieldsBtn.addEventListener('click', () => {
      console.log('✏️ [SIGN] Abriendo modal para asignar valores a campos...');
      console.log('🔍 [SIGN] window.bulkRecipientsSign ANTES de abrir modal:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad ANTES de abrir modal:', window.bulkRecipientsSign?.length);
      openDynamicFillModalSign();
      console.log('🔍 [SIGN] window.bulkRecipientsSign DESPUÉS de abrir modal:', window.bulkRecipientsSign);
      console.log('🔍 [SIGN] Cantidad DESPUÉS de abrir modal:', window.bulkRecipientsSign?.length);
    });
  }

  // Botón para guardar valores de campos dinámicos
  const saveBtn = document.getElementById('saveDynamicFieldsBtnSign');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveDynamicFieldsSign);
  }

  // Detectar cuando se abre el tab "Subir lista"
  const uploadTab = document.querySelector('.recipients-tab[data-tab="upload"]');
  if (uploadTab) {
    uploadTab.addEventListener('click', () => {
      console.log('📌 [SIGN] Tab Subir Lista activado');
      // Cargar datos de plantilla automáticamente
      setTimeout(() => {
        loadTemplateInfoForUploadSign();
      }, 300);
    });
  }

  // TAMBIÉN detectar cuando el modal se abre (por si el usuario va directo al tab)
  const recipientsModal = document.getElementById('recipientsModal');
  if (recipientsModal) {
    // Observar cambios en el atributo style del modal
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'style') {
          const isVisible = recipientsModal.style.display === 'flex';
          if (isVisible) {
            console.log('🔔 [SIGN] Modal de destinatarios abierto, pre-cargando plantilla...');
            // Dar tiempo para que se rendericen los tabs
            setTimeout(() => {
              loadTemplateInfoForUploadSign();
            }, 500);
          }
        }
      });
    });

    observer.observe(recipientsModal, {
      attributes: true,
      attributeFilter: ['style']
    });

    console.log('✅ [SIGN] Observer de modal configurado');
  }

  console.log('✅ [SIGN] Sistema de mapeo de campos inicializado');
});

// Exponer funciones globalmente
window.downloadTemplateSign = downloadTemplateSign;
window.openDynamicFillModalSign = openDynamicFillModalSign;
window.closeDynamicFillModalSign = closeDynamicFillModalSign;

console.log('✅ [SIGN-FIELD-MAPPING] Módulo cargado correctamente');
