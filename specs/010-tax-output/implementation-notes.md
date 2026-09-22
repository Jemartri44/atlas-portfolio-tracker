# Notas de implementación — feature `010-tax-output`

Documento **vivo**, escrito mientras se implementa. Recoge lo que se desvía del plan y por qué, lo que se preguntó y se respondió, y lo que queda. Se cierra con la feature.

**Estado al 2026-09-22**: bloques **0 y 1 completos**, más los dos lotes de corrección de criterios que la dirección encargó en marcha. **Bloques 2, 3, 4 y 5 sin empezar.** Rama rebasada sobre `develop` (`f29ebc1`), pipeline verde: 163 ficheros de test, **1.562 tests**, `packages/domain` al **100 %** de líneas, ramas y funciones, Biome limpio, `tsc -b` limpio, paquete web dentro de presupuesto.

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

---

## 2. Desviaciones del plan, con su motivo

1. **§0.2 decía «cinco importes» y «siete parámetros»**; su propia tabla lista seis y ocho. Implementados los ocho. La dirección lo confirmó como error del prompt.
2. **§1.3 daba a `integrity` el hallazgo `filing_fingerprint_mismatch`.** `integrity(state)` no tiene las líneas crudas, y dárselas obligaría a **rehacer el digest del libro entero en cada pantalla**. Partido en dos: `integrity` comprueba el **recuento** contra la posición (`filing_fingerprint_lines`, barato, siempre) y `deepCheck` comprueba el **digest** (`filing_fingerprint_mismatch`, a petición). Los dos códigos traducidos en las dos interfaces.
3. **Los lectores de los importes de los modelos** se llaman `modelThresholdOf(settings, model)` y no `model720ThresholdOf`: una función por concepto, con el modelo como parámetro, ya que el 720 y el 721 comparten maquinaria (decisión (j)).
4. **§1.6 hacía que los casos de uso devolvieran el aviso entero.** Cablearlo así metió **el motor fiscal en el trozo de arranque de la web** (+4,9 KB) y lo paró la comprobación automática. Partido en **hecho** (`filings/touched.ts`, solo proyecciones, +0,4 KB, lo devuelven `recordEvent`, `correctEvent` y `reverseEvent`, así que **ninguna interfaz puede olvidarse de avisar**) y **cifra** (`closedYearImpact`, que lee la cadena y la pone quien ya tiene el motor cargado). Medido, no razonado.
5. **El diferido por ejercicio** no se anota dentro de `walkWashSales`, como sugería §1.5: se obtiene ejecutando la cadena del ejercicio que lo necesita, que son solo los declarados y por tanto pocos. Evita tocar el fichero más peligroso del proyecto sin necesidad.

## 3. Hallazgos durante la implementación

- **El aviso de ejercicio cerrado mentía con un libro inválido**: comparaba una lectura que no se puede calcular contra otra que sí, y decía «la base pasa de 200,00 a 0,00». Ahora, si cualquiera de las dos falla, **no compara nada**, y tiene test.
- **El coste de proyección de una escritura** subía de una a tres al cablear el aviso. `closedYearImpact` y `unfiledPastYears` aceptan la proyección ya hecha; el test que fija «una proyección por escritura» sigue en 1.
- **`movedTaxYears` solo miraba la base.** Un ejercicio puede conservar su base y dejar **otro saldo pendiente**, y eso mueve los siguientes. Ahora compara las dos cosas y `MovedTaxYear` lleva los dos totales de pendiente, porque si no la fila dice «0,00 → 0,00» sin explicar por qué está ahí.
- **Cambiar el valor por defecto de la ventana habría etiquetado cada venta de fondo como `2:other`**, «una lectura que ninguna lectura del documento sostiene» — lo contrario de lo que la dirección acababa de fundamentar. Se paró antes de ejecutarlo y se resolvió con dos identificadores explícitos.
- **El libro calculado a mano de la 009 heredaba valores por defecto** en vez de fijarlos, dos veces (`income_category` y `wash_sale_window`). Un cálculo a mano cuyos literales dependen de lo que el código crea hoy es un espejo, no un cálculo. **Fijados los tres**, incluido `fiscal_date_rule`, que todavía no había mordido.
- **`npm run lint | tail` esconde el código de salida** (el de la tubería es el de `tail`), y dos commits entraron con lint en rojo. Se reconstruyeron con `git reset --soft`. Ejecutar `npm run lint` a pelo.

## 4. Presupuesto del paquete web

| Punto | Arranque | Total |
|---|---|---|
| Base de la rama | 69,4 | 190,4 |
| Configuración nueva | 69,9 | 191,5 |
| Evento `tax_return_filed` | 71,1 | 193,2 |
| Huella y proyección | 71,9 | 194,2 |
| El hecho del ejercicio cerrado | **72,3** | **194,6** |
| Techo | **74,0** | **195,5** |

El techo del **arranque** lo subió la dirección dos veces (71,5 y luego 74,0) con su motivo escrito en `check-bundle.mjs`; el del **total** sube paso a paso y siempre a lo medido. **Al cerrar la feature hay que apretarlos los dos** a lo que entonces se mida más un margen pequeño, y dejar escrito qué hay dentro.

**Comprobación nueva y automática**: la construcción **falla** si un trozo de arranque trae cualquier módulo de `domain/src/tax/` o `domain/src/informative/`, leído de los *source maps*. Probado que no es vacía: con una importación de `tax/criteria.ts` en el camino de escritura, falla con 71,2 KB, muy por debajo del techo. Lo que se vigila es **la forma**, no el tamaño.

## 5. Preguntas abiertas

1. **Una cifra grande deja de verse porque hemos dejado de dudar de ella.** Con el criterio #19 en certeza alta desaparece del apartado de dudosos y con él **los 200,00 € en juego** de la lectura contraria. Es lo que manda la regla de la 009 (dudoso es todo lo que no es certeza alta) y es coherente; pero la información se pierde. **A decidir en el bloque 2**, que es donde se elige qué ve el usuario y dónde.
2. **Congelado por la dirección, para el bloque del motor** (avisar al llegar): el defecto de `windowCriterion` con un ETC declarado capital mobiliario —recibe `2:listed` y una alternativa de un año que el art. 25.2 no contempla— y el **test de definitividad** (una transmisión solo libera el diferimiento si ella misma es definitiva; DGT V3282-18 y Manual práctico de Renta 2025, capítulo 11, **texto nuevo de marzo de 2026**), con la ventana del propio activo.
3. **Congelado también**: el criterio #21, la cita del art. 35 en líneas de capital mobiliario y la atadura de las comisiones a valores negociables.
4. **La web no alcanza `wash_sale_transfer_counts`**: Configuración no tiene control booleano. Es el **único** parámetro booleano de los 31 de `Settings`, así que es un control, no una familia. La CLI ya lo cubre. Trabajo posterior a la 010.
5. **Homogeneidad tras un `convert`**: una compra nueva en el activo de destino nunca se empareja con una pérdida anterior en el de origen. Con la V0796-26 parece correcto, pero **nadie lo ha comprobado para el traspaso entre fondos**, donde se cruza con el #2b. Anotado en `docs/fiscal-questions.md`, sin resolver.

## 6. Lo que queda

Bloques **2** (la Renta por casillas, con los datos de 2025 ya investigados en `questions.md`), **3** (Modelos 720 y 721, con sus dos cálculos a mano §6.1 y §6.2), **4** (la pantalla `/fiscal` y la tarjeta del Resumen), **5** (`atlas tax --boxes`, `m720`, `m721`, `filed`), las demostraciones §7 y §8, la verificación en navegador y el apriete final de los dos techos del paquete.

**Al cablear la cifra del aviso de ejercicio cerrado** en la CLI y en la web hay que escribir el test estático que la dirección pidió: que **enumere** los módulos que importan `recordEvent`, `correctEvent` o `reverseEvent` fuera del dominio y exija que cada uno alcance `closedYearImpact`, de modo que una tercera interfaz **rompa el test hasta que alguien la añada**.
