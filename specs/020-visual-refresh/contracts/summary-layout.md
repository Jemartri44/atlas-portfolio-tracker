# Contrato: el orden del Resumen

Lo decide `view-models/summary-order.ts` (presentación) con un solo dato del dominio: **si la fecha consultada cae en la campaña**. Tiene que saberse **en la primera pintada**, porque si llegara con el estado fiscal perezoso la tarjeta saltaría al principio del Resumen después de pintarse. Hoy esa regla vive en `inSeason`, sin exportar, dentro de `informative/attention.ts` (perezoso). Propuesta, **Q5**: sacarla a `settings/settings.ts` como `inRentaSeason(settings, date)`, exportada por el barril (unos bytes medidos), y que `fiscalAttention` la use: una sola regla en un solo sitio.

## Móvil y hasta 1.799 px (orden del DOM, §8 P6)

1. La línea de perder datos (si hay exportación vencida o nunca exportado, con datos en el navegador).
2. *Declaración*, **solo en campaña**, con «Campaña de la Renta» y, en E4, la versión corta del calendario.
3. *Patrimonio total*.
4. *Atención* (4 grupos visibles; fuera de campaña y con cuentas en el extranjero, la fila reservada al final de los visibles, que cuenta entre los cuatro).
5. *Últimos movimientos* (5 filas; un grupo de valoraciones = 1).
6. *Evolución del patrimonio*.
7. La fila de *Declaración*, **fuera de campaña**: «Declaración <ejercicio> · fuera de campaña · Ver →», sin ningún aviso.

## Desde 1.800 px (8+4 de la maqueta)

| Fila | Columnas 1-8 | Columnas 9-12 |
|---|---|---|
| 1 | La línea de perder datos (12) | |
| 2 | *Patrimonio total* | *Declaración* (tarjeta en campaña; fila fuera), nunca sola en su fila |
| 3-4 | *Evolución* | *Atención*, y debajo *Últimos movimientos* |

El orden del DOM a este ancho sigue la lectura (izquierda a derecha, arriba abajo), para que el foco siga al ojo; se mide.

## Lo que no salta

La tarjeta perezosa ocupa su sitio con un esqueleto del alto de lo que llega; la fila reservada de *Atención* tiene el alto de un aviso de una línea. Posiciones de cada tarjeta del primer pantallazo, antes y después, en `medidas.json`.
