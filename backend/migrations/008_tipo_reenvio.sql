-- =====================================================================
-- 008 — El tipo 'validacion_reenvio' faltaba en el ENUM
-- =====================================================================
--
-- La 006 creo la columna `tipo` con ENUM('validacion','firma'). Despues se
-- separo reenviar de crear -son acciones distintas y llevan cuentas
-- separadas para el limite de 2 al dia- y se empezo a registrar
-- 'validacion_reenvio', que el ENUM no admite.
--
-- MySQL no fallaba el envio: lo truncaba y dejaba un aviso en el log
--
--     Data truncated for column 'tipo' at row 1
--
-- asi que los reenvios SALIAN pero no quedaban registrados. Y lo que no se
-- registra no se cuenta: el limite diario no los frenaba y una persona podia
-- recibir correos sin tope.
--
-- Se vio el 07-10-2026, en el primer lote del envio a la Universidad: tres
-- reenvios confirmados por VI y cero filas en la tabla.
--
-- Solo ANADE un valor al ENUM. Las filas que ya existen no se tocan.

ALTER TABLE recordatorios_enviados
  MODIFY COLUMN tipo ENUM('validacion','validacion_reenvio','firma') NOT NULL;
