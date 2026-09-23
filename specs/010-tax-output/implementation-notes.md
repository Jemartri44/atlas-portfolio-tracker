# Notas de implementación — feature `010-tax-output`

Documento **vivo**, escrito mientras se implementa. Recoge lo que se desvía del plan y por qué, lo que se preguntó y se respondió, y lo que queda. Se cierra con la feature.

**Estado al 2026-09-23**: **los seis bloques completos** (0 y 1 del primer implementador; 2, 3, 4 y 5 del segundo), más los dos lotes de corrección de criterios y **la revisión adversarial de cierre** (apartado 7). Pipeline verde: **1.736 tests** en 185 ficheros, `packages/domain` al **100 %** de líneas, ramas y funciones, Biome limpio, `tsc -b` limpio, arranque **72,9 KB** de 73,5 y total **234,9** de 236,0.

---

## 1. Lo hecho, por bloques

### Bloque 0

- **P5**: la cadena de ejercicios empieza en el primero de tres —el año pedido, el primero con cifras y **la primera Renta presentada**— y nunca antes de 2018. `AnchorDifference` gana `before_ledger`, y la salida dice «traídas de lo declarado» en vez de «difieren de lo calculado». Comprobado que el test mata el mutante: revertido el arreglo, fallan tres de sus cuatro casos.
- **Configuración nueva**: los ocho parámetros (`model_72{0,1}_{threshold,increase,alert_threshold}_eur` y `renta_season_{start,end}`), opcionales, resueltos en el punto de uso y materializados (ADR-0022), con `alert_above_threshold` e `invalid_renta_season`, traducidos en las dos interfaces, *flags* en `atlas settings set` y campos en Configuración.
- **ETC y ETP a rendimiento del capital mobiliario** por defecto, con predicción previa y comparación clave por clave.

### Bloque 1

El evento `tax_return_filed` (tipo 25, `schema_version` sigue en 1), su proyección con la cadena de complementarias, la huella del libro con verificación y resellado en `compact`, la cadena compartida que construye el ancla **desde el libro** (`TaxOptions.filed` desaparece), el aviso de ejercicio cerrado partido en **hecho** y **cifra**, y la comparación de lo declarado con sus cuatro causas.

**La complementaria calculada a mano (§6.3) cuadró al céntimo y a la primera**, los ocho pasos: las cuatro causas (0,00/+10,00 al presentar, 0,00/0,00 de motor, +2,00/−2,00 de configuración, +16,00/+4,00 de eventos posteriores) suman exactamente la diferencia total, y el ancla respeta el tiempo (600,00 con la complementaria en vigor, 510,00 el 01/08/2028 cuando lo estaba la original, 612,00 sin ancla).

### Los dos lotes de criterios (encargo de la dirección, 2026-09-22)

Etiquetas y prosa de #17 a #24, y el cambio de comportamiento de la ventana de los fondos y los monetarios a dos meses. Cada uno con su predicción escrita y comiteada antes, y su comparación después: `criteria-labels-expectation.md` y `fund-window-expectation.md`.

### Bloque 2 — la Renta por casillas

Los **conceptos** (identificadores estables que no dependen de ningún impreso), las **casillas de 2025 como datos**, con su número, su rótulo **literal** y la orden del BOE en que se comprobó cada uno, y la atribución de las pérdidas de ejercicios anteriores a su pérdida de origen (ficha F5). Las 44 casillas se comprobaron **contra las imágenes del anexo I de la Orden HAC/277/2026**, una a una: cero discrepancias con lo que había investigado el implementador anterior, y se subió `checked_at` a 2026-09-23 con la URL de la imagen.

Un ejercicio **sin correspondencia comprobada** sale por conceptos y **sin ningún número**, con su nota. Nunca la casilla de otro año.

### Bloque 3 — Modelos 720 y 721

Fuera de `tax/`, en `informative/`, que es lo que permite seguir demostrando que la Renta no lee precios. Los dos cálculos a mano (§6.1 y §6.2) cuadraron; el veredicto **falla seguro** (nunca «no obligado» con datos incompletos) y dice qué falta como acción.

### Bloque 4 — la pantalla fiscal

`/fiscal` con selector de ejercicio en la URL, la base del ahorro como cifra protagonista rotulada «cartera y cubo juntos», cada total abierto en sus operaciones nombradas por activo y fecha, los dos apartados de criterios con la dirección en palabras, las pérdidas pendientes y lo que caduca, las casillas, el estado del 720 y del 721 y la comparación con lo presentado. `/fiscal/presentar/<modelo>/<año>` registra lo presentado desde la web. La tarjeta del Resumen sube arriba en campaña o cuando hay algo del 720 que hacer, y el aviso de ejercicio ya declarado está en las cuatro escrituras.

### Bloque 5 — la CLI

`atlas tax <año> --boxes`, `atlas m720`, `atlas m721` y `atlas filed <modelo> <año>`, más el aviso de ejercicio cerrado en `add`, `ca`, `edit`, `delete` y `settings set`.

---

## 2. Desviaciones del plan, con su motivo

1. **§0.2 decía «cinco importes» y «siete parámetros»**; su propia tabla lista seis y ocho. Implementados los ocho. La dirección lo confirmó como error del prompt.
2. **§1.3 daba a `integrity` el hallazgo `filing_fingerprint_mismatch`.** `integrity(state)` no tiene las líneas crudas, y dárselas obligaría a **rehacer el digest del libro entero en cada pantalla**. Partido en dos: `integrity` comprueba el **recuento** contra la posición (`filing_fingerprint_lines`, barato, siempre) y `deepCheck` comprueba el **digest** (`filing_fingerprint_mismatch`, a petición). Los dos códigos traducidos en las dos interfaces.
3. **Los lectores de los importes de los modelos** se llaman `modelThresholdOf(settings, model)` y no `model720ThresholdOf`: una función por concepto, con el modelo como parámetro, ya que el 720 y el 721 comparten maquinaria (decisión (j)).
4. **§1.6 hacía que los casos de uso devolvieran el aviso entero.** Cablearlo así metió **el motor fiscal en el trozo de arranque de la web** (+4,9 KB) y lo paró la comprobación automática. Partido en **hecho** (`filings/touched.ts`, solo proyecciones, +0,4 KB, lo devuelven `recordEvent`, `correctEvent` y `reverseEvent`, así que **ninguna interfaz puede olvidarse de avisar**) y **cifra** (`closedYearImpact`, que lee la cadena y la pone quien ya tiene el motor cargado). Medido, no razonado.
5. ~~**El diferido por ejercicio** no se anota dentro de `walkWashSales`, como sugería §1.5.~~ **Revocada el 2026-09-23** por la revisión adversarial: sin él, `chainFigures(chain, year)` devolvía el diferido del ejercicio para el que se construyó la cadena y no el pedido, y `movedTaxYears` no podía comparar la tercera cifra. `walkWashSales` recibe ahora el año de cada evento y toma una instantánea de lo diferido al cierre de **cada ejercicio que cruza**, en la misma pasada (`pendingByYear`). El plan §1.5 pedía justo eso.

## 3. Hallazgos durante la implementación

- **El aviso de ejercicio cerrado mentía con un libro inválido**: comparaba una lectura que no se puede calcular contra otra que sí, y decía «la base pasa de 200,00 a 0,00». Ahora, si cualquiera de las dos falla, **no compara nada**, y tiene test.
- **El coste de proyección de una escritura** subía de una a tres al cablear el aviso. `closedYearImpact` y `unfiledPastYears` aceptan la proyección ya hecha; el test que fija «una proyección por escritura» sigue en 1.
- **`movedTaxYears` solo miraba la base.** Un ejercicio puede conservar su base y dejar **otro saldo pendiente**, y eso mueve los siguientes. Ahora compara las dos cosas y `MovedTaxYear` lleva los dos totales de pendiente, porque si no la fila dice «0,00 → 0,00» sin explicar por qué está ahí.
- **Cambiar el valor por defecto de la ventana habría etiquetado cada venta de fondo como `2:other`**, «una lectura que ninguna lectura del documento sostiene» — lo contrario de lo que la dirección acababa de fundamentar. Se paró antes de ejecutarlo y se resolvió con dos identificadores explícitos.
- **Los libros calculados a mano heredaban valores por defecto** en vez de fijarlos. Un cálculo a mano cuyos literales dependen de lo que el código crea hoy es un espejo, no un cálculo. Se arregló **en dos pasadas, y la primera se dio por completa cuando no lo estaba**:
  - *Primera pasada (bloque 1)*: en `test/tax/exercise-ledger.ts` se fijaron `income_category`, `wash_sale_window` y `fiscal_date_rule`. Se anotó «ya no hereda ninguno», y **era falso**: `income_category` se construía extendiendo `DEFAULT_INCOME_CATEGORY`, así que **cinco de los siete tipos seguían viniendo del código**, y el libro de §6.3 (`test/tax/supplementary.test.ts`) se montaba sobre `taxBuilder()`, que escribe `DEFAULT_SETTINGS` tal cual —tres familias y **ninguno** de los cuatro escalares—.
  - *Segunda pasada (revisión adversarial, 2026-09-22)*: `HAND_SETTINGS` en `test/tax/helpers.ts` fija **las tres familias tipo a tipo y los cuatro escalares**, con el modelo de `tests/fixtures/ledger/tax-hand-v1.jsonl`, y los dos libros a mano lo usan. **Medido en las dos direcciones**: con los valores por defecto, cambiar la categoría de renta de los fondos tumbaba 11 casos y bajar el límite del 25 % al 30 tumbaba 6; con la configuración fijada, las dos mutaciones no mueven un solo literal.
- **`npm run lint | tail` esconde el código de salida** (el de la tubería es el de `tail`), y dos commits entraron con lint en rojo. Se reconstruyeron con `git reset --soft`. Ejecutar `npm run lint` a pelo.

### Hallazgos de los bloques 2 a 5 (segundo implementador)

- **Una aserción de tipo fabricó un objeto al que le faltaban tres campos.** La deducción por doble imposición construía su fila así: `const row = { event_id: line.event_id } as BoxRow`. El `as` silenció al compilador, los otros tres campos eran `undefined` en ejecución y **las dos interfaces imprimieron «undefined undefined»** al lado de cada deducción durante dos bloques enteros, sin que ningún test lo viera. Lo destapó la pantalla del bloque 4 al primer render. Arreglado leyendo la operación de la línea de renta de la que sale la deducción; con **un invariante sobre todas las filas** (si una fila existe, lleva sus cuatro campos) y **un test de arquitectura sobre el patrón**, que enumera los ficheros que hoy afirman un literal como un tipo y rompe cuando aparece uno nuevo. Comprobado que no es vacío: reintroducida la línea original, el test falla nombrando `draft.ts`.
  - **Por qué no una regla del analizador**: Biome 2.5.9 trae `nursery/noUnsafeTypeAssertion`, que prohíbe **toda** aserción salvo `as const`. Medida sobre `packages/domain/src`: **20 avisos**, y casi todos son `state.gains[index] as RealizedGain`, es decir, estrechar una lectura indexada bajo `noUncheckedIndexedAccess`, que no fabrica nada. Sustituirlos por una comprobación en ejecución añadiría una rama inalcanzable, y el dominio está al 100 % de ramas: la regla compraría una barrera real al precio de código muerto. La barrera está donde el fallo ocurre, no donde el analizador puede mirar.
- **El barril del dominio metió el motor fiscal en el arranque de la web.** En cuanto la pantalla importó `taxYear` de `@atlas/domain`, el arranque pasó de 72,5 a **93,3 KB** contra un techo de 74: el barril es un módulo, es lo que importa la primera pantalla, y lo que exporta y alguien usa viaja en su trozo. La solución es **una puerta propia**, `@atlas/domain/fiscal` (`src/fiscal.ts`), y el barril ya no nombra `tax/`, `informative/` ni los tres módulos de `filings/` que alcanzan la cadena fiscal; hay un test de arquitectura que falla si vuelve a hacerlo. La comprobación del paquete ya lo veía, pero un paso más tarde y en un sitio menos legible.
- **El dominio partido en dos trozos costó 1,3 KB de arranque sin una sola importación nueva.** Al hacerse alcanzable el motor desde un rincón perezoso del Resumen, el agrupador partió el dominio en dos trozos de arranque para que el trozo fiscal importara solo su mitad; la compresión no cruza la frontera de un trozo y cada mitad paga sus importaciones. Fijado a **un solo trozo** en `vite.config.ts`, con el motivo escrito. Medido en las tres variantes: 73,0 sin la tarjeta, 74,3 con ella, **72,7** con el grupo.
- **Un mutante que sobrevive puede ser un mutante que nunca se aplicó.** Tres veces se dio por muerto un mutante que el script de sustitución no había llegado a escribir, porque el formateador había reordenado el texto que buscaba. **Cualquier script de mutación tiene que afirmar que la sustitución ocurre** (`assert s.count(old) == 1`) y comprobar el fichero después; sin eso, «sobrevive» y «no se aplicó» son indistinguibles. La misma trampa mordió tres veces más editando código con el mismo tipo de script: un `assert` que salta **a mitad de un lote deja los ficheros anteriores escritos y los siguientes no**, así que un lote que falla se vuelve a ejecutar entero, no se continúa.

### El constructor de libros de test, valor por defecto a valor por defecto

Encargo de la dirección tras el tercer tropiezo con él (la comisión de 2 USD de `fx()`, que rompió §6.1 por 1,82 €). **`LedgerBuilder` rellena todos los campos que un test no escribe**, y cualquiera de ellos entra en una cifra fiscal. Esto es lo que trae, para que el siguiente lo lea antes de calcular a mano y no después:

| Dónde | Valores por defecto que pueden contaminar |
|---|---|
| `buy` | 10 participaciones a 100,00, **comisión 0**, EUR, tipo 1, fecha 2027-01-11 |
| `sell` | 1 a 100,00, **comisión 0**, EUR, tipo 1, fecha 2027-06-10 |
| `swap` | 1 por 1, valores 100,00, **comisión 0**, fecha 2027-06-10 |
| `fx` | **comisión 2 USD**, 1.085,00 EUR por 1.170,00 USD, **tipo comprado 1,0783**, fecha 2027-05-04 |
| `deposit` / `withdrawal` | **5.000,00** / **100,00**, EUR, fechas 2026-08-31 / 2027-06-01 |
| `fee` | **3,00** con descripción «custody» — y un gasto de administración resta de los rendimientos (#23) |
| `dividend` | bruto 10,00, **retención en origen 0** y en España 0, fecha 2027-04-01 |
| `interest` | bruto 5,00, retención 0, fecha 2027-04-30 |
| `valuation` | **5 unidades a 210,00**, fecha **2026-12-31** — contamina cualquier 720 |
| `orderPlaced` / `thesisOpened` | 500,00 de importe / de tamaño previsto |
| `account` | país **ES**, libro `core`, divisa EUR |
| `asset` | tipo **fund**, clase `equity`, divisa EUR, **traspasable** |
| `corporateAction` | fecha efectiva 2027-03-01 |
| `filed` | `filed_at` = año + 1 el 18/06; **`computed.settings` = `DEFAULT_SETTINGS`** y `settings_origin: "default"`; **`computed` copia lo declarado** si no se da, lo que anula la causa «lo que corregiste al presentar»; la huella lleva `sha256` falso y `lines` = los eventos escritos hasta ese momento |
| Sobre `fx_rate_date` | en `buy`, `sell`, `swap`, `deposit`, `withdrawal`, `fee` y `valuation` es `lastWorkingDay(fecha)`; en `dividend`, `interest` y `fx` es un **literal fijo** que no sigue a la fecha si el test la cambia |
| Sobre la configuración | `taxBuilder()` escribe `DEFAULT_SETTINGS` salvo que se le pase otra cosa: un cálculo a mano usa `HAND_SETTINGS`, que fija las tres familias tipo a tipo y los cuatro escalares |

La regla que se saca de aquí: **un cálculo a mano escribe todos los campos que nombra**, y si un total no cuadra por una cantidad pequeña y redonda, el primer sitio donde mirar es esta tabla.

## 4. Presupuesto del paquete web

| Punto | Arranque | Total |
|---|---|---|
| Base de la rama | 69,4 | 190,4 |
| Configuración nueva | 69,9 | 191,5 |
| Evento `tax_return_filed` | 71,1 | 193,2 |
| Huella y proyección | 71,9 | 194,2 |
| El hecho del ejercicio cerrado | 72,3 | 194,6 |
| La CLI del bloque 5 | 72,2 | 195,4 |
| La pantalla fiscal (bloque 4) | 72,8 | 226,5 |
| El formulario, la tarjeta y los avisos | **72,8** | **233,0** |
| La segunda revisión adversarial | **72,9** | **234,9** |
| Techo | **73,5** | **236,0** |

**Desglose del total, medido sobre el `dist` (gzip)**, porque autorizar una subida no es entenderla:

| Trozo | gzip | Qué lleva |
|---|---|---|
| `domain-*.js` | 37,6 | el dominio entero **menos** lo fiscal: proyecciones, esquema, dinero, casos de uso. Arranque |
| `index-*.js` | 25,2 | Solid, el enrutador, el armazón y la primera pantalla. Arranque |
| `chart-*.js` | 24,6 | uPlot vendorizado, perezoso: solo Cartera y Cubo |
| `fiscal-*.js` (motor) | **22,3** | `tax/year.ts` (39,6 KB de fuente), `wash-sale.ts` (30,2), `boxes/draft.ts` (18,9), `lines.ts` (18,3), **`boxes/years/2025.ts` (17,6: la tabla de casillas con sus rótulos literales)**, `informative/m720.ts` (15,8), `chain.ts` (12,8), `filings/proposal.ts` (10,2) |
| `index-*.css` | 9,9 | la hoja entera, incluida `fiscal.css` |
| `fiscal-*.js` (pantallas) | **7,1** | las siete piezas de `routes/fiscal/` y los nombres de los criterios |
| `fiscal-*.js` (modelos de vista) | **3,0** | `view-models/fiscal/` |
| `fiscal-status-*.js` | **0,4** | lo que la tarjeta del Resumen carga tras pintar |
| resto | ~96 | las otras once pantallas, los mensajes, los formularios y el *service worker* (6,8 entre `sw.js` y Workbox) |

**Duplicación entre trozos: ninguna.** Comprobado leyendo los *source maps* de los 58 trozos y cruzando qué módulo aparece en cuáles: **cero módulos en más de un trozo**. Los 37,5 KB que sube el total son pantallas y motor, no repetición.

El techo del **arranque** lo subió la dirección dos veces (71,5 y luego 74,0) con su motivo escrito en `check-bundle.mjs`; el del **total** sube paso a paso y siempre a lo medido. **Al cerrar la feature se han apretado los dos** a lo medido más un margen pequeño —arranque **73,5** sobre 72,8 y total **234,0** sobre 233,0—, con el desglose de arriba escrito en `check-bundle.mjs`.

**Comprobación nueva y automática**: la construcción **falla** si un trozo de arranque trae cualquier módulo de `domain/src/tax/` o `domain/src/informative/`, leído de los *source maps*. Probado que no es vacía: con una importación de `tax/criteria.ts` en el camino de escritura, falla con 71,2 KB, muy por debajo del techo. Lo que se vigila es **la forma**, no el tamaño.

## 5. Preguntas abiertas

1. ~~**Una cifra grande deja de verse porque hemos dejado de dudar de ella.**~~ **Resuelta por la dirección el 2026-09-23**: el informe lleva **dos** listas, `doubtful` y `settled`, con la misma forma, y la segunda enseña los criterios de certeza alta que **leídos al revés** moverían algo. Se parte, no se filtra: una entrada cuya lectura contraria no mueve nada **aparece igual, con sus ceros**, porque «comprobado y sin efecto» es información. Está en las dos interfaces y en el README.
2. **Congelado por la dirección, para el bloque del motor** (avisar al llegar): el defecto de `windowCriterion` con un ETC declarado capital mobiliario —recibe `2:listed` y una alternativa de un año que el art. 25.2 no contempla— y el **test de definitividad** (una transmisión solo libera el diferimiento si ella misma es definitiva; DGT V3282-18 y Manual práctico de Renta 2025, capítulo 11, **texto nuevo de marzo de 2026**), con la ventana del propio activo.
3. **Congelado también**: el criterio #21, la cita del art. 35 en líneas de capital mobiliario y la atadura de las comisiones a valores negociables.
4. **La web no alcanza `wash_sale_transfer_counts`**: Configuración no tiene control booleano. Es el **único** parámetro booleano de los 31 de `Settings`, así que es un control, no una familia. La CLI ya lo cubre. Trabajo posterior a la 010.
5. **Homogeneidad tras un `convert`**: una compra nueva en el activo de destino nunca se empareja con una pérdida anterior en el de origen. Con la V0796-26 parece correcto, pero **nadie lo ha comprobado para el traspaso entre fondos**, donde se cruza con el #2b. Anotado en `docs/fiscal-questions.md`, sin resolver.

## 6. Lo que queda

Nada de los seis bloques y nada de la entrega: los dos techos del paquete están apretados a lo medido más un margen pequeño, y la PR está abierta contra `develop`.

Trabajo posterior a la feature, anotado para quien siga:

1. **`priorYear` / `isPriorYear` en el dominio** sigue vivo porque la web lo usa en el flujo de rectificación. El aviso de ejercicio **declarado** lo sustituye conceptualmente; retirarlo es una limpieza de una feature posterior, no de esta.
2. **`today()` de la web no lee el reloj de los casos de uso**: su comentario dice que sí, pero usa `new Date()`. En producción los dos son el reloj del sistema, así que no cambia nada; en un test con reloj fijado, la pantalla y el dominio pueden mirar días distintos. Anotado al tropezar con ello escribiendo los tests del formulario.
3. **La tarjeta del Resumen y `/fiscal` proyectan el libro por su cuenta.** Con 5.000 eventos el coste es asumible (la tarjeta carga tras pintar y la pantalla es perezosa), pero nadie lo ha medido con la CPU frenada ×4 como pedía el prompt.
4. **Las dos interfaces tienen su propia lista de nombres de criterios** (`CRITERION_LABELS` en la CLI, `CRITERION_NAMES` en la web). El tipo `Record<CriterionId, string>` garantiza que ninguna se deje uno; nada garantiza que digan lo mismo.

---

## 7. La revisión adversarial de cierre (2026-09-23)

Encargo de la dirección antes de fusionar. Nueve hallazgos, todos aplicados; el detalle de cada uno está en el commit que lo arregla y en `questions.md`. Lo que conviene que sepa quien siga:

1. **La causa «configuración» de la comparación mentía.** R0 y R1 diferían en **dos** cosas, la configuración y la fecha de consulta, y la resta se rotulaba solo con una. Medido: una Renta de 2026 presentada dentro del prefijo de la de 2027, cuyas cifras se calcularon antes, imputaba **−500,00 € a «configuración»** sin haber tocado un solo ajuste. R1 lee ahora con el mismo `computed.as_of` que R0, y el desplazamiento por fecha lo absorbe la causa de los eventos posteriores, que es donde pertenece. **El test viejo no probaba nada**: «las cuatro causas suman la diferencia» es una identidad algebraica que cumple cualquier reparto. El nuevo ancla el reparto en el caso donde la fecha importa.
2. **`chainFigures` ignoraba el año para la cifra `deferred`** (arriba, desviación 5). Con ello, `movedTaxYears` compara ya **las tres** cifras que declara una Renta, y hay un test de un ejercicio en el que **solo** se mueve el diferido: antes ese cambio de configuración no pedía confirmación.
3. **Los cálculos a mano eran un espejo del código.** `HAND_SETTINGS` fija las tres familias tipo a tipo y los cuatro escalares. Medido antes y después: con los valores por defecto, mover la categoría de renta de los fondos tumbaba 11 casos y bajar el límite al 30 % tumbaba 6; ahora, ninguno.
4. **Seis mutantes sobrevivían a la suite entera** en la validación de forma de `tax_return_filed` y en la receta de la huella. Ahora mueren los seis, comprobado mutando uno a uno. El más importante: **la receta del digest está fijada a un literal** de una entrada conocida, porque la huella es dato persistido en el libro y cualquier retoque de la receta invalidaría en silencio todas las ya escritas. *Causa común de los cinco de validación*: `LedgerBuilder` **no valida nada** —no solo las presentaciones: ningún tipo de evento pasa por `validateShape`—, así que la cobertura de la validación tiene que venir de tests que la llamen directamente, y ahí es donde están.
5. **La cita del art. 4.9 del RD 1082/2012 estaba truncada donde más duele**, en cuatro sitios. El texto del BOE continúa «a los efectos de aquellas disposiciones que regulen regímenes específicos de inversión», y el art. 33.5 f) LIRPF no es obviamente una de ellas. **La decisión no cambia** —la sostienen la DGT V2067-06 y el manual del Modelo 100—, pero la cita ahora va entera y dice dónde se acaba su apoyo.
6. **El criterio #23 cruzaba otra vez las dos columnas** (la tercera vez, en la ronda cuyo objeto era dejar de cruzarlas): su dirección es **agresiva**, porque si el criterio está mal se deduce de más.
7. **El #18 sube a certeza alta**, con la fuente verificada en esta pasada: el Manual práctico de Renta 2025 de la AEAT, capítulo 11, actualizado el 17/03/2026, dice literalmente que la recompra existe cuando los valores homogéneos «continúan en el patrimonio del contribuyente tras la transmisión». Predicción escrita y comiteada antes; el `diff` del dorado fue **exactamente** la entrada prevista y nada más.
8. **La vista previa avisa ya donde avisa la escritura**: `previewEvent` y `previewCorrection` devuelven `closed` y `unfiledPastYears`, que el plan §1.6 enumeraba y no estaban. No cuesta una proyección más ni un byte de arranque en la web (medido: 72,3 KB).
9. **El test antideriva de criterios prometía más de lo que garantiza.** Se ha corregido la descripción, no el test: atarlo variante a variante exigiría analizar prosa española. Lo que garantiza y lo que no está escrito en su cabecera y en el traspaso (pendiente 12).

**Lo que la revisión dejó anotado sin hacer** está en `questions.md`, apartado «5 bis»: doce cosas, ninguna bloqueante, con el bloque al que afecta cada una.
---

## 8. Verificación en navegador (2026-09-23)

Hecha con Chromium sin interfaz, sobre el `dist` de producción servido por `npm run preview`, con el libro sintético sembrado en IndexedDB antes de arrancar la aplicación. **24 capturas medidas**, fuera del repositorio, en `~/atlas-private/capturas/2026-09-23-fiscal/`.

Qué se miró, y qué cambió por haberlo mirado:

- **400×890 con densidad 3** (el teléfono del usuario), **2045×1141** (su monitor) y **360** de ancho: `scrollWidth === clientWidth` en las tres, sin desplazamiento lateral, y ningún elemento sobresale del ancho del documento —comprobado en el navegador, no a ojo—.
- **Con datos y con el libro vacío**; **con la privacidad puesta y quitada**; claro y oscuro.
- **La pantalla fiscal medía cuatro pantallas de móvil** solo de criterios dudosos: diez entradas seguidas. Ahora enseña tres y pliega el resto, como los avisos del Resumen.
- **El mismo criterio aparecía dos veces con líneas idénticas.** El motor emite una entrada por motivo —una exposición normal y otra con `regime_not_recorded`—, y la pantalla no enseñaba el motivo. Ahora lo enseña siempre.
- **El libro vacío** enseñaba seis tarjetas de ceros; ahora enseña **una** con el siguiente paso.
- **El selector de ejercicio** era una caja vacía de 200 px; ahora es el mismo control compacto que la fecha de consulta, con su icono y su rótulo.
- **Se registró una presentación desde la propia web**, con el antes y el después: el ejercicio pasa a «2027 · declarado», la tarjeta «Lo presentado» aparece con lo declarado frente a lo calculado y la diferencia plegada, y el pie ofrece la complementaria.
- **Los dos rechazos del dominio se ven en la pantalla** y dicen qué hacer: una fecha de presentación posterior a hoy («no se registra lo que todavía no se ha presentado») y un importe mal escrito («tiene más de una coma»), este último **en el campo**, sin perder lo tecleado.

---

## 9. La segunda revisión adversarial (2026-09-23)

Encargo de la dirección con la PR ya abierta. Lo aplicado, por daño.

### 9.1 Los dos bloqueantes

1. **La casilla «Denominación de los valores transmitidos» llevaba el identificador interno.**
   `draft.ts` construía el campo con `{ text: line.asset_id }` y las dos interfaces pintaban
   `ast_epsilon` donde va la entidad emisora. Es el **único** campo de la salida que el usuario
   copia literalmente en Renta WEB, así que no era feo, era falso. Resuelto **en el dominio**
   (`nameOf(state, asset_id)`, con el identificador como último recurso si el catálogo no le da
   nombre) y cubierto con tres casos. *Por qué no lo vio nadie*: `LedgerBuilder` da a cada activo
   `name: asset_id`, así que en los tests el nombre y el identificador son la misma cadena; los
   casos nuevos **nombran el activo de otra manera**.
2. **La tarjeta de casillas no decía qué era cada importe.** El modelo de vista tiraba
   `entry.concept` y la pantalla caía al literal «Sin correspondencia comprobada» en **todas** las
   filas: es el caso normal, no un borde, porque 2025 es el único ejercicio con tabla comprobada y
   el primero real del usuario es 2026. Ahora el rótulo humano de cada concepto vive en el dominio
   (`CONCEPT_NAMES` + `ROW_FIELD_NAMES`, totales por construcción: quitar una entrada no compila,
   comprobado), las dos interfaces lo leen, y el aviso de «sin casilla comprobada» se dice **una
   vez por bloque**. La consola además deja de imprimir el `ConceptId` desnudo.

### 9.2 Lo demás, con su test

- **La privacidad de la pantalla fiscal**: mueren los dos mutantes que sobrevivían (quitar la
  guarda del «% del umbral» y sustituir los dos `Amount` del aviso de ejercicio declarado por
  cadenas crudas), comprobados uno a uno.
- **`atlas edit` avisa y ahora se comprueba**: test de conducta con la cifra que mueve, y el test
  de arquitectura pasa a ser **por comando** y no por fichero (borrar el bucle de `edit` deja de
  colar porque `delete`, dos funciones más abajo, nombre el aviso).
- **Los dos tests-barrera**: cerrados los tres agujeros medidos —`[{…}] as T[]`, el literal guardado
  en una variable y afirmado después, y `import * as domain` + `domain.recordEvent(…)`—, cada uno
  comprobado con su mutante. El agujero del `//` dentro de una cadena queda **escrito como límite
  conocido** en la cabecera del test.
- **Mutantes que ahora mueren**: `missing` siempre falso, etiquetar los criterios firmes en vez de
  los no firmes, el plegado de la lista a tres y los bloques de casillas vacíos.
- **La fuente y la certeza por casilla se enseñan**: cada fila dice dónde se comprobó y cuándo (y
  «sin confirmar» si la lectura no es firme), y cada bloque cita la imagen del anexo del BOE **como
  texto, nunca como enlace**. Con eso la justificación de `check-bundle.mjs` para dejar pasar el
  dominio del BOE —«es una cita que la pantalla enseña»— pasa a ser verdad, y lo dice nombrando el
  test que lo sostiene.
- **Una sola redacción del dinero**: `Money.centsText()` sustituye a las **seis** copias de `cents`
  (cuatro en la consola, una en la propuesta y una en la web) y `eur()` de la consola pasa por ella,
  así que las pantallas que el usuario abre seguidas dejan de escribir la misma cifra de dos formas.
- **Los dos mapas abiertos** (`PARTIAL_MESSAGES` del dominio y `PARTIAL_TEXTS` de la web) se cierran
  contra `PartialReason`; de propina, `MODEL_NAMES` del aviso contra `FilingModel`.
- **`atlas tax --boxes`** dice que una casilla es parcial también cuando trae importe.
- **El aviso del diálogo de anular se espera**: el diálogo no se abre hasta que se sabe, y un
  rechazo que no sea del dominio se enseña dentro del propio diálogo en vez de acabar en una
  promesa rota. El test lo sujeta comprobando que **no** hay diálogo antes de esperar.
- **`presentar.tsx`**: fuera el `as never` —la aserción vive ahora en `values.ts`, que es el sitio
  que ya tenía esa responsabilidad y está en la lista del test-barrera— y el error de un importe mal
  escrito va **en su campo**, sin perder lo tecleado y marcando todos los que estén mal a la vez.
- **Criterios repetidos**: una entrada sin motivo se distingue por las operaciones de las que sale
  («Por World Index Fund · 06/01/2027, …»), que es lo que el motor no daba.
- **La consola**: seis detalles —dinero por el formateador, el volcado de ~1.900 caracteres de
  configuración resumido antes de la pregunta, el justificante validado pronto y en español, el
  aviso de que un 720 sin nada registrado se guardaría vacío, los criterios con su rótulo y los días
  del saldo **por divisa** en vez de los de la primera.
- **Los documentos**: el sistema visual gana la pantalla `/fiscal` (§7.8), su hoja de estilos y el
  componente del aviso (§5.18); el README deja de decir que el *stack* lleva Pico, retirada en
  ADR-0023.

### 9.3 Las dos preguntas, resueltas por la dirección

- **El «% del umbral» baja al dominio** (`InformativeCategory.threshold_share_pct`): era el único
  número de esa pantalla que no salía del motor. La web solo decide si puede enseñarse.
- **«No obligado» sobre un libro vacío** deja de decirse: la categoría sin un solo activo registrado
  tiene veredicto propio, `nothing_recorded`, y las dos interfaces lo traducen por lo que es. El
  tipo es una unión cerrada, así que añadirlo rompió la compilación en los tres sitios que había que
  tocar, que es exactamente lo que se quería.

### 9.4 Lo que queda vivo, y por qué

- **El mutante de la guarda `invalidCount() === 0` sobre las tarjetas del 720 y el 721 es
  equivalente.** Con un libro inválido `taxYear` y `model720` lanzan los dos, así que `report().ok`
  es falso y el `Show` exterior ya sustituye la rejilla entera por el aviso de «no se puede
  calcular»: quitar la guarda interior no cambia un píxel. Se deja **a propósito** como defensa en
  profundidad si esa estructura cambia, y queda escrito aquí que ningún test puede matarlo.
- **El desplazamiento de un año en lo que caduca no se ha podido matar porque el camino está
  muerto**, y eso es un defecto, no un mutante: ver §9.5.

### 9.5 Un defecto encontrado, descrito y **sin arreglar**

**El aviso «caducan al cerrar X» de la pantalla fiscal no puede salir nunca, y el ejercicio en que
una pérdida se pierde dice «No hay nada que declarar».**

Medido con un libro de una sola venta con pérdida de 5.000,00 € en 2027 y cuatro años de arrastre:

| Ejercicio | `compensation.pending` | `compensation.expired` |
|---|---|---|
| 2027–2030 | −5.000,00 de 2027, `expires_after` 2031 | vacío |
| 2031 | **vacío** | −5.000,00 de 2027 |

La web calcula `expiring: loss.expires_after === year` **sobre `pending`**, y en 2031 la pérdida ya
no está en `pending`: la condición no se cumple en ningún ejercicio. Peor, `YearView.empty` no mira
`expired`, así que en 2031 la pantalla enseña «No hay nada que declarar en este ejercicio» mientras
5.000,00 € dejan de poder compensarse. La consola sí lo dice, desde `expired`: «CADUCA al cierre de
2031». Las dos interfaces no responden lo mismo a la misma pregunta.

### 9.6 Lo que se vio al volver a mirar la pantalla

**13 capturas nuevas**, fuera del repositorio, en
`~/atlas-private/capturas/2026-09-23-fiscal-revision-2/`: la pantalla fiscal a 400×890 con densidad
3, a 2045×1141 y a 360 de ancho, con el libro sintético y con el libro vacío, clara y oscura, con
la privacidad puesta y quitada, el formulario de presentar y el Resumen, más **dos con los bloques
de casillas desplegados**, que es lo que cambia entera. En las trece: ningún error de página y
`scrollWidth === clientWidth`, comprobado en el navegador elemento a elemento, no a ojo.

**Una cosa que chirría y no se ha tocado**, porque decide cómo se teclea una cifra en un impreso:
un concepto **sin signo** en un ejercicio **sin tabla comprobada** pierde el signo y no hay nada que
diga a cuál de las dos casillas iría. En el libro sintético, «Saldo de rendimientos del capital
mobiliario» sale como **5,69 €** cuando la cifra es **−5,69 €**: con tabla, 2025 lo resuelve con
`when_negative` (0429 positivo, 0430 negativo) y el número de casilla lo dice; sin tabla —que es el
caso normal— el lector ve una magnitud y ningún indicio. No es una regresión de esta ronda.

No se arregla aquí porque hay que decidir **qué significa `expired`** —la lectura de la consola es
«éste es su último ejercicio», la del campo `expires_after` es «el último en que se puede
compensar», y las dos no pueden ser ciertas a la vez— y eso es una decisión fiscal.

