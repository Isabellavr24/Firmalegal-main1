
// ==================== E-TITULO VALOR ====================

// POST /api/documents/:id/enviar-etitulo
app.post('/api/documents/:id/enviar-etitulo', requireAuth, async (req, res) => {
    const docId = parseInt(req.params.id);
    const { beneficiarioId } = req.body;

    if (!beneficiarioId) {
        return res.status(400).json({ success: false, message: 'BeneficiarioId es requerido' });
    }

    try {
        // 1. Obtener datos del documento
        const [docRows] = await db.promise().query(
            `SELECT d.document_id, d.title, d.signed_file_path, d.created_at, d.tv_guid
             FROM documents d WHERE d.document_id = ? AND d.owner_id = ? AND d.document_type = 'pagare'`,
            [docId, req.userId]
        );
        if (!docRows.length) return res.status(404).json({ success: false, message: 'Pagaré no encontrado' });
        const doc = docRows[0];

        if (doc.tv_guid) {
            return res.status(400).json({ success: false, message: 'Este pagaré ya fue enviado al baúl', tv_guid: doc.tv_guid });
        }
        if (!doc.signed_file_path) {
            return res.status(400).json({ success: false, message: 'El pagaré aún no tiene PDF firmado' });
        }

        // 2. Obtener recipients (firmantes)
        const [recipients] = await db.promise().query(
            `SELECT dr.name, dr.email, dp.role_name
             FROM document_recipients dr
             LEFT JOIN document_parts dp ON dr.part_id = dp.part_id
             WHERE dr.document_id = ? AND dr.is_final_signer = 0 AND dr.status = 'completed'`,
            [docId]
        );

        // 3. Leer PDF y convertir a base64
        const pdfPath = resolveFromRoot(doc.signed_file_path.replace(/^\/+/, ''));
        if (!fs.existsSync(pdfPath)) {
            return res.status(500).json({ success: false, message: 'PDF firmado no encontrado en servidor' });
        }
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString('base64');

        // 4. Calcular hash SHA256 del base64 (en ASCII, como indica el manual)
        const hashDocumento = crypto.createHash('sha256')
            .update(Buffer.from(pdfBase64, 'ascii'))
            .digest('hex')
            .toUpperCase();

        // 5. Obtener token de e-titulo
        const TV_API_URL = process.env.TV_API_URL || 'https://ra.pkiservices.co/api';

        console.log(`📦 [E-TITULO] Obteniendo token para documento ${docId}...`);
        const tokenResp = await fetch(`${TV_API_URL}/Token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: process.env.TV_API_USUARIO, clave: process.env.TV_API_CLAVE })
        });
        const tokenData = await tokenResp.json();
        if (!tokenData.dato) {
            return res.status(500).json({ success: false, message: 'Error obteniendo token de e-titulo', detail: tokenData });
        }
        const tvToken = tokenData.dato;
        console.log(`✅ [E-TITULO] Token obtenido`);

        // 6. Mapear contactos — rol DEUDOR/CODEUDOR
        const rolMap = (roleName) => {
            if (!roleName) return 'DEUDOR';
            const r = roleName.toUpperCase();
            if (r.includes('CODEUDOR') || r.includes('COD') || r.includes('N2')) return 'CODEUDOR';
            return 'DEUDOR';
        };

        const contactos = recipients.map(r => {
            const parts = (r.name || '').trim().split(' ');
            return {
                nombre: parts[0] || r.email,
                apellido: parts.slice(1).join(' ') || '',
                rolFirmante: rolMap(r.role_name),
                tipoDocumento: 'CC',
                numeroDocumento: '',
                correo: r.email,
                telefono: ''
            };
        });

        // Garantizar al menos un DEUDOR
        if (!contactos.length || !contactos.some(c => c.rolFirmante === 'DEUDOR')) {
            if (contactos.length) contactos[0].rolFirmante = 'DEUDOR';
            else contactos.push({
                nombre: 'Firmante', apellido: '', rolFirmante: 'DEUDOR',
                tipoDocumento: 'CC', numeroDocumento: '', correo: '', telefono: ''
            });
        }

        // 7. Enviar pagaré al baúl
        const payload = {
            BeneficiarioId: parseInt(beneficiarioId),
            numero: String(docId),
            estado: 'ARCHIVO_Y_CONSERVACION',
            nombreDocumento: doc.title || `PAGARE_${docId}`,
            montoDelPagare: 0,
            tipoMoneda: 'COP',
            fechaExpedicion: '',
            fechaVencimiento: '',
            documentoB64: pdfBase64,
            hashDocumento: hashDocumento,
            cantidadAdicional: 0,
            ArregloAdicionales: [],
            contactos
        };

        console.log(`📤 [E-TITULO] Enviando pagaré ${docId} al baúl ${beneficiarioId}...`);
        const pagarResp = await fetch(`${TV_API_URL}/pagare/pagareCustodia`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tvToken}`
            },
            body: JSON.stringify(payload)
        });
        const pagarData = await pagarResp.json();
        console.log(`📥 [E-TITULO] Respuesta:`, JSON.stringify(pagarData).substring(0, 300));

        if (pagarData.code !== 1000 || !pagarData.pagare?.guidId) {
            return res.status(500).json({ success: false, message: 'Error enviando al baúl', detail: pagarData });
        }

        const guidId = pagarData.pagare.guidId;

        // 8. Guardar guid en BD
        await db.promise().query(
            'UPDATE documents SET tv_guid = ?, tv_baul_id = ? WHERE document_id = ?',
            [guidId, parseInt(beneficiarioId), docId]
        );

        console.log(`✅ [E-TITULO] Pagaré ${docId} custodiado. GUID: ${guidId}`);
        res.json({ success: true, message: 'Pagaré enviado al baúl exitosamente', guidId, numeroPagare: pagarData.pagare.numeroPagare });

    } catch (error) {
        console.error('❌ [E-TITULO] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
});

// GET /api/documents/:id/certificado-etitulo
app.get('/api/documents/:id/certificado-etitulo', requireAuth, async (req, res) => {
    const docId = parseInt(req.params.id);
    try {
        const [rows] = await db.promise().query(
            'SELECT tv_guid, title FROM documents WHERE document_id = ? AND owner_id = ?',
            [docId, req.userId]
        );
        if (!rows.length || !rows[0].tv_guid) {
            return res.status(404).json({ success: false, message: 'Este pagaré no tiene certificado de custodia' });
        }
        const { tv_guid, title } = rows[0];

        const TV_API_URL = process.env.TV_API_URL || 'https://ra.pkiservices.co/api';
        const tokenResp = await fetch(`${TV_API_URL}/Token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: process.env.TV_API_USUARIO, clave: process.env.TV_API_CLAVE })
        });
        const tokenData = await tokenResp.json();
        if (!tokenData.dato) return res.status(500).json({ success: false, message: 'Error obteniendo token' });

        const certResp = await fetch(`${TV_API_URL}/Pagare/comprobanteRecepcionGuidId/${tv_guid}`, {
            headers: { 'Authorization': `Bearer ${tokenData.dato}` }
        });
        const certData = await certResp.json();
        if (!certData.dato) return res.status(500).json({ success: false, message: 'Certificado no disponible aún', detail: certData });

        const pdfBuffer = Buffer.from(certData.dato, 'base64');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="certificado_custodia_${docId}.pdf"`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ [E-TITULO-CERT] Error:', error.message);
        res.status(500).json({ success: false, message: 'Error interno', error: error.message });
    }
});
