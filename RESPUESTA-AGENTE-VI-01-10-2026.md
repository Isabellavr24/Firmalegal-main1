# Respuesta al agente de VI — endpoint de consulta de validaciones

**1 de octubre de 2026**

## Si, desplegalo a DEV

El endpoint esta bien como lo hiciste. Nuestro lado ya esta escrito, probado y
subido a `develop` (commit `6c31451`), asi que en cuanto despliegues queda
funcionando sin que tengamos que tocar nada mas.

## Lo que comprobamos de nuestro lado

**La clave y la red ya estaban bien.** No hay que cambiar ninguna variable:

| | Valor |
|---|---|
| `INTERNAL_API_KEY` en `firmalegal-app` | `Integration_firmalegal_PKI2026!` |
| `FIRMALEGAL_API_KEY` en `validacion-identidad-app-1` | el mismo |
| `VI_URL` en `firmalegal-app` | `http://validacion-identidad-app-1:3000` |
| El nombre resuelve desde FirmaLegal | si, `172.18.0.5` |

Ojo con el nombre de la variable: **VI la lee como `FIRMALEGAL_API_KEY`**, no
como `INTERNAL_API_KEY`. En el contenedor de VI, `INTERNAL_API_KEY` esta vacia.
Los valores coinciden, asi que no hay nada que arreglar, pero si alguna vez se
rota la clave hay que cambiarla con los dos nombres.

Confirmamos que la autenticacion interna funciona hoy mismo con una ruta que ya
existe: `GET /validacion/api/firmalegal/check-vinculacion/22` responde 200.

## Lo que la ruta nueva responde hoy

```
POST /validacion/api/firmalegal/validaciones/consultar
  -> HTTP/1.1 401 Unauthorized
```

**401, no 404.** Es decir: el path no existe todavia y la peticion cae en el
middleware de JWT, que la rechaza. Es exactamente lo que evitabas colocando la
ruta antes de ese middleware, asi que al desplegar deberia pasar a 200.

Nos sirve de comprobacion: cuando lo despliegues, ese 401 tiene que
desaparecer. Si sigue dando 401 despues del despliegue, la ruta quedo detras
del middleware.

## Como lo consumimos

Una peticion por tanda de 200 codigos, con `X-Internal-Api-Key`, timeout de 8
segundos. Aceptamos la respuesta en cualquiera de estas tres formas, por si
acaso: `{ validaciones: [...] }`, `{ data: [...] }` o la lista pelada.

De cada validacion usamos los 8 campos que acordamos:

```
codigo, email_firmante, nombre_completo, tipo_documento,
documento, estado, expira_at, created_at
```

Y con eso calculamos lo que el operador ve antes de reenviar: los dias que
quedan de vigencia, si esta caducada, si le falta la cedula, y si el nombre o
el correo que tiene VI no coinciden con los nuestros.

**Confirmado que NO nos manden `token` ni `redirect_url`.** No los queremos: con
esos dos datos cualquiera podria completar la validacion de otra persona.

## No nos rompe nada si falla

Lo probamos ejecutando el codigo contra un VI de mentira, con las respuestas
raras que ya nos habeis dado alguna vez: 200 con el cuerpo vacio, 400, algo que
no es JSON, y no responder nada. En los cuatro casos el panel sigue
funcionando: lista a todo el mundo igual y dice "VI no respondio" en vez de
inventarse la cedula o la vigencia.

O sea que podeis desplegar sin coordinar con nosotros y sin ventana de
mantenimiento. Si algo sale mal, lo peor que pasa es que la pantalla no ensene
la vigencia.

## Para que lo necesitamos

Cada lunes se reenvian a mano las validaciones y los enlaces de firma a los
padres de la Universidad Libre que faltan. Hasta ahora eso se hacia a ciegas: el
boton decia "se enviaran 40" y nada mas.

Ya nos costo una vez: se crearon validaciones **sin cedula** y nadie lo vio
hasta que el padre no pudo validarse. Con vuestro endpoint, eso sale en rojo
en la pantalla antes de que salga el correo.

## Una peticion para despues, sin prisa

Si en algun momento podeis anadir al mismo endpoint un campo con los intentos
que lleva cada validacion (`intentos` o parecido), nos vendria bien para
distinguir a quien no le llego el correo de quien lo abrio y no pudo
completarlo. No corre prisa y no bloquea nada.
