# Predicción: `24:etc_gain` pasa a certeza baja

**Escrita antes de tocar el código.** Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Por qué

Tratar un ETC como ganancia patrimonial va en contra de una consulta vinculante que dice «en todo caso» (DGT V0267-25). Esa lectura no es intermedia: es **débil**. `24:etc_gain` pasa de certeza media a **baja**. `24:etp_gain` se queda en **media**, porque ahí la estructura jurídica de cada producto deja margen real.

## Qué cambia en el código

- `packages/domain/src/tax/criteria.ts`: `24:etc_gain` pasa a `certainty: "low"`. Sigue siendo dudoso (lo era ya) y su riesgo sigue siendo agresivo.
- `tests/fiscal-criteria.test.ts`: la fila #24 del documento da certezas alta (ETC) y media (ETP), así que la baja no está en ella. `24:etc_gain` se exime **también en la certeza**, con su motivo, además de en el riesgo. La certeza más dudosa de la fila (media) la siguen llevando `24:etp` y `24:etp_gain`, así que el test sigue exigiéndola.

## Qué se mueve en `synthetic-v1.tax.json`

**Una línea**, en el ejercicio 2027: el campo `certainty` del dudoso `24:etc_gain`, de `"medium"` a `"low"`. Es el dudoso que nombra las dos líneas del contrasplit de `ast_gold` (`01MQTWHB78RC2FADH9B774BHS5`, una por cuenta).

Nada más: ni `criterion`, ni `documented_risk`, ni `measure`, ni las diferencias, que siguen en `0`, ni la dirección, que sigue en `none`; ni los criterios de las líneas, que ya decían `24:etc_gain`; ni los demás ejercicios. `synthetic-v1.jsonl`, su instantánea y `tax-hand-v1.jsonl` no se mueven: el libro calculado a mano no tiene ETC ni ETP.
