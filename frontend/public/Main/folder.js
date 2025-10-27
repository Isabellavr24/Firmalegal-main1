(function () {
  const grid = document.getElementById('docsGrid');
  const titleEl = document.getElementById('folderTitle');

  const params = new URLSearchParams(location.search);
  const folderId = params.get('id') || '';
  const folderName = params.get('name') ? decodeURIComponent(params.get('name')) : 'Carpeta';
  titleEl.textContent = folderName;

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const day  = new Intl.DateTimeFormat('es-ES', { day:'2-digit' }).format(d);
    let mon    = new Intl.DateTimeFormat('es-ES', { month:'short' }).format(d);
    mon = mon.replace('.', '');
    const time = new Intl.DateTimeFormat('es-ES', { hour:'2-digit', minute:'2-digit' }).format(d);
    return `${day} de ${mon} ${time}`;
  }

  function docCardTemplate(doc){
    const art = document.createElement('article');
    art.className = 'card doc';
    art.innerHTML = `
      <a class="card-link" href="#">
        <div class="doc-body">
          <h3 class="title">${doc.title || doc.name || 'Documento'}</h3>
          <div class="badges">
            <span class="small">${doc.owner_name || 'PKI SERVICES'}</span>
            <span class="small muted">${fmtDate(doc.updated_at || doc.created_at || new Date().toISOString())}</span>
          </div>
        </div>
      </a>
    `;
    art.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Abrir documento', doc.id);
      // TODO: integrar con tu visor
    });
    return art;
  }

  async function fetchDocs(){
    const url = `/api/documents?folder_id=${encodeURIComponent(folderId)}&is_template=1`;
    try {
      const res = await fetch(url, { headers: { 'Accept':'application/json' }});
      if (!res.ok) throw 0;
      const json = await res.json();
      if (json?.data && Array.isArray(json.data)) return json.data;
      throw 0;
    } catch {
      // Fallback demo
      return [
        { id: 101, title: 'otro si al contrato de arrendamiento', owner_name:'PKI SERVICES', updated_at:'2024-09-25T11:11:00' },
        { id: 102, title: 'contrato de arrendamiento 2DO PISO',   owner_name:'PKI SERVICES', updated_at:'2024-09-25T10:21:00' },
        { id: 103, title: 'Contrato PKI custodia e - Título Valor', owner_name:'PKI SERVICES', updated_at:'2024-08-19T08:33:00' },
        { id: 104, title: 'CONTRATO DE ARRENDAMIENTO', owner_name:'PKI SERVICES', updated_at:'2024-07-28T15:59:00' },
      ];
    }
  }

  async function render(){
    const docs = await fetchDocs();
    grid.innerHTML = '';
    if (!docs.length) {
      grid.innerHTML = '<p>No hay documentos en esta carpeta.</p>';
      return;
    }
    docs.forEach(d => grid.appendChild(docCardTemplate(d)));
  }

  document.addEventListener('DOMContentLoaded', render);
})();
