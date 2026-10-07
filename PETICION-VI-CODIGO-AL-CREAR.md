# Petición al equipo de VI: devolver el código al crear la validación

**2 de octubre de 2026**

## Qué necesitamos

Que `POST /validacion/api/firmalegal/iniciar-validacion` devuelva también el
**código** de la validación que acaba de crear, además de la `validacion_url`
que ya devuelve:

```json
{
  "validacion_url": "https://.../validacion/cellphone/?token=9fd5a8e9...",
  "codigo": "VAL-MU1E4GVX-826349"
}
```

Un campo más en la respuesta. Nada más.

## Por qué

Estamos poniendo en la pantalla del pagaré el estado de cada validación: en qué
va, cuánto le queda de vigencia y **cuántos intentos lleva esa persona**. Eso
usa el endpoint `validaciones/consultar` que ya hicisteis, y que recibe códigos.

El problema es que **hoy no tenemos el código hasta que la persona completa su
validación**. Lo guardamos en el callback, cuando ya terminó. Es decir: justo en
el periodo en que hace falta saber qué está pasando —entre que se envía y que la
completa— no tenemos con qué preguntar.

Es el periodo que importa. Cuando un padre escribe diciendo que algo no le
funciona, está siempre en ese estado.

## Por qué no lo resolvemos nosotros

Lo intentamos y no se puede desde nuestro lado:

- La respuesta de `iniciar-validacion` trae `validacion_url`, que lleva el
  **token**, no el código.
- No hay una ruta que permita consultar una validación **por token**;
  `validaciones/consultar` recibe códigos.
- Deducir el código del token no es posible: son valores distintos y sin
  relación.

## El caso que lo motiva

El 29 de septiembre una firmante escribió diciendo que no podía validarse. Para
responderle hubo que entrar al servidor y consultar la base de VI a mano. Lo que
se encontró:

| Intento | Resultado |
|---|---|
| 1, 2, 3 (28 sept) | Error del servicio: `ECONNABORTED` y "temporalmente saturado" |
| 4 (29 sept) | Fallido: OCR del documento 30/100, no se leyó la cédula |

Con el código guardado desde el principio, eso se habría visto en la pantalla
sin que nadie entrara al servidor.

## Una alternativa, si os sirve mejor

En vez de devolver el código, aceptar **también tokens** en
`validaciones/consultar`:

```json
{ "tokens": ["9fd5a8e9..."] }
```

Nos vale cualquiera de las dos. La primera nos parece más simple.

## Lo que ya está hecho de nuestro lado

- `backend/lib/estado-validacion.js` consume `validaciones/consultar` y ya
  calcula vigencia, caducidad y lo que falta para poder enviar.
- La pantalla tiene el hueco listo para "Intentos detectados: N". Hoy sale
  vacío porque no tenemos el código con qué preguntar.
- **El campo `intentos`** tampoco lo devuelve hoy `validaciones/consultar`. Lo
  comentasteis como viable (la tabla `validacion_intentos` ya lo guarda). No
  corre prisa, pero es el dato que da sentido a todo esto.

## Resumen

Dos cosas, por orden de importancia:

1. **El código al crear la validación** (o aceptar tokens en la consulta).
   Sin esto, no podemos consultar nada de las validaciones pendientes.
2. **El campo `intentos` en la consulta.** Sin prisa, pero es el dato clave.
