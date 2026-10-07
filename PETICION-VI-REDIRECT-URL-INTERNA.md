# Petición a VI: el redirect tras validar lleva a una URL interna de Docker

**6 de octubre de 2026** — urgente

---

## Lo que pasa

Un firmante completó su validación, pulsó el botón para ir a firmar, y el
navegador le mostró **"No se puede acceder a este sitio"** con
`DNS_PROBE_FINISHED_NXDOMAIN`.

La URL a la que le mandasteis fue:

```
http://firmalegal-app:3000/api/public/vi-callback?token=...
```

`firmalegal-app` es el nombre del contenedor en la red de Docker. Existe entre
servidores, pero el teléfono de un padre no puede resolverlo.

---

## Dónde está

En `backend/services/firmalegal.service.js`, línea 209:

```js
const APP_FL_URL = process.env.FIRMALEGAL_URL || 'https://firmalegalonline.com';
const redirectUrl = `${APP_FL_URL}/api/public/vi-callback?token=${firma_token}`;
```

`FIRMALEGAL_URL` es la URL **interna** (`http://firmalegal-app:3000`), la que
usáis para las llamadas servidor a servidor de la línea 31. Para eso está bien.

Pero esta de la 209 es la que abre **el navegador del firmante**, así que tiene
que ser la pública.

Vosotros ya tenéis la variable y ya la usáis bien en otro sitio —
`routes/validaciones.routes.js`, línea 373:

```js
// Usar FIRMALEGAL_PUBLIC_URL para redirección del browser del firmante
const flPublicUrl = process.env.FIRMALEGAL_PUBLIC_URL || process.env.FIRMALEGAL_URL || 'https://firmalegalonline.com';
```

Es exactamente lo que falta en la 209.

---

## Lo que pedimos

Que la línea 209 use la misma cascada que la 373:

```js
const APP_FL_URL = process.env.FIRMALEGAL_PUBLIC_URL
                || process.env.FIRMALEGAL_URL
                || 'https://firmalegalonline.com';
```

---

## Cómo se ve en los datos

Tres validaciones de hoy en DEV, con su `redirect_url`:

| código | creada desde | redirect_url |
|---|---|---|
| `VAL-MUWSV8FL-169049` | FirmaLegal | `http://firmalegal-app:3000/...` |
| `VAL-MUWSV7I2-A51A6A` | FirmaLegal | `http://firmalegal-app:3000/...` |
| `VAL-MUWSUPQ1-EA1EE6` | vuestro panel | `http://2.24.90.136/...` |

Las creadas desde nuestro botón salen con la interna; la creada desde vuestro
panel sale bien, porque pasa por la ruta que sí usa `FIRMALEGAL_PUBLIC_URL`.

---

## Por qué corre prisa

Esto rompe el flujo justo en el último paso: la persona ya hizo la validación
biométrica —lo más costoso— y al ir a firmar se encuentra un error de DNS. No
hay forma de que lo resuelva por su cuenta.

En producción, con el envío de la Universidad Libre, le pasaría a cada padre
que complete su validación desde un enlace creado por nosotros.

**Hay que comprobar también el `.env` de producción**: si allí
`FIRMALEGAL_PUBLIC_URL` está vacía, el arreglo caería a `FIRMALEGAL_URL` y el
problema seguiría. En el DEV de ahora vale `http://2.24.90.136`.

---

## De nuestro lado

No podemos evitarlo desde FirmaLegal: `iniciar-validacion` no acepta un
`redirect_url`, lo construís vosotros con vuestra variable. Si preferís que se
lo mandemos nosotros en la petición, también nos sirve — decidnos cuál de las
dos y lo hacemos.

Gracias.
