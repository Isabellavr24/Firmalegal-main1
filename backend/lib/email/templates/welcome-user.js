module.exports = function welcomeUserTemplate({ firstName, lastName, email, password, roleName, loginUrl, appUrl }) {
    const fullName = `${firstName} ${lastName}`;
    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenido a FirmaLegal Online</title>
</head>
<body style="margin:0;padding:0;background:#F4F1EE;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F1EE;padding:40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(42,13,49,0.12);">

                    <!-- HEADER -->
                    <tr>
                        <td style="background:linear-gradient(135deg,#2a0d31 0%,#5b1a6b 60%,#c41e56 100%);padding:48px 40px 36px;text-align:center;">
                            <img src="${appUrl}/img/Nuevologo.jpg" alt="FirmaLegal Online" style="max-width:130px;height:auto;border-radius:14px;margin-bottom:20px;display:block;margin-left:auto;margin-right:auto;" />
                            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">¡Bienvenido/a a<br>FirmaLegal Online!</h1>
                            <p style="margin:10px 0 0;color:rgba(255,255,255,0.75);font-size:15px;">Tu cuenta ha sido creada</p>
                        </td>
                    </tr>

                    <!-- GREETING -->
                    <tr>
                        <td style="padding:40px 40px 0;">
                            <p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#2a0d31;">Hola, <span style="color:#c41e56;">${fullName}</span> 👋</p>
                            <p style="margin:0;font-size:15px;color:#555;line-height:1.6;">
                                Un administrador ha creado tu cuenta en <strong>FirmaLegal Online</strong>. A continuación encontrarás tus credenciales de acceso personales.
                            </p>
                        </td>
                    </tr>

                    <!-- CREDENTIALS CARD -->
                    <tr>
                        <td style="padding:28px 40px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8ff;border:2px solid #e8e0f8;border-radius:16px;overflow:hidden;">
                                <tr>
                                    <td style="background:#2a0d31;padding:14px 24px;">
                                        <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">🔐 Tus credenciales de acceso</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:24px;">
                                        <!-- Email row -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                                            <tr>
                                                <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;padding-top:3px;">Correo</td>
                                                <td style="font-size:15px;color:#1f2937;font-weight:600;word-break:break-all;">${email}</td>
                                            </tr>
                                        </table>
                                        <!-- Password row -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                                            <tr>
                                                <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:top;padding-top:6px;">Contraseña</td>
                                                <td>
                                                    <span style="display:inline-block;background:#2a0d31;color:#ffffff;font-family:monospace;font-size:17px;font-weight:700;letter-spacing:2px;padding:8px 18px;border-radius:10px;">${password}</span>
                                                </td>
                                            </tr>
                                        </table>
                                        <!-- Role row -->
                                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                            <tr>
                                                <td style="width:110px;font-size:13px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;vertical-align:middle;">Rol</td>
                                                <td>
                                                    <span style="display:inline-block;background:#f0e9ff;color:#5b1a6b;font-size:13px;font-weight:700;padding:5px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${roleName}</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- SECURITY NOTE -->
                    <tr>
                        <td style="padding:0 40px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff8e1;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;padding:16px 20px;">
                                <tr>
                                    <td style="padding:16px 20px;">
                                        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">
                                            <strong>⚠️ Por tu seguridad:</strong> Te recomendamos cambiar tu contraseña la primera vez que inicies sesión. Ve a <em>Configuración → Perfil → Cambiar contraseña</em>.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- CTA BUTTON -->
                    <tr>
                        <td style="padding:0 40px 40px;text-align:center;">
                            <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#c41e56 0%,#2a0d31 100%);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 48px;border-radius:999px;letter-spacing:0.3px;box-shadow:0 4px 16px rgba(196,30,86,0.35);">
                                Iniciar sesión ahora →
                            </a>
                        </td>
                    </tr>

                    <!-- DIVIDER -->
                    <tr>
                        <td style="padding:0 40px;">
                            <hr style="border:none;border-top:1px solid #eee;margin:0;" />
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="padding:28px 40px;text-align:center;">
                            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">Este correo fue enviado automáticamente por FirmaLegal Online.</p>
                            <p style="margin:0;font-size:13px;color:#9ca3af;">Si crees que esto fue un error, ignora este mensaje.</p>
                            <p style="margin:16px 0 0;font-size:13px;font-weight:700;color:#2a0d31;">© ${year} FirmaLegal Online — PKI Services</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};
