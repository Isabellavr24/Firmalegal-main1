# Respuesta al equipo de VI — el bug de `linkValidacion` y las dos peticiones

**2 de octubre de 2026**

## Sobre el bug que encontrasteis: no nos estaba afectando

Buen hallazgo, y gracias por verificarlo contra el commit en vez de asumirlo.
Lo comprobamos de nuestro lado y la respuesta corta es: **`validacion_url` sí
llegaba `undefined`, pero no se usaba en ninguna parte.**

El único sitio de FirmaLegal que lee ese campo es la ruta
`/api/integration/vi-iniciar` (server.js:2898), y esa ruta **no la llama nadie**:
ni nuestro frontend ni ningún otro punto del código. Lo buscamos en todo el
repositorio.

El botón "Iniciar validación" de la pantalla nunca pasó por ahí: abre el panel
de Validación de Identidad directamente con `window.open`, construyendo la URL
por su cuenta.

Así que el bug era real pero inerte. Por eso no se notó nunca.

**Dos apuntes, aun así:**

Esa misma ruta tiene un segundo problema del mismo tipo, por nuestro lado:
comprueba `viResp.body.success` antes de devolver la URL, y vuestra respuesta
nunca ha traído ese campo. Es decir, aunque alguien la llamara, habría fallado
igual. Es nuestro, lo anotamos.

Y como el arreglo también va a producción: **no nos rompe nada**. Donde antes
llegaba `undefined` ahora llegará la URL correcta, y nadie la está leyendo.
Podéis desplegarlo sin coordinar con nosotros.

## Sobre las dos peticiones: perfectas, desplegad cuando queráis

Las dos cosas son justo lo que necesitábamos:

1. **El código al crear la validación** — con esto podemos consultar el estado
   de las validaciones pendientes, que es el periodo que importa.
2. **El campo `intentos`** — el dato que da sentido a todo el desarrollo.

Nuestro lado ya está escrito y esperando:

- `backend/lib/estado-validacion.js` consume `validaciones/consultar` y ya lee
  `intentos` si viene; si no viene, no rompe nada, simplemente no se muestra.
- La pantalla tiene el hueco listo para "Intentos detectados: N".
- Lo que **todavía no está** de nuestro lado es guardar el código al crearlo.
  Lo haremos en cuanto despleguéis, porque hasta entonces no hay nada que
  guardar.

**Sí, desplegad a DEV.** Cuando esté, lo conectamos y lo probamos de punta a
punta con un envío real.

## Una comprobación que os puede servir

Cuando despleguéis, lo que confirmaría que todo quedó bien:

```
POST /validacion/api/firmalegal/iniciar-validacion
  -> { "validacion_url": "https://...", "codigo": "VAL-XXXXXXXX-XXXXXX" }

POST /validacion/api/firmalegal/validaciones/consultar
  -> cada validacion con su campo "intentos"
```

Los dos campos nuevos, y la `validacion_url` que ya no es `undefined`.

## Un detalle del conteo de intentos

Para que la pantalla diga lo correcto: nos interesa el **número de intentos
registrados**, incluidos los que fallaron por caída del servicio.

El caso que motivó esto tenía 4 intentos: 3 fueron errores vuestros
(`ECONNABORTED`, "servicio saturado") y 1 fue un fallo real de lectura del
documento. Los cuatro cuentan, porque lo que queremos distinguir es a quien no
le llegó el correo (0 intentos) de quien lo intentó y no pudo.

Si `COUNT(*)` sobre `validacion_intentos` ya los incluye a todos, es justo lo
que necesitamos.
