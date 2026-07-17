module.exports = function welcomeUserTemplate({ firstName, lastName, email, password, roleName, loginUrl, appUrl, address, activationDate, expirationDate, firmasContratadas }) {
  const fullName = `${firstName} ${lastName}`;

  const fmtDate = (d) => {
    if (!d) return 'Indefinido';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const activacion    = fmtDate(activationDate);
  const expiracion    = expirationDate ? fmtDate(expirationDate) : 'Indefinido';
  const firmas        = firmasContratadas != null ? firmasContratadas : 'Indefinido';
  const direccion     = address || 'No especificada';

  const BRAND       = '#2a0d31';
  const BRAND_LIGHT = '#ede7f0';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Activacion de Servicio de Firma Electronica</title>
</head>
<body style="margin:0;padding:0;background:#f5f1f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f1f6;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(42,13,49,0.10);">

  <!-- HEADER -->
  <tr>
    <td style="background:${BRAND};padding:22px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:middle;">
            <img src="cid:pki-logo" alt="PKI Services" style="height:56px;display:block;border:0;">
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <div style="color:#e8dded;font-size:10px;letter-spacing:0.5px;text-transform:uppercase;">Entidad de Certificacion Digital Acreditada</div>
            <div style="color:#ffffff;font-size:13px;font-weight:700;margin-top:3px;">Activacion de Servicio de Firma Electronica</div>
            <div style="color:#c9b8d4;font-size:10px;margin-top:2px;">ONAC CEA-3.0-07 V-02 &middot; 20-ECD-004</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- INTRO -->
  <tr>
    <td style="padding:28px 32px 16px;">
      <p style="margin:0 0 10px;font-size:15px;color:#1a1a1a;">Estimado/a <strong>${fullName}</strong>,</p>
      <p style="margin:0;font-size:14px;color:#555;line-height:1.65;">
        Por medio del presente comunicado se informa la activacion del servicio de
        <strong style="color:${BRAND};">Firma Electronica Digital</strong>
        conforme al estandar <strong>ONAC 10.11.4.2</strong>.
      </p>
    </td>
  </tr>

  <!-- BLOQUE 1: ECD -->
  <tr>
    <td style="padding:0 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND};padding:10px 18px;">
            <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">1. Entidad de Certificacion Digital (ECD)</span>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd4e0;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
            <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;color:#333;">
              <tr>
                <td width="50%"><strong>Nombre:</strong> PKI Services S.A.S.</td>
                <td width="50%"><strong>NIT:</strong> 901.276.801-0</td>
              </tr>
              <tr>
                <td colspan="2"><strong>Direccion:</strong> Calle 127B Bis #46-63, Bogota D.C., Colombia</td>
              </tr>
              <tr>
                <td><strong>Zona postal:</strong> 111111</td>
                <td><strong>Tel:</strong> +57 350 620 2222</td>
              </tr>
              <tr>
                <td><strong>Web:</strong> <a href="https://firmalegalonline.com" style="color:${BRAND};text-decoration:none;">firmalegalonline.com</a></td>
                <td><strong>Acreditacion:</strong> CEA-3.0-07 &middot; 20-ECD-004</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BLOQUE 2: SUSCRIPTOR -->
  <tr>
    <td style="padding:0 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND};padding:10px 18px;">
            <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">2. Datos del Suscriptor</span>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd4e0;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
            <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;color:#333;">
              <tr>
                <td width="50%"><strong>Nombre:</strong> ${fullName}</td>
                <td width="50%"><strong>Email:</strong> ${email}</td>
              </tr>
              <tr>
                <td colspan="2"><strong>Direccion:</strong> ${direccion}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BLOQUE 3: ALCANCE -->
  <tr>
    <td style="padding:0 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND};padding:10px 18px;">
            <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">3. Alcance y Condiciones del Servicio</span>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd4e0;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
            <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;color:#333;">
              <tr>
                <td width="50%"><strong>Fecha de activacion:</strong> ${activacion}</td>
                <td width="50%"><strong>Fecha de expiracion:</strong> ${expiracion}</td>
              </tr>
              <tr>
                <td><strong>Firmas contratadas:</strong> ${firmas}</td>
                <td><strong>Rol asignado:</strong> ${roleName}</td>
              </tr>
              <tr>
                <td colspan="2"><strong>Tipo de servicio:</strong> Firma Electronica Digital con valor probatorio</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- BLOQUE 4: CREDENCIALES -->
  <tr>
    <td style="padding:0 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND};padding:10px 18px;">
            <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Credenciales de Acceso</span>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #ddd4e0;border-top:none;padding:16px 18px;border-radius:0 0 6px 6px;">
            <table width="100%" cellpadding="7" cellspacing="0" border="0" style="font-size:13px;color:#333;">
              <tr>
                <td style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;width:160px;">Plataforma</td>
                <td><a href="${loginUrl}" style="color:${BRAND};font-weight:700;text-decoration:none;">firmalegalonline.com</a></td>
              </tr>
              <tr>
                <td style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Email de acceso</td>
                <td style="font-weight:600;">${email}</td>
              </tr>
              <tr>
                <td style="color:#888;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Contrasena temporal</td>
                <td>
                  <span style="display:inline-block;background:${BRAND_LIGHT};border:1px solid #c9b8d4;font-family:monospace;font-size:16px;font-weight:700;letter-spacing:3px;padding:7px 16px;border-radius:6px;color:${BRAND};">${password}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- NOTA -->
  <tr>
    <td style="padding:0 32px 28px;">
      <table width="100%" cellpadding="12" cellspacing="0" border="0" style="background:#fdf6ff;border-left:4px solid ${BRAND};border-radius:0 6px 6px 0;">
        <tr>
          <td style="font-size:13px;color:#4a0e5a;line-height:1.55;">
            <strong>Recomendacion:</strong> Si desea cambiar su contrasena, escribanos a
            <a href="mailto:firmalegalonline@pkiservices.co" style="color:${BRAND};font-weight:600;">firmalegalonline@pkiservices.co</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- FIRMA -->
  <tr>
    <td style="padding:0 32px 36px;text-align:center;">
      <img src="cid:pao-firma" alt="Firma Sandra Paola Lopez Angarita" style="height:80px;display:block;margin:0 auto 8px;border:0;">
      <div style="border-top:1px solid #c9b8d4;padding-top:8px;font-size:12px;color:#333;line-height:1.6;text-align:center;">
        <strong>Sandra Paola Lopez Angarita</strong><br>
        Oficial de Decision &mdash; PKI Services S.A.S.<br>
        Calle 127B Bis #46-63, Bogota D.C. | Tel: +57 350 620 2222
      </div>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:${BRAND_LIGHT};padding:14px 32px;text-align:center;border-top:1px solid #ddd4e0;">
      <span style="font-size:11px;color:#7a5f88;">PKI Services S.A.S. &mdash; Entidad de Certificacion Digital Acreditada ONAC &mdash; NIT 901.276.801-0</span>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
};
