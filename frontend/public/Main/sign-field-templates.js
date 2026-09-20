/**
 * =============================================
 * PLANTILLAS DE CAMPOS — interfaz del editor
 * =============================================
 *
 * Exportar los campos de un pagare para reutilizarlos en otro. Los once
 * pagares de un colegio comparten la misma estructura —52 campos de texto, 6
 * de firma, sello y firma definitiva— y hoy se pintan uno por uno en cada
 * grado.
 *
 * Los dos botones son EXCLUYENTES (lo decide updateTemplateButtons en sign.js):
 * sin campos solo se puede importar, con campos solo exportar. Asi no hay
 * forma de duplicar campos importando sobre un documento que ya los tiene.
 *
 * Este archivo solo anade comportamiento: no toca nada del editor existente.
 */

(function () {
  'use strict';

  const API = '/api/field-templates';

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------

  function aviso(mensaje, tipo) {
    if (typeof window.showToast === 'function') window.showToast(mensaje, tipo || 'info');
    else console.log('[PLANTILLAS] ' + mensaje);
  }

  /**
   * Estado del editor. `fields`, `allPages` y `currentDocId` se declaran con
   * `let` en sign.js, asi que no existen en `window`: hay que pedirlas por la
   * funcion que ese archivo expone.
   */
  function estado() {
    return (typeof window.getEditorState === 'function')
      ? window.getEditorState()
      : { fields: [], totalPages: 0, pageSize: null, docId: null };
  }

  /** Tamaño y paginas del PDF, en el formato que espera el backend. */
  function tamanoPagina() {
    const st = estado();
    const out = { total_pages: st.totalPages || null };
    if (st.pageSize) {
      out.page_width = st.pageSize.width;
      out.page_height = st.pageSize.height;
    }
    return out;
  }

  function cerrarModal() {
    const m = document.getElementById('tplModal');
    if (m) m.remove();
    document.removeEventListener('keydown', escParaCerrar);
  }

  function escParaCerrar(e) {
    if (e.key === 'Escape') cerrarModal();
  }

  /**
   * Modal con el estilo del editor. Se construye con DOM, no con innerHTML de
   * datos: los nombres de plantilla los escribe el operador y no deben poder
   * inyectar markup.
   */
  function abrirModal(titulo, contenido, acciones) {
    cerrarModal();

    const fondo = document.createElement('div');
    fondo.id = 'tplModal';
    fondo.style.cssText =
      'position:fixed;inset:0;background:rgba(20,8,24,.55);z-index:9999;' +
      'display:flex;align-items:center;justify-content:center;padding:24px;';

    // min-width:0 en toda la cadena flex: sin el, un hijo ancho empuja la caja
    // y aparece el scroll lateral que se lleva el titulo fuera de la pantalla.
    const caja = document.createElement('div');
    caja.style.cssText =
      'background:#fff;border-radius:14px;max-width:1180px;width:100%;' +
      'max-height:90vh;display:flex;flex-direction:column;min-width:0;' +
      'box-shadow:0 18px 50px rgba(20,8,24,.28);overflow:hidden;';

    const cab = document.createElement('div');
    cab.style.cssText =
      'padding:18px 24px;border-bottom:1px solid #eee;display:flex;' +
      'align-items:center;justify-content:space-between;gap:16px;';
    const h = document.createElement('h3');
    h.textContent = titulo;
    h.style.cssText = 'margin:0;font-size:17px;color:#2a0d31;font-weight:600;';
    const cerrar = document.createElement('button');
    cerrar.textContent = 'Cerrar';
    cerrar.className = 'chip';
    cerrar.onclick = cerrarModal;
    cab.appendChild(h);
    cab.appendChild(cerrar);

    const cuerpo = document.createElement('div');
    // overflow-x:hidden mata el scroll lateral; el vertical se queda.
    cuerpo.style.cssText =
      'padding:22px 24px;overflow-y:auto;overflow-x:hidden;flex:1;min-width:0;';
    cuerpo.appendChild(contenido);

    caja.appendChild(cab);
    caja.appendChild(cuerpo);

    if (acciones && acciones.length) {
      const pie = document.createElement('div');
      pie.style.cssText =
        'padding:16px 24px;border-top:1px solid #eee;display:flex;' +
        'justify-content:flex-end;gap:10px;background:#faf8fb;';
      acciones.forEach(a => pie.appendChild(a));
      caja.appendChild(pie);
    }

    fondo.appendChild(caja);
    fondo.addEventListener('click', e => { if (e.target === fondo) cerrarModal(); });
    document.addEventListener('keydown', escParaCerrar);
    document.body.appendChild(fondo);
    return caja;
  }

  /** Resumen legible de los campos de una pagina o plantilla. */
  function resumirCampos(c) {
    const partes = [];
    if (c.text) partes.push(c.text + (c.text === 1 ? ' de texto' : ' de texto'));
    if (c.signature) partes.push(c.signature + (c.signature === 1 ? ' de firma' : ' de firma'));
    if (c.date) partes.push(c.date + ' de fecha');
    if (c.seal || c.stamp) partes.push((c.seal || 0) + (c.stamp || 0) + ' de sello');
    if (c.final_signature) partes.push(c.final_signature + ' de firma definitiva');
    return partes.length ? partes.join(' · ') : 'sin campos';
  }

  // ---------------------------------------------------------------------
  // Firmantes
  // ---------------------------------------------------------------------

  /**
   * Nombre legible del firmante dueño de un campo.
   *
   * Importa de verdad: un campo de firma mal atribuido acaba con la firma de
   * una persona en el pagare de otra —ya paso—. El resumen debe decir "2 de
   * firma (Firmante N1)" y no solo "2 de firma", para que se pueda comprobar
   * ANTES de exportar y no despues, con el contrato ya enviado.
   */
  function buscarRol(roleId, partesDoc) {
    if (roleId === null || roleId === undefined) return null;
    return (partesDoc || []).find(x => String(x.roleId) === String(roleId)) || null;
  }

  function nombreFirmante(campo, partesDoc) {
    const roleId = campo && campo.roleId;
    if (roleId === null || roleId === undefined) return null;
    const p = buscarRol(roleId, partesDoc);
    const orden = p && p.order ? ('N' + p.order) : '';
    // El nombre que puso el operador manda; si no hay, "Firmante N1".
    const nombre = (p && p.name) || (campo && campo.roleName) || '';
    if (nombre && !/^firmante\s*n?\d*$/i.test(nombre.trim())) {
      return orden ? `${nombre} (${orden})` : nombre;
    }
    // Si la parte no esta en `parts` —al importar se acaba de crear y el
    // sistema de roles aun no la tiene— el propio campo trae su "Firmante N1".
    // Usarlo evita el "Firmante ?" , que no dice nada.
    if (!orden && nombre) return nombre.trim();
    return 'Firmante ' + (orden || '?');
  }

  function colorFirmante(campo, partesDoc) {
    const p = buscarRol(campo && campo.roleId, partesDoc);
    return (p && p.color) || (campo && campo.roleColor) || '#6d6270';
  }

  /**
   * Desglose de las firmas por firmante: "2 de Firmante N1, 1 de Firmante N2".
   * Devuelve [] si en esa pagina no hay campos de firma.
   */
  function firmasPorFirmante(campos, partesDoc) {
    const cuenta = new Map();
    const muestra = new Map();
    campos
      .filter(f => f.type === 'signature')
      .forEach(f => {
        const clave = (f.roleId === null || f.roleId === undefined)
          ? '__sin__' : String(f.roleId);
        cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
        if (!muestra.has(clave)) muestra.set(clave, f);
      });

    return Array.from(cuenta.entries()).map(([clave, n]) => ({
      roleId: clave === '__sin__' ? null : clave,
      n: n,
      // Una firma sin firmante asignado es un problema, no un detalle: al
      // importarla nadie sabria a quien pertenece. Se nombra para que se vea.
      nombre: clave === '__sin__'
        ? 'Sin firmante asignado'
        : (nombreFirmante(muestra.get(clave), partesDoc) || 'Firmante desconocido'),
      color: clave === '__sin__' ? '#c2185b' : colorFirmante(muestra.get(clave), partesDoc),
      huerfana: clave === '__sin__'
    })).sort((a, b) => {
      if (a.huerfana) return 1;
      if (b.huerfana) return -1;
      return a.nombre.localeCompare(b.nombre);
    });
  }

  /**
   * Miniatura de una pagina con los campos dibujados encima, para que se vea
   * DONDE quedan y no solo cuantos son. Si el canvas no se puede leer, se
   * devuelve el recuadro con los campos igual: la posicion relativa se sigue
   * entendiendo sin el fondo.
   */
  function construirPrevisualizacion(numPagina, camposPagina, st, altoMax) {
    // Tamaño de ESTA pagina, no el de la primera: el PDF puede mezclar Carta y
    // Oficio y usar uno solo deforma las demas.
    const tam = (typeof window.getPageSize === 'function'
                 && window.getPageSize(numPagina))
      || st.pageSize || { width: 612, height: 792 };

    // Manda el ALTO, no el ancho: fijando el ancho, una hoja Oficio crece
    // hacia abajo y se sale de la tarjeta. Con el alto fijo, cada pagina se
    // adapta y las Oficio salen simplemente mas estrechas, sin deformarse.
    const H = altoMax || 150;
    const alto = H;

    // El espacio en el que estan las coordenadas ES el tamaño real de la
    // pagina, que window.getPageSize() devuelve leyendolo del PDF abierto
    // (612x792 en Carta, 612x1008 en Oficio). Es lo mismo que hace la vista de
    // importar con `coord_*`, y por eso alli fondo y campos encajan.
    //
    // Deducir ese espacio de donde caen los campos —como se intento antes— da
    // valores distintos del papel (946, 969...) y descuadra el fondo.
    //
    // OJO: `fields` del editor esta en PIXELES DE PANTALLA, con la escala del
    // viewport aplicada (~1.4), mientras que tam.* es el tamaño natural del
    // PDF. Hay que multiplicar por esa escala para comparar lo mismo; si no,
    // los campos salen ~1.4 veces mas grandes de lo que deberian.
    const escalaVp = (st && st.viewportScale) || 1.4;
    const espacioW = tam.width * escalaVp;
    const espacioH = tam.height * escalaVp;

    // La proporcion no cambia al escalar los dos ejes por igual.
    const W = Math.round(H * (tam.width / tam.height));

    const marco = document.createElement('div');
    marco.style.cssText =
      `position:relative;width:${W}px;height:${alto}px;border:1px solid #e0d6e6;` +
      'border-radius:6px;overflow:hidden;background:#fff;flex-shrink:0;';

    const fondo = (typeof window.getPageThumbnail === 'function')
      ? window.getPageThumbnail(numPagina, W * 2)
      : null;

    if (fondo) {
      const img = document.createElement('img');
      img.src = fondo;
      img.alt = '';
      img.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;opacity:.55;';
      marco.appendChild(img);
    } else {
      marco.style.background = '#f7f4f8';
    }

    // Los campos vienen en el espacio natural del PDF, el mismo en el que
    // esta expresado pageSize: la proporcion es directa.
    camposPagina.forEach(f => {
      const m = document.createElement('div');
      const izq = (f.x / espacioW) * 100;
      const arr = (f.y / espacioH) * 100;
      const an = Math.max((f.w / espacioW) * 100, 1.5);
      const al = Math.max((f.h / espacioH) * 100, 1.2);
      const color = f.type === 'signature'
        ? colorFirmante(f, st.parts)
        : (f.type === 'date' ? '#2f7d5d'
          : (f.type === 'seal' || f.type === 'stamp') ? '#9a6a1f'
          : f.type === 'final_signature' ? '#6b4a8f' : '#4a6fa5');
      m.style.cssText =
        `position:absolute;left:${izq}%;top:${arr}%;width:${an}%;height:${al}%;` +
        `background:${color}33;border:1px solid ${color};border-radius:2px;box-sizing:border-box;`;
      const duenio = f.type === 'signature' ? nombreFirmante(f, st.parts) : null;
      m.title = (f.label || f.type) + (duenio ? ' — ' + duenio : '');
      marco.appendChild(m);
    });

    return marco;
  }

  /**
   * Lo mismo que firmasPorFirmante pero para los campos de una PLANTILLA, que
   * no traen part_id —a proposito: es de otro documento— sino `part_order`.
   * Ese orden es justamente lo que se conserva al importar: 1 = Firmante N1.
   */
  function firmasPorOrden(camposPlantilla) {
    const cuenta = new Map();
    (camposPlantilla || [])
      .filter(f => f.field_type === 'signature')
      .forEach(f => {
        const clave = (f.part_order === null || f.part_order === undefined)
          ? '__sin__' : String(f.part_order);
        cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
      });

    const paleta = ['#4a6fa5', '#b0693f', '#2f7d5d', '#6b4a8f', '#a3523f'];
    return Array.from(cuenta.entries()).map(([clave, n]) => ({
      n: n,
      nombre: clave === '__sin__' ? 'Sin firmante asignado' : 'Firmante N' + clave,
      color: clave === '__sin__' ? '#c2185b' : paleta[(parseInt(clave, 10) - 1) % paleta.length],
      huerfana: clave === '__sin__'
    })).sort((a, b) => a.huerfana ? 1 : b.huerfana ? -1 : a.nombre.localeCompare(b.nombre));
  }

  /**
   * Previsualizacion de una pagina de la PLANTILLA. Aqui no hay canvas —el PDF
   * de origen no esta abierto—, asi que se dibuja solo la silueta de los
   * campos sobre un recuadro en blanco: basta para ver como quedan repartidos.
   */
  function previsualizarPlantilla(pag, tpl, ancho) {
    const camposPlantilla = pag.campos || [];
    const W = ancho || 88;
    // El marco lleva la proporcion del PAPEL...
    const papelAncho = tpl.page_width || 612;
    const papelAlto = tpl.page_height || 792;
    // ...pero los campos se dividen por el espacio de ESA pagina, que el
    // editor no comparte entre todas. Un valor global deforma las paginas
    // que ya estaban bien.
    const ancho0 = pag.coord_width || papelAncho;
    const alto0 = pag.coord_height || papelAlto;
    const alto = Math.round(W * (papelAlto / papelAncho));

    const marco = document.createElement('div');
    marco.style.cssText =
      `position:relative;width:${W}px;height:${alto}px;border:1px solid #e0d6e6;` +
      'border-radius:6px;overflow:hidden;background:#fff;flex-shrink:0;';

    // Pagina real del PDF de origen debajo de los campos. Sin ella la
    // miniatura son recuadros sueltos y no se reconoce el documento.
    if (tpl.source_pdf_url && window.pdfjsLib) {
      const cv = document.createElement('canvas');
      cv.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;opacity:.55;';
      marco.appendChild(cv);
      (async () => {
        try {
          if (!previsualizarPlantilla._pdf ||
              previsualizarPlantilla._url !== tpl.source_pdf_url) {
            // Se cachea: son once paginas y abrir el PDF una vez por
            // miniatura lo descargaria once veces.
            previsualizarPlantilla._url = tpl.source_pdf_url;
            previsualizarPlantilla._pdf =
              window.pdfjsLib.getDocument(tpl.source_pdf_url).promise;
          }
          const doc = await previsualizarPlantilla._pdf;
          const page = await doc.getPage(pag.page_number);
          const vp0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (W * 2) / vp0.width });
          cv.width = vp.width; cv.height = vp.height;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        } catch (e) { marco.style.background = '#f7f4f8'; }
      })();
    } else {
      marco.style.background = '#f7f4f8';
    }

    const paleta = ['#4a6fa5', '#b0693f', '#2f7d5d', '#6b4a8f', '#a3523f'];
    (camposPlantilla || []).forEach(f => {
      const m = document.createElement('div');
      const color = f.field_type === 'signature'
        ? (f.part_order ? paleta[(f.part_order - 1) % paleta.length] : '#c2185b')
        : (f.field_type === 'date' ? '#2f7d5d'
          : (f.field_type === 'seal' || f.field_type === 'stamp') ? '#9a6a1f'
          : f.field_type === 'final_signature' ? '#6b4a8f' : '#8a8a99');
      m.style.cssText =
        `position:absolute;left:${(f.x_position / ancho0) * 100}%;` +
        `top:${(f.y_position / alto0) * 100}%;` +
        `width:${Math.max((f.width / ancho0) * 100, 1.5)}%;` +
        `height:${Math.max((f.height / alto0) * 100, 1.2)}%;` +
        `background:${color}33;border:1px solid ${color};border-radius:2px;box-sizing:border-box;`;
      m.title = f.field_label || f.field_type;
      marco.appendChild(m);
    });

    return marco;
  }

  /**
   * Portada de la plantilla: primera pagina del PDF de origen.
   * Sin ella las tarjetas salen en blanco y no hay forma de reconocer de que
   * documento viene cada plantilla, sobre todo si le cambiaron el nombre.
   */
  function portadaPlantilla(t) {
    const W = 92, H = 120;
    const marco = document.createElement('div');
    marco.style.cssText =
      `width:${W}px;height:${H}px;border:1px solid #e0d6e6;border-radius:6px;` +
      'overflow:hidden;background:#f7f4f8;flex-shrink:0;position:relative;' +
      'display:flex;align-items:center;justify-content:center;';

    if (!t.source_pdf_url) {
      const s = document.createElement('div');
      s.textContent = 'Sin vista previa';
      s.style.cssText = 'font-size:10px;color:#a596ad;text-align:center;padding:6px;';
      marco.appendChild(s);
      return marco;
    }

    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#fff;';
    marco.appendChild(cv);

    (async () => {
      try {
        if (!window.pdfjsLib) return;
        const doc = await window.pdfjsLib.getDocument(t.source_pdf_url).promise;
        const page = await doc.getPage(1);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (W * 2) / vp0.width });
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      } catch (e) { /* la tarjeta sigue siendo usable sin portada */ }
    })();

    return marco;
  }

  /** Fuente, tamaño y color del texto, legible. */
  function formatoLegible(config) {
    if (!config) return null;
    let f = config;
    if (typeof f === 'string') {
      try { f = JSON.parse(f); } catch (e) { return null; }
    }
    if (!f || typeof f !== 'object') return null;
    const p = [
      f.fontFamily || f.font || null,
      (f.fontSize || f.size) ? ((f.fontSize || f.size) + 'pt') : null,
      f.color || null,
      f.align ? ('alin. ' + f.align) : null
    ].filter(Boolean);
    return p.length ? p.join(' · ') : null;
  }

  /** Puntito de color + texto, para las leyendas de firmante. */
  function lineaFirmante(texto, color) {
    const fila = document.createElement('div');
    fila.style.cssText =
      'display:flex;align-items:center;gap:6px;font-size:12px;color:#555;' +
      'margin-top:4px;line-height:1.4;';
    const punto = document.createElement('span');
    punto.style.cssText =
      `width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;`;
    const t = document.createElement('span');
    t.textContent = texto;
    // Un nombre largo no debe romper la tarjeta.
    t.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
    fila.appendChild(punto);
    fila.appendChild(t);
    return fila;
  }

  // ---------------------------------------------------------------------
  // EXPORTAR
  // ---------------------------------------------------------------------

  async function exportar() {
    const st = estado();
    const campos = st.fields || [];
    if (!campos.length) {
      aviso('Este documento no tiene campos para exportar', 'warning');
      return;
    }

    // Resumen por pagina, igual que lo vera despues al importar.
    const porPagina = {};
    for (const f of campos) {
      const p = f.page || 1;
      if (!porPagina[p]) {
        porPagina[p] = { page: p, total: 0, text: 0, signature: 0, date: 0, seal: 0, final_signature: 0, campos: [] };
      }
      porPagina[p].total++;
      porPagina[p].campos.push(f);
      const t = f.type === 'stamp' ? 'seal' : f.type;
      if (porPagina[p][t] !== undefined) porPagina[p][t]++;
    }

    const cont = document.createElement('div');

    const intro = document.createElement('p');
    intro.textContent =
      'Se guardaran los campos de texto, firma, fecha, sello y firma definitiva ' +
      'de este pagare, con su posicion, su formato y a que firmante pertenecen.';
    intro.style.cssText = 'margin:0 0 18px;color:#555;font-size:14px;line-height:1.5;';
    cont.appendChild(intro);

    // Nombre: se hereda del documento y se puede editar.
    const lbl = document.createElement('label');
    lbl.textContent = 'Nombre de la plantilla';
    lbl.style.cssText = 'display:block;font-size:13px;color:#2a0d31;font-weight:600;margin-bottom:6px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'tplNombre';
    input.value = (document.querySelector('.bar strong') || {}).textContent || 'Plantilla';
    input.maxLength = 255;
    input.style.cssText =
      'width:100%;padding:10px 12px;border:1px solid #d9cfe0;border-radius:8px;' +
      'font-size:14px;margin-bottom:22px;color:#2a0d31;';
    cont.appendChild(lbl);
    cont.appendChild(input);

    // Resumen de firmas del documento entero, arriba del todo: es lo que hay
    // que comprobar antes de exportar nada.
    const firmasDoc = firmasPorFirmante(campos, st.parts);
    if (firmasDoc.length) {
      const caja = document.createElement('div');
      caja.style.cssText =
        'border:1px solid #e6dfea;border-radius:10px;padding:14px 16px;' +
        'background:#faf8fb;margin-bottom:20px;';
      const ct = document.createElement('div');
      ct.textContent = 'Campos de firma, por firmante';
      ct.style.cssText = 'font-size:13px;font-weight:600;color:#2a0d31;margin-bottom:4px;';
      caja.appendChild(ct);
      firmasDoc.forEach(fp => {
        caja.appendChild(lineaFirmante(
          `${fp.n} ${fp.n === 1 ? 'campo' : 'campos'} — ${fp.nombre}`, fp.color
        ));
      });
      if (firmasDoc.some(f => f.huerfana)) {
        const alerta = document.createElement('div');
        alerta.textContent =
          'Hay campos de firma sin firmante asignado. Al importar la plantilla ' +
          'nadie sabra a quien pertenecen: conviene asignarlos antes de exportar.';
        alerta.style.cssText =
          'margin-top:10px;font-size:12px;color:#c2185b;background:#fdf2f0;' +
          'border:1px solid #f0d4cf;border-radius:6px;padding:8px 10px;line-height:1.45;';
        caja.appendChild(alerta);
      }
      cont.appendChild(caja);
    }

    const tit = document.createElement('div');
    tit.textContent = 'Campos encontrados';
    tit.style.cssText = 'font-size:13px;font-weight:600;color:#2a0d31;margin-bottom:10px;';
    cont.appendChild(tit);

    const rejilla = document.createElement('div');
    // Alto uniforme: una pagina Oficio es mas alta que una Carta y sin esto
    // desborda su tarjeta.
    rejilla.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));' +
      'grid-auto-rows:minmax(228px,auto);gap:14px;min-width:0;';

    Object.values(porPagina).sort((a, b) => a.page - b.page).forEach(p => {
      const tarjeta = document.createElement('div');
      tarjeta.style.cssText =
        'border:1px solid #e6dfea;border-radius:10px;padding:14px;background:#fdfcfd;' +
        'display:flex;gap:12px;align-items:flex-start;min-width:0;' +
        'height:100%;box-sizing:border-box;overflow:hidden;';

      // Miniatura mas pequeña: a 120px una pagina Oficio mide casi 200 de alto
      // y se salia de la tarjeta.
      tarjeta.appendChild(construirPrevisualizacion(p.page, p.campos, st, 196));

      // min-width:0 es lo que impide que un nombre largo desborde la tarjeta
      // dentro de un contenedor flex.
      const texto = document.createElement('div');
      texto.style.cssText = 'min-width:0;flex:1;';

      const t = document.createElement('div');
      t.textContent = `Pagina ${p.page}`;
      t.style.cssText = 'font-weight:600;color:#2a0d31;font-size:14px;margin-bottom:4px;';
      const d = document.createElement('div');
      d.textContent = resumirCampos(p);
      d.style.cssText = 'font-size:12.5px;color:#666;line-height:1.5;overflow-wrap:anywhere;';
      texto.appendChild(t);
      texto.appendChild(d);

      firmasPorFirmante(p.campos, st.parts).forEach(fp => {
        texto.appendChild(lineaFirmante(`${fp.n} × ${fp.nombre}`, fp.color));
      });

      tarjeta.appendChild(texto);
      rejilla.appendChild(tarjeta);
    });
    cont.appendChild(rejilla);

    const total = document.createElement('p');
    total.textContent = `${campos.length} campo(s) en ${Object.keys(porPagina).length} pagina(s)`;
    total.style.cssText = 'margin:16px 0 0;font-size:13px;color:#777;';
    cont.appendChild(total);

    // Campos de texto mapeados, con su formato. Es lo que de verdad se
    // reutiliza: la etiqueta dice de que columna del CSV se llena cada hueco,
    // y el formato evita rehacer fuente y tamaño en cada grado.
    const textos = campos.filter(f => f.type === 'text');
    // El desglose sale siempre que haya campos, aunque el pagare no tenga
    // ninguno de texto: tambien se exportan firmas, sellos y firma definitiva.
    if (campos.length) {
      const tit2 = document.createElement('div');
      tit2.textContent = 'Campos guardados, por pagina';
      tit2.style.cssText =
        'font-size:13px;font-weight:600;color:#2a0d31;margin:24px 0 4px;';
      cont.appendChild(tit2);

      const fmt = textos.find(f => f.format) || {};
      if (fmt.format) {
        const f = fmt.format;
        const linea = [
          f.fontFamily || f.font || 'Fuente por defecto',
          (f.fontSize || f.size) ? ((f.fontSize || f.size) + 'pt') : null,
          f.color ? ('color ' + f.color) : null,
          f.align ? ('alin. ' + f.align) : null
        ].filter(Boolean).join(' · ');
        const sub = document.createElement('div');
        sub.textContent = 'Formato guardado: ' + linea;
        sub.style.cssText =
          'font-size:12px;color:#6d6270;background:#faf6fb;border-radius:6px;' +
          'padding:6px 10px;margin-bottom:10px;display:inline-block;' +
          'overflow-wrap:anywhere;';
        cont.appendChild(sub);
      }

      // Agrupados por pagina y plegables: son 60 campos y en una sola lista
      // no hay quien los revise.
      const porPag = new Map();
      campos.slice().sort((a, b) => a.page - b.page).forEach(f => {
        if (!porPag.has(f.page)) porPag.set(f.page, []);
        porPag.get(f.page).push(f);
      });

      const NOMBRE_TIPO = {
        text: 'Texto', signature: 'Firma', date: 'Fecha',
        seal: 'Sello', stamp: 'Sello', final_signature: 'Firma definitiva'
      };
      const COLOR_TIPO = {
        text: '#8a8a99', signature: '#4a6fa5', date: '#2f7d5d',
        seal: '#9a6a1f', stamp: '#9a6a1f', final_signature: '#6b4a8f'
      };

      porPag.forEach((lista, numPag) => {
        const det = document.createElement('details');
        det.style.cssText =
          'border:1px solid #ece5f0;border-radius:8px;background:#fdfcfd;' +
          'margin-bottom:8px;min-width:0;';

        const sum = document.createElement('summary');
        const sinMap = lista.filter(f => f.type === 'text' && !f.label).length;
        sum.textContent = `Pagina ${numPag} — ${lista.length} campo(s)` +
          (sinMap ? ` · ${sinMap} de texto sin mapear` : '');
        sum.style.cssText =
          'padding:9px 12px;cursor:pointer;font-size:12.5px;font-weight:600;' +
          'user-select:none;color:' + (sinMap ? '#c2185b' : '#2b0e31') + ';';
        det.appendChild(sum);

        const caja = document.createElement('div');
        caja.style.cssText =
          'display:grid;grid-template-columns:repeat(auto-fill,minmax(195px,1fr));' +
          'gap:5px;padding:0 12px 12px;min-width:0;';

        // SIN reordenar por tipo: se respeta el orden en que estan en el
        // documento. Ese orden es el que decide a que responsable pertenece
        // cada etiqueta repetida —"Nombre:" sale seis veces en el pagare— y
        // alterarlo aqui daria una idea falsa de como se va a exportar.
        lista.slice()
          .sort((a, b) => (a.y - b.y) || (a.x - b.x))
          .forEach(f => {
            const fila = document.createElement('div');
            fila.style.cssText =
              'font-size:11.5px;color:#444;padding:4px 7px;background:#fff;' +
              'border:1px solid #ece5f0;border-radius:5px;min-width:0;' +
              'display:flex;gap:6px;align-items:baseline;overflow-wrap:anywhere;';

            const tipo = document.createElement('span');
            tipo.textContent = NOMBRE_TIPO[f.type] || f.type;
            tipo.style.cssText =
              `flex-shrink:0;font-size:10px;font-weight:700;` +
              `color:${COLOR_TIPO[f.type] || '#8a8a99'};text-transform:uppercase;` +
              'letter-spacing:.3px;';

            const val = document.createElement('span');
            if (f.type === 'text') {
              // Solo el texto se mapea a una columna del CSV.
              val.textContent = f.label || '(sin mapear)';
              if (!f.label) val.style.cssText = 'color:#c2185b;font-style:italic;';
            } else {
              // El resto: a quien pertenece. El sello y la firma definitiva no
              // llevan firmante a proposito.
              const duenio = nombreFirmante(f, st.parts);
              val.textContent = duenio || '—';
              if (duenio) val.style.color = '#2b0e31';
              else val.style.color = '#9a8aa3';
            }
            val.style.minWidth = '0';

            fila.appendChild(tipo);
            fila.appendChild(val);
            caja.appendChild(fila);
          });

        det.appendChild(caja);
        cont.appendChild(det);
      });


      const sinMapear = textos.filter(f => !f.label).length;
      if (sinMapear) {
        const av = document.createElement('div');
        av.textContent =
          `${sinMapear} campo(s) de texto sin etiqueta: al importar la plantilla ` +
          `no sabran de que columna del CSV llenarse.`;
        av.style.cssText =
          'margin-top:10px;font-size:12px;color:#c2185b;background:#fdf2f0;' +
          'border:1px solid #f0d4cf;border-radius:6px;padding:8px 10px;line-height:1.45;';
        cont.appendChild(av);
      }
    }

    const btn = document.createElement('button');
    btn.textContent = 'Exportar plantilla';
    btn.className = 'chip primary';
    btn.onclick = () => guardarPlantilla(input.value, false, btn);

    abrirModal('Exportar plantilla', cont, [btn]);
    setTimeout(() => input.focus(), 50);
  }

  async function guardarPlantilla(nombre, forzar, btn) {
    const docId = estado().docId;
    if (!docId) { aviso('No se pudo identificar el documento', 'error'); return; }

    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
      // EXPORTAR NO GUARDA EL DOCUMENTO. Los campos se mandan tal como estan
      // pintados en el editor, asi que la plantilla queda guardada y el
      // documento no se toca: si el operador sale sin pulsar GUARDAR, su
      // documento sigue como estaba y no aparece listo para envio.
      const st = estado();
      const orden = new Map((st.parts || []).map(p => [String(p.roleId), p.order]));

      // Las coordenadas del editor llevan la escala del viewport aplicada
      // (~1.4); `document_fields` las guarda SIN ella, en espacio PDF, porque
      // saveFieldsToBackend divide antes de escribir.
      //
      // La plantilla tiene que guardarlas igual que `document_fields`: al
      // importar, aplicarCamposImportados vuelve a multiplicar por la escala.
      // Sin esta division los campos se guardan 1.4 veces mas grandes, se
      // salen de la pagina en la previsualizacion y al importarlos caen
      // desplazados.
      // La escala la manda el editor (VIEWPORT_SCALE). El respaldo solo actua
      // si getEditorState no la devolvio, y entonces avisa: exportar con una
      // escala equivocada deja la plantilla inservible sin dar ningun error.
      if (!st.viewportScale) {
        console.warn('[PLANTILLAS] El editor no informo viewportScale; se usa 1.4. ' +
                     'Si el editor cambio de escala, esta exportacion saldra mal.');
      }
      const ESCALA = st.viewportScale || 1.4;
      const campos = (st.fields || []).map(f => ({
        field_type: f.type,
        page_number: f.page,
        x_position: f.x / ESCALA, y_position: f.y / ESCALA,
        width: f.w / ESCALA, height: f.h / ESCALA,
        field_label: f.label,
        // Fuente, tamaño, color y alineacion viajan con el campo.
        field_config: f.format || null,
        // El ORDEN del firmante, nunca su id: en otro pagare ese id es de otra
        // persona. El sello y la firma definitiva no llevan firmante.
        part_order: (f.roleId !== null && f.roleId !== undefined)
          ? (orden.get(String(f.roleId)) || null) : null
      }));

      const r = await fetch(`${API}/export/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.assign(
          { name: (nombre || '').trim(), forzar: !!forzar, campos: campos },
          tamanoPagina()
        ))
      });
      const data = await r.json();

      // Duplicado: la misma estructura ya se exporto antes. Se compara por los
      // mapeos, no por el nombre.
      if (r.status === 409 && data.code === 'YA_EXISTE') {
        if (btn) { btn.disabled = false; btn.textContent = 'Exportar plantilla'; }
        const fecha = data.data && data.data.created_at
          ? new Date(data.data.created_at).toLocaleDateString('es-CO')
          : '';
        const msg = `Ya existe una plantilla con estos mismos campos: ` +
                    `"${data.data.name}"${fecha ? ' del ' + fecha : ''}. ` +
                    `¿Guardar otra igual de todos modos?`;
        if (confirm(msg)) guardarPlantilla(nombre, true, btn);
        return;
      }

      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo guardar');

      cerrarModal();
      // "Exportada", no "guardada": el operador sigue en el editor y el boton
      // GUARDAR —el que si redirige al tracker— esta todavia por pulsar.
      aviso(
        `Plantilla "${data.data.name}" exportada con ${data.data.total_fields} campos. ` +
        `Los campos quedaron guardados en el documento.`,
        'success'
      );
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Exportar plantilla'; }
      aviso('Error al guardar la plantilla: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------
  // IMPORTAR
  // ---------------------------------------------------------------------

  async function importar() {
    try {
      const r = await fetch(API, { credentials: 'same-origin' });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudieron cargar las plantillas');

      const lista = data.data || [];
      const cont = document.createElement('div');

      if (!lista.length) {
        const vacio = document.createElement('p');
        vacio.textContent =
          'Todavia no hay plantillas guardadas. Pinte los campos de un pagare y ' +
          'use "Exportar plantilla" para reutilizarlos despues.';
        vacio.style.cssText = 'margin:0;color:#666;font-size:14px;line-height:1.6;';
        cont.appendChild(vacio);
        abrirModal('Mis plantillas', cont, []);
        return;
      }

      // Filtro por fecha. Con once grados por colegio la lista crece rapido y
      // lo que se busca casi siempre es "la del ultimo envio".
      const barra = document.createElement('div');
      barra.style.cssText =
        'display:flex;align-items:center;gap:10px;margin:0 0 18px;flex-wrap:wrap;';

      const etq = document.createElement('label');
      etq.textContent = 'Ordenar por';
      etq.style.cssText = 'font-size:13px;color:#6d6270;';

      const orden = document.createElement('select');
      orden.style.cssText =
        'padding:6px 10px;border:1px solid #d9cfe0;border-radius:8px;' +
        'font-size:13px;color:#2b0e31;background:#fff;cursor:pointer;';
      [['recientes', 'Mas recientes primero'],
       ['antiguas', 'Mas antiguas primero'],
       ['nombre', 'Nombre (A-Z)']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        orden.appendChild(o);
      });

      const cuenta = document.createElement('span');
      cuenta.style.cssText = 'font-size:12.5px;color:#9a8aa3;margin-left:auto;';
      cuenta.textContent = lista.length === 1
        ? '1 plantilla' : `${lista.length} plantillas`;

      barra.appendChild(etq);
      barra.appendChild(orden);
      barra.appendChild(cuenta);
      cont.appendChild(barra);

      const rejilla = document.createElement('div');
      // Mas ancho: ahora cada tarjeta lleva portada ademas de los datos.
      rejilla.style.cssText =
        'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));' +
        'gap:14px;min-width:0;';

      function pintar(orden) {
        while (rejilla.firstChild) rejilla.removeChild(rejilla.firstChild);
        const ordenada = lista.slice().sort((a, b) => {
          if (orden === 'nombre') return (a.name || '').localeCompare(b.name || '');
          const fa = new Date(a.created_at || 0).getTime();
          const fb = new Date(b.created_at || 0).getTime();
          return orden === 'antiguas' ? fa - fb : fb - fa;
        });
        ordenada.forEach(t => {
        const tarjeta = document.createElement('div');
        tarjeta.style.cssText =
          'border:1px solid #e6dfea;border-radius:10px;padding:16px;cursor:pointer;' +
          'background:#fdfcfd;transition:border-color .15s,box-shadow .15s;';
        tarjeta.onmouseenter = () => {
          tarjeta.style.borderColor = '#c2185b';
          tarjeta.style.boxShadow = '0 2px 10px rgba(42,13,49,.08)';
        };
        tarjeta.onmouseleave = () => {
          tarjeta.style.borderColor = '#e6dfea';
          tarjeta.style.boxShadow = 'none';
        };
        tarjeta.onclick = () => personalizar(t.template_id);

        const nom = document.createElement('div');
        nom.textContent = t.name;
        // Negrita real y sin recortar: el nombre es lo que se lee primero.
        nom.style.cssText =
          'font-weight:800;color:#2a0d31;font-size:15px;margin-bottom:8px;' +
          'line-height:1.35;overflow-wrap:anywhere;';

        const det = document.createElement('div');
        det.textContent = resumirCampos({
          text: t.text_fields, signature: t.signature_fields,
          date: t.date_fields, seal: t.seal_fields,
          final_signature: t.final_signature_fields
        });
        det.style.cssText = 'font-size:13px;color:#666;line-height:1.5;margin-bottom:8px;';

        const meta = document.createElement('div');
        const tam = t.page_size_name ? ` · ${t.page_size_name}` : '';
        const fecha = t.created_at
          ? new Date(t.created_at).toLocaleDateString('es-CO',
              { day: '2-digit', month: 'short', year: 'numeric' })
          : '';
        meta.textContent =
          `${t.page_count} pagina(s)${tam}` + (fecha ? ` · ${fecha}` : '');
        meta.style.cssText = 'font-size:12px;color:#999;';

        // Portada a la izquierda, datos a la derecha.
        tarjeta.style.cssText += 'display:flex;gap:14px;align-items:flex-start;min-width:0;';
        tarjeta.appendChild(portadaPlantilla(t));

        const datos = document.createElement('div');
        datos.style.cssText = 'min-width:0;flex:1;';
        datos.appendChild(nom);
        datos.appendChild(det);
        datos.appendChild(meta);
        tarjeta.appendChild(datos);

        if (t.team_name) {
          const eq = document.createElement('div');
          eq.textContent = t.team_name;
          eq.style.cssText = 'font-size:12px;color:#c2185b;margin-top:6px;';
          datos.appendChild(eq);
        }
        rejilla.appendChild(tarjeta);
        });
      }

      cont.appendChild(rejilla);
      pintar('recientes');
      orden.addEventListener('change', () => pintar(orden.value));

      // Descripcion abajo, como footer, con una linea solida encima: arriba
      // empujaba las plantillas y se leia antes de lo que importa.
      const pie = document.createElement('div');
      // Lo que de verdad hay que dejar claro: que se elige que paginas traer,
      // y que nada queda guardado hasta pulsar GUARDAR.
      pie.textContent =
        'Al elegir una plantilla podrá escoger qué páginas traer y a qué página ' +
        'del documento va cada una. Los campos se colocan con su posición, su ' +
        'fuente y su firmante, y quedan listos para revisar: no se guardan en el ' +
        'documento hasta que pulse GUARDAR.';
      pie.style.cssText =
        'margin-top:22px;padding-top:14px;border-top:1px solid #e6dfea;' +
        'font-size:12.5px;color:#6d6270;line-height:1.5;';
      cont.appendChild(pie);

      abrirModal('Mis plantillas', cont, []);
    } catch (e) {
      aviso('Error al cargar las plantillas: ' + e.message, 'error');
    }
  }

  /** Segunda pantalla: elegir que paginas importar y a donde. */
  async function personalizar(templateId) {
    try {
      const r = await fetch(`${API}/${templateId}`, { credentials: 'same-origin' });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo cargar la plantilla');

      const tpl = data.data;
      const paginasDoc = estado().totalPages || 1;
      const cont = document.createElement('div');

      // Aviso de tamaño distinto: los campos se colocan con sus posiciones
      // originales, NO se escalan. Escalar mal desplaza un campo a la columna
      // del otro responsable.
      const tam = tamanoPagina();
      if (tpl.page_width && tam.page_width &&
          (Math.abs(tpl.page_width - tam.page_width) > 6 ||
           Math.abs(tpl.page_height - tam.page_height) > 6)) {
        const al = document.createElement('div');
        al.style.cssText =
          'background:#fff8e6;border:1px solid #f0d9a0;border-radius:10px;' +
          'padding:14px 16px;margin-bottom:20px;font-size:13px;color:#7a5a12;line-height:1.6;';
        al.textContent =
          `Estos campos vienen de "${tpl.source_document_name || tpl.name}", que era tamano ` +
          `${tpl.page_size_name || tpl.page_width + ' x ' + tpl.page_height}. ` +
          `Este documento es ${Math.round(tam.page_width)} x ${Math.round(tam.page_height)}, ` +
          `asi que puede que tenga que reubicarlos. Mantenga Shift y haga clic ` +
          `para seleccionar varios campos y moverlos juntos.`;
        cont.appendChild(al);
      }

      const tit = document.createElement('div');
      tit.textContent = 'Importar por pagina';
      tit.style.cssText = 'font-size:13px;font-weight:600;color:#2a0d31;margin-bottom:12px;';
      cont.appendChild(tit);

      const rejilla = document.createElement('div');
      // Todas las tarjetas con el MISMO alto, definido por la rejilla y no por
      // su contenido: asi la vista queda pareja aunque una pagina tenga dos
      // firmantes y otra ninguno.
      //
      // align-items:start ademas evita que, al desplegar los mapeos de una,
      // las demas se estiren a su alto y dejen un hueco en blanco.
      rejilla.style.cssText =
        'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));' +
        'grid-auto-rows:minmax(236px,auto);' +
        'gap:14px;min-width:0;';

      const seleccion = {};

      (tpl.paginas || []).forEach(p => {
        const tarjeta = document.createElement('div');
        tarjeta.style.cssText =
          'border:1px solid #e6dfea;border-radius:10px;padding:14px;background:#fdfcfd;' +
          'display:flex;flex-direction:column;min-width:0;height:100%;' +
          'box-sizing:border-box;';

        const fila = document.createElement('label');
        fila.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:8px;';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = true;
        chk.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:#2a0d31;';
        const et = document.createElement('span');
        et.textContent = `Pagina ${p.page_number} de ${tpl.page_count}`;
        et.style.cssText = 'font-weight:600;color:#2a0d31;font-size:14px;';
        fila.appendChild(chk);
        fila.appendChild(et);

        const det = document.createElement('div');
        det.textContent = resumirCampos(p);
        det.style.cssText =
          'font-size:13px;color:#666;line-height:1.5;margin-bottom:8px;' +
          'min-height:39px;overflow-wrap:anywhere;';

        // Pagina destino: por defecto la misma. Si el documento tiene menos
        // paginas, se avisa y la casilla queda desmarcada.
        const dest = document.createElement('div');
        dest.style.cssText =
          'display:flex;align-items:center;gap:8px;font-size:12px;color:#777;' +
          'margin-top:10px;flex-wrap:wrap;';
        const lab = document.createElement('span');
        lab.textContent = 'Colocar en la pagina';
        const sel = document.createElement('select');
        sel.style.cssText =
          'padding:4px 8px;border:1px solid #d9cfe0;border-radius:6px;font-size:13px;color:#2a0d31;';
        for (let i = 1; i <= paginasDoc; i++) {
          const o = document.createElement('option');
          o.value = i;
          o.textContent = i;
          if (i === p.page_number) o.selected = true;
          sel.appendChild(o);
        }
        dest.appendChild(lab);
        dest.appendChild(sel);

        seleccion[p.page_number] = { chk, sel };

        // Miniatura a la izquierda, datos a la derecha, dentro de una fila
        // que ocupa todo el alto util de la tarjeta.
        const cuerpo = document.createElement('div');
        cuerpo.style.cssText =
          'display:flex;gap:12px;align-items:flex-start;min-width:0;flex:1;';
        cuerpo.appendChild(previsualizarPlantilla(p, tpl, 120));

        const texto = document.createElement('div');
        texto.style.cssText =
          'min-width:0;flex:1;display:flex;flex-direction:column;';
        texto.appendChild(fila);
        texto.appendChild(det);

        const zonaFirmas = document.createElement('div');
        // Altura reservada: dos lineas de firmante. Sin esto, las paginas sin
        // firmas quedan mas bajas y la rejilla se ve descuadrada.
        zonaFirmas.style.cssText = 'min-height:42px;min-width:0;';
        firmasPorOrden(p.campos).forEach(fp => {
          zonaFirmas.appendChild(lineaFirmante(`${fp.n} × ${fp.nombre}`, fp.color));
        });
        texto.appendChild(zonaFirmas);

        // Mapeos de los campos de texto de esta pagina, con su fuente. Es lo
        // que empareja cada hueco con su columna del CSV: hay que poder verlo
        // ANTES de importar, no despues de enviar el documento.
        const textos = (p.campos || []).filter(c => c.field_type === 'text');
        let caja = null;
        if (textos.length) {
          // Footer de la tarjeta: separado con una linea, debajo de todo.
          caja = document.createElement('details');
          // Sin min-height ni flex: la franja mide lo que mide su enlace, y el
          // aire se reparte con padding igual arriba y abajo. Asi no queda el
          // texto pegado a la linea con un hueco debajo.
          caja.style.cssText =
            'margin:12px -14px -14px;border-top:1px solid #f0eaf3;' +
            'min-width:0;position:relative;' +
            // Sigue la curva de la tarjeta, que si no la corta en las esquinas.
            'border-radius:0 0 10px 10px;';

          const res = document.createElement('summary');
          res.textContent = `Ver los ${textos.length} mapeos de texto`;
          // Berenjena de marca, no el magenta, que aqui compite con los avisos.
          // Centrado en su franja: el marcador del details se pone dentro del
          // flujo con inline-flex para que no lo desplace a la izquierda.
          res.style.cssText =
            'font-size:12px;color:#2b0e31;cursor:pointer;font-weight:600;' +
            'list-style:none;text-align:center;padding:12px 12px;' +
            'user-select:none;';
          res.addEventListener('click', () => {
            // El triangulo se dibuja aqui para poder centrarlo con el texto.
            setTimeout(() => {
              res.textContent = (caja.open ? '▾ ' : '▸ ') +
                `Ver los ${textos.length} mapeos de texto`;
            }, 0);
          });
          res.textContent = `▸ Ver los ${textos.length} mapeos de texto`;
          caja.appendChild(res);


          const ul = document.createElement('div');
          // Flotante sobre la tarjeta: dentro del flujo, abrirla estiraba la
          // fila entera de la rejilla y las tarjetas vecinas crecian con ella.
          ul.style.cssText =
            'position:absolute;left:0;right:0;top:100%;z-index:5;' +
            'margin-top:4px;background:#fff;border:1px solid #e6dfea;' +
            'border-radius:8px;padding:12px 14px;box-sizing:border-box;' +
            'box-shadow:0 8px 24px rgba(20,8,24,.14);' +
            'font-size:11.5px;color:#555;line-height:1.6;max-height:220px;' +
            'overflow-y:auto;overflow-wrap:anywhere;';
          const fmt = formatoLegible((textos.find(c => c.field_config) || {}).field_config);
          if (fmt) {
            const f = document.createElement('div');
            f.textContent = 'Fuente: ' + fmt;
            f.style.cssText =
              'font-size:11.5px;color:#6d6270;margin:0 0 6px;padding-bottom:6px;' +
              'border-bottom:1px solid #f0eaf3;overflow-wrap:anywhere;';
            ul.appendChild(f);
          }

          textos.forEach(c => {
            const l = document.createElement('div');
            l.textContent = '· ' + (c.field_label || '(sin mapear)');
            if (!c.field_label) l.style.color = '#c2185b';
            ul.appendChild(l);
          });
          caja.appendChild(ul);
        }

        // margin-top:auto empuja el selector y el footer al fondo, asi quedan
        // alineados entre tarjetas aunque el contenido de arriba varie.
        dest.style.marginTop = 'auto';
        texto.appendChild(dest);

        // El aviso va DESPUES de los controles, que es donde se lee.
        if (p.page_number > paginasDoc) {
          chk.checked = false;
          const w = document.createElement('div');
          w.textContent = `Este documento solo tiene ${paginasDoc} pagina(s)`;
          w.style.cssText = 'font-size:12px;color:#c2185b;margin-top:8px;line-height:1.4;';
          texto.appendChild(w);
        }

        cuerpo.appendChild(texto);
        tarjeta.appendChild(cuerpo);
        // Footer a lo ancho de toda la tarjeta, debajo de la miniatura y de
        // los datos. Es informacion de consulta, no un control.
        if (caja) tarjeta.appendChild(caja);
        rejilla.appendChild(tarjeta);
      });

      cont.appendChild(rejilla);

      const btn = document.createElement('button');
      btn.textContent = 'Importar';
      btn.className = 'chip primary';
      btn.onclick = () => {
        const mapa = {};
        for (const [pag, ctl] of Object.entries(seleccion)) {
          if (ctl.chk.checked) mapa[pag] = parseInt(ctl.sel.value, 10);
        }
        if (!Object.keys(mapa).length) {
          aviso('Seleccione al menos una pagina', 'warning');
          return;
        }
        aplicarImportacion(templateId, mapa, btn);
      };

      abrirModal('Personalice su importacion', cont, [btn]);
    } catch (e) {
      aviso('Error: ' + e.message, 'error');
    }
  }

  async function aplicarImportacion(templateId, mapaPaginas, btn) {
    const docId = estado().docId;
    if (!docId) { aviso('No se pudo identificar el documento', 'error'); return; }

    // Ya hay campos pintados sin guardar: el backend no los ve —no estan en la
    // base— asi que su comprobacion no salta y se duplicarian en pantalla.
    const yaHay = (estado().fields || []).length;
    if (yaHay) {
      aviso(`Este documento ya tiene ${yaHay} campo(s) sin guardar. ` +
            `Bórrelos o pulse GUARDAR antes de importar.`, 'warning');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

    try {
      const r = await fetch(`${API}/${templateId}/import/${docId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(Object.assign({ paginas: mapaPaginas }, tamanoPagina()))
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || 'No se pudo importar');

      cerrarModal();

      // Los campos NO estan guardados: el backend solo los calcula. Se pintan
      // aqui y el operador decide. Asi importar no equivale a enviar, se puede
      // seguir editando, y GUARDAR sigue siendo el unico que escribe.
      if (typeof window.aplicarCamposImportados === 'function') {
        window.aplicarCamposImportados(data.data.campos || []);
      }

      let msg = `${data.data.colocados} campo(s) importado(s)`;
      if (data.data.omitidos) msg += `, ${data.data.omitidos} omitido(s)`;
      msg += '. Pulse GUARDAR para conservarlos.';
      aviso(msg, 'success');

      if (data.data.aviso_tamano) {
        const a = data.data.aviso_tamano;
        setTimeout(() => {
          aviso(
            `Los campos vienen de un documento tamano ${a.origen} y este es ${a.destino}. ` +
            `Revise su posicion antes de guardar.`,
            'warning'
          );
        }, 900);
      }

      // Sin recargar la pagina: recargar perdia los campos —que aun no estan
      // en la base— y ademas provocaba el parpadeo de "vacio y luego relleno".
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Importar'; }
      aviso('Error al importar: ' + e.message, 'error');
    }
  }

  // ---------------------------------------------------------------------
  // Enganche con el editor
  // ---------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    const exp = document.getElementById('exportTemplateBtn');
    const imp = document.getElementById('importTemplateBtn');
    if (exp) exp.addEventListener('click', exportar);
    if (imp) imp.addEventListener('click', importar);
  });
})();
