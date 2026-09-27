# Plan de implementación: `020-visual-refresh`

**Rama**: `feature/020-visual-refresh` · **Fecha**: 2026-09-27 (Europe/Madrid) · **Especificación**: [`spec.md`](spec.md)
**Entrada**: `docs/prompts/020-visual-refresh.md`, con su §8.1. Anexos: [`research.md`](research.md) (bloque 0 y fuentes), [`data-model.md`](data-model.md) (lo que el dominio y la web calculan), [`contracts/`](contracts/) (puertas del dominio y reglas de la interfaz), [`quickstart.md`](quickstart.md) (cómo se comprueba) y [`questions.md`](questions.md).

**Estado: el alto del plan.** No hay código de producción. **Hay una parada del bloque 0 del color (Q1)** que no bloquea el alto, pero sí el bloque 2 de E1; el resto de E1 puede empezar con el visto bueno.

## Resumen

Trece mejoras de la propuesta (M1-M13) y el ancla de `#sincronizacion`, en cuatro entregas de una sola rama, cada una con su PR. Cinco cambios del dominio, cada uno en sus propios commits y señalados en la PR: `fiscalAttention` (M2) y `hasForeignAccountsAt` (E2), más `inRentaSeason` si se aprueba (Q5); la exportación de `NEAR_LIMIT_PCT` (E3); lo aportado, el cubo en porcentaje y el calendario (E4). Dos valores más que M1 y M10 necesitan y el dominio no da (§4.4): los porcentajes de cada tesis y los del medidor del tope. Todo lo nuevo del dominio va detrás de una puerta perezosa, salvo las dos piezas del barril. La web solo traduce, coloca y dibuja, con los guardianes escritos antes que el código.

## Contexto técnico

**Lenguaje/versión**: TypeScript 7.0.2, Node 22 (`.nvmrc`), ESM, `tsconfig` estricto.
**Dependencias principales**: Solid 1.9.15, `@solidjs/router` 1.0.0, uPlot 1.6.32 vendorizada (trae `paths.stepped` y `cursor.sync`), `big.js` vendorizada en el dominio. **Ninguna nueva.**
**Almacenamiento**: ninguno nuevo; la web lee el libro de IndexedDB (ADR-0019).
**Pruebas**: Vitest 4 con `happy-dom`, `fast-check` (ya es dependencia de desarrollo), `@vitest/coverage-v8`; siempre `--pool=forks --maxWorkers=1`, y las dos pasadas (`test:coverage:domain`, `test:others`) por separado con las opciones.
**Plataforma**: el navegador del móvil (400×890, DPR 3) y del monitor (2045×1141); PWA estática con CSP `style-src 'self'`.
**Tipo de proyecto**: monorepo; se tocan `apps/web` y `packages/domain`, y `tests/architecture.test.ts`.
**Objetivos**: arranque ≤ 76.069 bytes gzip, total ≤ 309.500 (§6).
**Restricciones**: sin dependencias, sin estilos en línea, ningún valor fuera de `tokens.css`, ningún porcentaje con `number`, ninguna regla de dominio en la web, memoria disponible ≥ 1.500 MB antes de cada paso pesado.
**Escala**: 13 mejoras, 4 entregas, 5 cambios de dominio.

## Comprobación contra la constitución

| Principio | Cómo se cumple | Riesgo y guardián |
|---|---|---|
| I. El libro es la fuente | Nada se almacena: lo aportado, el cubo en %, el calendario y los medidores se recalculan del libro | — |
| II. La fiscalidad solo del libro | Ninguna cifra fiscal cambia; el calendario usa `washSaleWindowEnd` y no recalcula; ningún precio entra en una fecha fiscal | Predicción y salida fiscal byte a byte en E2 y E4 (mutante 29) |
| III. Compartimentación | Lo aportado es **solo** de la cartera principal; el medidor del peso del cubo es la única cifra que junta los dos libros, con su filete y su frase | Mutantes 19 y 21 |
| IV. Nada codificado | Campaña, parada, peso máximo y ventanas salen de `Settings`; la marca del tope, del dominio; el plazo de los modelos, de una tabla normativa con su fuente; **ninguna fecha fiscal en la web** | Guardián de fechas fiscales en la web (mutante 26) |
| V. Fallo seguro | El hueco se dibuja (opción A); lo aportado no tiene huecos porque no depende de precios; un ejercicio sin plazo normativo lo dice; sin `tax_residence` se reserva la fila | Mutantes 22 y 24 |
| VI. Pocas dependencias | Ninguna nueva; Chromium desde el *scratchpad* | `package.json` y `package-lock.json` sin cambios |
| VII. Tests primero | Cada guardián antes que el código; el dominio al 100 %; mutación por regla | §7 y §10 |

**Sin violaciones que justificar.** La única tensión es la cuarta gráfica (M12) frente a `brief.md` §7, **ya decidida** por la dirección (§7.1 (b) del encargo); va a la lista de documentos.

## 1. Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Colores, paso de 1.800 px, alturas de los paneles, alto de la barra actual | `apps/web/src/styles/tokens.css` (tres bloques) |
| La prueba del color (tres bloques, CVD, contraste, pares, alias) | `apps/web/test/palette.test.ts` (nuevo); `contrast.test.ts` se queda |
| La regla del uso de ganancia y pérdida en las hojas | `apps/web/test/palette-usage.test.ts` (nuevo) |
| Techos contra autorizaciones | `apps/web/scripts/check-bundle.mjs` (`BOOT_AUTHORISED_GZIP_BYTES`, `TOTAL_AUTHORISED_GZIP_BYTES`) |
| El ancla bajo la barra | `styles/base.css` (`scroll-padding-top`) y `shell/anchor.ts` (nuevo: ir al fragmento cuando el destino existe) |
| `hasForeignAccountsAt` | `packages/domain/src/projections/foreign-accounts.ts`, barril |
| `fiscalAttention.prominent` | `packages/domain/src/informative/attention.ts` |
| La puerta de las series e indicadores | `packages/domain/src/charts.ts` → `@atlas/domain/charts` |
| El calendario y los plazos | `packages/domain/src/informative/calendar.ts`, `informative/deadlines.ts`, exportados por `fiscal.ts` |
| El orden del Resumen, la línea de perder datos, la fila reservada | `apps/web/src/view-models/attention.ts`, `view-models/summary-order.ts` (nuevo) |
| Movimientos por mes y valoraciones agrupadas | `apps/web/src/view-models/movements.ts` (el agrupamiento sale de `MovementList.tsx`) |
| «Este año» | `apps/web/src/components/chart/ranges.ts` |
| Paneles de la evolución | `components/chart/StackedSeriesCard.tsx` (nuevo), que reutiliza `Chart`, `ChartTable` y `gaps.ts` |
| Regla del hueco del cubo | `view-models/series.ts` |
| Tira de desviación, medidores, mancuernas, calendario | `components/chart/` (SVG a mano con coordenadas en %) |
| El guardián de privacidad por atributos | `apps/web/test/privacy-attributes.test.tsx` (nuevo) |
| El guardián de fechas fiscales en la web | `tests/architecture.test.ts` |

## 2. La partición, tal como la sigo

**La del encargo, sin cambios**: E1 (M6, M4, M11, M13, ancla), E2 (M2, M8), E3 (M1, M9, M5, M10), E4 (M3, «Este año», M7, M12). Una rama, cuatro PRs, y la siguiente entrega empieza con `git merge origin/develop` tras la palabra de la dirección.

**Dos precisiones**:
- **E1 se parte por dentro por Q1.** Los bloques 1 (guardianes, sin los colores nuevos todavía: exigen los tres bloques, prueban la simulación contra la fuente y fijan los umbrales), 3 (M4), 4 (M11), 5 (M13) y 6 (el ancla) no dependen de Q1. El bloque 2 (sustituir los colores) espera la respuesta. Si llega tarde, E1 se congela sin el bloque 2 y la dirección decide si la fusiona así.
- **Los dos valores de M1/M10 que faltan** (§4.4) van en E3, en commits de dominio propios, señalados, si la dirección los aprueba aquí.

## 3. E1: diseño

### 3.1 Bloque 0 del color

Entero en [`research.md`](research.md) R1-R4: fuentes con dirección y fecha, mi recálculo (coincide con la propuesta en todas sus cifras) y los contrastes (pasan todos). **La parada**: pérdida frente a peligro con visión normal **en oscuro mide 5,05**, por debajo del suelo de 7 del encargo; la propuesta solo midió el claro. → **Q1**.

### 3.2 La prueba del color (bloque 1)

- **Lector por bloques, no por orden de aparición**: parte `tokens.css` en sus tres bloques de color por sus selectores (`:root {` claro, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"])`, `:root[data-theme="dark"]`) y **falla si encuentra un cuarto bloque que declare `--c-*`** (el tercer bloque que el lector no mira, familia 1 de §6) o un valor de color que no sea `#rrggbb` en una variable semántica o de datos (`rgb()`, `hsl()`, un nombre). Las `--c-*` con transparencia (`--c-backdrop`) quedan en una lista cerrada con su motivo.
- **Cada `--c-*` en los tres bloques**; falta en uno → falla.
- **ΔE** ganancia/pérdida ≥ 8 en el peor de protan/deutan/tritan, en los dos temas oscuros y en el claro; pérdida/peligro, visión normal, ≥ 7 (o lo que decida Q1); contraste ≥ 4,5 de ganancia y pérdida sobre superficie y papel; ≥ 3 de `--c-series-contrib` sobre la superficie.
- **La simulación contra la fuente** (R1, R2): primarios → columnas publicadas; blanco conservado; OKLab del blanco y del negro.
- **Pares iguales**: dentro de cada bloque, dos `--c-*` no comparten valor salvo la lista cerrada, **cada par con su motivo**; el test comprueba además que **ningún color semántico** (`--c-gain`, `--c-loss`, `--c-danger`, `-soft`, `-border`, `--c-caution`, `-icon`, `-soft`) aparece en la lista. Con la lista completa de R7 (incluido `--c-raised`, que el encargo no nombraba).
- **Sin alias dentro**: ninguna variable del fichero toma `var(--c-gain)` ni el de otro semántico.

### 3.3 El uso de ganancia y pérdida (bloque 1)

- **Por identidad, no por parecido**: las únicas reglas de todas las hojas que pueden nombrar `--c-gain` y `--c-loss` son **una lista cerrada de selectores** de resultado (hoy `.positive` y `.negative` de `base.css`, que pintan `Amount` y `Figure` con `coloured`); cualquier otra aparición, en cualquier hoja, falla. Y `--c-positive` o `--c-negative` en cualquier sitio, fallan.
- **Sin alias fuera**: ninguna hoja define una variable cuyo valor contenga `var(--c-gain)` o `var(--c-loss)`.
- **Dónde se pide color**: un test recorre el código de la web y lista cada `coloured` de `Amount`/`Figure`; la lista esperada, escrita en el test, son **resultados** (ganancia o pérdida realizada o latente, resultado frente al índice, medias de ganancia y pérdida). El `coloured` de `Criteria.tsx:80` (lo que arriesga un criterio) no es un resultado: **Q6**.

### 3.4 Signo y unidad (bloque 2)

`formatDecimalString` ya pone U+2212 y quita el signo del cero. Se añaden los tests que atan las reglas (menos tipográfico, cero sin signo, «pp» para una diferencia de pesos y «%» para un peso o un rendimiento, nunca los dos en una columna de una misma tabla), con sus mutantes (5).

### 3.5 M4, el paso de 1.800 px (bloque 3)

- `@media (min-width: 112.5rem)` en `tokens.css` con los valores de la propuesta (`--text-md` 16, `--text-lg` 19, `--text-xl` 28, `--text-display` 48, `--chart-h` `clamp(15rem, 28vh, 22rem)`, `--gutter` 40, `--grid-gap` 24, `--content-max` 115rem = 1.840).
- **El Resumen en 8+4** en `layout.css` a partir de 1.800: el patrimonio `span-8`, *Declaración* `span-4` a su derecha, la evolución `span-8` y *Atención* y *Últimos movimientos* apilados en la columna de 4. **El orden de tabulación sigue al visual**: el orden de lectura del 8+4 (perder datos, patrimonio, *Declaración*, evolución, *Atención*, movimientos) no es el del móvil (§8 P6: *Atención* antes que la evolución, *Declaración* al final fuera de campaña), y la rejilla puede mover una caja pero no el orden en que la recorre el teclado. Por eso el orden del DOM lo elige `view-models/summary-order.ts` con una señal del ancho, `mediaQuery("(min-width: 112.5rem)")` de `shell/media.ts`, el mismo recurso que ya ordena la navegación por la misma razón. Se mide con el foco (§8).
- **Medido**: tamaño computado del cuerpo a 1.799 y 1.800; borde superior de la evolución a 2045×1141 (hoy 1.187 px, **fuera**; objetivo ≤ 1.141).

### 3.6 M11, Registrar compacto (bloque 4)

Baldosas de 64 px (`--tile-h`, token nuevo) en tres columnas en el móvil; las fechas y cantidad con precio en pareja **solo si caben a 360 px**, medido; si no, columna a ese ancho.

### 3.7 M13, el pulido (bloque 5)

- **El botón** [decide, §7.2 (c)]: **propongo «Importar de la carpeta»**, el texto de la propuesta, en el primer arranque y en Ajustes. El alto automático dejaría el botón en dos líneas, que es justo el defecto. La tarjeta ya dice encima «en el ordenador, el libro de la consola».
- **El eje del cubo con unidad**: «€» en el eje con la privacidad quitada (con ella, el eje ya no lleva cifras). En E4 pasa a «%».
- **Movimientos de escritorio**: la fecha en tinta, sin subrayado; la fila entera como objetivo con un enlace que cubre la fila (`a::after` absoluto sobre la celda, sin `style`), y la columna *Estado* solo si alguna fila de la página la usa (decisión en el modelo de vista, con su test).
- Sin sangría en la lista de *Declaración* (`fiscal-todo`).

### 3.8 El ancla (bloque 6) [decide, §7.2 (d)]

- **Propongo `scroll-padding-top` en el documento**, no `scroll-margin-top` en cada destino: una sola regla cubre **cualquier** ancla presente y futura, que es lo que pide el encargo («y por cualquier ancla de la aplicación»). Atada a una variable nueva, `--header-h`, que vale `var(--statusbar-h)` por debajo de 1.200 px y `var(--topbar-h)` desde ahí, más `--space-3` de aire. Si la barra cambia de alto, el margen la sigue. Un test lee `base.css` y exige que el valor sea `var(--header-h)` (mutante 6: un número).
- **Lo que el encargo no sabía** (R7): a 400 px **la página ni siquiera baja al ancla**, porque el destino se pinta después de que el navegador busque el fragmento. Por eso hace falta además un pequeño efecto en el armazón (`shell/anchor.ts`), en uno de los pocos ficheros de arranque que ADR-0017 permite: tras cada navegación con fragmento, espera a que el destino exista (hasta un tope de fotogramas) y lo lleva arriba con `scrollIntoView`, que respeta `scroll-padding-top`. Sin animación (`behavior: "auto"`).
- **Medido** a 400 y a 2045: tras navegar, `scrollY > 0` cuando la página es más alta que la pantalla, y el borde superior del título ≥ el borde inferior de la barra.

## 4. El dominio

Cada cambio en **sus propios commits**, con sus tests en rojo primero, el dominio al 100 % y **señalado en la PR** con su lista de commits. Contratos en [`contracts/domain-doors.md`](contracts/domain-doors.md).

### 4.1 `fiscalAttention.prominent` = solo la campaña (E2)

Tests en los bordes (primer y último día incluidos, el día antes y el de después, con una campaña configurada `03-15`..`05-20` distinta de la de por defecto) y un 720 pendiente fuera de la campaña que ya no sube la tarjeta. La fecha es argumento. **La salida fiscal no se mueve**: `prominent` no lo lee ninguna orden de la consola (`atlas` no pinta la tarjeta); se comprueba con `grep` y con la predicción.

**Una sexta pieza para el barril, que el encargo no declaraba (Q5)**: el Resumen tiene que saber **en la primera pintada** si la fecha cae en la campaña, o *Declaración* saltaría arriba al llegar el estado fiscal perezoso (justo lo que §3, E2, bloque 2 prohíbe). La regla vive hoy en `inSeason`, sin exportar, en `informative/attention.ts` (perezoso). Propongo moverla a `settings/settings.ts` como `inRentaSeason(settings, date)`, junto a `rentaSeasonOf`, exportarla por el barril (unos 40 bytes, medidos) y que `fiscalAttention` la use: una sola regla en un solo sitio, con los tests de bordes sobre ella. Sin la aprobación, la alternativa es pintar la tarjeta al final y moverla al llegar, que salta.

### 4.2 `hasForeignAccountsAt` (E2)

Diseño en [`data-model.md`](data-model.md) §1. **Compara con `tax_residence`**, nunca con `"ES"`; **sin `tax_residence`, `true`**. **No alineo `fiscalAttention` ni `informative/holdings.ts` con él**: con `tax_residence` ausente, el predicado dice `true` y ellos comparan con `ES`; cambiarlos haría que un libro sin `tax_residence` tratara como extranjeras las cuentas españolas y **movería avisos y cifras del 720/721**. Consecuencia conocida, en Q3: con una residencia distinta de `ES`, el predicado y el motor pueden discrepar (el motor sigue la ley española en cualquier caso).

### 4.3 `NEAR_LIMIT_PCT` exportado (E3)

`export const` en `bucket-stats.ts` y en el barril; mismo valor. El medidor lo lee; el test del mutante 19 cambia la constante a 75 (mutando el dominio) y mira moverse la marca.

### 4.4 Lo que M1 y M10 necesitan y el dominio no da [decide, §7.2 (g)]

| Valor | ¿Existe? | Propuesta |
|---|---|---|
| % de cada tipo de activo sobre la parte de la cartera, y partición cartera/cubo | Los importes, sí (calculadora); la partición es `bucket_pct_of_contribution` | Modelo de vista con `Decimal`; **no es dominio** (reparto ya decidido, solo se expresa) |
| Aportado como % del tope | **No**: el dominio lo calcula dentro del aviso (`bucket-stats.ts:392`) y no lo expone | `bucketGauges` en `@atlas/domain/charts`, con la propiedad «relleno > marca ⇔ aviso» |
| Resultado del cubo sobre lo aportado, con signo | Solo `loss_pct` (la pérdida, positiva) | En `bucketGauges` (`result_pct`); la web no niega nada |
| Cada tesis frente al índice en pp, y los dos % de la mancuerna | **No**: solo importes (`result_vs_index_eur`) | `thesisVsIndexPct` en `@atlas/domain/charts`, con el denominador de la regla 16 |
| Peso de cada posición en el cubo | Sí, en la web (`view-models/bucket/positions.ts`, con `Decimal`) | Se queda; «sin dato» con total parcial |
| Peso del cubo sobre el patrimonio y su máximo | Sí (`weight_pct`) y `Settings` | Se usa tal cual |
| `unrealized_pct`, `vs_index_pct` | Sí | Se usan tal cual |

Van **en `@atlas/domain/charts`, perezosos** (el Cubo y la Cartera son rutas perezosas), no como campos nuevos del barril, para no gastar arranque.

### 4.5 E4: lo aportado, el cubo en %, el calendario

Lo aportado: §5. El cubo en %: [`data-model.md`](data-model.md) §3, con el invariante contra `bucketStats`. El calendario: ídem, con la tabla normativa (R5) cuya forma es **Q4**.

### 4.6 El año del calendario y las fechas fuera de él [decide, §7.2 (b)]

**Propongo**: la tira enseña **el año natural de la fecha consultada** (enero a diciembre), con «hoy» como línea de acento. **Ninguna fecha se esconde**:
- una fecha **posterior** al año (la ventana de un año que termina el siguiente) va en la lista con su fecha completa, y en la tira como su marca pegada al **borde derecho** con una flecha «›» y el año («2030 ›»);
- una fecha **anterior** a hoy dentro del año (un plazo ya pasado) se dibuja y se lista **atenuada**, con «pasado»;
- la campaña es la banda del año enseñado.
- En la **versión corta** de *Declaración* (solo en campaña): la tira sin la lista, y la próxima fecha en una línea.

## 5. La definición de lo aportado (propuesta para `business-rules.md`) [decide, §7.2 (a)]

La escribe la dirección antes de la primera línea de su código. Propuesta, caso a caso, con un ejemplo cada uno:

1. **Qué cuenta**: los `cash_deposit` (suman) y los `cash_withdrawal` (restan) en **cuentas cuyo libro es `core`**. *Ejemplo*: ingresos de 1.000 € el 01/02 y el 01/03 y una retirada de 300 € el 15/03 → lo aportado a 31/03 es 1.700 €.
2. **Su valor en euros**: `amount / fx_rate` **del propio evento**, con la precisión de ADR-0005 (`FxRate.toEur`, como `cashFlowsOf`), nunca otro tipo ni el del día de la gráfica. *Ejemplo*: 1.100 USD con `fx_rate` 1,1000 → 1.000 €, en cualquier fecha posterior.
3. **Qué no cuenta**: dividendos, intereses, comisiones sueltas, compras, ventas, cambios de divisa (`fx_exchange`), eventos corporativos y **traspasos** (`transfer`, también el de custodia de ADR-0012), porque no son dinero que el usuario pone o saca. *Ejemplo*: un dividendo de 50 € no mueve lo aportado aunque suba el efectivo.
4. **El cubo nunca entra** (constitución III). *Ejemplo*: un ingreso de 200 € en la cuenta del cubo no mueve lo aportado a la cartera principal. **Dinero que pasa de la cartera al cubo** se registra como retirada en una y ingreso en otra: resta de lo aportado a la cartera, que es lo que pasó.
5. **Anulados y corregidos**: se usa la proyección (`state.reversed`, `state.invalid`), que ya los resuelve: un evento anulado no cuenta y su corrección sí. *Ejemplo*: un ingreso de 1.000 € anulado y corregido a 100 € cuenta 100 €.
6. **Un libro con compras y sin ingresos previos** (quien no registra su efectivo): lo aportado **no se inventa** a partir de las compras. La serie lleva `uncovered_buys: true` cuando la cartera principal tiene alguna compra antes de su primer ingreso, y la tarjeta lo dice en una línea («Lo aportado solo cuenta los ingresos registrados, y hay compras anteriores al primero»). **[decide]** si en ese caso se dibuja la espina o no; propongo dibujarla con la frase.
7. **La consulta a una fecha** (ADR-0016): el punto de fecha `d` cuenta los eventos cuya fecha de negocio (`value_date`) es `≤ d`; la serie usa las mismas fechas que `netWorthSeries`, así que cada punto es «lo aportado hasta ese día».
8. **Una cuenta que cambia de libro** (si el catálogo lo permite): cuenta el libro que tenía la cuenta **cuando se registró el movimiento**, con la regla de `accountsAt` (día de registro). *[decide]* si basta el libro actual, que es lo que hace hoy `cashFlowsOf` para el cubo.

## 6. El paquete

### 6.1 La partida, medida

`npm run build` sobre `ae66814` (el `develop` con la 015 entera), exacto con `020-measure.sh`:

| | Medido | Referencia del encargo (PR #98) | Techo en `check-bundle.mjs` | Autorización | Margen hasta la autorización |
|---|---:|---:|---:|---:|---:|
| **Arranque** | **74.125** | 74.114 | 74.134 | 76.069 | **1.944** |
| **Total** | **301.439** | ~301.370 | 301.496 | 309.500 | **8.061** |

Se apartan de la referencia en +11 y +69: la referencia es anterior a los últimos commits de E5 (`65aa0ff`, `04e84b0`, de la consola) y al ruido de *hash*. No es una parada (§5 del encargo).

### 6.2 Estimación mejora a mejora (bytes gzip; el total incluye el arranque)

Las de la propuesta, corregidas donde veo más código: la propuesta no contaba la fontanería de una puerta nueva (la 015 midió +941 en el total por la de `tools`) ni los modelos de vista nuevos.

| Entrega | Mejora | Arranque | Total | La propuesta |
|---|---|---:|---:|---|
| E1 | M6 (variables, tests) | +10 | +10 | 0 / 0 |
| E1 | M4 (paso y rejilla 8+4) | +150 | +150 | +150 / = |
| E1 | M11 | +80 | +80 | +100 / = |
| E1 | M13 (CSS + Movimientos + botón) | +60 | +110 | +50 / +50 |
| E1 | El ancla (`scroll-padding` + `shell/anchor.ts`) | +120 | +120 | — |
| | **E1** | **+420** | **+470** | |
| E2 | `hasForeignAccountsAt` e `inRentaSeason` (barril) | +130 | +130 | — |
| E2 | M2 (línea de perder datos, fila reservada, orden, fila plegada, «pendiente» en una línea) | +200 | +700 | +100 / +200 |
| E2 | M8 (por mes y valoraciones agrupadas) | +60 | +500 | +50 / +400 |
| | **E2** | **+390** | **+1.330** | |
| E3 | `NEAR_LIMIT_PCT` exportado | +15 | +15 | — |
| E3 | La puerta `@atlas/domain/charts` (fontanería) y `bucketGauges`, `thesisVsIndexPct` | 0 | +700 | — |
| E3 | M1 | +100 | +800 | +100 / +600-900 |
| E3 | M9 | +100 | +350 | +100 / +300 |
| E3 | M5 | +60 | +300 | +60 / +200 |
| E3 | M10 | +50 | +700 | +50 / +700 |
| | **E3** | **+325** | **+2.865** | |
| E4 | M3 (lo aportado en la puerta, paneles, `cursor.sync`, tabla) | +40 | +1.300 | 0 / +800-1.200 |
| E4 | «Este año» | 0 | +100 | — |
| E4 | M7 (serie en %, regla del hueco) | +20 | +550 | +50 / +400 |
| E4 | M12 (calendario, plazos, tira, lista, versión corta) | 0 | +1.200 | 0 / +800-1.000 |
| | **E4** | **+60** | **+3.150** | |

**Acumulado** (desde 74.125 / 301.439):

| Tras | Arranque | Margen hasta 76.069 | Total | Margen hasta 309.500 |
|---|---:|---:|---:|---:|
| E1 | 74.545 | 1.524 | 301.909 | 7.591 |
| E2 | 74.935 | 1.134 | 303.239 | 6.261 |
| E3 | 75.260 | 809 | 306.104 | 3.396 |
| E4 | 75.320 | 749 | **309.254** | **246** |

**Con mi estimación, el total cabe con 246 bytes de holgura, es decir, se acaba dentro de E4**, en M12 si se construye al final, y con cualquier desviación del 10 % en E3-E4 no cabe. El arranque cabe con holgura: **M14 no hace falta**.

### 6.3 El orden de recorte que propongo si el total se acaba [decide, §7.2 (h)]

La parada cae en E4 (la regla del encargo). Por este orden, cada uno medido con su prototipo antes de proponerlo:

1. **La versión corta del calendario dentro de *Declaración*** (~200): repite lo que `/fiscal` ya enseña y solo se ve en campaña.
2. **Las mancuernas de M10** (~400): la diferencia en pp por tesis ya la da M1 en texto; la mancuerna es su dibujo.
3. **La fila entera como objetivo en Movimientos de escritorio (M13)** y **la tabla equivalente de las dos tiras** (la de la cartera ya lleva todo) (~150).
4. **M9** (~350): las columnas fundidas; los porcentajes de M1 siguen delante.

Lo que **no** propongo recortar: M3, M1, M2 (las tres de más valor y la que evita perder datos), ni ninguna comprobación.

### 6.4 Disciplina

Cada mejora se mide **con un prototipo construido y deshecho** antes de su commit; **cada subida de techo, en su propio commit y delante** del que la necesita (lo medido + 20 en el arranque; + ≤ 256 en el total), con la medida trozo a trozo en el mensaje, en `questions.md` y en el comentario de `check-bundle.mjs`; si una medida baja, techo más bajo en su commit. Una tabla por mejora en `questions.md`.

## 7. La tabla de reglas

Una fila por regla visible, con el test que la ata y el mutante que la rompe (numerados como §5 del encargo; «n.» son míos). Todos se ven **en rojo antes que en verde**.

| # | Regla | Test (fichero) | Mutante |
|---|---|---|---|
| 1 | Cada `--c-*` en los tres bloques | `palette.test.ts` | 1: un color ausente en un bloque oscuro |
| 2 | Ganancia/pérdida ≥ 8 (peor CVD), dos temas | `palette.test.ts` | 2: intercambiadas; pérdida = peligro |
| 3 | Pérdida/peligro, visión normal ≥ 7 (o Q1) | `palette.test.ts` | 2 |
| 4 | La simulación es la de la fuente | `palette.test.ts` | 3: identidad; otra deficiencia |
| 5 | Contraste de ganancia, pérdida y lo aportado | `palette.test.ts` | n.1: `--c-loss` claro a `#c86a3a` (4,0:1) |
| 6 | Un cuarto bloque o un valor no `#hex` en un semántico falla | `palette.test.ts` | n.2: `--c-gain: rgb(…)`; un cuarto bloque |
| 7 | `--c-positive`/`--c-negative` en ninguna hoja; ganancia/pérdida solo en selectores de resultado; sin alias | `palette-usage.test.ts` | 4: olvidado; en un peso; por alias |
| 8 | Dentro de `tokens.css`: sin `var()` de un semántico; sin pares iguales fuera de la lista; ningún semántico en la lista | `palette.test.ts` | 7 ter |
| 9 | Menos tipográfico; cero sin signo; pp y % | `format.test.ts`, `spanish-numbers.test.tsx` | 5 |
| 10 | Techo > autorización no construye | `tests/test-outputs.test.ts` + ejecución de `check-bundle.mjs` con un techo alterado | 7 bis |
| 11 | El paso de 1.800 cambia justo ahí | `tokens-steps.test.ts` (lee el `@media`) + `medidas.json` | n.3: `min-width: 112.4375rem` |
| 12 | El ancla atada a la variable | `anchor.test.ts` (hoja) + `shell-anchor.test.tsx` (el efecto con un destino que llega tarde) + `medidas.json` | 6: un número; n.4: sin el efecto |
| 13 | *Estado* solo si alguna fila lo usa | `movements.test.tsx` | 7: siempre; nunca |
| 14 | Botón de importar en una línea a 400 | `medidas.json` (alto = 44) | — (medida) |
| 15 | `prominent` = campaña, bordes incluidos | `packages/domain/test/fiscal-attention.test.ts` | 8; 9 (sin bordes; en UTC) |
| 16 | Perder datos primero, una sola vez | `attention.test.tsx` | 10 |
| 17 | El 720 fuera de campaña en *Atención*, una vez | `summary.test.tsx` | 11 |
| 18 | Inválidos fuera de campaña: no sube, fila neutra, en *Atención* en su grupo | `summary.test.tsx` | 11 bis |
| 19 | `hasForeignAccountsAt`: `tax_residence`; sin ella `true`; sin extranjeras, sin fila | `packages/domain/test/foreign-accounts.test.ts`, `summary.test.tsx` | 11 ter |
| 20 | «Pendiente» en una línea con un precio | `missing-data.test.tsx` | 12 |
| 21 | Valoraciones agrupadas: mismo día, solo valoraciones, sin anuladas; mes en Madrid; un grupo = una fila; fecha consultada | `movements.test.tsx`, `summary.test.tsx` | 13 |
| 22 | Orden del Resumen en el móvil y en el 8+4 | `summary-order.test.ts` + foco en `medidas.json` | n.5: el orden de la maqueta |
| 23 | Nada salta en el primer pantallazo | `medidas.json` (posiciones antes y después de lo perezoso) | — (medida) |
| 24 | Ningún importe en texto ni atributos con privacidad | `privacy-attributes.test.tsx` | 14 |
| 25 | Porcentajes con `Decimal`, redondeo una vez | `view-models.test.ts` (1,005 → «1,01 %») | 15 |
| 26 | Ningún % sobre un total parcial | `view-models.test.ts`, `bucket-screen.test.tsx` | 16 |
| 27 | Columnas fundidas solo con privacidad | `portfolio.test.tsx`, `bucket-screen.test.tsx` | 17 |
| 28 | Punto de la tira por el aviso, nunca por cifras; «N activos fuera de umbral» | `portfolio.test.tsx` | 18 |
| 29 | Marca del tope = `NEAR_LIMIT_PCT`; parada y máximo de `Settings`; peso del cubo con su señal | `bucket-screen.test.tsx`, `packages/domain/test/charts-gauges.test.ts` | 19 |
| 30 | Mancuerna: diferencia en tinta con signo; punto = tesis, anillo = índice | `bucket-screen.test.tsx` | 20 |
| 31 | Lo aportado: solo core, su tipo, `Decimal`, sin huecos | `packages/domain/test/contributed-series.test.ts` | 21, 22 |
| 32 | «Este año» desde el 01/01 de la fecha consultada en Madrid | `chart.test.tsx` (`ranges`) | 23 |
| 33 | Regla del hueco `>` la mitad; sin tramo, *pendiente* | `view-models.test.ts` | 24 |
| 34 | Cubo en % sobre lo aportado; ausente con comparación parcial; = `bucketStats` al final | `packages/domain/test/bucket-index-pct.test.ts` | 25 |
| 35 | Ninguna fecha fiscal en la web; campaña de `Settings`; ventana de `washSaleWindowEnd`; sin importes en el calendario | `tests/architecture.test.ts`, `packages/domain/test/fiscal-calendar.test.ts`, `privacy-attributes.test.tsx` | 26 |
| 36 | Paneles con escalas propias y `cursor.sync` | `chart-wiring.test.tsx` | 27 |
| 37 | Nada nuevo en el barril; puertas en `LAZY_ONLY` | `tests/architecture.test.ts`, `check-bundle.mjs` | 28 |
| 38 | Renta variable y cripto nunca juntas sin etiqueta | `chart-wiring.test.tsx` | n.6: sin etiqueta directa |
| 39 | Cada SVG nuevo: `role="img"` con etiqueta sin importes, o `aria-hidden` con texto al lado | `privacy-attributes.test.tsx` | n.7: una etiqueta con un importe con la privacidad quitada |
| 40 | La salida fiscal no se mueve | predicción + ejecución | 29 |
| 41 | Ningún test de `develop` desaparece | lista de nombres, al cerrar cada entrega | 30 |

**El guardián de fechas fiscales en la web** (fila 35) reconoce **por identidad**: prohíbe en `apps/web/src` cualquier literal `MM-DD` o `M/D` de un mes y día (`/\b(0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])\b/` en cadenas), `new Date(` con tres argumentos, `Date.UTC(` y los nombres de mes en letra dentro de una cadena que no esté en `format/date.ts` (el único sitio donde se nombran los meses para pintar). Las vías de §6, familia 1, van como mutantes.

## 8. El guion de capturas

- **Chromium**: el más alto de `~/.cache/ms-playwright/chromium-*` (hoy `chromium-1243`, `Chrome/153.0.8010.12`), sin fijarlo. Guion: `020-capture.mjs` en el *scratchpad*.
- **Dos compilaciones de producción** servidas con `vite preview` (la CSP de producción va en la `<meta>` de `index.html`): **antes**, la de `develop` al empezar la entrega (para E1, el *build* de `ae66814` de este worktree, que aún no tiene cambios; en las siguientes, un worktree desacoplado); **después**, la del commit congelado.
- **Libros**: el sintético (`atlas synth --out <scratchpad>/020-synth/ledger.jsonl --seed 1`, 200 eventos) metido en IndexedDB como lo haría una importación; el libro vacío (`""`); y sin libro (primer arranque). Privacidad y tema por `localStorage` y `prefers-color-scheme`.
- **El reloj**, fuera de la aplicación: `Page.addScriptToEvaluateOnNewDocument` sustituye `Date` por una subclase desplazada al **20/01/2029 10:00** o al **15/05/2029 10:00** (Europe/Madrid), antes de cualquier guion de la página; además `Emulation.setTimezoneOverride("Europe/Madrid")` y `setLocaleOverride("es-ES")` (así las fechas de los campos salen como en el teléfono). La aplicación no sabe nada.
- **Matriz**: 400×890 DPR 3 y 2045×1141; claro y oscuro; privacidad puesta y quitada; libro sintético (el 20/01 todas las pantallas; el 15/05 el Resumen y `/fiscal`), libro vacío y primer arranque.
- **Por *viewport***: desde arriba, una pantalla (85 %) más abajo cada vez hasta el final, con las barras fijas encima.
- **Medido** (`medidas.json`): desplazamiento lateral a 360, 400, 1.440 y 2045 con la privacidad **quitada** (cifras anchas); texto por debajo de 13 px (fuera de la máscara); objetivos por debajo de 44 px; el ancla al cargar y tras el fragmento; el cuerpo a 1.799 y 1.800; el borde de la evolución a 2045×1141; y, desde E2, las posiciones de cada tarjeta del primer pantallazo antes y después de lo perezoso, y el orden del foco en el 8+4.
- **Dónde**: `~/personal/atlas/privado/capturas/<AAAA-MM-DD>-020-E<n>/antes/` y `…/despues/`, nombres `<pantalla>-<ancho>-<tema>-<privacidad>-<libro>-<fecha>-<n>.png`, con `LEEME.md` que empareja cada antes con su después y dice qué mejora enseña.
- **Las maquetas**, abiertas con el mismo Chromium a 400 y a 2045 en claro y en oscuro, en `…/maquetas/`.

## 9. Otras propuestas del alto (§7.2 del encargo)

- **(e) Puertas**: `@atlas/domain/charts` para las series y los indicadores; el calendario en `@atlas/domain/fiscal`. **No** mudar `netWorthSeries` y `bucketIndexSeries`: el arranque sobra y el total falta (§6).
- **(f) Alturas de los paneles de M3**: tokens nuevos `--panel-h` y `--strip-h`: en el móvil 8,25rem (132) y 2,75rem (44); de 1.024 a 1.799, 15rem (240) y 3,5rem (56); desde 1.800, `var(--chart-h)` (`clamp(15rem, 28vh, 22rem)`, unos 320 a 1.141 de alto) y 4rem (64).
- **(c)**, **(d)**, **(b)**, **(a)**, **(g)**, **(h)**: §3.7, §3.8, §4.6, §5, §4.4 y §6.3.

## 10. Mutación, gemelos, salida fiscal, memoria

- **Mutación** con la disciplina de §2 ter: el guion (`020-mut/`) aplica cada sustitución el número de veces que dice, restaura y compara el fichero **byte a byte**, y **se niega a correr si hay un gemelo `.js`** junto a una fuente. Un mutante = un paso pesado, detrás de la puerta de memoria. Recuento en `questions.md`.
- **Gemelos**: `find apps packages tests -name '*.js' -not -path '*/dist*' -not -path '*/node_modules/*'` cruzado con sus `.ts`/`.tsx`, antes de cada lote y de cada PR, con la orden y su salida en `questions.md`.
- **Salida fiscal** (E2 y E4): predicción escrita antes; `tax --lots`, `--boxes`, `--json`, `gains`, `income`, `m720`, `m721` y `filed` sobre `synthetic-v1`, comparados byte a byte con la salida de `develop`.
- **Memoria**: `free -m` antes de cada suite, *build*, lote o pasada de capturas; nada si `available` < 1.500 MB; nunca dos pasos pesados a la vez ni Chromium abierto durante una suite.
- **Relojes**: las suites de la web y del dominio con `TZ=Pacific/Kiritimati` y `TZ=Pacific/Pago_Pago`, y con el reloj falseado al 31/12 23:30 y al 01/01 00:30 (`faketime` no está instalado y no se instala: se falsea con `vi.setSystemTime` global en un `setup` de una pasada aparte, sin tocar los tests).

## 11. Orden de trabajo tras el visto bueno

**E1**: (1) guardianes del color sin los colores nuevos y el de `check-bundle.mjs` (7 bis); (2) con Q1 respondida, los colores en los tres bloques y el cambio de `.positive`/`.negative`; (3) M4; (4) M11; (5) M13; (6) el ancla; cada mejora con su prototipo medido y su techo delante si hace falta. Capturas antes/después, autocomprobación de §6, congelado, revisión, PR.
**E2**: predicción fiscal; dominio (`prominent`, `hasForeignAccountsAt`) en commits propios; modelo de vista del Resumen; M8; capturas y medidas del primer pantallazo.
**E3**: el guardián de privacidad por atributos primero; `NEAR_LIMIT_PCT`; la puerta `charts` con `bucketGauges` y `thesisVsIndexPct` (si se aprueban); M1, M9, M5, M10.
**E4**: la definición de lo aportado ya escrita por la dirección; predicción fiscal; dominio (lo aportado, el cubo en %, calendario y plazos); «Este año»; M3; M7; M12. Si el total no cabe, parada con §6.3.

Push cada dos o tres commits, con `typecheck` delante; `npm run lint` antes de cada commit.
