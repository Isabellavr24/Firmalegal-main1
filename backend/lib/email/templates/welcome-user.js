module.exports = function welcomeUserTemplate({ firstName, lastName, email, password, roleName, loginUrl, appUrl }) {
    const fullName = `${firstName} ${lastName}`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a FirmaLegal Online</title>
    <style>
        body { font-family: Arial, sans-serif; background: #F8F9FA; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .header { background: #2a0d31; color: white; padding: 48px 40px; text-align: center; }
        .header h1 { margin: 16px 0 0; font-size: 32px; font-weight: 800; }
        .content { padding: 48px 40px; }
        .credentials-card { background: #F8F9FA; border: 2px solid #E9ECEF; border-radius: 12px; overflow: hidden; margin: 32px 0; }
        .credentials-header { background: #2a0d31; padding: 14px 24px; }
        .credentials-header p { margin: 0; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
        .credentials-body { padding: 24px; }
        .cred-row { display: flex; align-items: center; margin-bottom: 16px; }
        .cred-label { width: 110px; font-size: 13px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
        .cred-value { font-size: 15px; color: #1f2937; font-weight: 600; word-break: break-all; }
        .cred-password { display: inline-block; background: #2a0d31; color: #fff; font-family: monospace; font-size: 17px; font-weight: 700; letter-spacing: 2px; padding: 8px 18px; border-radius: 10px; }
        .cred-role { display: inline-block; background: #ede9f8; color: #2a0d31; font-size: 13px; font-weight: 700; padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
        .security-note { background: #fff8e1; border-left: 4px solid #f59e0b; border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 0 0 32px; font-size: 14px; color: #92400e; line-height: 1.5; }
        .btn-login { display: inline-block; background: #2a0d31; color: #FFFFFF !important; padding: 16px 48px; text-decoration: none !important; border-radius: 999px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px; }
        .footer { background: #F8F9FA; padding: 40px; text-align: center; border-top: 1px solid #E9ECEF; color: #6C757D; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>¡Bienvenido/a a<br>FirmaLegal Online!</h1>
        </div>
        <div class="content">
            <p>Hola <strong>${fullName}</strong>,</p>
            <p>Tu cuenta ha sido creada en <strong>FirmaLegal Online</strong>. A continuación encontrarás tus credenciales de acceso personales.</p>

            <div class="credentials-card">
                <div class="credentials-header">
                    <p>🔐 Tus credenciales de acceso</p>
                </div>
                <div class="credentials-body">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;vertical-align:top;padding-top:3px;">Correo</td>
                            <td style="font-size:15px;color:#1f2937;font-weight:600;word-break:break-all;padding-bottom:16px;">${email}</td>
                        </tr>
                        <tr>
                            <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:16px;vertical-align:middle;">Contraseña</td>
                            <td style="padding-bottom:16px;"><span style="display:inline-block;background:#2a0d31;color:#fff;font-family:monospace;font-size:17px;font-weight:700;letter-spacing:2px;padding:8px 18px;border-radius:10px;">${password}</span></td>
                        </tr>
                        <tr>
                            <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:middle;">Rol</td>
                            <td><span style="display:inline-block;background:#ede9f8;color:#2a0d31;font-size:13px;font-weight:700;padding:5px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${roleName}</span></td>
                        </tr>
                    </table>
                </div>
            </div>

            <div class="security-note">
                <strong>⚠️ Por tu seguridad:</strong> Te recomendamos cambiar tu contraseña la primera vez que inicies sesión. Ve a <em>Configuración → Perfil → Cambiar contraseña</em>.
            </div>

            <div style="text-align: center; margin: 36px 0 0;">
                <a href="${loginUrl}" class="btn-login" style="display:inline-block;background:#2a0d31;color:#FFFFFF;padding:16px 48px;text-decoration:none;border-radius:999px;font-weight:700;font-size:16px;letter-spacing:0.3px;">Iniciar sesión ahora →</a>
            </div>

            <p style="color: #6C757D; font-size: 14px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E9ECEF;">
                Si tienes preguntas, contáctanos respondiendo a este correo.
            </p>
        </div>
        <div class="footer">
            <p><strong style="color: #2a0d31;">FirmaLegal Online</strong></p>
            <p style="font-size: 13px; color: #ADB5BD;">© ${new Date().getFullYear()} FirmaLegal Online — PKI Services</p>
        </div>
    </div>
</body>
</html>`;
};
