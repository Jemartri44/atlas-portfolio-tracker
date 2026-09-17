# Prompt 005 — Feature `005-bucket-tracking`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/005-bucket-tracking.md` en el repositorio. Parte de `develop` con la Fase 2 fusionada (PR #23).

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir la **Fase 3**: el seguimiento del **cubo especulativo**. Es el libro con más funcionalidad propia porque es donde el usuario aprende: cada tesis se mide contra la alternativa aburrida (el índice), las comisiones se miran de frente, y las reglas de control avisan antes de que el cubo crezca más de lo previsto. Con ella llega también la vista de **patrimonio total** desglosado, que la especificación exige y que la regla 18 necesita. Todo con precios manuales: no hay fuentes automáticas hasta la Fase 4.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Portfolio nomenclature*, *Code architecture*, *Working on a feature*, *Domain traps* y *Design principles*.
2. `.specify/memory/constitution.md` (v1.5.0: III con sus **dos** excepciones acotadas, II, IV, V y VII).
3. `docs/adr/README.md` y los ADRs 0004 (efectivo derivado), 0005 (dinero), 0009 (FIFO global), 0013 y 0014 (fecha fiscal y ventana de recompra de fecha a fecha), 0015 (proyección degradada).
4. `docs/business-rules.md` §4 completo (reglas 13-20 del cubo, con la nota de la regla 18), §1, §5.4 (regla de recompra) y §7 (tabla de parámetros).
5. `docs/specification.md` §6.2 (el cubo, punto por punto: es tu lista de la compra), §3.2 y §5.
6. `docs/data-schema.md` §6.1 (`settings_changed`), §6.4 (tesis), §7 (tabla de proyecciones, con las filas nuevas de esta feature) y §8.4.
7. `specs/004-monthly-contribution/` entero: es el código sobre el que construyes (`manualPrices`, `coreWeights`, `costSummary`, el patrón de proyección degradada y de fallo seguro ante un precio ausente). Y `specs/003-synthetic-data/` para el generador y el *golden file*.
8. En el código: `packages/domain/src/projections/{theses,prices,weights,costs,gains,positions,cash,state}.ts`, `settings/settings.ts`, `apps/cli/src/commands/{thesis,portfolio,query}.ts`, y `packages/domain/src/synth/scenario.ts`.
9. `docs/dependencies.md` (lista cerrada; esta feature no añade nada).

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/005-bucket-tracking/questions.md` y avisa. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-005 -b feature/005-bucket-tracking origin/develop
   cd ../atlas-portfolio-tracker-005 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` con el alcance de la sección 3 → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`. Artefactos en `specs/005-bucket-tracking/`, en español con identificadores en inglés. **Enseña `spec.md` y `plan.md` y espera el visto bueno antes de escribir código.**
3. Al planificar, mira cómo miden la operativa las herramientas del ramo: el *trade journal* de Portfolio Performance y las métricas por operación de Ghostfolio (tasa de acierto, esperanza, *drawdown*). Anota en `plan.md` qué cubren ellos y nuestro §3 no, y por qué queda fuera. No copies código.
4. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés (el hook los valida).
5. PR a `develop` con la plantilla, checklist rellena con honestidad. No fusiones: la dirección revisa y fusiona.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las de `docs/prompts/001-ledger-core.md` §2 bis, vigentes íntegras: solo tu rama, nunca push a `develop`/`main`, `docs/` intocable (dudas a `questions.md`), sin dependencias nuevas, cobertura 100 % de líneas y ramas en `packages/domain`, Biome limpio **antes de cada commit** (`npm run lint`, no solo al final), inglés en el código y español en specs y mensajes de la CLI.

Dos recordatorios que esta feature pone a prueba:

- **Ningún cálculo fiscal puede depender de un precio** (constitución II). Aquí se manejan precios por todas partes: P&L latente, comparación con el índice, patrimonio. Nada de eso puede tocar `gains.ts`, `lots.ts` ni `income.ts`, y un test de arquitectura debe fijarlo.
- **Fallo seguro** (constitución V): un precio que falta produce "sin dato" y un aviso, **nunca** un cero, una interpolación ni un total parcial presentado como completo. La 004 ya fijó ese patrón; síguelo literalmente.

## 3. Alcance

### 3.0 Configuración nueva (`Settings`)

- `bucket_benchmark_asset_id?`: el activo que hace de índice de referencia del cubo (regla 16). Es un `asset_id` del catálogo; puede ser de cualquier libro (normalmente el fondo global del núcleo) y **no** participa en ningún cálculo del cubo salvo como referencia de rendimiento. Sin él, las comparaciones con el índice salen "sin dato" con un aviso, nunca un cero.
- Los umbrales de las reglas 17 y 18 ya existen en `Settings` y siguen siendo opcionales: `bucket_max_cumulative_contribution`, `bucket_stop_loss_pct`, `bucket_max_weight_pct`. Sin el parámetro, su aviso **no se evalúa** (nunca un valor por defecto inventado, constitución IV).
- `atlas settings set` gana `--bucket-benchmark-asset`. Valida que el activo exista en el catálogo al proyectar (aviso `unknown_benchmark_asset`, no rechazo: el catálogo puede cambiar después).

### 3.1 Patrimonio total (`netWorth`, `atlas networth`)

`netWorth(state, date, settings)`: valor del **núcleo** (reutiliza `coreWeights`), valor del **cubo** (posiciones físicas × precio manual) y **efectivo** por cuenta y divisa convertido a EUR con el `fx_rate` de la última operación que lo movió —si una divisa no tiene tipo conocido, esa línea sale "sin convertir" y el total se marca parcial—. Devuelve los tres bloques **siempre desglosados** y el total, con marca de parcialidad y la lista de lo que falta.

Es la única vista que suma los dos libros, y lo hace por mandato de la especificación (§3.2: "el patrimonio total siempre se muestra desglosado"). Cumple la constitución III porque **nunca** presenta un único número sin descomponer y porque no alimenta ningún peso objetivo. CLI: `atlas networth [--date]`, con una fila por libro y por divisa de efectivo, el total al pie y los avisos.

### 3.2 Posiciones abiertas del cubo (`bucketPositions`)

Por cada par (cuenta `bucket`, activo) con posición física > 0 a la fecha: cantidad, coste medio en EUR (desde los lotes fiscales del activo, que son globales pero en el cubo coinciden con la cuenta por la regla 21), precio manual con su antigüedad y marca `stale`, valor en EUR, **P&L latente** en EUR y en porcentaje, la tesis abierta asociada (si la hay), sus **días abierta**, si ha **superado el plazo esperado** (`expected_horizon_days`) y su **condición de invalidación** como recordatorio visible (especificación §6.2). Sin precio: fila "sin precio", P&L "sin dato", aviso.

### 3.3 Tesis medidas contra el índice (regla 16)

Amplía `theses()` (o una proyección nueva que la envuelva, como prefieras) con:

- `benchmark_equivalent_eur`: qué valdría hoy —o en la fecha de cierre— el mismo dinero puesto en el índice el día que se puso en el activo. Definición exacta, para que sea reproducible: `Σ_compras coste_i × P(d_fin) / P(d_i)`, donde `coste_i` y `d_i` son el coste en EUR y la `fiscal_date` de cada `buy` enlazado, `P(d)` es el precio manual del `bucket_benchmark_asset_id` en la fecha `d` (última `valuation` con `date ≤ d`, como en `manualPrices`) y `d_fin` es la `fiscal_date` de la última venta enlazada si la tesis está cerrada, o la fecha consultada si sigue abierta.
- `result_vs_index_eur` = resultado de la tesis − resultado del índice = `(result_eur + valor_latente) − (benchmark_equivalent_eur − invested_eur)`, donde `valor_latente` es el valor actual de la posición viva de la tesis (cero si está cerrada y sin posición).
- **Si falta cualquier `P(d)` necesaria** (no hay `valuation` del índice en o antes de esa fecha, o no hay índice configurado): los dos campos salen `undefined` y se lista el activo y la fecha que faltan. Nunca se estima.
- Redondeo a céntimos solo en la salida, una vez (ADR-0005). Todo esto es informativo: no toca lotes, ni ganancias, ni fechas fiscales.

### 3.4 Estadísticas de operativa (`bucketStats`)

Sobre las **tesis cerradas** (la unidad de decisión del usuario) y sobre las ventas del cubo:

- Número de tesis cerradas y número de operaciones de venta, con el **aviso de significancia** por debajo de 100 operaciones (especificación §6.2: por debajo de esa muestra no se distingue habilidad de suerte).
- **Tasa de acierto** (tesis cerradas con resultado > 0 sobre el total), **ganancia media** de las positivas, **pérdida media** de las negativas y **esperanza matemática** por tesis (media de todas), todo en EUR exactos y redondeado una vez en la salida.
- **Comisiones acumuladas sobre capital operado** (regla 14): `Σ fees_eur de los buy y sell del cubo / Σ coste de sus buy`, en porcentaje, con los dos importes a la vista. Es la métrica que el plan llama la más reveladora: sale destacada, no en una esquina.
- **Máxima caída del resultado realizado acumulado**: ordena las ventas del cubo por `fiscal_date` (desempate por posición en el fichero), acumula `gain_eur` y devuelve la mayor caída desde un máximo previo, con las fechas del pico y del valle. Se calcula **solo desde el libro**, sin precios, así que es exacta; la curva de valor con precios es de la web (Ronda 7).
- **Resultado agregado frente al índice**: suma de `result_vs_index_eur` de las tesis que lo tienen, y cuántas quedaron sin dato.

### 3.5 Reglas de control (17, 18 y presupuesto)

Avisos, nunca rechazos, devueltos en la estructura de la proyección (no en `state.warnings`: el libro es válido), con el patrón que fijó la 004:

- `bucket_contribution_exceeded`: aporte acumulado al cubo (Σ `cash_deposit` − Σ `cash_withdrawal` de sus cuentas) por encima de `bucket_max_cumulative_contribution`; y `bucket_contribution_near_limit` al pasar del 80 % (umbral fijo relativo, no configurable: es el "aviso al acercarse" de la regla 17).
- `bucket_stop_loss_reached`: pérdida acumulada del cubo (realizada + latente) por encima de `bucket_stop_loss_pct` del aporte acumulado. La especificación pide "bloqueo visible al superarlo": en la CLI es un aviso destacado en `atlas bucket` y en `atlas add buy` cuando la cuenta es del cubo; **no** se bloquea el registro (el libro nunca rechaza un hecho que ocurrió).
- `bucket_weight_exceeded`: peso del cubo sobre el patrimonio total (§3.1) por encima de `bucket_max_weight_pct` (regla 18).
- Aporte acumulado **frente al presupuesto previsto**: `bucket_pct_of_contribution × monthly_contribution_eur × meses transcurridos` desde el primer evento del cubo, como referencia informativa. Si falta cualquiera de los dos parámetros, no se calcula.

### 3.6 Aviso de recompra (regla de los dos meses)

Al registrar un `buy` de un activo que se vendió **con pérdida** dentro de la ventana `wash_sale_window[asset_type]` (ADR-0014, contada **de fecha a fecha** en meses o años naturales: implementa la aritmética de calendario en `dates/civil-date.ts`, con el fin de mes al último día cuando el día no existe), avisa: `wash_sale_window_repurchase`, con el evento de la venta, su pérdida y el último día de la ventana. Vale para los dos libros (la regla es fiscal, no del cubo), y aparece también en `atlas check`.

**Esto es solo el aviso.** El diferimiento de la pérdida, su reparto entre los lotes recomprados y el viaje del diferimiento a través de traspasos y canjes (ADR-0014) son del motor fiscal, Fase 5. No los implementes aquí ni prepares estructuras para ellos.

### 3.7 CLI

- `atlas bucket [--date] [--json]`: la vista del cubo en un comando — posiciones abiertas con P&L latente y recordatorio de invalidación (§3.2), tesis abiertas y cerradas con su resultado frente al índice (§3.3), las estadísticas de §3.4 con las comisiones sobre capital operado destacadas, y los avisos de §3.5.
- `atlas thesis show <thesis_id> [--date]`: el detalle de una tesis — hipótesis, plazo, invalidación, tamaño previsto frente a lo realmente invertido, sus `buy`/`sell` enlazados con fechas e importes, resultado, comparación con el índice y días abierta.
- `atlas networth [--date]` (§3.1).
- `atlas thesis list` gana las columnas de resultado frente al índice y días abierta; todos los comandos nuevos son de **solo lectura**, con proyección degradada y cabecera de aviso, y con el sobre `{ invalid_count, data }` en `--json`, como el resto.

### 3.8 Generador sintético y *golden file*

El escenario actual tiene tres tesis (dos cerradas, una abierta) y ninguna valoración del índice de referencia, así que las métricas nuevas saldrían casi todas "sin dato". Amplíalo con: `settings_changed` que fije `bucket_benchmark_asset_id` al fondo global y los tres umbrales del cubo; `valuation` periódicas (anuales o semestrales) del activo de referencia desde el primer evento del cubo, para que las comparaciones con el índice tengan datos; al menos **seis tesis cerradas** (mezcla de ganancias y pérdidas, alguna con dos compras en fechas distintas) y dos abiertas; y una recompra dentro de la ventana tras una venta con pérdida, para el aviso de §3.6.

**Antes de tocar el escenario, arregla el sorteo.** Hoy todos los valores del generador salen del mismo flujo del PRNG, así que **cualquier** evento nuevo vuelve a sortear los ULIDs, los importes y las fechas de todo lo que viene después: la regeneración de la feature 004 cambió 116 de los 160 ids y dejó el diff ilegible. Da a las `valuation` (y a cualquier bloque que añadas en medio) **su propio subflujo de PRNG** —un `Prng` derivado de la semilla con otra constante, o sortéalas al final del escenario— de modo que los eventos preexistentes conserven sus ids y sus cifras y el diff del *golden* se pueda revisar de un vistazo. Es requisito de esta feature, no una mejora opcional: sin él, la siguiente regeneración vuelve a ser un acto de fe.

Regenera el *golden* **una sola vez, en un commit propio y justificado**, y vuelve a congelarlo. Antes de hacerlo, **verifica y anota en el mensaje del commit** que las únicas diferencias respecto al fichero anterior son las que declaras: compara el fichero antiguo y el nuevo con un script en tu scratchpad y enumera los cambios por tipo de evento. Una regeneración que tape un cambio de proyección es el peor defecto posible de esta feature.

### 3.9 Tests (constitución VII)

- **Propiedades** (`fast-check`): `result_vs_index_eur` es cero cuando el activo y el índice tienen exactamente el mismo rendimiento en el periodo; la máxima caída nunca es negativa y es cero si no hay pérdidas; la tasa de acierto está en `[0, 1]`; la esperanza es la media de ganancia y pérdida ponderada por su frecuencia; el P&L latente más el resultado realizado de una tesis es igual a (valor actual + cobros) − coste, exacto.
- **Casos límite obligatorios**: tesis sin índice configurado y con índice sin valoraciones (las dos, "sin dato" y aviso); tesis con una compra anterior a la primera `valuation` del índice (sin dato); tesis abierta sin precio del activo (P&L sin dato, la tesis sigue listándose); tesis cerrada con posición viva (aviso ya existente de la 002); cubo con cero operaciones (estadísticas vacías, sin divisiones por cero); una sola tesis cerrada (medias bien definidas, esperanza = su resultado); todas las tesis con pérdida (ganancia media "sin dato", no cero); umbrales no configurados (ningún aviso); umbral exactamente en el límite (no dispara: la regla es "por encima"); patrimonio con una divisa de efectivo sin tipo conocido (parcial); recompra el último día de la ventana (avisa) y el día siguiente (no avisa), en fondo (un año) y en acción (dos meses), incluido el caso del 31 de enero más un mes.
- **Arquitectura**: un test que falle si `gains.ts`, `lots.ts`, `income.ts` u `operations.ts` importan las proyecciones de precios o del cubo.
- Prueba a mano el `quickstart.md` con el binario compilado sobre el *golden* regenerado y anota las desviaciones.

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Gráficas, histogramas, curvas de valor y líneas temporales (son de la web, Ronda 7: esta feature deja los **datos** listos, no el dibujo); rendimiento por plazo, por tamaño o por tipo de hipótesis (necesita una taxonomía de hipótesis que no existe); precios automáticos y `PriceSource` (Fase 4); el diferimiento de la regla de recompra y cualquier cálculo fiscal (Fase 5); avisos de los Modelos 720/721 (Fase 4); importadores; API; web; Terraform; cambios de esquema que no sean los `Settings` de §3.0.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`), `build` y CI en verde; `npm run clean && npm run build` desde cero.
- `atlas bucket`, `atlas thesis show`, `atlas networth` funcionando sobre el *golden* regenerado, y `atlas check --deep` limpio.
- `docs/` sin cambios (si algo no encaja, es una pregunta).
- README: sección breve de la Fase 3 con un ejemplo (`thesis open` → `add buy` → `bucket`).
- `specs/005-bucket-tracking/questions.md` con lo que hayas preguntado (o vacío, dicho explícitamente) y las notas de implementación.
- PR a `develop` con la checklist de la constitución.

## 6. Decisiones fijadas por este prompt

Reflejadas en `docs/business-rules.md`, `docs/data-schema.md` §7 y la constitución v1.5.0 en `develop`. Si el código que encuentras no coincide, manda el documento.

- **(a) El índice de referencia es un `asset_id` configurable** (`bucket_benchmark_asset_id`), no una lista de precios aparte ni un activo especial: así el usuario registra sus valoraciones con el mismo `atlas add valuation` que todo lo demás.
- **(b) Fórmula del equivalente en índice**: `Σ_compras coste_i × P(d_fin) / P(d_i)`, con los precios manuales del índice y sin ponderación temporal adicional. Es reproducible a mano, que es lo que importa en una métrica de aprendizaje. Si falta un precio, no hay dato.
- **(c) El patrimonio total es la única vista que suma los dos libros**, siempre desglosada, y es una excepción acotada y escrita de la constitución III (la otra es la salida fiscal de la Fase 5). No alimenta pesos objetivo ni ninguna métrica del núcleo.
- **(d) Las estadísticas se calculan sobre tesis cerradas**, no sobre operaciones sueltas: la tesis es la unidad de decisión (regla 15). El número de ventas se informa aparte para la significancia estadística.
- **(e) La máxima caída se calcula solo desde el libro** (resultado realizado acumulado), sin precios: exacta y disponible ya. La curva de valor con precios llega con la web.
- **(f) La regla de parada avisa, no bloquea el registro**: el libro nunca rechaza un hecho que ya ocurrió (ADR-0003). El "bloqueo visible" de la especificación es un aviso destacado, y en la web será una barrera de interfaz.
- **(g) El aviso de recompra entra ahora; el diferimiento, no.** La ventana de fecha a fecha (ADR-0014) hace falta para el aviso, así que su aritmética de calendario se implementa aquí y el motor fiscal de la Fase 5 la reutiliza.
- **(h) Los avisos de consulta viven en la estructura devuelta**, no en `state.warnings`: el libro es válido y el *golden* no debe cambiar por ellos (patrón de la 004).
