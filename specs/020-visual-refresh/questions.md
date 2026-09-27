# Preguntas y registro: `020-visual-refresh`

Fechas en Europe/Madrid. Aquí van las preguntas a la dirección, lo que se responde, el SHA congelado de cada entrega, cómo se vio fallar cada test, la tabla del paquete, las capturas y sus medidas, la autocomprobación de §6 y la lista de documentos que la dirección tendrá que actualizar.

## 1. Estado

- **2026-09-27**: alto del plan. Rama `feature/020-visual-refresh` desde `origin/develop` (`ae66814`), worktree `.claude/worktrees/020-visual-refresh`, `core.hooksPath` a `.githooks`, `npm ci`. `git log origin/develop..origin/feature/015-api-access` sale vacío (la 015 entera está en `develop`).
- **Sin código de producción.** Hay `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` y esta lista.
- **Una parada del bloque 0 del color: Q1.** Bloquea el bloque 2 de E1 (sustituir los colores), no el resto de E1.

## 2. La partida del paquete (§5 del encargo)

`npm run build` sobre `ae66814`, medido exacto (el mismo cálculo de `check-bundle.mjs`, con una línea de impresión en una copia temporal, borrada después):

| | Medido | Referencia del encargo (PR #98) | Techo | Autorización | Margen |
|---|---:|---:|---:|---:|---:|
| Arranque | **74.125** | 74.114 | 74.134 | 76.069 | 1.944 |
| Total | **301.439** | ~301.370 | 301.496 | 309.500 | 8.061 |

Las dos medidas se apartan de la referencia (+11 y +69); la referencia se tomó antes de los últimos commits de E5 de la 015. **No es una parada**: la referencia no es una puerta. La estimación mejora a mejora y el orden de recorte están en `plan.md` §6: **con mi estimación el total cabe con unos 250 bytes de holgura al final de E4**, así que la parada, si llega, cae en E4.

## 3. El bloque 0 del color

Entero en `research.md` R1-R4. Resumen:
- Fuentes: Machado, Oliveira y Fernandes (2009), severidad 1, en RGB lineal; OKLab de Ottosson (23/12/2020). Con dirección y fecha de consulta.
- **Mi recálculo coincide con la propuesta en todas sus cifras**: ganancia/pérdida en el peor caso 8,87 (claro) y 9,90 (oscuro); pérdida/peligro con visión normal 7,50 (claro); las de hoy 6,30, 4,22 y 2,11.
- **Pérdida/peligro con visión normal en oscuro: 5,05.** La propuesta no la midió. El encargo fija el suelo en 7. → Q1.
- Contrastes: todos pasan (el mínimo, `--c-loss` claro sobre `--c-fill`, 4,76:1).

## 4. Preguntas a la dirección

### Q1 — Pérdida frente a peligro, en oscuro, no llega a 7 (BLOQUEA E1, bloque 2)

**Qué pasa.** Con visión normal, `--c-loss` oscuro (`#f2a066`) frente a `--c-danger` oscuro (`#f29a8a`) mide **ΔE 5,05** (hoy, 2,26). En claro mide 7,50. Con tritanopía, en oscuro, 0,82. El encargo: «pérdida frente a peligro, con visión normal, al menos lo que midas (la propuesta dice 7,5; el test falla por debajo de 7)», y «si un color propuesto no llega al umbral, para: no eliges otro tú».

**Opciones**:
- **(a)** Aceptar los valores de la propuesta con un suelo por tema: **7 en claro y 5 en oscuro** (lo medido, 7,50 y 5,05). El peligro nunca va solo (icono con forma propia y palabra), y aun así mejora mucho lo de hoy (2,26).
- **(b)** Que quien hizo la propuesta (o la dirección) cambie **la pérdida oscura** para llegar a 7 frente al peligro, sin bajar de 8 frente a la ganancia con daltonismo ni de 4,5:1 de contraste. Yo mido lo que me den con `020-cvd.mjs` y lo escribo aquí antes de usarlo.
- **(c)** Cambiar **el peligro oscuro** en lugar de la pérdida. Toca todos los avisos críticos y la banda de datos con problemas: más alcance del que esta feature pedía.

**Recomendación: (b)**, y si no hay un valor que cumpla las tres condiciones, (a). La regla que el encargo quiere proteger, «el rojo solo ante un problema», es de visión normal, y en oscuro, que el usuario usa, 5 es una diferencia que se ve pero se confunde de un vistazo.

### Q2 — Los ejercicios sin declarar, fuera de la campaña: ¿dónde se dicen?

**Qué pasa.** Hoy la tarjeta *Declaración* dice «El ejercicio 2027 tiene cifras y no consta como declarado» (`unfiled_years`), que el dominio trata como **una nota, no un aviso** (`filings/touched.ts:141-148`, Q8 de la 010). El encargo decide dónde van fuera de la campaña lo del 720/721 y los inválidos (*Atención*), y que la fila plegada dice «solo su estado neutro», pero **no dice nada de los ejercicios sin declarar**.

**Opciones**:
- **(a)** Solo en `/fiscal` fuera de la campaña; en la tarjeta, en campaña, como hoy.
- **(b)** En la fila plegada, como parte de su estado neutro («Declaración 2028 · fuera de campaña · 2027 sin declarar · Ver →»): no es un aviso y no se dice en otro sitio, así que no se repite.
- **(c)** En *Atención*, como un aviso más. Pero el dominio lo trata como nota, y en enero el ejercicio anterior está *siempre* «sin declarar» porque la campaña no ha empezado: sería ruido cada año de enero a marzo.

**Recomendación: (b)**. Es un estado, no un aviso, y (a) haría que un ejercicio olvidado de verdad (2027 en enero de 2029) no se dijera en el Resumen en todo el año.

### Q3 — `tax_residence` sin valor: la fila se reserva siempre

**Qué pasa.** `tax_residence` es opcional y **no tiene valor por defecto en el código** (solo lo escribe el generador sintético, `"ES"`); `business-rules.md` dice «España» como valor inicial y la web pide dos letras. Con la regla del encargo (sin `tax_residence`, `hasForeignAccountsAt` no supone `ES` y responde que sí), **todo libro que nunca lo configuró reservará una fila de esqueleto en *Atención* fuera de la campaña**, que desaparece al llegar el estado fiscal si no hay nada del 720/721. No esconde nada; cuesta un hueco que aparece y se va en cada apertura.

Además, no alineo `fiscalAttention` ni `informative/holdings.ts` (que comparan con `"ES"`) con el predicado nuevo: con `tax_residence` ausente, alinear haría extranjeras las cuentas españolas y movería avisos y cifras del 720/721. Consecuencia: con una residencia distinta de `ES`, predicado y motor pueden discrepar (una fila no reservada que luego se llena, o al revés); los modelos 720/721 son españoles, así que el caso no tiene sentido fiscal, pero lo digo.

**Opciones**: **(a)** como dice el encargo (reservar siempre sin `tax_residence`); **(b)** sin `tax_residence`, reservar solo si hay alguna cuenta con país distinto de `ES`, que es lo que el motor compara hoy (mismo resultado que el motor, sin suponer nada nuevo); **(c)** que la dirección documente un valor por defecto `ES` en el dominio, como `DEFAULT_RENTA_SEASON` (es un cambio de lo que dice `business-rules.md`, no del esquema).

**Recomendación: (b)**. Da exactamente las mismas filas reservadas que avisos puede producir el motor, que es lo que la reserva quiere prever, y no supone la residencia: copia lo que el motor ya supone. Si la dirección prefiere (a), vale y lo construyo así.

### Q4 — El plazo de los modelos 720 y 721: ¿una fila por ejercicio o un tramo abierto?

**Qué pasa.** Fuente encontrada (`research.md` R5): Orden HAP/72/2013 art. 7 y Orden HFP/886/2023 art. 4, «entre el 1 de enero y el 31 de marzo del año siguiente». «Un ejercicio sin dato no pinta plazo y lo dice; nunca lo supone».

**Opciones**: **(a)** una fila por ejercicio **verificado**: 720 de 2013 a 2026 y 721 de 2023 a 2026 (el de 2026 se presenta en 2027 con la orden vigente hoy), cada fila con su norma, artículo, dirección y fecha de verificación; un ejercicio posterior sale «plazo sin verificar» hasta que alguien añada su fila; **(b)** un tramo abierto por orden («desde el ejercicio 2013, mientras no se cambie la Orden HAP/72/2013»), que pinta el plazo de cualquier ejercicio futuro.

**Recomendación: (a)**. (b) supone que la orden no cambiará, que es justo lo que el encargo prohíbe; (a) cuesta una fila al año y es como viven las casillas del Modelo 100. El primer ejercicio del 720 (2012) tuvo un plazo transitorio distinto que no he verificado, así que no lo incluyo: un libro con ese ejercicio lo vería «plazo sin verificar».

### Q5 — Una sexta pieza para el barril: `inRentaSeason`

**Qué pasa.** Para que *Declaración* no salte arriba del Resumen al llegar el estado fiscal perezoso, el Resumen tiene que saber **en la primera pintada** si la fecha cae en la campaña. Esa regla es del dominio y hoy vive sin exportar en `informative/attention.ts` (perezoso). No es una de las dos piezas que el encargo autoriza en el barril.

**Propuesta**: moverla a `settings/settings.ts` como `inRentaSeason(settings, date)`, junto a `rentaSeasonOf`, exportada por el barril (unos 40 bytes, medidos antes) y usada por `fiscalAttention`: una regla, un sitio, con sus tests de bordes. **Recomendación: sí.** Sin ella, la tarjeta se pinta abajo y salta en campaña.

### Q6 — Lo que arriesga un criterio fiscal, ¿es un resultado?

**Qué pasa.** `routes/fiscal/Criteria.tsx:80` pinta con el color de ganancia o de pérdida lo que un criterio arriesga (`stake.amount_eur`). No es una ganancia ni una pérdida realizada o latente; con la regla nueva («el color solo en resultados», propuesta §5.4), el guardián lo rechaza.

**Opciones**: **(a)** quitarle el color y dejar el signo; **(b)** declararlo resultado en la lista cerrada del guardián.

**Recomendación: (a)**. Un importe en juego en tinta con su signo se lee igual, y el color de pérdida en un criterio fiscal se confunde con «has perdido».

## 4.1 Respuestas de la dirección (2026-09-27)

Visto bueno a `spec.md` y `plan.md`. Decisiones, tal como llegaron:

- **Q1**: buscar una pérdida oscura que cumpla todos los umbrales (pérdida/peligro ≥ 7, ganancia/pérdida ≥ 8 y contraste ≥ 4,5). Si no existe, se acepta un suelo por tema (7 en claro, 5 en oscuro), con los valores medidos anotados. El bloque 2 de E1 va con ese resultado. → §9.
- **Q2**: sí, en la fila plegada y en estado neutro.
- **Q3**: sí. Con `tax_residence`, el predicado usa ese valor; sin él, vuelve a la regla actual del motor («alguna cuenta con país distinto de ES»). Ese respaldo va **dentro de la función de dominio**, nunca en la web, con su test y su mutante. No se alinean `fiscalAttention` ni `holdings.ts`.
- **Q4**: una fila por ejercicio verificado, con la cita del BOE.
- **Q5**: sí, `inRentaSeason` en el barril y `fiscalAttention` usándola; se miden los bytes.
- **Q6**: sí, sin color y con el signo.
- **Propuestas (a) a (h)**: aceptadas tal cual. La definición de «lo aportado» va a `business-rules.md` en el commit de dominio de E4, y se enseñan la espina y la frase.
- **Presupuesto total**: la PR #102 (precios) añadirá unos 406 bytes al total y 47 al arranque; **la autorización del total sube a 310.500 bytes**. El arranque sigue en 76.069. El orden de recorte (h) solo se aplica si ni con eso cabe. Cuando la #102 esté en `develop`, se fusiona en la rama y se vuelve a medir.
- **Añadido para E3**: en *Atención*, el aviso de un tipo del BCE desactualizado enlaza hoy a «Registrar valoración»; tiene que llevar a actualizar el histórico del BCE (su sección de Ajustes), con su test.
- **Errores del encargo (§6)**: corregidos en los artefactos (`spec.md`, `plan.md`, `data-model.md`): la lista cerrada de pares recoge `--c-raised`; el ancla lleva el efecto de ir al fragmento; `inRentaSeason` es la sexta pieza del barril; las autorizaciones son 76.069 y 310.500.

## 5. Propuestas del alto (§7.2 del encargo), con mi recomendación

| | Qué | Propongo | Dónde |
|---|---|---|---|
| (a) | La definición de lo aportado | Ingresos menos retiradas de efectivo en cuentas `core`, a `amount / fx_rate` del propio evento; nada más cuenta; el cubo nunca; anulados por la proyección; fecha de negocio ≤ la del punto. **Dos puntos para decidir**: dibujar la espina con una frase cuando hay compras sin ingreso previo (propongo sí), y el libro de la cuenta a la fecha del movimiento o el actual (propongo el actual, como `cashFlowsOf`, salvo que el catálogo permita cambiarlo) | `plan.md` §5 |
| (b) | Qué año enseña el calendario | El año natural de la fecha consultada; lo posterior, en la lista y en el borde derecho de la tira con «2030 ›»; lo pasado, atenuado | `plan.md` §4.6 |
| (c) | El botón de M13 | «Importar de la carpeta» | `plan.md` §3.7 |
| (d) | El ancla | `scroll-padding-top: calc(var(--header-h) + var(--space-3))` en el documento, **y** un efecto en `shell/anchor.ts` que lleva al fragmento cuando el destino existe (hoy, a 400 px, la página ni baja) | `plan.md` §3.8 |
| (e) | Las puertas | `@atlas/domain/charts`; el calendario en `@atlas/domain/fiscal`; **no** mudar `netWorthSeries` ni `bucketIndexSeries` (liberan arranque, que sobra, y cuestan total, que falta) | `plan.md` §9 |
| (f) | Alturas de los paneles | Móvil 132/44; 1.024-1.799, 240/56; ≥ 1.800, `clamp(15rem, 28vh, 22rem)`/64 | `plan.md` §9 |
| (g) | Lo que falta para M1 y M10 | `bucketGauges` (aportado % del tope, resultado % con signo) y `thesisVsIndexPct` (los dos % de cada tesis y la diferencia en pp), en `@atlas/domain/charts`, en commits de dominio de E3 | `plan.md` §4.4 |
| (h) | El orden de recorte | 1. versión corta del calendario en *Declaración*; 2. mancuernas; 3. la fila entera como objetivo y las tablas equivalentes de las tiras; 4. M9 | `plan.md` §6.3 |

## 6. Errores o precisiones del encargo

- **La lista de pares iguales de `tokens.css` (§3, E1, bloque 1) no nombra `--c-raised`**, que en claro también vale `#ffffff`. La lista cerrada del test lo recoge con su motivo (la pestaña actual sobre su carril es una hoja, como la superficie).
- **El defecto del ancla es mayor de lo que dice la 015** (§30.5): al entrar por `/ajustes#sincronizacion` a 400 px la página no baja, porque el destino se pinta después de que el navegador busque el fragmento; con un `scroll-margin`/`scroll-padding` solo no basta (`plan.md` §3.8; medidas en §7).
- **La propuesta no midió pérdida/peligro en oscuro** (Q1).
- **La campaña hace falta en el arranque** (Q5): el encargo declaraba cinco necesidades de dominio; con el orden del Resumen sin saltos hay una sexta.
- `check-bundle.mjs`: los techos y `LAZY_ONLY` están ahora en las líneas 332, 773 y 909 (el encargo avisaba de que E5 los movería).

## 7. Capturas «antes» de E1

- **Dónde**: `~/personal/atlas/privado/capturas/2026-09-27-020-E1/antes/` (292 capturas, 128 escenas), con `LEEME.md`, `medidas.json` e `indice.json`; las dos maquetas de la propuesta a 400 y 2045, en claro y en oscuro, en `…/maquetas/` (22).
- **Compilación**: la de producción de `ae66814`, con `vite preview` y su CSP. **Chromium**: `chromium-1243` (`Chrome/153.0.8010.12`), el único que hay, tomado como el más alto.
- **Matriz**: 400×890 DPR 3 y 2045×1141; claro y oscuro; privacidad puesta y quitada; sintético el 20/01/2029 en las ocho pantallas que la feature toca (Resumen, Movimientos, Registrar, compra, Cartera, Cubo, Ajustes, Declaración) y el 15/05/2029 en el Resumen y Declaración; libro vacío (Resumen, Registrar, Cartera, Cubo, Ajustes) y primer arranque. Por *viewport*.
- **Medidas de partida** (`medidas.json`):

| Medida | Hoy | Objetivo |
|---|---|---|
| Desplazamiento lateral a 360, 400, 1.440 y 2045 (privacidad quitada) | **ninguno** | ninguno |
| Texto que se lee por debajo de 13 px | **ninguno** | ninguno |
| Objetivos por debajo de 44 px | 88 apariciones, todas `input` de casillas (24 px) e interruptores (1 px) con la etiqueta como objetivo | clasificar en E1 |
| Cuerpo a 1.799 / 1.800 px | 15 px / 15 px | cambia en 1.800 (16 px) |
| Borde superior de la gráfica de evolución a 2045×1141 | **1.187 px** (tarjeta en 1.110) | ≤ 1.141 |
| Ancla `#sincronizacion` a 400, al cargar | la página no baja (`scrollY` 0) | baja al destino |
| Ancla a 400, llevada al fragmento | título en 17 px, **bajo la barra** (53 px) | ≥ borde de la barra |
| Ancla a 2045 | título en 197 px, barra en 65 | igual |
| Pantallas del móvil, sintético y privacidad puesta | Resumen 2,83 · Movimientos 2,58 · Registrar 1,15 · Cubo 3,49 | Movimientos < 2; Registrar ≤ 1 |

- **Límite de esta pasada**: los campos de fecha salen `mm/dd/yyyy` porque el selector sigue el idioma de la interfaz de Chromium; el guion ya arranca con `--lang=es-ES`. El «antes» definitivo de E1 se toma al empezar la entrega, sobre el `develop` de ese día (puede haber entrado la 016).

## 8. Documentos que la dirección tendrá que actualizar

Además de los de §5 del encargo (`system.md` §3.1, §3.3, §3.4, §4.1, §5.2, §5.12, §5.15, §6, §7.2-§7.8, §8 y §9; `brief.md` §7 con nota fechada; ADR-0017 con nota fechada; `business-rules.md`: lo aportado, la línea 324 y el calendario; la propuesta con su estado; `decision-roadmap.md` y `prompts/README.md`):

- `system.md` §3.2: la validación del color ya no «se hizo fuera»: la prueba vive en `apps/web/test/palette.test.ts`, con Machado 2009 y OKLab, y cubre la tritanopía.
- `system.md` §3.6: la gráfica ya no es «184 px en el móvil y 240 en escritorio» (`--chart-h` es 11,5rem = 184 y 15rem = 240; desde 1.800, `clamp`), y los paneles tienen sus alturas.
- `business-rules.md`, tabla de `Settings`: `tax_residence` dice «España» y el código no tiene valor por defecto (Q3).
- `business-rules.md`, regla 17: la marca del aviso del tope (80 %) es una constante del dominio, exportada, no configurable (ya lo es; ahora la pinta la web).
- `business-rules.md` §5.8 (modelos informativos): el plazo por ejercicio y su fuente (Q4).
