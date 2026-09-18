# Especificación de la feature: Seguimiento del cubo especulativo y patrimonio total (`005-bucket-tracking`)

**Rama**: `feature/005-bucket-tracking`

**Creada**: 2026-09-18

**Estado**: Borrador a la espera del visto bueno del usuario; Q1-Q5 en `questions.md` con su supuesto provisional. Actualizada el 2026-09-18 con el prompt revisado tras el **tercer *challenge*** (bloque 0 §3.0 bis, puerta de precios §3.0 ter, tipo de cambio del efectivo §3.1, tesis contaminadas §3.4, aportación bruta §3.5 y aviso de Renta movida §3.5 bis)

**Entrada**: prompt de traspaso `docs/prompts/005-bucket-tracking.md` §3 (alcance, incluido el bloque 0), §4 (fuera de alcance) y §6 (decisiones fijadas, incluidas (i), (j) y (k)). Deriva de ADR-0004, ADR-0005, ADR-0009, ADR-0013, ADR-0014, ADR-0015, **ADR-0016** y **ADR-0018**; `docs/business-rules.md` §1, §4 (reglas 13-20), §5.4 y §7; `docs/data-schema.md` §5, §6.1, §6.2, §6.4, §7 y §8.4; `docs/specification.md` §3.2, §5 y §6.2; constitución II, III (con sus **dos** excepciones), IV, V y VII. Construye sobre `specs/003-synthetic-data/` y `specs/004-monthly-contribution/`.

## Resumen

Primera feature de la **Fase 3**. La Fase 2 dejó el núcleo resuelto: pesos, desviaciones, aportación mensual y costes. El cubo especulativo sigue siendo una lista de tesis sin métricas: se sabe qué se compró y cuánto se ganó, pero no **si se ganó más que la alternativa aburrida**, que es la única pregunta que la regla 16 considera relevante. Esta feature contesta esa pregunta y las que la acompañan, con precios manuales y sin tocar una sola regla fiscal.

0. **Bloque 0 — las tres correcciones del tercer *challenge*** (van primero, historia 10): `asset_type` gana `etf`; los mapas de `Settings` indexados por tipo de activo pasan a ser **parciales**, de modo que añadir un tipo no invalide la configuración ya escrita (ADR-0018); y `valuation`, `cash_deposit`, `cash_withdrawal` y `standalone_fee` ganan `fx_rate_date?`, sin el cual el tipo aplicado a una valoración de fin de año no es reproducible. Los tres son cambios **compatibles**: no tocan `schema_version` y **no cambian el *golden***.

0 bis. **Una sola puerta para los precios** (historia 11): toda lectura de precio pasa a una única función de `prices.ts`, con un parámetro opcional para una fuente externa que hoy nadie pasa y la precedencia escrita (**manual por delante de automático**, decisión (j)). Ninguna proyección vuelve a leer `state.valuations` por su cuenta: es el único punto que la Fase 4 tendrá que tocar.

1. **Índice de referencia configurable** (`bucket_benchmark_asset_id`): un `asset_id` del catálogo —normalmente el fondo global del núcleo— cuyos precios salen de las `valuation` de siempre. Sin él, todas las comparaciones con el índice salen "sin dato" con un aviso, nunca un cero.
2. **Patrimonio total** (`netWorth`, `atlas networth`): núcleo valorado + cubo valorado + efectivo por cuenta y divisa —convertido con el **último tipo conocido de esa divisa**, mostrando de qué fecha es y marcándolo caducado con el mismo criterio que los precios—, **siempre desglosado**, con marca de parcialidad y la lista de lo que falta. Es la única vista que suma los dos libros y lo hace como control de presupuesto (excepción 2 de la constitución III), nunca como métrica de cartera.
3. **Posiciones abiertas del cubo** (`bucketPositions`): cantidad, coste medio, precio con su antigüedad, valor, **P&L latente**, la tesis asociada, sus días abierta, si ha superado el plazo previsto y su condición de invalidación a la vista.
4. **Tesis medidas contra el índice** (`bucketTheses`, regla 16): `benchmark_equivalent_eur` —qué valdría hoy el mismo dinero puesto en el índice el día que se puso en el activo— y `result_vs_index_eur`. Si falta cualquier precio del índice, los dos campos quedan **sin dato** y se dice exactamente qué falta.
5. **Estadísticas de operativa** (`bucketStats`): tesis cerradas, ventas, tasa de acierto, ganancia y pérdida medias, esperanza matemática, **comisiones acumuladas sobre capital operado** (regla 14, destacadas), máxima caída del resultado realizado y resultado agregado frente al índice, con el aviso de significancia por debajo de 100 operaciones. Las tesis cuyo resultado está **contaminado por el FIFO global** quedan fuera de las medias y se cuentan aparte, diciendo por qué (decisión (k)).
6. **Reglas de control** (17, 18 y presupuesto): avisos —nunca rechazos— por aporte acumulado **bruto** (sin restar retiradas, con el neto etiquetado aparte), por pérdida acumulada y por peso del cubo sobre el patrimonio total. Y el aviso que faltaba en `atlas settings set`: **si el cambio mueve las ganancias realizadas de un ejercicio anterior**, se dice antes de escribir (§3.5 bis).
7. **Aviso de recompra** (`wash_sale_window_repurchase`): al registrar una compra de un activo vendido con pérdida dentro de la ventana de ADR-0014, contada **de fecha a fecha**. Solo el aviso: el diferimiento es del motor fiscal de la Fase 5.
8. **CLI**: `atlas bucket`, `atlas thesis show <id>`, `atlas networth`, y columnas nuevas en `atlas thesis list`. Todo de solo lectura, con proyección degradada y `--date` proyectando con `asOf` (ADR-0016).
9. **Generador sintético**: **subflujo de PRNG** para que añadir eventos deje de rebarajar el libro entero, escenario ampliado (índice valorado periódicamente, siete tesis cerradas, dos abiertas, una recompra dentro de la ventana) y *golden file* regenerado **una sola vez**, verificado y congelado de nuevo.

Nada fiscal ni estructural se decide aquí. Las dudas encontradas están en `questions.md` con su supuesto provisional.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Decir cuál es el índice de referencia (Prioridad: P1)

La regla 16 compara cada tesis con "la alternativa aburrida". Esa alternativa es un activo concreto del catálogo —el fondo global del núcleo— y el usuario tiene que poder nombrarlo. No es un activo especial ni una lista de precios aparte: se valora con `atlas add valuation` como todo lo demás (decisión (a)).

**Por qué esta prioridad**: sin el parámetro, la mitad de la feature sale "sin dato". Es el cimiento de las historias 3 y 5.

**Prueba independiente**: `atlas settings set --bucket-benchmark-asset ast_world` seguido de `atlas settings show` muestra el parámetro; `atlas bucket` pasa de "sin índice configurado" a comparar.

**Escenarios de aceptación**:

1. **Dado** un catálogo con `ast_world`, **cuando** se ejecuta `atlas settings set --bucket-benchmark-asset ast_world`, **entonces** el `settings_changed` resultante lleva `bucket_benchmark_asset_id: "ast_world"` y `atlas settings show` lo muestra.
2. **Dado** que el parámetro **no** está configurado, **cuando** se consultan las tesis, **entonces** `benchmark_equivalent_eur` y `result_vs_index_eur` quedan **sin dato** y se emite el aviso `missing_benchmark_asset`; ninguna cifra sale a cero.
3. **Dado** un `bucket_benchmark_asset_id` que no existe en el catálogo (porque se escribió mal, o porque el activo se dio de alta después), **cuando** se consulta, **entonces** se emite el aviso `unknown_benchmark_asset`, las comparaciones quedan sin dato y **no** se rechaza nada: el catálogo puede cambiar después del cambio de configuración.
4. **Dado** un índice que sí existe pero **sin ninguna `valuation`** con `date ≤` la fecha pedida, **cuando** se consulta, **entonces** las comparaciones quedan sin dato con el aviso `missing_benchmark_price`, que dice el activo y la fecha que faltan.
5. **Dado** un `bucket_benchmark_asset_id` de cualquiera de los dos libros, **cuando** se proyecta, **entonces** se acepta: el índice es una **referencia de rendimiento** y no participa en ningún otro cálculo del cubo.

---

### Historia 2 — Ver qué tengo abierto en el cubo y cuánto va ganando (Prioridad: P1)

El usuario abre `atlas bucket` y quiere ver, de un vistazo, cada posición viva del cubo: cuánto tiene, a qué precio la compró, cuánto vale hoy, cuánto gana o pierde sin haber vendido, cuántos días lleva abierta, si ya se ha pasado del plazo que él mismo se dio y —sobre todo— **qué dijo que le haría estar equivocado**.

**Por qué esta prioridad**: es la vista diaria del cubo y la que hace útil el registro de tesis. La condición de invalidación escrita y nunca releída no sirve de nada.

**Prueba independiente**: sobre el libro sintético, `atlas bucket --date D` lista una fila por posición viva del cubo con P&L latente y la condición de invalidación; borrando la `valuation` de ese activo, la fila pasa a "sin precio" y el P&L a "sin dato", y la fila **sigue apareciendo**.

**Escenarios de aceptación**:

1. **Dado** una cuenta del cubo con posición física mayor que cero de un activo a la fecha, **cuando** se pide la vista, **entonces** la fila muestra cantidad, coste medio en EUR, precio manual con su divisa, su fecha, su antigüedad y su marca de caducidad, valor en EUR, P&L latente en EUR y en porcentaje.
2. **Dado** una posición con una tesis abierta sobre ese par (cuenta, activo), **cuando** se pide la vista, **entonces** la fila añade el `thesis_id`, los **días abierta**, el plazo previsto (`expected_horizon_days`), si el plazo **ya se ha superado** y el texto íntegro de la condición de invalidación.
3. **Dado** una posición del cubo **sin** tesis abierta (por ejemplo, la que quedó viva tras cerrar la tesis), **cuando** se pide la vista, **entonces** la fila aparece igualmente con las columnas de tesis vacías; sigue siendo patrimonio del usuario.
4. **Dado** un activo del cubo **sin** precio manual a la fecha, **cuando** se pide la vista, **entonces** la fila dice "sin precio", el valor y el P&L quedan **sin dato**, el activo se lista en `missing_prices`, el total del cubo se marca **parcial** y se emite un aviso; nunca un cero ni un total parcial con aspecto de completo.
5. **Dado** una fecha pasada `D`, **cuando** se pide la vista, **entonces** las cantidades son las de esa fecha (proyección con `asOf`, ADR-0016) y los precios, los últimos conocidos a esa fecha: jamás se mezclan cantidades de hoy con precios de entonces.
6. **Dado** un activo del **núcleo**, **cuando** se pide la vista del cubo, **entonces** no aparece en ninguna fila ni total (constitución III).
7. **Dado** una posición cuyo precio manual tiene más de `stale_price_days`, **cuando** se pide la vista, **entonces** el precio se marca caducado y el cálculo se hace igual (degradación visible, no silencio).

---

### Historia 3 — Saber si gané más que el índice (Prioridad: P1, regla 16)

Para cada tesis, el usuario quiere la única comparación que importa: qué habría rendido **ese mismo dinero, en esas mismas fechas**, puesto en el índice. No "¿gané?", sino "¿gané más que la alternativa aburrida?".

**Por qué esta prioridad**: es la regla 16 y la razón de ser del cubo como herramienta de aprendizaje. Sin ella, el cubo es un registro de operaciones más.

**Prueba independiente**: sobre el libro sintético con el índice configurado y valorado, `atlas bucket --date D` muestra, por tesis, `benchmark_equivalent_eur` y `result_vs_index_eur`; borrando una `valuation` del índice anterior a una compra, esa tesis pasa a "sin dato" y dice qué precio falta.

**Escenarios de aceptación**:

1. **Dado** una tesis con compras enlazadas de coste `coste_i` y fecha fiscal `d_i`, y un índice con precio en todas esas fechas, **cuando** se calcula, **entonces** `benchmark_equivalent_eur = Σ coste_i × P(d_fin) / P(d_i)`, donde `P(d)` es el último precio manual del índice con `date ≤ d` y `d_fin` es la fecha fiscal de la **última venta enlazada** si la tesis está cerrada, o la **fecha consultada** si sigue abierta (decisión (b)).
2. **Dado** el mismo caso, **cuando** se calcula, **entonces** `result_vs_index_eur = (result_eur + P&L latente de la posición viva de la tesis) − (benchmark_equivalent_eur − invested_eur)`.
3. **Dado** un activo que rinde **exactamente** lo mismo que el índice entre la compra y el cierre, **cuando** se calcula, **entonces** `result_vs_index_eur` es **cero exacto** (sin redondeo intermedio).
4. **Dado** que falta **cualquiera** de los `P(d)` necesarios —no hay índice configurado, no existe en el catálogo, o no hay `valuation` suya en o antes de esa fecha—, **cuando** se calcula, **entonces** `benchmark_equivalent_eur` y `result_vs_index_eur` quedan **ambos sin dato**, se lista el activo y la fecha que faltan, y **nunca** se estima ni se interpola.
5. **Dado** una tesis cuya primera compra es **anterior** a la primera `valuation` del índice, **cuando** se calcula, **entonces** queda sin dato aunque el resto de precios existan: la comparación es todo o nada.
6. **Dado** cualquier tesis, **cuando** se imprime, **entonces** los importes se redondean a céntimos **una sola vez, en la salida** (ADR-0005); el cálculo interno es exacto.
7. **Dado** cualquier tesis, **cuando** se calcula la comparación, **entonces** **ningún** lote, ganancia, fecha fiscal ni diferimiento cambia: todo esto es informativo (constitución II).

---

### Historia 4 — Cuánto tengo en total, desglosado (Prioridad: P1)

El usuario quiere saber su patrimonio: cuánto en el núcleo, cuánto en el cubo y cuánto en efectivo en las cuentas de inversión. Nunca un único número: el desglose es obligatorio (`docs/specification.md` §3.2). Es además el **denominador de la regla 18**.

**Por qué esta prioridad**: la especificación lo exige y la regla de recogida no se puede evaluar sin él. Es la única vista que suma los dos libros y la constitución III la autoriza expresamente como control de presupuesto (excepción 2).

**Prueba independiente**: `atlas networth --date D` imprime tres bloques (núcleo, cubo, efectivo), una fila por divisa de efectivo y cuenta, el total al pie y los avisos; con un activo sin precio, el total sale marcado como parcial y dice qué falta.

**Escenarios de aceptación**:

1. **Dado** un libro con posiciones en los dos libros y efectivo en varias divisas, **cuando** se pide el patrimonio, **entonces** se devuelven **siempre** los tres bloques por separado, con su subtotal, más el total; el total nunca se presenta sin su desglose.
2. **Dado** efectivo en una divisa distinta del euro, **cuando** se convierte, **entonces** se usa el **último tipo conocido de esa divisa** en el libro (el del último evento, en orden cronológico de proyección, que declaró un tipo para ella) con `eur = importe / fx_rate` (ADR-0013), y la fila muestra el importe original, la divisa, el tipo aplicado, **la fecha de ese tipo** y su **antigüedad en días**.
3. **Dado** un tipo cuya fecha tiene más de `stale_price_days`, **cuando** se convierte, **entonces** la fila se marca **caducada** igual que un precio viejo y el total sigue calculándose: un tipo de hace dos años no puede presentarse como si fuera de hoy, pero tampoco se oculta.
4. **Dado** un saldo en una divisa de la que **no** se conoce ningún tipo (por ejemplo, la comisión de un `fx_exchange` pagada en una tercera divisa), **cuando** se convierte, **entonces** esa fila sale "sin convertir", el total se marca **parcial** y la divisa se lista en lo que falta.
5. **Dado** un activo con posición y **sin** precio manual, **cuando** se pide el patrimonio, **entonces** su bloque y el total se marcan parciales, se lista el activo y **no** se sustituye por cero.
6. **Dado** una fecha pasada, **cuando** se pide el patrimonio, **entonces** cantidades, saldos, precios y tipos son los conocidos a esa fecha (proyección con `asOf`).
7. **Dado** cualquier patrimonio calculado, **cuando** se usa en otro sitio, **entonces** **no** alimenta ningún peso objetivo ni ninguna métrica del núcleo: su único consumidor es el aviso de la regla 18.
8. **Dado** el colchón bancario, **cuando** se pide el patrimonio, **entonces** no aparece: está fuera del alcance de la aplicación (ADR-0004).

---

### Historia 5 — Saber si esto se me da bien o he tenido suerte (Prioridad: P2)

Con varias tesis cerradas, el usuario quiere las estadísticas de su operativa: cuántas acertó, cuánto gana de media cuando acierta, cuánto pierde cuando falla, qué espera por tesis, **cuánto se ha ido en comisiones frente al capital que ha movido** y cuál ha sido la peor racha. Y quiere que la aplicación le recuerde que con pocas operaciones nada de eso significa nada.

**Por qué esta prioridad**: es el panel de aprendizaje de la especificación §6.2 y la regla 14 llama a las comisiones "probablemente la métrica más reveladora". Va después de las tres primeras porque se apoya en ellas.

**Prueba independiente**: `atlas bucket --date D` sobre el libro sintético imprime el bloque de estadísticas con las comisiones sobre capital operado destacadas y el aviso de significancia; sobre un libro sin ninguna tesis cerrada, el bloque sale vacío sin ninguna división por cero.

**Escenarios de aceptación**:

1. **Dado** un conjunto de tesis cerradas, **cuando** se calculan las estadísticas, **entonces** se muestran su número, el número de operaciones de **venta** del cubo y, mientras la muestra sea menor de 100, un aviso de que por debajo de esa cifra no se distingue habilidad de suerte.
2. **Dado** las tesis cerradas, **cuando** se calculan, **entonces** la **tasa de acierto** es (tesis cerradas con resultado > 0) / (tesis cerradas), la **ganancia media** es la media de las positivas, la **pérdida media** la media de las negativas y la **esperanza** la media de todas, en EUR exactos y redondeadas una sola vez en la salida.
3. **Dado** una tesis cerrada cuyas ventas consumieron lotes que **no** proceden de sus propias compras (el FIFO es global por activo, ADR-0009: ocurre cuando una tesis anterior se cerró dejando posición viva, o cuando la tesis no tiene ninguna compra enlazada y vende lotes heredados de un canje), **cuando** se calculan las estadísticas, **entonces** esa tesis queda **fuera** de la tasa de acierto, de las medias y de la esperanza, y se informa de **cuántas** se han excluido y **por qué** (decisión (k)).
4. **Dado** que **todas** las tesis cerradas terminaron en pérdida, **cuando** se calcula, **entonces** la ganancia media sale **sin dato**, nunca cero (un cero diría que hubo ganadoras que ganaron nada).
5. **Dado** una única tesis cerrada, **cuando** se calcula, **entonces** las medias están bien definidas y la esperanza es exactamente su resultado.
6. **Dado** el cubo, **cuando** se calculan las comisiones sobre capital operado, **entonces** se muestra `Σ comisiones de sus buy y sell / Σ coste de sus buy`, en porcentaje y **con los dos importes a la vista**, en un lugar destacado de la salida.
7. **Dado** las ventas del cubo ordenadas por fecha fiscal (desempate por posición en el fichero), **cuando** se acumula su `gain_eur`, **entonces** la **máxima caída** es la mayor bajada desde un máximo previo, se informa con las fechas del pico y del valle, es siempre ≥ 0, y vale **cero** si la curva nunca baja.
8. **Dado** las tesis con comparación disponible, **cuando** se agrega, **entonces** se muestra la suma de `result_vs_index_eur` y **cuántas tesis quedaron sin dato**; las que no tienen comparación no se cuentan como cero.
9. **Dado** un cubo **sin ninguna operación**, **cuando** se calculan las estadísticas, **entonces** todas las métricas salen vacías o "sin dato" y ninguna división por cero se produce.
10. **Dado** cualquier cálculo de estas estadísticas, **cuando** se hace, **entonces** **solo** intervienen datos del libro (ganancias realizadas, comisiones, costes); la máxima caída no usa precios y por tanto es exacta (decisión (e)).

---

### Historia 6 — Que el cubo no crezca por descuido (Prioridad: P2, reglas 17 y 18)

El plan fija tres topes para el cubo: cuánto dinero total se le mete, cuánta pérdida acumulada se tolera y cuánto puede pesar sobre el patrimonio. La aplicación avisa —al acercarse y al superarlos— y además enseña el aporte acumulado frente al presupuesto previsto. **Avisa; no bloquea**: el libro nunca rechaza un hecho que ya ocurrió (decisión (f), ADR-0003).

**Por qué esta prioridad**: son las reglas de conducta que el sistema debe hacer difíciles de saltar (constitución III), pero se apoyan en el patrimonio y en las estadísticas.

**Prueba independiente**: con los tres umbrales configurados en el libro sintético, `atlas bucket` imprime los avisos correspondientes; quitando los umbrales de la configuración, no aparece ninguno.

**Escenarios de aceptación**:

1. **Dado** `bucket_max_cumulative_contribution = L`, **cuando** el aporte acumulado **bruto** al cubo (Σ `cash_deposit` de sus cuentas, en EUR, **sin restar las retiradas**) **supera** `L`, **entonces** se emite `bucket_contribution_exceeded` con el aporte bruto y el tope; al pasar del **80 %** de `L` sin superarlo, se emite `bucket_contribution_near_limit` (umbral relativo fijo, no configurable).
2. **Dado** una retirada del cubo, **cuando** se evalúa la regla 17, **entonces** **no** devuelve margen: el tope es de dinero nuevo puesto en riesgo y la regla 19 prohíbe reponer el cubo. El aporte **neto** se muestra igualmente, etiquetado como tal, junto al bruto.
3. **Dado** `bucket_stop_loss_pct = p`, **cuando** la pérdida acumulada del cubo (realizada **más** latente) supera `p %` del aporte acumulado **bruto**, **entonces** se emite `bucket_stop_loss_reached`, **destacado** en `atlas bucket` y en `atlas add buy` cuando la cuenta es del cubo; **el registro de la compra no se bloquea**.
4. **Dado** `bucket_max_weight_pct = w`, **cuando** el peso del cubo sobre el patrimonio total supera `w %`, **entonces** se emite `bucket_weight_exceeded` con el peso y el tope.
5. **Dado** que el patrimonio total es **parcial** (falta algún precio o algún tipo), **cuando** se evalúa la regla 18, **entonces** el peso sale **sin dato** y el aviso **no** se emite: no se avisa sobre un porcentaje calculado sobre un total incompleto.
6. **Dado** que **falta** cualquiera de los tres parámetros, **cuando** se consulta, **entonces** su aviso **no se evalúa** y no se inventa ningún valor por defecto (constitución IV).
7. **Dado** un umbral **exactamente igual** al valor observado, **cuando** se evalúa, **entonces** **no** dispara: la regla es "por encima".
8. **Dado** `bucket_pct_of_contribution` y `monthly_contribution_eur` configurados, **cuando** se consulta, **entonces** se muestra el aporte acumulado frente al presupuesto previsto (`pct × aportación × meses transcurridos desde el primer evento del cubo`) como referencia **informativa**; si falta cualquiera de los dos, no se calcula.
9. **Dado** cualquiera de estos avisos, **cuando** se produce, **entonces** viaja en la estructura devuelta por la consulta y **no** en `state.warnings`: el libro es válido y el *golden* no cambia por ellos (decisión (h)).

---

### Historia 7 — Que no me deje tropezar con la regla de los dos meses (Prioridad: P1)

La regla mira la ventana **anterior o posterior** a la venta con pérdida, así que la aplicación avisa en las **dos direcciones**: al registrar la **compra** de un activo vendido con pérdida hace poco, y al registrar la **venta con pérdida** de un activo comprado hace poco. La segunda es la más útil de las dos, porque llega cuando el usuario todavía puede decidir si vende. Es el error fiscal más común en operativa activa y vale para los dos libros, porque la regla es fiscal y no del cubo.

**Por qué esta prioridad**: es dinero. Un aviso que no está cuesta una pérdida no declarada; la aritmética de la ventana es además la que reutilizará el motor fiscal de la Fase 5 (decisión (g)).

**Prueba independiente**: sobre un libro con una venta con pérdida de un fondo, registrar una compra del mismo fondo 11 meses después avisa; 13 meses después, no. Y al revés: vender con pérdida un activo comprado 11 meses antes avisa. Con una acción, el límite está en dos meses.

**Escenarios de aceptación**:

1. **Dado** una venta con pérdida de un activo con fecha fiscal `d`, **cuando** se registra una compra del **mismo** activo con fecha fiscal en `(d, d + W]`, siendo `W = wash_sale_window[asset_type]`, **entonces** se emite `wash_sale_window_repurchase` con el evento de la venta, su cantidad, su pérdida y el **último día de la ventana**.
2. **Dado** compras del mismo activo con fecha fiscal en `[d − W, d)`, **cuando** se registra una **venta con pérdida** con fecha fiscal `d`, **entonces** se emite `wash_sale_window_prior_buy` por cada compra afectada, con su evento, su cantidad y el **primer día de la ventana** (Q3).
3. **Dado** una ventana de dos meses y una venta el 2027-01-15, **cuando** la compra es del 2027-03-15, **entonces** avisa; **cuando** es del 2027-03-16, **no** avisa (contada de fecha a fecha, ADR-0014).
4. **Dado** la dirección hacia atrás, **cuando** la venta con pérdida es el 2027-03-15 y la compra fue el 2027-01-15, **entonces** avisa; **cuando** la compra fue el 2027-01-14, **no** avisa.
5. **Dado** una venta el 2027-01-31 y una ventana de un mes, **cuando** se calcula el último día, **entonces** es el 2027-02-28 (2028-02-29 en año bisiesto): el día que no existe cae en el último del mes.
6. **Dado** un fondo (ventana `"1y"`), **cuando** la recompra es a los 11 meses, **entonces** avisa; a los 13, no. **Dado** una acción (ventana `"2m"`), a los dos meses avisa y a los tres no.
7. **Dado** una venta **con ganancia**, **cuando** se recompra dentro de la ventana, **entonces** **no** avisa en ninguna de las dos direcciones: la regla es solo para pérdidas.
8. **Dado** una operación en el **núcleo** o en el **cubo**, **cuando** se cumple la condición, **entonces** avisa igual: la regla es fiscal, no de un libro.
9. **Dado** cualquiera de los dos avisos, **cuando** se consulta `atlas check`, **entonces** aparece listado; **cuando** se ejecuta `atlas add buy` o `atlas add sell`, aparece en la vista previa **antes** de confirmar.
10. **Dado** cualquiera de los dos avisos, **cuando** se registra la operación, **entonces** **se registra igualmente**: es un aviso, no un rechazo, y ninguna pérdida se difiere, se cuantifica ni se reparte todavía (eso es la Fase 5).
11. **Dado** una ventana expresada como `"<n>d"` (forma antigua), **cuando** se calcula, **entonces** se cuentan `n` días naturales, en las dos direcciones.

---

### Historia 8 — El cubo entero en un comando, y el detalle de una tesis (Prioridad: P2)

El usuario no quiere cinco comandos: quiere `atlas bucket` y verlo todo —posiciones, tesis, estadísticas y avisos—; y, cuando una tesis le interesa, `atlas thesis show <id>` con lo que escribió, lo que hizo y cómo acabó.

**Por qué esta prioridad**: es la presentación de las historias 2, 3, 5 y 6. Sin ella el dominio está hecho pero no se ve.

**Prueba independiente**: `atlas bucket --json` devuelve un único objeto con las cuatro secciones y `invalid_count`; `atlas thesis show th_alpha` imprime la ficha de esa tesis; con un id inexistente, error de uso.

**Escenarios de aceptación**:

1. **Dado** `atlas bucket [--date] [--json]`, **cuando** se ejecuta, **entonces** imprime las posiciones abiertas (H2), las tesis abiertas y cerradas con su resultado frente al índice (H3), las estadísticas con las comisiones sobre capital operado destacadas (H5) y los avisos (H6).
2. **Dado** `atlas thesis show <thesis_id> [--date]`, **cuando** se ejecuta, **entonces** imprime hipótesis, plazo previsto, condición de invalidación, tamaño previsto frente a lo realmente invertido, la lista de `buy` y `sell` enlazados con fecha e importe, el resultado, la comparación con el índice y los días abierta.
3. **Dado** `atlas thesis list`, **cuando** se ejecuta, **entonces** añade las columnas de resultado frente al índice y días abierta, y proyecta con `asOf` la fecha pedida.
4. **Dado** cualquiera de los comandos nuevos, **cuando** se ejecuta, **entonces** es de **solo lectura**: no abre el almacén para escribir y el `etag` del libro no cambia.
5. **Dado** un libro con eventos inválidos, **cuando** se ejecuta cualquiera de ellos, **entonces** responde en modo degradado con la cabecera de aviso y, en `--json`, con el sobre `{ invalid_count, data }` (ADR-0015).
6. **Dado** `--date` con un valor que no es una fecha válida, **cuando** se ejecuta, **entonces** falla como **error de uso**, no con una respuesta plausible.
7. **Dado** un `thesis_id` que no existe, **cuando** se ejecuta `thesis show`, **entonces** se informa de que no existe y se sale con el código de error correspondiente.

---

### Historia 9 — Un libro sintético que ejercite todo esto, y un *golden* revisable (Prioridad: P3)

El escenario actual tiene cuatro tesis y ninguna valoración del índice: las métricas nuevas saldrían casi todas "sin dato". Se amplía. Y antes de ampliarlo se arregla el sorteo: hoy **cualquier** evento nuevo vuelve a sortear los ULID y los importes de todo lo que viene después, lo que convirtió la última regeneración en un fichero irreconocible (116 de 160 ids cambiados).

**Por qué esta prioridad**: sin él, ni los ejemplos de la Fase 3 ni el `quickstart` se pueden probar; pero no aporta funcionalidad. El subflujo de PRNG, en cambio, es **requisito**: sin él la regeneración siguiente vuelve a ser un acto de fe.

**Prueba independiente**: añadir un bloque de eventos nuevos al escenario y comprobar que los ids y las cifras de **todos** los eventos anteriores no cambian; `atlas synth --seed 1` reproduce el *golden* byte a byte.

**Escenarios de aceptación**:

1. **Dado** un bloque de eventos nuevo recordado en un **subflujo** propio, **cuando** se genera el libro, **entonces** ningún evento preexistente cambia de id, de `recorded_at` ni de importe: el diff del *golden* son líneas añadidas (y las declaradas explícitamente), no un fichero nuevo.
2. **Dado** cualquier semilla, **cuando** se genera el libro, **entonces** sigue siendo función pura de la semilla, byte a byte, y los invariantes de la 003 (proyección limpia prefijo a prefijo, avisos exactamente los declarados, instantánea estable, `compact` conservador) siguen verdes.
3. **Dado** el escenario ampliado, **cuando** se genera, **entonces** contiene: `bucket_benchmark_asset_id` y los tres umbrales del cubo en la configuración; `valuation` periódicas del índice desde el primer evento del cubo; **al menos seis tesis cerradas** con mezcla de ganancias y pérdidas, alguna con dos compras en fechas distintas; **dos tesis abiertas**; y una **recompra dentro de la ventana** tras una venta con pérdida.
4. **Dado** el libro sintético, **cuando** se ejecutan `atlas bucket`, `atlas networth` y `atlas thesis show` a una fecha con precios, **entonces** responden sin "sin dato" por falta de índice y `atlas check --deep` no encuentra ningún error.
5. **Dado** la regeneración del *golden*, **cuando** se hace, **entonces** es **una sola vez**, en un commit propio, y el mensaje enumera —verificadas con un script, comparando el fichero antiguo y el nuevo por tipo de evento— **todas** las diferencias: ni una sin declarar.
6. **Dado** el aviso de recompra recién implementado, **cuando** se proyecta el libro sintético, **entonces** el aviso aparece en la lista de avisos esperados del generador (la venta con pérdida del fondo seguida de las aportaciones mensuales ya existía y ahora se detecta).

---

### Historia 10 — Bloque 0: que añadir un tipo de activo no invalide el libro (Prioridad: P1, ADR-0018)

El tercer *challenge* encontró un fallo en el orden en que se hacen las cosas: el cargador valida **cada línea con las reglas de hoy**, así que endurecer una validación deja el libro entero ilegible, y los mapas de `Settings` indexados por tipo de activo se validaban **completos**. El día que el enumerado ganara `etf` —que los documentos ya nombran en tres sitios y que `reference_etf_id` obliga a dar de alta—, **todas** las líneas `settings_changed` escritas habrían pasado a ser inválidas. Se arregla ahora, que el libro real está vacío y cuesta cero.

**Por qué esta prioridad**: va **primero** porque todo lo demás se apoya en `Settings` y en el enumerado, y porque es la única parte de la feature que, hecha tarde, obligaría a una versión de esquema.

**Prueba independiente**: una línea `settings_changed` escrita **sin** `etf` en sus mapas sigue siendo válida y `settingsAt` devuelve el valor por defecto para ese tipo; el *golden* no cambia ni un byte por este bloque.

**Escenarios de aceptación**:

1. **Dado** el enumerado de tipos de activo, **cuando** se da de alta un activo `etf`, **entonces** se acepta, su fecha fiscal por defecto es la de **contratación** y su ventana de recompra por defecto es `"2m"`.
2. **Dado** un `settings_changed` cuyo `fiscal_date_rule` o `wash_sale_window` **no** menciona algún tipo de activo, **cuando** se valida, **entonces** se acepta (mapa parcial), y **cuando** se lee, cada tipo ausente toma su valor por defecto documentado (ADR-0013, ADR-0014).
3. **Dado** un mapa parcial, **cuando** se deriva la fecha fiscal o la ventana de un activo de un tipo ausente, **entonces** se usa el valor por defecto, **nunca** un `undefined` que degrade en silencio a la otra rama.
4. **Dado** un valor **inválido** presente en el mapa (`"3m"`, `"ayer"`), **cuando** se valida, **entonces** se rechaza como hasta ahora: la tolerancia es a la ausencia, no al disparate.
5. **Dado** `valuation`, `cash_deposit`, `cash_withdrawal` o `standalone_fee`, **cuando** llevan `fx_rate_date`, **entonces** se valida como el resto (fecha válida, nunca en fin de semana) y la CLI permite fijarlo; **cuando** no lo llevan, se aceptan igual (campo opcional).
6. **Dado** todo el bloque 0, **cuando** se regenera el libro sintético, **entonces** el *golden* y su instantánea **no cambian**: los tres cambios son compatibles (decisión (i)). Si cambiaran, se investiga antes de aceptarlo.

---

### Historia 11 — Bloque 0: una sola puerta para los precios (Prioridad: P1, decisión (j))

Hoy el precio sale siempre de las `valuation` del libro y lo consumen tres proyecciones; esta feature añade tres más. Cuando llegue la Fase 4 con los precios automáticos, o un trabajo diario escribe en el registro de hechos —una barbaridad— o hay que reabrir seis proyecciones con cobertura del 100 %. Se centraliza **antes** de añadir nada.

**Por qué esta prioridad**: es una refactorización preventiva que cuesta poco ahora y mucho después; y va antes que las proyecciones nuevas para que nazcan ya usando la puerta.

**Prueba independiente**: un test de arquitectura comprueba que **ningún** módulo fuera de `prices.ts` lee `state.valuations` para obtener un precio; las proyecciones de la Fase 2 siguen dando exactamente los mismos números (sus tests pasan sin tocarlos).

**Escenarios de aceptación**:

1. **Dado** un activo y una fecha, **cuando** se pide su precio, **entonces** una **única** función lo devuelve con su valor unitario en divisa y en euros, su **origen**, la fecha del precio y su antigüedad, o **nada** si no lo hay.
2. **Dado** esa función, **cuando** se llama sin fuente externa —como hace hoy todo el código—, **entonces** el resultado es idéntico al actual y su origen es `manual`.
3. **Dado** el parámetro opcional de fuente externa, **cuando** un día se pase (Fase 4), **entonces** la precedencia documentada es **manual por delante de automático**, siempre: el precio manual es una decisión del usuario y el automático una conveniencia (constitución I).
4. **Dado** cualquier proyección de precio (pesos, aportación, costes, simulador, patrimonio, cubo), **cuando** necesita un precio, **entonces** lo pide a esa función y **no** recorre `state.valuations` por su cuenta.
5. **Dado** el cambio, **cuando** se ejecutan los tests de la Fase 2, **entonces** pasan sin modificarlos: es una refactorización, no un cambio de comportamiento.

---

### Historia 12 — Que un cambio de configuración no mueva una Renta ya presentada sin decirlo (Prioridad: P2, §3.5 bis)

`atlas settings set` ya avisa si un cambio de umbral silencia un aviso activo. Falta el aviso caro: cambiar `fiscal_date_rule` reinterpreta las fechas fiscales y puede **mover ganancias realizadas de un ejercicio a otro** —justo el cambio que ADR-0013 promete que será "un `settings_changed`, no un despliegue"—. El usuario tiene que verlo antes de escribir.

**Por qué esta prioridad**: es dinero y es una declaración ya presentada; va después del bloque 0 porque necesita la configuración resuelta.

**Prueba independiente**: sobre un libro con una venta el 30/12 liquidada el 02/01, cambiar `fiscal_date_rule` del tipo de ese activo lista el ejercicio afectado con las dos cifras y pide confirmación; con `--yes` se escribe.

**Escenarios de aceptación**:

1. **Dado** un cambio de configuración, **cuando** las ganancias realizadas de **cualquier ejercicio anterior al del reloj** cambian de total al reproyectar el mismo libro con la configuración nueva, **entonces** se listan esos ejercicios con la cifra **antes** y **después**, y se pide confirmación.
2. **Dado** que el cambio solo afecta al ejercicio **en curso**, **cuando** se evalúa, **entonces** no se avisa: todavía no hay nada presentado.
3. **Dado** `--yes`, **cuando** se ejecuta, **entonces** la confirmación se da por hecha y se escribe.
4. **Dado** que el usuario responde que no, **cuando** se ejecuta, **entonces** no se escribe nada.
5. **Dado** un cambio que no toca ninguna regla fiscal (por ejemplo, un umbral del cubo), **cuando** se evalúa, **entonces** ningún ejercicio cambia y el aviso no aparece.
6. **Dado** el aviso, **cuando** se emite, **entonces** **no bloquea**: es información, igual que el aviso de umbral silenciado; y se emite para cualquier ejercicio anterior, porque el libro todavía no sabe qué ejercicios se han declarado (evento `tax_return_filed`, previsto para la Ronda 9).

---

### Casos límite

- **Tesis sin índice configurado** y **tesis con índice sin ninguna valoración**: las dos, sin dato y con su aviso propio (`missing_benchmark_asset` / `missing_benchmark_price`).
- **Tesis con una compra anterior a la primera `valuation` del índice**: sin dato, aunque las demás compras sí tengan precio.
- **Tesis abierta sin precio del activo**: el P&L latente queda sin dato y la tesis **sigue listándose**; su comparación con el índice también queda sin dato (le falta el término latente).
- **Tesis cerrada con posición viva** (aviso `thesis_closed_with_position` ya existente): la posición aparece en las posiciones abiertas sin tesis asociada, y el resultado de la tesis para las estadísticas es el **realizado**.
- **Cubo con cero operaciones**: estadísticas vacías, sin divisiones por cero, sin avisos de umbral salvo los que dependan solo de la configuración.
- **Una sola tesis cerrada**: medias bien definidas; esperanza igual a su resultado.
- **Todas las tesis con pérdida**: ganancia media "sin dato", no cero.
- **Tesis cerrada con resultado exactamente cero** (la que se cerró por un canje sin venta): no cuenta como acierto (la regla es "resultado > 0") y sí entra en la esperanza.
- **Umbrales no configurados**: ningún aviso; **umbral exactamente en el límite**: no dispara.
- **Aporte acumulado cero** con pérdida acumulada: la regla de parada no se evalúa (no se divide entre cero).
- **Patrimonio con una divisa de efectivo sin tipo conocido**: esa fila "sin convertir" y el total parcial.
- **Patrimonio con el cubo vacío**: el bloque del cubo sale a cero y **se muestra igualmente**, porque cero es un dato y la ausencia de bloque, no.
- **Recompra el último día de la ventana** (avisa) y **el día siguiente** (no avisa), en fondo (un año) y en acción (dos meses), incluido **31 de enero más un mes** y el 29 de febrero de un año bisiesto.
- **Venta con pérdida con compras dentro de la ventana anterior**: avisa con `wash_sale_window_prior_buy`, una vez por compra afectada (Q3).
- **Dos cuentas del cubo con el mismo activo** (permitido con aviso desde la 001): el coste medio se reparte por coste unitario medio de los lotes abiertos del activo, que son globales (ADR-0009).
- **Máxima caída sin ninguna venta**: cero, sin fechas de pico ni de valle.
- **Tesis sin ninguna compra enlazada** (la que se abrió tras un canje y solo vende lo heredado): sin comparación con el índice (el sumatorio de compras está vacío: eso es "sin dato", no cero) y excluida de las estadísticas por resultado contaminado.
- **`settings_changed` con los mapas parciales**: válido; los tipos ausentes toman su valor por defecto y el cambio no invalida ninguna línea anterior (ADR-0018).
- **Tipo de cambio de una divisa más viejo que `stale_price_days`**: se usa, se marca caducado y se dice de qué fecha es; **nunca** se oculta ni se presenta como actual.
- **Divisa con saldo cero**: no aparece como fila del patrimonio ni marca nada como parcial.
- **Retirada del cubo mayor que lo aportado**: el bruto sigue siendo el tope evaluado; el neto se muestra negativo, etiquetado.
- **Cambio de configuración que mueve ganancias solo del ejercicio en curso**: no se avisa.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Configuración (§3.0)**

- **FR-001**: `Settings` DEBE admitir `bucket_benchmark_asset_id?` (cadena no vacía, `asset_id` del catálogo de cualquier libro), validado como forma al escribir `settings_changed`. `atlas settings set` DEBE ganar `--bucket-benchmark-asset`.
- **FR-002**: la existencia del activo se comprueba **al proyectar la consulta**, no al escribir: si no está en el catálogo, aviso `unknown_benchmark_asset` y comparaciones sin dato; nunca un rechazo.
- **FR-003**: los umbrales `bucket_max_cumulative_contribution`, `bucket_stop_loss_pct` y `bucket_max_weight_pct` siguen siendo opcionales; sin el parámetro, su aviso **no se evalúa**.

**Patrimonio total (§3.1)**

- **FR-004**: `netWorth(state, date, settings)` DEBE devolver, **siempre desglosados**: el bloque del **núcleo** (reutilizando `coreWeights`, con sus subtotales por clase), el bloque del **cubo** (posiciones físicas × precio manual, por cuenta y activo) y el bloque de **efectivo** (por cuenta y divisa, con su importe original, su tipo aplicado y su equivalente en EUR), más el total.
- **FR-005**: el efectivo en divisa se convierte con el **último tipo conocido de esa divisa** en el libro (`eur = importe / fx_rate`), y la fila DEBE mostrar la **fecha de ese tipo**, su **antigüedad en días** y la marca `stale` con el mismo criterio que los precios (`stale_price_days`); si no hay ningún tipo conocido, la fila sale "sin convertir", el total se marca parcial y la divisa se lista en `missing_rates`.
- **FR-006**: `netWorth` DEBE marcar el total como **parcial** y listar lo que falta cuando algún activo con posición carece de precio o algún saldo carece de tipo; **nunca** un cero ni un total parcial con aspecto de completo.
- **FR-007**: `atlas networth [--date] [--json]` DEBE imprimir los tres bloques, una fila por libro, cuenta y divisa, el total al pie y los avisos.
- **FR-008**: ningún otro cálculo de la aplicación DEBE consumir el total del patrimonio salvo el aviso de la regla 18 (constitución III, excepción 2).

**Posiciones abiertas del cubo (§3.2)**

- **FR-009**: `bucketPositions(state, date, settings)` DEBE devolver, por cada par (cuenta del libro `bucket`, activo) con posición física mayor que cero a la fecha: cantidad, coste medio en EUR derivado de los lotes fiscales abiertos del activo, precio manual con su antigüedad y su marca `stale`, valor en EUR, P&L latente en EUR y en porcentaje, y —si la hay— la tesis abierta asociada con sus días abierta, su `expected_horizon_days`, la marca de plazo superado y su condición de invalidación.
- **FR-010**: sin precio, la fila DEBE decir "sin precio", el valor y el P&L quedan sin dato, el activo entra en `missing_prices`, el total del cubo se marca parcial y se emite aviso.

**Tesis frente al índice (§3.3)**

- **FR-011**: `bucketTheses(state, date, settings)` DEBE devolver cada tesis (`theses()` íntegro) más `benchmark_equivalent_eur = Σ coste_i × P(d_fin) / P(d_i)` y `result_vs_index_eur = (result_eur + latente) − (benchmark_equivalent_eur − invested_eur)`, con `P(d)` = último precio manual del índice con `date ≤ d`, y `d_fin` = fecha fiscal de la última venta enlazada (tesis cerrada) o la fecha consultada (tesis abierta).
- **FR-012**: si falta cualquier `P(d)` necesario, o el índice no está configurado o no existe, los **dos** campos DEBEN quedar sin dato y DEBE listarse el activo y la fecha que faltan. Nunca se estima.
- **FR-013**: el cálculo DEBE ser exacto y redondearse a céntimos **una sola vez en la salida** (ADR-0005).
- **FR-014**: nada de esto DEBE tocar lotes, ganancias, fechas fiscales ni diferimientos, y ningún módulo fiscal (`lots.ts`, `gains.ts`, `income.ts`, `operations.ts`, `theses.ts`) DEBE importar las proyecciones de precios ni las del cubo; un **test de arquitectura** lo fija.

**Estadísticas de operativa (§3.4)**

- **FR-015**: `bucketStats` DEBE devolver el número de tesis cerradas y el de ventas del cubo, con el aviso de significancia mientras la muestra sea menor de 100.
- **FR-016**: DEBE devolver tasa de acierto, ganancia media de las positivas, pérdida media de las negativas y esperanza matemática por tesis, calculadas sobre **tesis cerradas** (decisión (d)); la ganancia media (o la pérdida media) queda **sin dato** si no hay ninguna de ese signo.
- **FR-016 bis**: DEBE marcar como **contaminada** toda tesis cuyas ventas hayan consumido lotes que no procedan (siguiendo el linaje `source_lot_id` hasta su origen) de sus propias compras enlazadas, dejarla **fuera** de la tasa de acierto, de las medias y de la esperanza, y devolver cuántas se han excluido y por qué (decisión (k)).
- **FR-017**: DEBE devolver las comisiones acumuladas sobre capital operado (`Σ fees_eur de los buy y sell del cubo / Σ coste de sus buy`, en porcentaje) **con los dos importes a la vista**, y la CLI DEBE mostrarlas destacadas (regla 14).
- **FR-018**: DEBE devolver la máxima caída del resultado realizado acumulado, calculada **solo desde el libro** ordenando las ventas del cubo por (fecha fiscal, posición en el fichero), con las fechas del pico y del valle; nunca negativa; cero si no hay caídas.
- **FR-019**: DEBE devolver la suma de `result_vs_index_eur` de las tesis que lo tienen y cuántas quedaron sin dato.

**Reglas de control (§3.5)**

- **FR-020**: DEBEN emitirse `bucket_contribution_exceeded` (aporte acumulado **bruto** —Σ `cash_deposit` de las cuentas del cubo, sin restar retiradas— por encima de `bucket_max_cumulative_contribution`) y `bucket_contribution_near_limit` (por encima del 80 % del tope, umbral relativo fijo). El aporte **neto** DEBE devolverse también, etiquetado como tal.
- **FR-021**: DEBE emitirse `bucket_stop_loss_reached` cuando la pérdida acumulada del cubo (realizada más latente) supere `bucket_stop_loss_pct` del aporte acumulado **bruto**; la CLI lo DEBE destacar en `atlas bucket` y en `atlas add buy` sobre una cuenta del cubo, **sin bloquear** el registro (decisión (f)).
- **FR-022**: DEBE emitirse `bucket_weight_exceeded` cuando el peso del cubo sobre el patrimonio total supere `bucket_max_weight_pct`; si el patrimonio es parcial, el peso queda sin dato y el aviso no se emite.
- **FR-023**: DEBE calcularse el aporte acumulado frente al presupuesto previsto (`bucket_pct_of_contribution × monthly_contribution_eur × meses transcurridos desde el primer evento del cubo`) como referencia informativa; si falta cualquiera de los dos parámetros, no se calcula.
- **FR-024**: todos estos avisos DEBEN viajar en la estructura devuelta por la consulta, **nunca** en `state.warnings` (decisión (h)).

**Aviso de recompra (§3.6)**

- **FR-025**: `dates/civil-date.ts` DEBE implementar la aritmética de calendario de la ventana: suma de meses y de años naturales con el día inexistente llevado al **último día del mes**, y la lectura de `wash_sale_window` en sus tres formas (`"2m"`, `"1y"`, `"<n>d"`).
- **FR-026**: al proyectar un `buy` de un activo vendido **con pérdida** dentro de la ventana `wash_sale_window[asset_type]` contada de fecha a fecha, DEBE emitirse `wash_sale_window_repurchase` con el id de la venta, su cantidad, su pérdida y el último día de la ventana.
- **FR-026 bis**: al proyectar un `sell` **con pérdida** de un activo comprado dentro de la ventana **anterior**, DEBE emitirse `wash_sale_window_prior_buy` por cada compra afectada, con su id, su cantidad y el primer día de la ventana (Q3). Los dos avisos valen para los dos libros y aparecen en `atlas check` y en la vista previa de `atlas add buy|sell`.
- **FR-027**: la compra **no** se rechaza y **ninguna** pérdida se difiere, reparte ni asocia a lotes: el motor de la regla es de la Fase 5 (decisión (g)).

**CLI (§3.7)**

- **FR-028**: `atlas bucket [--date] [--json]` DEBE reunir posiciones abiertas, tesis con su comparación, estadísticas y avisos en una sola salida.
- **FR-029**: `atlas thesis show <thesis_id> [--date]` DEBE imprimir la ficha completa de una tesis.
- **FR-030**: `atlas thesis list` DEBE ganar las columnas de resultado frente al índice y días abierta.
- **FR-031**: todos los comandos nuevos DEBEN ser de solo lectura, proyectar en modo degradado con cabecera de aviso y usar el sobre `{ invalid_count, data }` en `--json`.
- **FR-032**: **toda** vista que acepte una fecha DEBE proyectar con `asOf` puesto a esa fecha (ADR-0016), incluida `atlas thesis list`, que hoy no lo hace.

**Generador y *golden* (§3.8)**

- **FR-033**: el generador DEBE permitir recordar bloques de eventos en un **subflujo de PRNG propio**, derivado de la semilla, de modo que añadir eventos no altere los identificadores ni las cifras de los eventos preexistentes.
- **FR-034**: el escenario DEBE incluir `bucket_benchmark_asset_id` y los tres umbrales del cubo, valoraciones periódicas del índice desde el primer evento del cubo, al menos seis tesis cerradas (con ganancias y pérdidas, alguna con dos compras en fechas distintas), dos tesis abiertas y una recompra dentro de la ventana tras una venta con pérdida.
- **FR-035**: el *golden file* y su instantánea DEBEN regenerarse **una sola vez**, en un commit propio cuyo mensaje enumere las diferencias verificadas frente al fichero anterior, y volver a congelarse; los invariantes de la 003 DEBEN seguir verdes.

**Bloque 0 — correcciones del tercer *challenge* (§3.0 bis, ADR-0018)**

- **FR-040**: `asset_type` DEBE admitir `etf`, con `trade_date` como `fiscal_date_rule` por defecto y `"2m"` como `wash_sale_window` por defecto.
- **FR-041**: `fiscal_date_rule`, `wash_sale_window` y la forma antigua `wash_sale_window_days` DEBEN validarse como mapas **parciales**: un tipo ausente es válido y toma su valor por defecto documentado; un valor presente e inválido se sigue rechazando. `settingsAt` DEBE completarlos al leer, y toda derivación (fecha fiscal, ventana de recompra) DEBE resolver el valor por defecto en el punto de uso, nunca degradar a la otra rama por un `undefined`.
- **FR-042**: `valuation`, `cash_deposit`, `cash_withdrawal` y `standalone_fee` DEBEN admitir `fx_rate_date?`, validado como el resto (fecha válida y nunca en fin de semana), con su flag en la CLI.
- **FR-043**: los tres cambios son **compatibles** (ADR-0018): no tocan `schema_version` y **no** DEBEN cambiar el *golden* ni su instantánea.

**Una sola puerta para los precios (§3.0 ter, decisión (j))**

- **FR-044**: DEBE existir **una única** función de lectura de precio que reciba activo y fecha y devuelva el precio con su **origen**, su fecha y su antigüedad, con un **parámetro opcional de fuente externa** que hoy nadie pasa, y con la precedencia documentada **manual por delante de automático**.
- **FR-045**: ninguna proyección fuera de ese módulo DEBE leer `state.valuations` para obtener un precio; un test lo fija. El comportamiento actual de las proyecciones de la Fase 2 no cambia.

**Aviso de ejercicio movido (§3.5 bis)**

- **FR-046**: `atlas settings set` DEBE comparar las ganancias realizadas por ejercicio del mismo libro con la configuración vigente y con la nueva, listar los **ejercicios anteriores al del reloj** cuyo total cambie —con las dos cifras— y pedir confirmación, satisfecha con `--yes`; **no** bloquea el cambio.

**Transversales**

- **FR-036**: ninguna proyección de esta feature DEBE mezclar `core` y `bucket` salvo `netWorth`, que lo hace **siempre desglosado** y por mandato expreso de la constitución III (excepción 2).
- **FR-037**: ningún precio DEBE influir en un cálculo fiscal (constitución II) y ningún precio ausente DEBE sustituirse por cero, interpolarse ni estimarse (constitución V).
- **FR-038**: los mensajes del dominio DEBEN escribirse en inglés y la CLI DEBE traducirlos por su `code` (contrato de `errors.ts`).
- **FR-039**: `packages/domain` DEBE mantener el 100 % de cobertura de líneas y ramas, sin dependencias nuevas (`docs/dependencies.md` es lista cerrada).

### Entidades clave

- **`NetWorth`**: fecha, bloque del núcleo (total, subtotales por clase, parcialidad), bloque del cubo (filas por cuenta y activo, total, parcialidad), bloque de efectivo (filas por cuenta y divisa con importe original, tipo aplicado, fecha del tipo y EUR), total, marca de parcialidad, listas de lo que falta y avisos.
- **`CashLine`**: cuenta, divisa, saldo original, tipo de cambio aplicado con su fecha, su antigüedad, su marca `stale` y su evento de origen, y el equivalente en EUR (ausente si no hay tipo).
- **`AssetPrice`** (la puerta única de §3.0 ter): valor unitario en divisa y en euros, divisa, tipo BCE, fecha del precio, antigüedad, marca `stale` y **origen** (`manual` hoy; `external` cuando la Fase 4 pase la fuente opcional).
- **`ContaminatedThesis`**: tesis excluida de las estadísticas, con el motivo (`foreign_lots`) y los lotes ajenos que consumieron sus ventas.
- **`FiscalYearImpact`**: ejercicio anterior cuyo total de ganancias realizadas cambia con la configuración nueva, con la cifra antes y después.
- **`BucketPosition`**: cuenta, activo, cantidad, coste medio y coste total en EUR, precio manual (o su ausencia), valor, P&L latente en EUR y en porcentaje, tesis asociada, días abierta, plazo previsto, marca de plazo superado y condición de invalidación.
- **`BucketThesisView`**: la tesis (`ThesisView`) más `benchmark_equivalent_eur`, `result_vs_index_eur`, el P&L latente de su posición viva y la lista de precios del índice que faltan.
- **`BucketStats`**: tesis cerradas, ventas, tasa de acierto, ganancia media, pérdida media, esperanza, comisiones y capital operado con su porcentaje, máxima caída con pico y valle, agregado frente al índice y número de tesis sin comparación.
- **`BucketControls`**: aporte acumulado, presupuesto previsto, pérdida acumulada, peso sobre el patrimonio y los avisos de las reglas 17 y 18.
- **`WashSaleWindowEnd`**: último día de la ventana de recompra para una fecha fiscal y un tipo de activo, contado de fecha a fecha.
- **`Settings.bucket_benchmark_asset_id`**: `asset_id` del índice de referencia del cubo (regla 16).

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: el usuario ve, en **un solo comando**, todas las posiciones vivas del cubo con su P&L latente, su condición de invalidación y sus días abierta, sin escribir nada en el libro.
- **SC-002**: para cada tesis con datos de índice, el usuario sabe cuánto ha ganado **frente a la alternativa aburrida**, con una fórmula que puede reproducir a mano con los precios del libro.
- **SC-003**: cero casos de cifra inventada: un precio, un tipo de cambio o un precio del índice que falta produce siempre "sin dato" y un aviso que nombra lo que falta, nunca un cero, una interpolación ni un total parcial presentado como completo.
- **SC-004**: el patrimonio total nunca se muestra como un número único: los tres bloques aparecen siempre, y ninguna otra vista de la aplicación suma los dos libros.
- **SC-005**: una recompra dentro de la ventana avisa **antes** de confirmar el registro, en los dos libros, con el último día de la ventana calculado de fecha a fecha; una recompra un día después no avisa.
- **SC-006**: añadir un bloque de eventos al generador deja intactos los identificadores y las cifras de todos los eventos anteriores; el diff del *golden* se revisa entero de un vistazo y su commit enumera todas las diferencias.
- **SC-007**: `atlas bucket`, `atlas networth` y `atlas thesis show` funcionan sobre el *golden* regenerado y `atlas check --deep` no reporta ningún error.
- **SC-008**: `packages/domain` mantiene el 100 % de cobertura de líneas y ramas; `lint`, `typecheck`, `test` y `build` verdes desde cero, sin dependencias nuevas.
- **SC-009**: el bloque 0 no cambia **ni un byte** del *golden* ni de su instantánea, y una línea `settings_changed` escrita antes de que existiera `etf` sigue siendo válida y legible.
- **SC-010**: existe **un solo sitio** en todo el código donde se decide qué precio tiene un activo en una fecha; la Fase 4 podrá añadir la fuente automática sin tocar ninguna proyección.
- **SC-011**: ninguna estadística del cubo promedia un resultado que el FIFO global ha contaminado; las excluidas se cuentan y se explican.

## Supuestos

- **A1 — Qué es el "valor latente" de la fórmula de la regla 16 (Q1, resuelta: el prompt se ha corregido).** El prompt §3.3 define `result_vs_index_eur = (result_eur + valor_latente) − (benchmark_equivalent_eur − invested_eur)` y llama a `valor_latente` "el valor actual de la posición viva". Tomado literalmente, una tesis abierta que rinde **exactamente** lo mismo que el índice daría `result_vs_index_eur = invested_eur` en vez de cero, y las dos propiedades que el propio prompt exige en §3.9 fallarían. Se toma **la plusvalía latente** (valor actual − coste de la posición viva), con la que ambas propiedades se cumplen y el caso cerrado da idéntico resultado.
- **A2 — `P(d)` se toma en euros (Q2, confirmada).** `ManualPrice` ofrece el valor unitario en su divisa y en EUR. Como los costes de las compras están en EUR, el cociente `P(d_fin)/P(d_i)` se calcula con `unit_value_eur`: mide lo que habría hecho el dinero **del inversor**, divisa incluida. Con un índice en euros —el caso normal— ambas opciones coinciden.
- **A3 — Coste medio de una posición del cubo.** Coste unitario medio = Σ coste de los **lotes abiertos** del activo / Σ cantidad de esos lotes (los lotes son globales por activo, ADR-0009); el coste de la fila es ese coste unitario × la cantidad de la fila. Con el activo en una sola cuenta —lo que garantiza la regla 21 entre libros— coincide con el coste de la cuenta.
- **A4 — Resultado de una tesis para las estadísticas.** Es su `result_eur` (realizado). Una tesis cerrada con posición viva ya tiene su aviso desde la 002; su plusvalía latente se informa en las posiciones abiertas, no se suma a las estadísticas de tesis cerradas.
- **A5 — La ventana incluye sus extremos.** `fecha fiscal de la venta + W` es el último día que avisa hacia delante y `fecha fiscal de la venta − W` el primero hacia atrás, contados de fecha a fecha y con el día inexistente llevado al último del mes (`docs/fiscal-questions.md` #14, valor por defecto documentado). Un día más allá, en cualquiera de los dos sentidos, no avisa.
- **A6 — Las dos mitades de la ventana avisan (Q3, respondida: cambia el supuesto inicial).** `wash_sale_window_repurchase` al registrar la compra posterior a una venta con pérdida, y `wash_sale_window_prior_buy` al registrar una venta con pérdida con compras del mismo activo en la ventana anterior. El cálculo es el mismo y la segunda llega cuando el usuario todavía puede decidir. Cuantificar el diferimiento sigue siendo de la Fase 5.
- **A7 — Aporte acumulado al cubo.** El que evalúan las reglas 17 y 18 es el **bruto**: Σ `cash_deposit` de las cuentas del libro `bucket`, convertido a EUR con el `fx_rate` de cada evento, **sin restar las retiradas** (una retirada no devuelve margen para volver a arriesgar; regla 19). El **neto** (bruto − retiradas) se calcula y se muestra etiquetado aparte. No entran ventas, dividendos ni intereses: son resultado del cubo, no aportación a él.
- **A8 — Meses transcurridos para el presupuesto.** Meses naturales completos entre la fecha del **primer evento del cubo** (la más antigua de sus fechas de negocio) y la fecha consultada, más uno, de modo que el primer mes ya cuenta con presupuesto.
- **A9 — `atlas thesis list` pasa a usar `--date` (Q4, confirmada).** Hoy acepta `--at` y **no** proyecta con `asOf`. Se unifica con el resto de vistas: `--date`, validado como fecha y propagado como `asOf`; `--at` pasa a dar un error de uso que remite al nuevo, como se hizo con `--wash-sale-window-days` en la 004.
- **A10 — Tipo de cambio del efectivo.** Se guarda al proyectar el **último tipo conocido por divisa** (no por cuenta): cualquier evento de la pasada B que declare un par divisa/tipo lo registra, de modo que un `buy` en dólares da tipo al efectivo en dólares de cualquier cuenta. La fecha mostrada es su `fx_rate_date` cuando el evento lo trae (bloque 0) y, si no, la fecha de negocio del evento, dicho así en la propia fila. El caso sin tipo conocido existe de verdad: la comisión de un `fx_exchange` puede pagarse en una divisa que no es ni la vendida ni la comprada, y entonces ese saldo se mueve sin ningún tipo asociado.
- **A11 — Capital operado incluye la comisión de compra.** `Σ coste de sus buy` es el coste de adquisición tal como lo define `docs/data-schema.md` §8.1 (comisión incluida), que es lo que ya significa `invested_eur` en una tesis. Se usa el mismo número en las dos vistas para que no haya dos "invertido" distintos.
- **A12 — Fecha por defecto.** Hoy en `Europe/Madrid` cuando no se pasa `--date`, como el resto de consultas.
- **A13 — Sin cambios en `docs/`.** Todo lo que esta feature implementa ya está escrito en `docs/`; cualquier desajuste se anota en `questions.md` en vez de corregir el documento (regla del prompt §2 bis).
- **A14 — Dónde se resuelve el valor por defecto de un mapa parcial.** En el **punto de uso** (derivación de la fecha fiscal y de la ventana de recompra) y en `settingsAt` al leer. **No** en `state.fiscalSettings` ni en `settingsHistory`, que conservan literalmente lo que dice la línea: así la instantánea del *golden* no cambia por una tolerancia de lectura, igual que se decidió con `normalizeSettings` en la 004.
- **A15 — El generador conserva sus mapas de configuración tal cual.** `scenario.ts` deja de heredar los mapas de `DEFAULT_SETTINGS` y los declara explícitamente con los mismos seis tipos que escribe hoy, byte por byte. Así `DEFAULT_SETTINGS` puede ganar `etf` sin tocar el *golden*, y el libro sintético pasa a ser, de propina, la prueba de regresión de los mapas parciales: una configuración escrita antes de que `etf` existiera.
- **A16 — La fuente externa de precios es un dato, no un puerto.** El parámetro opcional de §3.0 ter es una **consulta pura y síncrona** (precios ya cargados en memoria), no el puerto `PriceSource` de ADR-0007, que es cosa de `packages/adapters` y de la Fase 4. El dominio sigue sin E/S.
- **A17 — Tesis contaminada (Q6, confirmada).** Una tesis cerrada está contaminada si alguno de los lotes que consumieron sus ventas no procede, siguiendo el linaje `source_lot_id` hasta la raíz, de una compra enlazada a ella misma. Cubre los dos casos reales: el FIFO que consume los restos de una tesis anterior sobre el mismo activo y la tesis sin compras propias que vende lotes heredados de un canje. Se excluye de las medias, no de la lista de tesis: sigue viéndose, con su marca.
- **A18 — El aviso de ejercicio movido compara totales por ejercicio.** Se reproyecta el mismo libro con la configuración vigente y con la nueva y se comparan los totales de ganancias realizadas por ejercicio, redondeados a céntimos. Solo se listan los ejercicios **anteriores** al del reloj, porque el libro todavía no sabe cuáles se han declarado (evento `tax_return_filed`, Ronda 9).
