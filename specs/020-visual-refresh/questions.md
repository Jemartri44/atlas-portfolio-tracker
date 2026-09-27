# Preguntas y registro: `020-visual-refresh`

Fechas en Europe/Madrid. Aquí van las preguntas a la dirección, lo que se responde, el SHA congelado de cada entrega, cómo se vio fallar cada test, la tabla del paquete, las capturas y sus medidas, la autocomprobación de §6 y la lista de documentos que la dirección tendrá que actualizar.

## 1. Estado

- **2026-09-27, tarde**: **E1 terminada y congelada** (§9). El código congelado es `ded43d6`.
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

## 9. E1 — El marco y el color

### 9.1 Q1, resuelta: la pérdida oscura

Busqué por fuerza bruta, alrededor de `#f2a066` y en pasos de 2 por canal, una pérdida oscura que cumpliera las tres condiciones de la dirección, más dos márgenes míos: pérdida/peligro ≥ 7,5 y pérdida/aviso ≥ 6,2 (lo que medía la propuesta frente al aviso). Elegí la **más cercana a la propuesta**: **`#f49a44`**, a ΔE 2,98 de `#f2a066`, una diferencia que apenas se ve. Guion: `020-search.mjs` en el *scratchpad*. Medido con `020-cvd.mjs` y atado en `apps/web/test/palette.test.ts`:

| Par, tema oscuro | Normal | Protan. | Deuteran. | Tritan. | Umbral |
|---|---:|---:|---:|---:|---|
| Ganancia `#5cc6b0` / pérdida `#f49a44` | 21,41 | **13,47** | 13,88 | 27,23 | ≥ 8 en el peor caso: **13,47** |
| Pérdida `#f49a44` / peligro `#f29a8a` | **7,57** | 8,38 | 7,00 | 2,06 | ≥ 7 con visión normal |
| Pérdida `#f49a44` / aviso `#e8b659` | 6,54 | 6,39 | 3,87 | 7,21 | — (la propuesta daba 6,20) |

Contraste de `#f49a44`: 7,51:1 sobre la superficie, 8,24:1 sobre el papel y 6,55:1 sobre `--c-fill`. **El claro es el de la propuesta** (`#0f6b5c`, `#b04a12`): 8,87 y 7,50. Con tritanopía, pérdida y peligro quedan cerca en oscuro (2,06), igual que con la pérdida de la propuesta (0,82): el peligro nunca va solo (icono con forma propia y palabra). **El suelo de 7 vale en los dos temas**: no hizo falta el suelo por tema.

### 9.2 Lo que encontré y arreglé sin que lo pidiera el encargo

- **Una pérdida pintada de verde**. «Pérdida acumulada sobre el aporte» del Cubo (`BudgetCard.tsx:99`) pedía color por signo sobre `loss_pct`, que es **positivo cuando se pierde**. Con pérdidas, la cifra salía en el color de ganancia. El guardián nuevo del color lo rechaza: `0add25a` le quita el color y deja el signo, igual que a lo que arriesga un criterio (Q6).
- **El ancla era peor de lo dicho**: a 400 px la página no bajaba al destino. Arreglado con las dos piezas del plan §3.8 (`c39fe66`).

### 9.3 Los commits de E1

| Commit | Qué |
|---|---|
| `867eed1` | La prueba del color: tres bloques, `#hex`, pares, alias y la simulación frente a su fuente |
| `d650e25` | `check-bundle.mjs` no construye con un techo por encima de su autorización (76.069 / 310.500), con su test |
| `b39e3c3` | Techo del total antes de `0add25a` |
| `0add25a` | El color de resultado, solo en resultados: la lista cerrada de quién lo pide; lo que arriesga un criterio (Q6) y la pérdida del Cubo, sin color |
| `41c3203` | Techo del arranque antes de M6 |
| `6b32132` | **M6**: `--c-gain` y `--c-loss` en los tres bloques, `--c-series-contrib`, y las pruebas de ΔE, tono, contraste y uso |
| `993c3fa` | El signo y la unidad: U+2212, el cero sin signo y ninguna columna con pp y % a la vez |
| `05702b6`, `a2e1b9d` | Techo, y **M4**: el paso de 1.800 px |
| `01cb1b3`, `563c06e` | Techo, y **M4**: el Resumen en 8+4, con el orden del marcado según el ancho (`view-models/summary-order.ts`) |
| `b87c139`, `c231de3` | Techo, y **M11**: baldosas de 64 px en tres columnas y los campos en pareja desde 384 px |
| `4dc5893`, `1779bd0` | Techos, y **M13**: fecha de Movimientos en tinta con la fila entera como objetivo, *Estado* solo si se usa, el eje con «€», «Importar de la carpeta» y la lista de *Declaración* sin sangría |
| `441bd20`, `c39fe66` | Techo, y el ancla bajo la barra |
| `7d6aa89` | Fusión de `develop` con la PR #102, con los techos medidos en la fusión |
| `84e4be9` | Las clases nuevas (`pair`, `summary-fiscal`), escritas donde las lee el test de arquitectura |
| `ded43d6` | Techos bajados a lo medido |

**Sin cambios de dominio en E1.** `git diff origin/develop -- packages/domain tests/fixtures` sale vacío.

### 9.4 El paquete, mejora a mejora

| Mejora | Arranque | Δ | Total | Δ | La propuesta (arranque / total) |
|---|---:|---:|---:|---:|---|
| Partida (`ae66814`) | 74.125 | | 301.439 | | |
| El color, solo en resultados (`0add25a`) | 74.125 | 0 | 301.545 | +106 | — |
| M6 (`6b32132`) | 74.137 | +12 | 301.518 | −27 | 0 / 0 |
| M4, el paso (`a2e1b9d`) | 74.188 | +51 | 301.612 | +94 | +150 / = (las dos partes) |
| M4, el 8+4 (`563c06e`) | 74.275 | +87 | 301.692 | +80 | |
| M11 (`c231de3`) | 74.366 | +91 | 301.768 | +76 | +100 / = |
| M13 (`1779bd0`) | 74.413 | +47 | 301.980 | +212 | +50 / +50 |
| El ancla (`c39fe66`) | 74.596 | +183 | 302.066 | +86 | — |
| La PR #102, al fusionar (`7d6aa89`) | 74.665 | +69 | 302.418 | +352 | (la dirección: +47 / +406) |
| Las clases en el marcado (`84e4be9`) | 74.664 | −1 | 302.379 | −39 | |
| **E1, congelada** | **74.664** | | **302.379** | | |

- **Lo propio de E1**: +470 en el arranque (estimaba +420) y +588 en el total (estimaba +470). El ancla costó más de lo previsto (+183 frente a +120): el efecto del marco vive en el arranque a propósito.
- **Margen**: el arranque queda a 1.405 bytes de 76.069; el total, a 8.121 de 310.500. Con mi estimación de E2 a E4 (+775 en el arranque y +7.345 en el total, plan §6.2), E4 acabaría hacia 75.439 y 309.724: **cabe, con unos 630 y 780 bytes**.
- **Techos**: cada subida en su propio commit, delante del que la necesita, con la medida y la tendencia en `check-bundle.mjs`. En la fusión con la #102 los dos techos se midieron y se fijaron en la propia fusión, que es donde se encontraron.

### 9.5 Commits que no construían o no pasaban por sí solos, dichos

- **Construcción**: el primer `fix(web): paint only results…` (`c46556f`, **local, nunca empujado**) subía el total a 301.545 sin techo. Lo vi al medir el prototipo de M6: la construcción de su padre ya fallaba. Antes de empujar deshice los dos commits locales y los rehíce con el techo delante (`b39e3c3`, y el mismo cambio como `0add25a`). No queda en la historia empujada.
- **Tests**: el test de arquitectura «styles no class the markup never writes» falla desde `563c06e` (`summary-fiscal` se escribía en un literal fuera de un atributo `class`) y desde `c231de3` (`pair`, en un objeto) hasta `84e4be9`. Lo encontró la tubería completa antes de congelar. **Seis commits empujados en rojo en ese test** (`563c06e` a `7d6aa89`). No reescribo la historia. Desde entonces paso la pasada completa antes de dar una mejora por cerrada, no solo los tests de la mejora.
- **Un tropiezo de manos, sin efecto en la rama**: al medir M4 por partes, un `git stash push` con una ruta sin seguimiento falló, y el `git stash pop` siguiente sacó la entrada de otra feature (`ci-015-upload-artifact`) en este worktree. La deshice (`git checkout HEAD -- .github/workflows/ci.yml vitest.config.ts`) y **la entrada sigue en la lista de `stash`, intacta**. Desde entonces mido con parches en el *scratchpad*, no con `stash`, que es compartido entre worktrees.

### 9.6 Mutación

Guion `020-mut/mutate.py`: aplica la sustitución el número exacto de veces, se niega a correr con un gemelo `.js`, restaura el fichero y lo compara byte a byte. **43 mutantes, 43 muertos, 43 ficheros restaurados idénticos** (`020-mut/results.jsonl`). Por la numeración del encargo:

| Del encargo | Mutantes | Muertos |
|---|---|---|
| 1. Un color ausente en un bloque oscuro | `M1-absent-dark` | ✓ |
| 2. Ganancia y pérdida intercambiadas; la pérdida con el valor del peligro | `2-swapped-light`, `2-loss-is-danger`, `2-dark-loss-of-proposal` | ✓✓✓ |
| 3. Una matriz identidad, o la de otra deficiencia | `3-identity`, `3-other-deficiency-protan`, `3-other-deficiency-tritan` | ✓✓✓ |
| 4. Olvidado, en un peso o una desviación, o por un alias | `4-forgotten-positive`, `4-gain-on-a-gauge`, `4-coloured-deviation`, `4-alias-outside`, `f1-colour-by-code` | ✓✓✓✓✓ |
| 5. El guion, o el cero con signo | `5-hyphen`, `5-signed-zero`, `n-mixed-column` | ✓✓✓ |
| 6. El margen del ancla como número | `6-margin-a-number`, `6-bar-not-followed`, `n4-no-follower` | ✓✓✓ |
| 7. *Estado* siempre, o nunca | `7-state-always`, `7-state-never`, `7-list-ignores-rows` | ✓✓✓ |
| 7 bis. Un techo por encima de su autorización | `7bis-m7b` (arranque), `7bis-m7c` (total) | ✓✓ |
| 7 ter. Alias dentro de `tokens.css`, un par igual a la ganancia, un semántico en la lista | `7ter-alias-inside`, `7ter-same-as-gain`, `7ter-semantic-in-list` | ✓✓✓ |
| Míos | `n1-loss-contrast`, `n2-rgb-value`, `n2-fourth-block`, `f1-hsl-value`, `f1-named-value`, `n3-step-a-pixel-early`, `n5-mockup-dom-order`, `n5-order-ignores-width`, `n5-fiscal-keeps-order`, `m11-two-columns`, `m11-pair-at-360`, `m11-lonely-pair`, `m13-date-in-accent`, `m13-row-not-target`, `m13-indent`, `Q6-stake-coloured`, `lossPct-coloured` | todos |

### 9.7 Cómo vi fallar cada test antes que el código

- `palette.test.ts` y `palette-usage.test.ts` (M6): escritos antes de cambiar los colores; **15 en rojo** sobre `tokens.css` de `develop`: los tres ΔE, los tres de pérdida/peligro, los tres de contraste, la espina en los tres bloques, la lista de pares, «ni rastro de `--c-positive`» y «solo las reglas de un resultado». Después, cambiados los colores, verdes.
- `chart.test.tsx` y `chart-wiring.test.tsx` (el eje con «€»): tres en rojo con las expectativas nuevas, verdes al cambiar `axis.ts`.
- `monitor-step.test.tsx`: el paso, en rojo hasta ajustar la lectura de las variables resueltas; el orden y la colocación, vistos morir con los mutantes `n5-*`.
- El resto (`sign-and-unit`, `registrar-compact`, `polish`, `anchor`, `result-colour`, `bundle-authorisation`): verdes contra lo que ya estaba bien, o escritos a la vez que el cambio; **cada uno visto en rojo por su mutante** (§9.6), que es la prueba de que muerden.

### 9.8 Tubería completa, sobre `ded43d6`

| Orden | Salida | Nota |
|---|---:|---|
| `npm run lint` | 0 | |
| `npm run typecheck` | 0 | |
| `npm run test:coverage:domain -- --pool=forks --maxWorkers=1` | 0 | el dominio al 100 % (sin cambios en E1) |
| `npm run test:others -- --pool=forks --maxWorkers=1` | **1**, luego **0** | la primera, sobre `7d6aa89`, falló en el test de arquitectura (§9.5); tras `84e4be9`, 173 ficheros y 1.650 tests en verde |
| `npm run build` | 0 | arranque 74.664, total 302.379 |
| Web y dominio con `TZ=Pacific/Kiritimati` y el reloj del sistema en el **31/12/2028 23:30** (Madrid) | 0 | 241 ficheros, 2.240 tests |
| Web y dominio con `TZ=Pacific/Pago_Pago` y el reloj en el **01/01/2029 00:30** (Madrid) | 0 | 241 ficheros, 2.240 tests |

El reloj se falsea fuera del repositorio: `NODE_OPTIONS=--import 020-fakeclock.mjs` sustituye `Date` en cada proceso de la suite (el informe de Vitest muestra la hora falsa, prueba de que se aplicó). Junté cada huso con una de las dos horas para no pasar cuatro veces las suites; si algo hubiera fallado, habría separado las condiciones.

- **Gemelos `.js`**: `find apps packages tests -name '*.js' -not -path '*/dist*' -not -path '*/node_modules/*'` cruzado con sus `.ts`/`.tsx`: **ninguno**.
- **Nombres de test**: `020-testnames.sh` sobre `origin/develop` y sobre la rama: **ninguno desaparece**, y hay 60 nuevos.
- **Salida fiscal**: E1 no toca el dominio ni la consola (`git diff origin/develop -- packages apps/cli tests/fixtures` vacío), así que no se puede mover. La predicción y la comparación byte a byte van en E2 y E4.

### 9.9 Cada commit construye por sí solo (familia 5)

En el worktree desacoplado `.claude/worktrees/020-probe`, en secuencia y detrás de la puerta de memoria: `npm run build` (con `check-bundle.mjs`) de cada commit de E1 que toca `apps/web/` o `packages/domain/src/` (`020-percommit.sh`). `package-lock.json` no cambia en el tramo, así que no hizo falta otro `npm ci`.

| Commit | `npm run build` | Arranque | Total |
|---|---:|---:|---:|
| `867eed1` | 0 | 74125 | 301439 |
| `d650e25` | 0 | 74125 | 301439 |
| `b39e3c3` | 0 | 74125 | 301439 |
| `0add25a` | 0 | 74125 | 301545 |
| `41c3203` | 0 | 74125 | 301545 |
| `6b32132` | 0 | 74137 | 301518 |
| `993c3fa` | 0 | 74137 | 301518 |
| `05702b6` | 0 | 74137 | 301518 |
| `a2e1b9d` | 0 | 74188 | 301612 |
| `01cb1b3` | 0 | 74188 | 301612 |
| `563c06e` | 0 | 74275 | 301692 |
| `b87c139` | 0 | 74275 | 301692 |
| `c231de3` | 0 | 74366 | 301768 |
| `4dc5893` | 0 | 74366 | 301768 |
| `1779bd0` | 0 | 74413 | 301980 |
| `441bd20` | 0 | 74413 | 301980 |
| `c39fe66` | 0 | 74596 | 302066 |
| `7d6aa89` | 0 | 74665 | 302418 |
| `84e4be9` | 0 | 74664 | 302379 |
| `ded43d6` | 0 | 74664 | 302379 |

**Los veinte, en verde**, y cada subida de techo va delante del commit que la necesita. Las medidas son deterministas: coinciden byte a byte con las que tomé al construir cada mejora (§9.4).

### 9.10 Autocomprobación de §6, familia a familia

1. **Guardianes que se pueden eludir.** Para cada uno escribí la vía que lo salta y la vi morir:
   - *El color*: un valor en `rgb()` (`n2-rgb-value`), en `hsl()` (`f1-hsl-value`) o con nombre (`f1-named-value`) en lugar de `#hex`; un cuarto bloque que el lector no mira (`n2-fourth-block`); un alias dentro de `tokens.css` (`7ter-alias-inside`), fuera (`4-alias-outside`) o desde el código, como nombre de color de una serie (`f1-colour-by-code`). Todos muertos. El guardián reconoce **por identidad**: el camino exacto de at-reglas y selector de cada bloque, la lista exacta de reglas `(hoja, selector)` que pueden pintar un resultado, y la lista exacta de ficheros que piden `coloured`.
   - *La autorización del paquete*: un techo por encima, en el arranque y en el total (`7bis-*`). La construcción misma falla, no solo el test.
   - *El ancla*: el margen como número (`6-margin-a-number`), la variable del alto sin seguir a la barra de escritorio (`6-bar-not-followed`) y el marco sin el efecto (`n4-no-follower`).
   - *La privacidad por atributos, las fechas fiscales en la web, la puerta del barril y `LAZY_ONLY`*: no hay nada que mirar en E1. No se toca ningún importe, ni una fecha fiscal, ni el dominio. Son de E2 a E4.
   - *Los estilos en línea*: el código nuevo no usa `style` ni `setAttribute("style")` ni `innerHTML`. Además, `check-bundle.mjs` sigue en verde con su comprobación.
2. **Reglas sin test.** Repasé cada «siempre», «nunca», «solo» y cada número de §3, E1:
   - tres bloques: fila 1;
   - ΔE ≥ 8 y ≥ 7: filas 2 y 3;
   - 4,5:1 y 3:1: fila 5;
   - solo en resultados: filas 7 y el test de `coloured`;
   - U+2212 y el cero sin signo: fila 9;
   - pp y % nunca en la misma columna: `sign-and-unit.test.tsx`, que recorre las tablas de la Cartera y el Cubo en dos fechas;
   - «justo en 1.800»: fila 11;
   - «64 px en tres columnas» y «solo si caben a 360»: `registrar-compact.test.tsx`, con 360 medido en Chromium;
   - «*Estado* solo si alguna fila la usa»: fila 13;
   - «atado a la variable»: fila 12;
   - «nunca sola en su fila»: la tarjeta fiscal a la derecha del patrimonio, en `monitor-step.test.tsx`.
   **Una regla que se cumplía por casualidad**: «solo en resultados» se cumplía salvo en dos sitios que nadie miraba. Uno era una pérdida pintada de verde (§9.2).
3. **Tests que dependen del reloj.** Nada nuevo lee `Date.now()` ni `new Date()` sin argumento: lo busqué en el código y en los tests nuevos. Además, las suites de la web y del dominio pasan con `TZ=Pacific/Kiritimati` y el reloj en el 31/12 23:30, y con `TZ=Pacific/Pago_Pago` y el reloj en el 01/01 00:30 (§9.8). Los bordes de la campaña, de «Este año», del mes y del calendario son de E2 y E4.
4. **Documentos y descripción de la PR desalineados.** La descripción de la PR, este fichero y la rama dicen lo mismo:
   - cada commit de §9.3 está en la PR;
   - las cifras del paquete son las de `ded43d6`, el código congelado;
   - las capturas que se citan están en su carpeta, con esa fecha y ese Chromium;
   - no hay cambios de dominio que señalar;
   - la lista de documentos (§8 y §9.12) cubre cada regla visible que cambió;
   - lo no hecho se dice: M5, M9, M10, M1, M2, M3, M7, M8 y M12 son de E2 a E4.
5. **Techo subido tarde.** §9.9: los veinte commits construyen en verde por sí solos. El único que no lo hacía (`c46556f`) nunca se empujó (§9.5).
6. **Accesibilidad y contraste.**
   - Los colores nuevos, medidos por el test en los tres bloques (§9.1).
   - El color nunca va solo: el signo, siempre (fila 9).
   - Los objetivos de 44 px, el texto de 13 px y el desplazamiento lateral a 360, 400, 1.440 y 2045: §9.11.
   - El orden del foco en el 8+4 sigue al visual, porque el marcado cambia de orden con el ancho (`n5-*`); comprobado en el navegador (§9.11).
   - Nada nuevo se anima: el ancla va con `behavior: "auto"`, y no hay transiciones nuevas.
   - No hay SVG nuevos en E1.

### 9.11 Capturas y medidas

- **Dónde**: `~/personal/atlas/privado/capturas/2026-09-27-020-E1/`, con `antes/` (294 capturas), `despues/` (286), `maquetas/` y `LEEME.md`, que empareja cada escena con la mejora que enseña. 128 escenas por pasada.
- **Antes**: la compilación de `develop` en `f192f87`, con la 015 y la #102, en un worktree desacoplado. **Después**: la de `ded43d6`. Chromium `chromium-1243` (`Chrome/153.0.8010.12`) con `LANG=es_ES.UTF-8`: esta vez los campos de fecha salen `dd/mm/aaaa`. La pasada del alto (§7) los sacaba `mm/dd/yyyy`, porque `--lang` no basta en el Chromium sin interfaz; hace falta la variable de entorno. Esa pasada se sustituyó por esta.
- **Medidas** (`medidas.json`, antes → después):

| Medida | Antes | Después | Regla |
|---|---|---|---|
| Desplazamiento lateral a 360, 400, 1.440 y 2045, privacidad quitada | ninguno | **ninguno** | sin desplazamiento |
| Texto que se lee por debajo de 13 px | ninguno | **ninguno** | ≥ 13 px |
| Objetivos por debajo de 44 px | 88: casillas (24 px) e interruptores (1 px), cuyo objetivo es la etiqueta entera | **los mismos 88**, ninguno nuevo | ≥ 44 px |
| Cuerpo a 1.799 / 1.800 px | 15 / 15 px | **15 / 16 px** (y el `h1`, 26 / 28 px) | cambia justo en 1.800 |
| Borde superior de la gráfica de evolución a 2045×1141 | 1.187 px | **540 px** | ≤ 1.141 |
| Orden del marcado del Resumen a 2045 frente a su posición | la tarjeta fiscal, cuarta en el marcado, se pintaba **primera** (`order: -1`) | patrimonio, *Declaración*, evolución, *Atención*, movimientos: **igual en el marcado y en la pantalla** | el foco sigue al ojo |
| «Otros registros» a 400×890 | 700 px | **441 px** (la barra inferior, en 826) | en el primer pantallazo |
| Baldosas del día a día a 400 | 104-120 px | **64 px** las siete | 64 px |
| Pantallas de Registrar en el móvil | 1,15 | **1,00** | una |
| El botón de la carpeta a 400 | «Importar desde la carpeta de la consola», en dos líneas dentro de sus 44 px (se ve en las capturas) | «Importar de la carpeta», en una línea, 44 px | una línea |
| Ancla a 400, al cargar | `scrollY` 0 (no baja) | **`scrollY` 938, título en 81 px bajo una barra de 53 px** | título ≥ barra |
| Ancla a 2045, al cargar | título en 197 px, barra en 65 | título en 184 px, barra en 65 | título ≥ barra |

- **Lo que se ve y no mide ningún número**: con la privacidad puesta, M6 solo se nota en la Declaración y en los resultados del Cubo, porque el color va en cifras que se ven. La mejora grande de color llega con E3, cuando los porcentajes junto a las máscaras lleven signo.

### 9.12 Documentos que la dirección tendrá que actualizar por E1

Además de §8:

- `system.md` §3.1: `--c-gain` `#0f6b5c` / `#5cc6b0`, `--c-loss` `#b04a12` / **`#f49a44`** (no el `#f2a066` de la propuesta; §9.1), `--c-series-contrib` `#8a8880` / `#8f8d86`, con sus contrastes. Y la frase «El color de resultado solo en resultados», con la lista cerrada de `result-colour.test.ts`.
- `system.md` §3.3 y §3.4: el paso de 1.800 px (16/19/28/48, `--gutter` 40, `--grid-gap` 24, contenedor 1.840).
- `system.md` §3.6: `--tile-h` (64 px) y `--tile-h-wide` (104 px), y `--header-h`.
- `system.md` §4.1: el punto de corte de 1.800 px, y que a partir de él el Resumen cambia **el orden del marcado**, no solo la colocación.
- `system.md` §5.4: la fila entera como objetivo cuando el enlace de la fila es su fecha, y la columna *Estado* solo si se usa.
- `system.md` §5.10 o §7.4: los campos cortos en pareja desde 384 px, y por qué no a 360 (una fecha necesita 169 px y media fila le da 158).
- `system.md` §5.15: el eje de las gráficas con su unidad («400 €», «12 k€»).
- `system.md` §7.2: el 8+4 del monitor.
- `system.md` §7.4: las baldosas de 64 px en tres columnas y sin icono en el móvil, y con icono desde 640 px.
- `system.md` §9: `shell/anchor.ts` (el ancla) y `view-models/summary-order.ts` (el orden del Resumen).
- `docs/design/proposals/2026-09-25-visual-improvements.md` §5.1: la pérdida oscura cambia a `#f49a44`, porque la de la propuesta no llegaba a ΔE 7 frente al peligro en oscuro (5,05).

### 9.13 Congelado

- **Código congelado: `ded43d6`**. El commit que añade esta sección solo toca `specs/`; su SHA va en la PR. Desde aquí no empujo nada mientras dura la revisión.
- **Para los revisores**: `git worktree add --detach .claude/worktrees/020-rev-E1-<revisor> <sha>`.
