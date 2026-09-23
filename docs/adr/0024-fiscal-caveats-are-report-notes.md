# ADR-0024 — Una salvedad fiscal es una nota del informe, no una decisión de la interfaz

**Estado:** Propuesta (2026-09-23).

## Contexto

La feature 010 sacó la salida fiscal por **dos interfaces** —la consola y la web— que leen del
**mismo motor**. Aun así, las revisiones adversariales encontraron **tres** casos en los que las dos
decían cosas distintas sobre la misma cifra, y los tres se cazaron mirando, no compilando:

1. **Lo que caduca.** `TaxYearReport.compensation` tiene `pending` y `expired`. La consola lee
   `expired` y dice «CADUCA al cierre de 2031»; la web leía `pending` y calculaba su propia
   condición, que **no se cumplía nunca**. Nada ata «si enseñas lo pendiente, enseña lo que
   caducó»: son dos campos independientes de la misma estructura.
2. **Una casilla parcial.** `BoxEntry.partial` dice que el motor no calcula entera esa casilla. La
   web lo decía siempre; la consola solo cuando además faltaba el importe, así que una cifra parcial
   con número al lado se leía como el importe de la casilla —justo lo que el prompt prohíbe—. Las
   dos tenían el campo delante; una no lo leyó **en esa posición**.
3. **El nombre de un criterio.** `CRITERION_LABELS` en la consola y `CRITERION_NAMES` en la web.
   `Record<CriterionId, string>` garantiza que ninguna se deje un criterio; **nada** garantiza que
   digan lo mismo.

El mecanismo que **sí** funciona está probado en la misma feature: al añadir el veredicto
`nothing_recorded` a una unión cerrada, la compilación se rompió en los tres sitios que había que
tocar y fue imposible olvidarse de ninguno. Pero una unión cerrada obliga a **tratar un caso**, no
a **decir algo** sobre un campo opcional que una interfaz sencillamente no lee. Ese es el hueco.

La constitución pide que toda salvedad fiscal se diga y nunca se calle (fallo seguro, principio V),
y el proyecto asume que habrá más interfaces (una API, un importador): cada una nueva multiplica las
ocasiones de divergir.

## Opciones consideradas

1. **Dejarlo como está y cazarlo revisando.** *Ventaja*: cuesta cero y las tres se arreglaron.
   *Inconveniente*: las tres se encontraron **mirando una pantalla**, dos de ellas después de
   pasar por revisión; el coste crece con cada interfaz y con cada campo opcional nuevo, y lo que se
   pierde es una advertencia fiscal, no un detalle estético.
2. **Un test de contrato entre las dos interfaces**: una tabla de casos, las dos salidas, y la
   afirmación de que dicen lo mismo. *Ventaja*: caza divergencias reales sin tocar el dominio.
   *Inconveniente*: compara **prosa española** de dos redactados legítimamente distintos (la consola
   es densa, la pantalla explica), así que o se vuelve laxo o se vuelve frágil; y no impide escribir
   la divergencia, solo la detecta después.
3. **Que el motor emita la salvedad como dato**, con su código, y que cada interfaz solo la
   traduzca — que es lo que `TaxBoxes.notes` ya hace con los `Warning`. *Ventaja*: perder una
   salvedad pasa a ser «no pintar una nota que existe», y eso lo comprueba un test genérico sobre
   cualquier informe, una vez, sin enumerar casos; el motor decide **qué hay que advertir** y la
   interfaz solo **cómo se dice**, que es el reparto que el proyecto ya aplica a los criterios y a
   los bloques del formulario. *Inconveniente*: cambia la forma del informe y obliga a tocar las dos
   interfaces; y hay que decidir qué es una salvedad y qué es un dato más (el importe de una casilla
   no es una nota, pero «esta casilla no se calcula entera» sí).
4. **Cerrar cada campo opcional en una unión exhaustiva.** *Ventaja*: el compilador ayuda.
   *Inconveniente*: no resuelve el problema, que no es tratar un caso sino **leer un campo**: una
   interfaz siempre puede desestructurar y tirar lo que no quiere.

## Decisión

Se adopta la **opción 3** como regla de diseño de la salida fiscal: **una salvedad fiscal es una
nota del informe, no una decisión de la interfaz.** Todo aquello que el motor sabe que matiza una
cifra —que no la calcula entera, que un saldo deja de poder usarse, que una correspondencia no está
comprobada, que un criterio está en duda— se emite como **dato con código** en el informe, y la
interfaz solo elige palabras y sitio. Lo que la interfaz decide es **cómo** se dice y **dónde**,
nunca **si** se dice.

No se aplica retroactivamente en esta feature: las tres divergencias ya están corregidas una a una y
convertirlas en notas cambia la forma del informe y las dos interfaces, que es trabajo con su propio
riesgo fiscal. La regla gobierna **lo que se escriba a partir de ahora** y la feature que decida
migrar lo existente.

## Consecuencias

- Una salvedad nueva se añade en **un sitio** (el informe), y las interfaces que no la pinten fallan
  un test genérico en vez de callar. Añadir una tercera interfaz deja de multiplicar las ocasiones
  de divergir.
- Hace falta un test genérico —«toda nota del informe llega a la salida»— por interfaz, y un
  criterio escrito de qué es una nota y qué es un dato. Sin ese criterio la regla degenera en
  convertir todo en notas.
- Se vuelve más difícil que una interfaz «mejore» un aviso por su cuenta: si quiere decir más, lo
  dice el motor para las dos. Eso es deliberado.
- Lo ya existente queda **mezclado** mientras no se migre: `TaxBoxes.notes` sigue la regla y
  `compensation.pending`/`expired`, `BoxEntry.partial` y los dos mapas de rótulos no. Mientras dure,
  la revisión de una pantalla fiscal sigue teniendo que mirar, y conviene que lo sepa.
- Relacionadas: ADR-0020 (lo declarado es un hecho, no un valor derivado) y ADR-0021, que fijan que
  el motor es quien decide qué se declara; esta extiende el mismo reparto a lo que se **advierte**.
