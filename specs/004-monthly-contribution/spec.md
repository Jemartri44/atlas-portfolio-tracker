# Especificación de la feature: Aportación mensual, pesos del núcleo y correcciones del segundo *challenge* (`004-monthly-contribution`)

**Rama**: `feature/004-monthly-contribution`

**Creada**: 2026-08-31

**Estado**: Aprobado por el usuario (2026-08-31); Q1 resuelta (b) refinada, Q2 (b) y Q3 con el supuesto

**Entrada**: prompt de traspaso `docs/prompts/004-monthly-contribution.md` §3 (alcance, incluido el bloque 0), §4 (fuera de alcance) y §6 (decisiones fijadas). Deriva de ADR-0004, ADR-0005, ADR-0009, ADR-0012, ADR-0013, **ADR-0014** y **ADR-0015**; `docs/data-schema.md` §4, §6.1, §6.2, §7 y §8.4; `docs/business-rules.md` §1, §2 (reglas 1-6b), §5.4 y §7; `docs/specification.md` §5 y §6.1; constitución II, III, IV, V y VII. Construye sobre `specs/001-ledger-core/`, `specs/002-corporate-actions/` y `specs/003-synthetic-data/`.

## Resumen

Primera feature de la **Fase 2**. La Fase 1 dejó el libro cerrado: se registra, se proyecta, se verifica y se compacta. Lo que falta para que la aplicación sirva de verdad cada mes es responder a dos preguntas: **¿cómo está repartida la cartera?** y **¿dónde va el dinero de este mes?**. Esta feature las contesta con precios manuales y sin tocar ni una regla fiscal.

1. **Precios manuales** (`manualPrices`): el último precio conocido por activo, tomado de las `valuation` ya existentes, con su antigüedad y su marca `stale`. Informativo por definición: ningún cálculo fiscal lo mira (constitución II) y nunca se interpola (constitución V).
2. **Pesos y desviaciones del núcleo** (`coreWeights`, `atlas weights`): valor, peso real, peso objetivo y desviación en puntos porcentuales por activo, con subtotales por clase y los avisos de las reglas 3 y 6b. Si falta un precio, la fila sale "sin precio" y los pesos **no** se calculan sobre un total parcial.
3. **Calculadora de la aportación mensual** (`contributionPlan`, `atlas contribute`): separa el presupuesto del cubo, reparte el resto proporcionalmente al déficit frente al objetivo, da el sobrante por pesos objetivo y cuadra los céntimos. **Propone; nunca vende ni escribe** (regla 2, decisión (h)).
4. **Simulador de traspaso** (`atlas transfer simulate`): qué pesos quedarían tras mover participaciones de un fondo a otro, recordando que no es hecho imponible.
5. **Costes** (`costSummary`, `atlas costs`): comisiones acumuladas por activo del núcleo, TER y coste anual estimado, TER medio ponderado; el cubo aparte y sin sumarse jamás con el núcleo.
6. **Bloque 0 — las siete correcciones del segundo *challenge* externo (2026-08-31)**, ya recogidas en los documentos de `develop`: `wash_sale_window` con forma nueva y antigua (ADR-0014); consultas de solo lectura en modo degradado y `settings_changed` registrable con `--accept-invalid` (ADR-0015); `fx_rate` de EUR obligatoriamente `"1"` y `fx_rate_date` nunca en fin de semana; `transfer` sin `fee`; `dividend.source_country?`; confirmación de `backup`/`export` cuando el destino cae dentro de un árbol de trabajo de git.
7. **Generador sintético y *golden file*** actualizados a lo anterior, regenerados **una sola vez** y congelados de nuevo.

Nada fiscal ni estructural se decide aquí: el motor de la ventana de recompra, el linaje del diferimiento y la salida fiscal son de la Fase 5. Las dudas encontradas están en `questions.md` con su supuesto provisional.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Ver cómo está repartido el núcleo (Prioridad: P1)

El usuario quiere saber, un día cualquiera, cuánto vale cada activo del núcleo, qué peso tiene sobre el total del núcleo, cuál era su peso objetivo y cuántos puntos porcentuales se ha desviado. Los precios los introduce a mano con `atlas add valuation` (no hay fuentes automáticas hasta la Fase 4), así que la vista muestra siempre **de cuándo es cada precio** y marca los que llevan demasiado tiempo sin actualizar.

**Por qué esta prioridad**: es la base de todo lo demás. La aportación mensual, el simulador y los avisos de umbral se calculan sobre estos números; sin ellos la Fase 2 no existe.

**Prueba independiente**: sobre el libro sintético, `atlas weights --date 2027-12-31` imprime una fila por activo `core` con posición, subtotales por clase (`equity`, `fixed_income`, `gold`, `crypto`), el total del núcleo y los avisos al pie; borrando una `valuation` del fichero, la fila correspondiente pasa a "sin precio" y los pesos desaparecen con su aviso.

**Escenarios de aceptación**:

1. **Dado** un libro con `valuation` para todos los activos `core` con posición, **cuando** se pide `atlas weights --date D`, **entonces** cada fila muestra cantidad, precio unitario en su divisa, tipo BCE, valor unitario en EUR, valor EUR, peso real (%), peso objetivo (%), desviación en pp, fecha del precio y su antigüedad en días.
2. **Dado** un activo cuyo precio más reciente tiene más de `stale_price_days` de antigüedad, **cuando** se piden los pesos, **entonces** su precio se marca `⚠` y se lista el activo como precio caducado, **pero** el cálculo se hace igual (fallo visible, no mudo).
3. **Dado** que `stale_price_days` no está configurado, **cuando** se piden los pesos, **entonces** ningún precio se marca caducado y la antigüedad se sigue mostrando.
4. **Dado** un activo `core` con posición y **sin** ninguna `valuation` con `date ≤ D`, **cuando** se piden los pesos, **entonces** su fila dice "sin precio", el total del núcleo se marca **parcial**, las columnas de peso real y desviación quedan vacías para **todos** los activos y un aviso explica por qué (decisión (c)).
5. **Dado** un activo cuya única `valuation` es posterior a `D`, **cuando** se piden los pesos a fecha `D`, **entonces** se trata como "sin precio": nunca se usa un precio del futuro.
6. **Dado** varias `valuation` del mismo activo en cuentas distintas, **cuando** se calcula su precio manual, **entonces** se toma la de fecha mayor con `date ≤ D` y, en caso de empate de fecha, la última en orden de fichero (decisión (b)); el precio no depende del orden en que se registraron las valoraciones de fechas distintas.
7. **Dado** un activo del cubo, **cuando** se piden los pesos, **entonces** no aparece en ninguna fila, subtotal ni total (constitución III).
8. **Dado** un activo `core` con peso objetivo mayor que cero y **sin posición**, **cuando** se piden los pesos, **entonces** aparece con cantidad y valor cero, sin precio, peso real `0 %` y desviación `−w_i`, y el total **no** se marca parcial (A2).
9. **Dado** `--json`, **cuando** se piden los pesos, **entonces** la salida incluye filas, subtotales por clase, total, marca de parcialidad y la lista de avisos con su código.

---

### Historia 2 — Repartir la aportación del mes (Prioridad: P1)

Cada mes el usuario aporta una cantidad fija. Antes de dar las órdenes en la plataforma quiere saber cuánto va al cubo, cuánto al núcleo y cuánto a cada activo del núcleo para acercarse a los pesos objetivo **comprando**, nunca vendiendo (regla 2). La aplicación se lo calcula al céntimo y no escribe nada: las órdenes se dan a mano y se registran después con `atlas order place` / `atlas add buy` (decisión (h)).

**Por qué esta prioridad**: es el uso mensual de la aplicación, la razón por la que existe la Fase 2, y la prioridad 4 de la constitución VII.

**Prueba independiente**: sobre el libro sintético con precios a una fecha, `atlas contribute --amount 1000 --date D` imprime el presupuesto del cubo, la tabla del núcleo con déficit y asignación por activo, y los pesos resultantes; la suma de las asignaciones es exactamente el importe del núcleo.

**Escenarios de aceptación**:

1. **Dado** un importe `A` y `bucket_pct_of_contribution = p`, **cuando** se calcula el plan, **entonces** el presupuesto del cubo es `redondeo2(A × p / 100)`, el importe del núcleo es `A − cubo`, y el del cubo se **muestra aparte, sin asignar** a ningún activo (es un presupuesto, no una asignación).
2. **Dado** el valor `V` del núcleo a la fecha y el importe del núcleo `C`, **cuando** se calcula el plan, **entonces** el objetivo de cada activo es `w_i/100 × (V + C)` y su déficit `gap_i = max(0, objetivo_i − valor_i)`.
3. **Dado** que `Σgap ≥ C`, **cuando** se reparte, **entonces** cada activo recibe `C × gap_i / Σgap`; un activo sin déficit recibe cero y ningún activo queda **por encima** de su objetivo por efecto de la aportación.
4. **Dado** que `Σgap < C`, **cuando** se reparte, **entonces** cada activo recibe su `gap_i` íntegro y el sobrante `C − Σgap` se reparte proporcionalmente a los pesos objetivo `w_i`.
5. **Dado** cualquier reparto, **cuando** se redondea, **entonces** cada asignación se redondea a céntimos half-up **una vez**, la suma de las asignaciones es **exactamente** el importe del núcleo y ninguna asignación es negativa; el residuo del redondeo se ajusta en el activo de mayor déficit (A6 fija el desempate y el tope).
6. **Dado** que no se pasa `--amount` y `monthly_contribution_eur` está configurado, **cuando** se calcula el plan, **entonces** se usa ese valor y se indica su origen; **si no** hay ninguno de los dos, se rechaza remitiendo a `atlas settings set --monthly-contribution-eur`.
7. **Dado** que falta `target_weights` o `bucket_pct_of_contribution`, **cuando** se calcula el plan, **entonces** se rechaza diciendo qué parámetro falta y cómo fijarlo; un `bucket_pct_of_contribution` de `"0"` es un valor válido, no un parámetro ausente.
8. **Dado** un activo del núcleo **con posición** sin precio manual a la fecha, **cuando** se calcula el plan, **entonces** se **rechaza** listando las `valuation` que faltan (activo y fecha pedida); nunca se reparte sobre un total parcial (decisión (c)). Un activo con peso objetivo y **sin posición** no necesita precio: vale cero y recibe su déficit íntegro (A2).
9. **Dado** `--amount 0` (o un importe negativo o no decimal), **cuando** se calcula el plan, **entonces** se rechaza como error de uso.
10. **Dado** un plan calculado, **cuando** se imprime, **entonces** se muestran además los pesos resultantes tras aplicar la aportación y los mismos avisos de la Historia 1.
11. **Dado** cualquier plan, **cuando** termina, **entonces** **no se ha escrito ninguna línea en el libro** y el `etag` del fichero no ha cambiado.

---

### Historia 3 — Consultar un libro degradado sin quedarse ciego (Prioridad: P1, ADR-0015)

Un libro puede contener eventos que dejan de ser válidos: una línea editada a mano, una migración con semántica nueva, o un `settings_changed` que reinterpreta el pasado (Historia 4). Hasta ahora un solo evento inválido dejaba mudas todas las consultas. A partir de esta feature, **todas las consultas de solo lectura responden** con lo que sí se puede proyectar y **avisan en cabecera** de que hay eventos inválidos; las mutaciones siguen exigiendo un libro válido.

**Por qué esta prioridad**: es el camino de reparación. Sin él, la promesa de ADR-0013 ("un cambio de regla fiscal es un `settings_changed`, no un despliegue") es inaplicable, y un libro roto no se puede ni mirar para arreglarlo.

**Prueba independiente**: sobre un libro con un evento inválido, `atlas positions` responde con las posiciones que sí se proyectan y una cabecera de aviso; `atlas add buy …` sigue rechazando.

**Escenarios de aceptación**:

1. **Dado** un libro con `n > 0` eventos inválidos, **cuando** se ejecuta cualquiera de `positions`, `lots`, `cash`, `gains`, `income`, `valuations`, `weights`, `contribute`, `costs`, `transfer simulate`, `thesis list`, `order list`, `transfer pending`, `account list`, `asset list`, `settings list|show` o `export`, **entonces** el comando responde con la proyección degradada y una cabecera de aviso que dice cuántos eventos son inválidos y remite a `atlas check`.
2. **Dado** `--json` en cualquiera de esos comandos, **cuando** hay eventos inválidos, **entonces** la salida incluye `invalid_count` y ninguna cabecera de texto contamina el JSON.
3. **Dado** un libro sin eventos inválidos, **cuando** se ejecuta cualquiera de esos comandos, **entonces** no aparece cabecera alguna y `invalid_count` es `0`.
4. **Dado** un libro con eventos inválidos, **cuando** se intenta cualquier **mutación** distinta de `settings_changed` (`add …`, `ca …`, `thesis open|close`, `order place`, `edit`, `delete`, `compact`), **entonces** se rechaza como hasta ahora.
5. **Dado** `atlas export --format jsonl`, **cuando** hay eventos inválidos, **entonces** el aviso no se mezcla con los datos exportados (A9).

---

### Historia 4 — Cambiar la configuración sabiendo qué rompe y qué silencia (Prioridad: P1, ADR-0015 y constitución IV)

La configuración reinterpreta el pasado: cambiar `fiscal_date_rule` puede reordenar cronológicamente un par compra/venta y dejar eventos históricos inválidos. Los hechos no cambian, cambia su lectura, así que no hay nada que "rectificar antes": `settings_changed` es el **único** evento que se admite registrar aun así, con confirmación explícita que **lista los eventos que pasan a ser inválidos**. Y, por separado, si el cambio de un umbral **silencia un aviso activo**, la aplicación lo dice antes de escribir.

**Por qué esta prioridad**: es la contrapartida de la Historia 3 y la única puerta de escritura sobre un libro que queda con inválidos. Sin ella el usuario no puede aplicar la corrección de su asesor fiscal.

**Prueba independiente**: sobre un libro cuyo `settings_changed` nuevo invalida una venta histórica, `atlas settings set --fiscal-date-rule fund=trade_date` se rechaza listando el evento afectado; con `--accept-invalid` se escribe, y a partir de ahí las consultas avisan.

**Escenarios de aceptación**:

1. **Dado** un `settings_changed` cuya aplicación deja inválidos eventos que antes eran válidos, **cuando** se registra sin `--accept-invalid`, **entonces** se **rechaza** listando esos eventos (id, tipo y motivo) y no se escribe nada.
2. **Dado** el mismo caso, **cuando** se registra con `--accept-invalid`, **entonces** se escribe y se informa de cuántos eventos quedan inválidos y de que las consultas avisarán.
3. **Dado** un libro que **ya** tenía eventos inválidos, **cuando** se registra un `settings_changed` que no añade ninguno nuevo, **entonces** se acepta sin `--accept-invalid`: solo cuentan los que **pasan a ser** inválidos (comparación de conjuntos antes/después, como `reverseEvent` con los dependientes).
4. **Dado** cualquier otro tipo de evento, **cuando** se intenta registrar con `--accept-invalid`, **entonces** se rechaza: la excepción es exclusiva de `settings_changed`.
5. **Dado** un cambio de `deviation_threshold_pp` o de `satellite_min_weight_pct` que hace desaparecer un aviso que estaba activo con la configuración anterior, **cuando** se ejecuta `atlas settings set`, **entonces** se listan los avisos silenciados (código y activo) y se pide confirmación; `--yes` la da por hecha.
6. **Dado** que no hay precios suficientes para evaluar los avisos, **cuando** se ejecuta `atlas settings set`, **entonces** se dice que no se ha podido comprobar y se continúa (nunca se bloquea un cambio de configuración por falta de precios).
7. **Dado** `--accept-invalid` sin terminal interactiva, **cuando** se ejecuta `atlas settings set`, **entonces** el flag basta: la confirmación interactiva **no** sustituye al flag, pero el flag sí evita la pregunta por los eventos invalidados.

---

### Historia 5 — Un libro que no admite datos imposibles (Prioridad: P2, bloque 0)

El segundo *challenge* encontró cuatro huecos de validación que hoy dejan pasar datos que no pueden ser ciertos: un importe en euros con un tipo de cambio distinto de `1`, un tipo del BCE fechado un sábado (el BCE no publica), una comisión dentro de un `transfer` (que no la lleva) y un dividendo extranjero sin país del pagador. Se cierran ahora, mientras no existe ningún libro real (decisión (g)).

**Por qué esta prioridad**: son errores silenciosos con coste fiscal. Endurecer ahora es gratis; endurecer con un libro de años exige migración.

**Prueba independiente**: cada regla tiene su caso de rechazo y su caso de aceptación en los tests de `validateShape`; el *golden file* regenerado las cumple todas.

**Escenarios de aceptación**:

1. **Dado** un evento con `currency = "EUR"` y `fx_rate ≠ "1"` (en cualquiera de los pares `currency`/`fx_rate`, `sold_currency`/`fx_rate_sold`, `bought_currency`/`fx_rate_bought`, incluidos los efectos `forced_sale` y `grant`), **cuando** se valida, **entonces** se rechaza con `eur_fx_rate_not_one`; con `"1"` se acepta. Un `"1.0000"` no es `"1"`: se rechaza (el libro guarda el tipo tal cual lo publica el BCE, y para el euro eso es `1`).
2. **Dado** un `fx_rate_date` en sábado o en domingo (en cualquier evento que lo lleve y en los efectos `forced_sale` y `grant`), **cuando** se valida, **entonces** se rechaza con `fx_rate_date_weekend`; un día laborable se acepta. Los festivos TARGET no se validan (Ronda 6).
3. **Dado** un `transfer` con `fee`, **cuando** se valida, **entonces** se rechaza como campo desconocido y el mensaje remite a `standalone_fee` para la comisión del depositario; el flag `--fee` desaparece de `atlas add transfer` con el mismo mensaje.
4. **Dado** un `dividend` con `source_country`, **cuando** se valida, **entonces** se exige ISO 3166-1 de dos letras mayúsculas (`"US"` sí, `"usa"` no, `"Us"` no); sin el campo se sigue aceptando (es opcional).
5. **Dado** `atlas add dividend --source-country US`, **cuando** se registra, **entonces** el campo llega al libro.

---

### Historia 6 — Simular un traspaso antes de darlo (Prioridad: P2)

Antes de traspasar de un fondo a otro, el usuario quiere ver cómo quedarían los pesos y confirmar que no genera hecho imponible. La simulación no escribe, no toca lotes y no propone nada: solo enseña el antes y el después.

**Por qué esta prioridad**: `docs/specification.md` §6.1.1 lo pide y es la operación de rebalanceo sin coste fiscal del núcleo; el `transfer` real existe desde la 001.

**Prueba independiente**: `atlas transfer simulate --from-asset ast_world --to-asset ast_bonds --quantity 10 --date D` imprime dos columnas de pesos y la nota fiscal; con un activo no traspasable, se rechaza.

**Escenarios de aceptación**:

1. **Dado** dos activos `core` y `transferable` con precio manual, **cuando** se simula el traspaso de una cantidad, **entonces** se muestran los pesos antes y después, la desviación antes y después y el importe movido (`cantidad × precio manual del origen`, en EUR).
2. **Dado** `--all`, **cuando** se simula, **entonces** se mueve la posición física total del activo de origen a la fecha pedida.
3. **Dado** que alguno de los dos activos no es `core`, no es `transferable`, no existe, o es el mismo, **cuando** se simula, **entonces** se rechaza indicando el motivo concreto.
4. **Dado** que falta el precio manual de cualquiera de los dos activos, **cuando** se simula, **entonces** se rechaza listando lo que falta (decisión (c)).
5. **Dado** una cantidad mayor que la posición física del origen, **cuando** se simula, **entonces** se rechaza.
6. **Dado** cualquier simulación, **cuando** termina, **entonces** recuerda que un traspaso entre fondos no es hecho imponible (`business-rules.md` §5.2) y **no se ha escrito nada** en el libro.

---

### Historia 7 — Cuánto cuesta la cartera (Prioridad: P2)

El usuario quiere ver, por activo del núcleo, cuánto lleva pagado en comisiones y qué le cuesta al año el TER; y, por separado, cuánto lleva pagado en comisiones el cubo. Los dos libros nunca se suman (constitución III).

**Por qué esta prioridad**: `docs/specification.md` §6.1 lo pide y la regla 14 lo llama "probablemente la métrica más reveladora"; la métrica completa del cubo (comisiones sobre capital operado, contra el índice) es de la Fase 3.

**Prueba independiente**: `atlas costs --date D` sobre el libro sintético imprime la tabla del núcleo, el TER medio ponderado y el total anual estimado, y una tabla aparte con el total de comisiones por cuenta del cubo.

**Escenarios de aceptación**:

1. **Dado** un activo del núcleo, **cuando** se piden los costes, **entonces** se muestran sus comisiones acumuladas en EUR (`Σ fee / fx_rate` de sus `buy` y `sell` no anulados), ese total como porcentaje de lo invertido (`Σ` coste de sus compras), su TER si está declarado y el coste anual estimado (`TER × valor actual`) solo si hay precio.
2. **Dado** que un evento fue anulado por `reversal`, **cuando** se acumulan comisiones, **entonces** su comisión **no** cuenta.
3. **Dado** el conjunto del núcleo, **cuando** se piden los costes, **entonces** se muestran el TER medio ponderado por valor y el coste anual total estimado; si falta algún precio, el agregado se marca **parcial** y se dice sobre qué parte del núcleo se ha calculado.
4. **Dado** el cubo, **cuando** se piden los costes, **entonces** se muestra **solo** el total de comisiones acumuladas por cuenta, en su propia tabla, sin ninguna fila ni total compartido con el núcleo.
5. **Dado** un activo sin ninguna compra, **cuando** se calcula el porcentaje sobre lo invertido, **entonces** se muestra vacío en vez de una división por cero.

---

### Historia 8 — El libro sintético al día (Prioridad: P3)

El *golden file* de la 003 viola las validaciones nuevas (fechas de tipo de cambio que caen en fin de semana) y su `settings_changed` usa la forma antigua de la ventana de recompra y pesos objetivo por clase. El generador se ajusta y el *golden* se regenera **una sola vez**, en un commit propio y justificado (decisión (g)).

**Por qué esta prioridad**: sin él, ni los tests de la 003 ni los ejemplos de la Fase 2 pasan; pero no aporta funcionalidad nueva.

**Prueba independiente**: `atlas synth --out demo.jsonl --seed 1` reproduce byte a byte el *golden* regenerado, `atlas check --deep` está limpio y los invariantes de la 003 (prefijos, avisos declarados, instantánea estable) siguen verdes.

**Escenarios de aceptación**:

1. **Dado** cualquier semilla, **cuando** se genera el libro, **entonces** ningún `fx_rate_date` cae en sábado o domingo y ningún evento en EUR lleva un `fx_rate` distinto de `"1"`.
2. **Dado** cualquier semilla, **cuando** se genera el libro, **entonces** sus `settings_changed` llevan `wash_sale_window` (forma nueva), `target_weights` por `asset_id` de activos `core` que suman exactamente 100, y `stale_price_days`, `deviation_threshold_pp`, `satellite_min_weight_pct`, `bucket_pct_of_contribution` y `monthly_contribution_eur` con valores que hacen calculables `weights` y `contribute`.
3. **Dado** cualquier semilla, **cuando** se genera el libro, **entonces** el `dividend` en USD lleva `source_country` y ningún `transfer` lleva `fee`.
4. **Dado** el libro sintético, **cuando** se piden `weights`, `contribute`, `costs` y `transfer simulate` a una fecha con precios, **entonces** responden sin rechazos por falta de precio.
5. **Dado** la semilla 1, **cuando** se compara con `tests/fixtures/ledger/synthetic-v1.jsonl` y su `.snapshot.json` regenerados, **entonces** coinciden byte a byte, y todos los invariantes de la 003 siguen cumpliéndose.
6. **Dado** la forma antigua `wash_sale_window_days`, **cuando** se carga un libro que la usa, **entonces** se acepta y equivale a `"<n>d"`; esa forma se cubre con tests unitarios de `settings.ts`, no con el *golden*.

---

### Historia 9 — No escribir copias dentro del repositorio (Prioridad: P3, bloque 0)

`atlas backup --to …` y `atlas export --out …` escriben ficheros con datos reales. Si el destino cae dentro de un árbol de trabajo de git, lo más probable es que acabe en un commit. La aplicación lo detecta y pide confirmación.

**Por qué esta prioridad**: es una salvaguarda de privacidad barata (constitución: nada personal en el repositorio) y el usuario ya la pidió en el *challenge*.

**Prueba independiente**: `atlas backup --to <dir dentro de un repo>` pregunta antes de copiar; con `--yes` sigue; fuera de un repo no pregunta.

**Escenarios de aceptación**:

1. **Dado** un destino cuyo directorio (o cualquier ancestro) contiene `.git`, **cuando** se ejecuta `backup` o `export --out`, **entonces** se avisa de la ruta del repositorio encontrado y se pide confirmación antes de escribir.
2. **Dado** `--yes`, **cuando** se ejecuta, **entonces** escribe sin preguntar.
3. **Dado** que el usuario responde que no, **cuando** se ejecuta, **entonces** no se escribe nada y se informa de la cancelación.
4. **Dado** un destino fuera de cualquier árbol de git, **cuando** se ejecuta, **entonces** no hay pregunta adicional.
5. **Dado** que no hay terminal interactiva y falta `--yes`, **cuando** el destino está dentro de un repositorio, **entonces** se rechaza pidiendo `--yes`.

---

### Casos límite

- **Reparto con déficit cero**: todos los activos están en o por encima de su objetivo; todo el importe del núcleo se reparte por pesos objetivo.
- **Un solo activo con déficit**: se lleva todo el importe hasta cubrir su déficit; el sobrante, por pesos.
- **Aportación menor que un céntimo por activo**: el reparto sigue sumando exactamente el importe del núcleo y ninguna asignación es negativa (A6).
- **Residuo de redondeo**: la suma de los redondeos difiere del importe del núcleo; el ajuste va al activo de mayor déficit y nunca lo deja negativo (A6).
- **Activo con peso objetivo `"0"` y posición viva**: su déficit es cero (está por encima del objetivo), no recibe nada del sobrante, y su desviación positiva se muestra y puede disparar el aviso de umbral.
- **Activo con peso objetivo y sin posición**: aparece con valor cero, sin precio y sin marcar el total como parcial; su déficit es su objetivo íntegro (A2).
- **Clave de `target_weights` que no es un activo `core` del catálogo**: aviso `unknown_target_weight`, nunca rechazo (decisión (a)); su peso sigue contando para el 100 %.
- **Activo `core` con posición y sin peso asignado**: aviso `asset_without_target`; su objetivo es cero.
- **Cubo al 0 % y al 100 %** de la aportación: en el primer caso el núcleo recibe todo; en el segundo, el núcleo recibe cero y la tabla del núcleo sale con todas las asignaciones a cero.
- **Satélite exactamente en el mínimo**: `satellite_min_weight_pct` no dispara el aviso (la regla es "por debajo del mínimo"); un satélite con peso cero tampoco lo dispara (regla 6b: "0 % o al menos el mínimo").
- **Desviación exactamente igual al umbral**: no dispara el aviso (la regla es "se desvía **más** de un umbral").
- **`settings_changed` que invalida el pasado sin `--accept-invalid`**: rechazo con la lista; con el flag, se escribe y las consultas avisan.
- **Divisa EUR con `fx_rate = "1.0000"`**: rechazo.
- **`fx_rate_date` en sábado**: rechazo; en viernes o lunes, aceptación.
- **`wash_sale_window_days` antiguo**: se acepta y equivale a `"<n>d"`; si conviven las dos formas, manda la nueva (A7).
- **Libro vacío o sin activos `core`**: `weights` y `costs` responden con tablas vacías; `contribute` rechaza por falta de `target_weights`.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Bloque 0 — correcciones del *challenge***

- **FR-001**: `Settings` DEBE incluir `wash_sale_window` como mapa por `asset_type` con valores `"2m"`, `"1y"` o `"<n>d"` (`n` entero positivo), validado al escribir `settings_changed`, y DEBE seguir aceptando `wash_sale_window_days` (entero de días por `asset_type`) como forma antigua equivalente a `"<n>d"`. `DEFAULT_SETTINGS` pasa a `"2m"` para `stock`, `etc` y `etp` y `"1y"` para `fund`, `money_market` y `crypto`. Ningún motor consume el valor en esta feature.
- **FR-002**: todas las consultas de solo lectura DEBEN proyectar con `collectErrors` y, si hay eventos inválidos, imprimir una cabecera de aviso con su número y la remisión a `atlas check`; en `--json` DEBEN incluir `invalid_count`.
- **FR-003**: `recordEvent` DEBE aceptar `options.acceptInvalid`, admitido **solo** para `settings_changed`; sin él, DEBE rechazar cuando la proyección con el evento nuevo deja inválidos eventos que antes no lo eran, listando id, tipo y motivo de cada uno.
- **FR-004**: `atlas settings set` DEBE exigir el flag explícito `--accept-invalid` para ese caso (la confirmación interactiva no basta) y DEBE mostrar la lista de eventos afectados.
- **FR-005**: la validación de forma DEBE rechazar `fx_rate ≠ "1"` cuando la divisa del par es `EUR` (código `eur_fx_rate_not_one`), en todos los pares divisa/tipo del esquema, incluidos los de los efectos `forced_sale` y `grant`.
- **FR-006**: la validación de forma DEBE rechazar todo `fx_rate_date` que caiga en sábado o domingo (código `fx_rate_date_weekend`), en eventos y en efectos. Los festivos TARGET no se validan.
- **FR-007**: `transfer` DEBE dejar de admitir `fee`; el flag `--fee` de `atlas add transfer` DEBE desaparecer y su mensaje DEBE remitir a `standalone_fee`.
- **FR-008**: `dividend` DEBE admitir `source_country?` validado como ISO 3166-1 alfa-2 en mayúsculas, y `atlas add dividend` DEBE aceptarlo con `--source-country`.
- **FR-009**: `atlas backup` y `atlas export --out` DEBEN buscar `.git` hacia arriba desde el destino y, si lo encuentran, pedir confirmación antes de escribir; `--yes` la satisface.

**Fase 2 — proyecciones y comandos**

- **FR-010**: `manualPrices(state, date)` DEBE devolver, por activo con alguna `valuation` con `date ≤` la pedida, el valor unitario en su divisa, la divisa, el tipo BCE, el valor unitario en EUR (`unit_value / fx_rate`, 10 decimales), la fecha de la valoración, su antigüedad en días y la marca `stale` (`antigüedad > stale_price_days`, nunca `stale` si el parámetro no está configurado). La valoración elegida es la de fecha mayor y, a igualdad de fecha, la última en orden de fichero, de cualquier cuenta.
- **FR-011**: `coreWeights(state, date)` DEBE devolver, solo para el libro `core` y para los activos con posición agregada mayor que cero **o** con peso objetivo mayor que cero, por activo: cantidad agregada entre cuentas, precio manual, valor en EUR, peso real, peso objetivo, desviación en pp y marca de "sin precio"; subtotales por `asset_class` y total del núcleo. Si algún activo **con posición** no tiene precio, el total DEBE marcarse parcial y los pesos y desviaciones DEBEN quedar vacíos; un activo sin posición no marca nada (A2).
- **FR-012**: `validateSettings` DEBE exigir que los valores de `target_weights` sean decimales **no negativos** que sumen exactamente 100 (ya exige la suma; falta el signo).
- **FR-013**: `coreWeights` DEBE emitir los avisos `unknown_target_weight` (clave que no es un activo `core` del catálogo), `asset_without_target` (activo `core` con posición sin peso), `deviation_above_threshold` (|desviación| > `deviation_threshold_pp`) y `satellite_below_minimum` (peso de `gold` o `crypto` mayor que 0 y menor que `satellite_min_weight_pct`). Los dos últimos no se evalúan si su parámetro no está configurado.
- **FR-014**: `contributionPlan(state, { amount, date })` DEBE calcular el presupuesto del cubo, el importe del núcleo, el objetivo, el valor, el déficit y la asignación por activo según el algoritmo de la decisión (d), con redondeo half-up a céntimos una vez por activo y suma exacta al importe del núcleo.
- **FR-015**: `contributionPlan` DEBE rechazar si falta `target_weights`, si falta `bucket_pct_of_contribution`, si el importe no es un decimal positivo, o si algún activo `core` **con posición** carece de precio manual a la fecha (listando lo que falta).
- **FR-016**: `atlas weights [--date] [--json]` DEBE imprimir la tabla por activo con subtotales por clase, la antigüedad de cada precio con su marca de caducidad y los avisos al pie.
- **FR-017**: `atlas contribute [--amount] [--date] [--json]` DEBE imprimir el presupuesto del cubo aparte, la tabla del núcleo con déficit y asignación, los pesos resultantes y los avisos, y **no** DEBE escribir en el libro.
- **FR-018**: `atlas transfer simulate --from-asset --to-asset (--quantity | --all) [--date] [--json]` DEBE mostrar los pesos antes y después de mover `cantidad × precio manual del origen` euros entre dos activos `core` y `transferable`, recordar que no es hecho imponible, y no escribir nada.
- **FR-019**: `costSummary(state, events, date, settings)` DEBE devolver, por activo del núcleo, comisiones acumuladas en EUR y como porcentaje de lo invertido, TER y coste anual estimado; en agregado, TER medio ponderado por valor y coste anual total; y, **por separado**, el total de comisiones acumuladas por cuenta del cubo. La tabla del núcleo cubre todo activo que haya operado **o** que se tenga en cartera, para que el TER de un activo llegado por canje pese en el agregado. Las comisiones acumuladas suman las de `buy`, `sell` y las de los efectos `forced_sale` de los eventos corporativos del activo (Q2), no las de `standalone_fee` (A10). Ninguna fila ni total mezcla los dos libros.
- **FR-020**: `atlas costs [--date] [--json]` DEBE imprimir lo anterior en tablas separadas por libro.
- **FR-021**: `atlas settings set` DEBE evaluar los avisos de FR-013 con la configuración anterior y con la nueva sobre el mismo libro y fecha, listar los que el cambio silencia y pedir confirmación (satisfecha con `--yes`); si no hay precios suficientes, DEBE decirlo y continuar.
- **FR-022**: `atlas settings set` DEBE permitir fijar `target_weights` (por `asset_id`) y `wash_sale_window` desde la línea de órdenes.

**Generador y *golden***

- **FR-023**: el generador sintético DEBE producir libros que cumplan FR-005, FR-006, FR-007 y FR-008, con `settings_changed` en la forma nueva y con los parámetros que hacen calculables `weights`, `contribute` y `costs`.
- **FR-024**: el *golden file* y su instantánea DEBEN regenerarse una sola vez, en un commit propio con la justificación, y volver a congelarse; los invariantes de la 003 DEBEN seguir verdes.

**Transversales**

- **FR-025**: ninguna proyección ni comando de esta feature DEBE mezclar `core` y `bucket` (constitución III); la excepción fiscal de la constitución III es de la Fase 5.
- **FR-026**: ningún precio manual DEBE influir en un cálculo fiscal (constitución II), y nunca DEBE interpolarse ni estimarse un precio ausente (constitución V).
- **FR-027**: `packages/domain` DEBE mantener el 100 % de cobertura de líneas y ramas, sin dependencias nuevas.

### Entidades clave

- **`ManualPrice`**: precio informativo de un activo a una fecha — valor unitario, divisa, tipo BCE, valor unitario en EUR, fecha del precio, antigüedad en días, marca `stale`, evento de origen.
- **`CoreWeightRow`**: activo del núcleo con cantidad, precio (o su ausencia), valor EUR, peso real, peso objetivo y desviación en pp.
- **`CoreWeights`**: filas, subtotales por `asset_class`, total del núcleo, marca de total parcial y avisos.
- **`ContributionPlan`**: importe, presupuesto del cubo, importe del núcleo, filas por activo (valor, objetivo, déficit, asignación, peso resultante) y avisos.
- **`TransferSimulation`**: activos origen y destino, cantidad, importe movido en EUR y los pesos antes y después.
- **`CostSummary`**: filas del núcleo (comisiones, % de lo invertido, TER, coste anual), agregado del núcleo (TER medio ponderado, coste anual total, marca de parcialidad) y totales de comisiones por cuenta del cubo.
- **`WashSaleWindow`**: `"2m"` | `"1y"` | `"<n>d"`, por `asset_type`, en `Settings`.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: con el libro sintético y una fecha con precios, el usuario obtiene el reparto de su aportación mensual en un solo comando, sin escribir nada en el libro y con la suma de asignaciones exactamente igual al importe del núcleo, hasta el céntimo.
- **SC-002**: para cualquier combinación de pesos objetivo, valores y aportación generada por los tests de propiedades, el reparto suma exactamente el importe del núcleo, ninguna asignación es negativa y la desviación máxima no aumenta al aplicar la propuesta.
- **SC-003**: un activo del núcleo sin precio nunca produce un número: o la fila dice "sin precio" y el total sale marcado como parcial, o el comando se rechaza listando lo que falta. Cero casos de un total parcial presentado como completo.
- **SC-004**: con un evento inválido en el libro, las 17 consultas de solo lectura siguen respondiendo y todas avisan; ninguna mutación distinta de `settings_changed` se acepta.
- **SC-005**: un cambio de configuración que invalida eventos históricos solo se escribe con `--accept-invalid`, y el usuario ve la lista completa de eventos afectados antes de decidir.
- **SC-006**: un cambio de umbral que silencia un aviso activo nunca se escribe sin que el usuario lo haya visto listado.
- **SC-007**: `atlas check --deep` sobre el *golden* regenerado está limpio, y `atlas synth --seed 1` lo reproduce byte a byte.
- **SC-008**: `packages/domain` mantiene el 100 % de cobertura de líneas y ramas; `lint`, `typecheck`, `test` y `build` verdes, sin dependencias nuevas.

## Supuestos

- **A1 — Precio manual y `valuation`.** No hay evento nuevo de precio (decisión (b)): el precio manual sale de las `valuation` existentes. Una `valuation` sirve a la vez de foto para el Modelo 720 y de precio informativo; su `quantity` no se usa para el precio (solo `unit_value`), de modo que una valoración de una sola cuenta da precio a todo el activo.
- **A2 — Filas de `weights` para activos sin posición (Q1, resuelta el 2026-08-31).** El universo de filas de `coreWeights` es "posición agregada > 0 **o** peso objetivo > 0". La fila de un activo con objetivo y **sin posición** va con cantidad y valor cero, **sin precio**, peso real `0 %` y desviación `−w_i`, y **no** marca el total como parcial: una posición nula vale cero sin necesidad de precio, así que no falta ningún dato. Solo un activo **con posición** y sin precio hace parcial el total. En consecuencia, `contributionPlan` exige precio únicamente para los activos **con posición**.
- **A3 — Total del núcleo.** `V` es la suma de los valores en EUR de los activos `core` con posición y precio; el efectivo de las cuentas no entra (los pesos objetivo son de activos, ADR-0004 lo mantiene aparte en la vista de patrimonio).
- **A4 — Fecha por defecto.** Todos los comandos de esta feature usan hoy en `Europe/Madrid` cuando no se pasa `--date`, igual que `valuations` y `settings show`.
- **A5 — Configuración usada (corregido al implementar).** Los parámetros y los avisos de `weights`, `contribute`, `costs` y `transfer simulate` se leen con `settingsAt(--date)`: **la configuración vigente en la fecha consultada**. Es lo que exige `business-rules.md` §7 ("cambiar los pesos objetivo altera el cálculo de desviaciones históricas; hay que poder saber qué valores estaban vigentes en cada momento") y lo único que da una respuesta útil al preguntar por una fecha pasada. No contradice Q3 de la 001, que fija la configuración vigente al final del libro solo para **derivar la fecha fiscal** (una reinterpretación que debe ser retroactiva), no para los parámetros de gestión. El aviso de umbral silenciado de `settings set` sí evalúa a **hoy**, que es cuando el cambio empieza a regir.
- **A6 — Residuo del redondeo.** Se ajusta en el activo de mayor déficit; empate por mayor peso objetivo y después por `asset_id` (orden estable). Si el ajuste dejara esa asignación negativa, se toma solo hasta agotarla y el resto se ajusta en el siguiente por déficit, y así sucesivamente: la suma siempre cuadra y ninguna asignación sale negativa.
- **A7 — Convivencia de las dos formas de la ventana.** Si un `settings_changed` trae `wash_sale_window` y `wash_sale_window_days`, manda la forma nueva; con solo la antigua, se deriva `"<n>d"`; sin ninguna de las dos, la validación falla. La normalización ocurre al proyectar, nunca reescribiendo la línea.
- **A8 — La CLI escribe solo la forma nueva (Q3, resuelta el 2026-08-31).** `atlas settings set` gana `--wash-sale-window` y pierde `--wash-sale-window-days`, que pasa a dar un error de uso remitiendo al nuevo (no existe ningún libro real que dependa del flag; la forma antigua se sigue **leyendo**, que es lo que exige ADR-0014).
- **A9 — Dónde va la cabecera de aviso.** En los comandos tabulares va a la salida estándar; en `export` va al canal de error, para no contaminar el fichero exportado ni la tubería. En `--json` no hay cabecera: el dato es `invalid_count`.
- **A10 — Qué comisiones se acumulan (Q2, resuelta el 2026-08-31).** `buy`, `sell` y los efectos `forced_sale` (`fee` por cuenta): las tres son comisiones de negociación del activo y las tres reducen o aumentan la base de la operación. `standalone_fee` queda fuera de las dos tablas: no lleva activo y `data-schema.md` §6.2 dice que no afecta a la base fiscal de ningún lote. En el cubo se acumulan las mismas tres, agregadas por cuenta. La métrica de la regla 14 (comisiones sobre capital operado) es de la Fase 3.
- **A11 — Detección de árbol de git.** Se busca una entrada `.git` (fichero o directorio, para cubrir *worktrees*) subiendo desde el directorio de destino hasta la raíz del sistema de ficheros, sin ejecutar `git`.
- **A12 — Sin cambios en `docs/`.** Todo lo que esta feature implementa ya está escrito en `docs/`; cualquier desajuste se anota en `questions.md` en vez de corregir el documento (regla del prompt §2 bis).
