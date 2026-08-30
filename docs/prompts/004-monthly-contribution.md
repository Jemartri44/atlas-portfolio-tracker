# Prompt 004 — Feature `004-monthly-contribution`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/004-monthly-contribution.md` en el repositorio. Parte de `develop` con la Fase 1 fusionada (PRs #10-#18) y el triaje del segundo *challenge* aplicado a los documentos (PR #20).

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir la **Fase 2**: los pesos del núcleo con precios manuales, la calculadora de la aportación mensual, el simulador de traspaso y los avisos de umbral. Antes, un **bloque 0** con las correcciones que dejó el segundo *challenge* externo (2026-08-31): son pequeñas, tocan validación y CLI, y el resto de la feature se apoya en ellas. Las decisiones están tomadas y documentadas; tu trabajo es implementarlas con exactitud, no rediseñarlas.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Working on a feature*, *Domain traps* y *Design principles* (compartimentación y su única excepción).
2. `.specify/memory/constitution.md` (v1.4.0: III con la excepción fiscal, IV, V y VII).
3. `docs/adr/README.md` y los ADRs 0004, 0005, 0009, 0012, 0013, **0014** (ventana de fecha a fecha y linaje del diferimiento) y **0015** (proyección degradada y `settings_changed`): los dos últimos son los centrales del bloque 0.
4. `docs/data-schema.md`: §4 (validaciones nuevas de `fx_rate` y `fx_rate_date`), §6.1 (`settings_changed` y su regla de aceptación), §6.2 (`transfer` sin comisión, `dividend.source_country?`, `valuation`), §7 (proyecciones) y §8.4 (forma `wash_sale_window`).
5. `docs/business-rules.md` §1, §2 (reglas 1-6b), §5 (encabezado y §5.4) y §7 (tabla de parámetros); `docs/specification.md` §5 y §6.1; `docs/fiscal-questions.md` (14-16 son provisionales: no cierres nada fiscal).
6. `specs/001-ledger-core/`, `specs/002-corporate-actions/` y `specs/003-synthetic-data/`: los `questions.md` (notas de implementación) son el historial de decisiones de detalle.
7. En el código: `packages/domain/src/schema/validate.ts`, `settings/settings.ts`, `projections/{operations,project-ledger,valuations,state}.ts`, `usecases/record-event.ts`, `synth/` (el generador que vas a retocar), `apps/cli/src/commands/{query,catalogue,shared}.ts`, y el golden `tests/fixtures/ledger/synthetic-v1.jsonl` con su `.snapshot.json`.
8. `docs/dependencies.md` (lista cerrada; esta feature no añade nada).

Si encuentras una contradicción o una ambigüedad que te impida seguir, **no la resuelvas tú**: anótala en `specs/004-monthly-contribution/questions.md` y avisa al usuario. Nada fiscal ni estructural se decide en esta feature.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado** (después de fusionar la PR #20):
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-004 -b feature/004-monthly-contribution origin/develop
   cd ../atlas-portfolio-tracker-004 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` con el alcance de la sección 3 → `/speckit-clarify` si hace falta → `/speckit-plan` → `/speckit-tasks`. Artefactos en `specs/004-monthly-contribution/`, en español con identificadores en inglés. **Enseña `spec.md` y `plan.md` al usuario y espera su visto bueno antes de escribir código.**
3. Al planificar, lee cómo Ghostfolio calcula la asignación por clase y las diferencias contra los pesos objetivo (su módulo de *allocations*/*rebalance*) y cómo Portfolio Performance presenta la vista de rebalanceo por taxonomías. Anota en `plan.md` qué cubren ellos y nuestro §3 no. No copies código.
4. `/speckit-implement` por tareas, commits atómicos, Conventional Commits en inglés (el hook los valida).
5. PR a `develop` con la plantilla, checklist rellena con honestidad. No fusiones.

## 2 bis. Reglas de operación

Las de `CLAUDE.md` § *Working on a feature* y las de `docs/prompts/001-ledger-core.md` §2 bis, vigentes íntegras: solo tu rama, nunca push a `develop`/`main`, `docs/` intocable (dudas a `questions.md`), sin dependencias nuevas, cobertura 100 % en `packages/domain`, Biome limpio, inglés en el código y español en specs y mensajes de la CLI. La compartimentación es sagrada: **nada de esta feature mezcla núcleo y cubo** (la excepción fiscal de la constitución III es de la Fase 5, no tuya).

## 3. Alcance

### 3.0 Bloque 0 — correcciones del *challenge* (los documentos ya están en `develop`; alinea el código)

1. **`wash_sale_window`** (ADR-0014, `data-schema.md` §8.4): campo nuevo de `Settings` con valores `"2m"`, `"1y"` o `"<n>d"` por `asset_type`; `wash_sale_window_days` (entero de días) se sigue aceptando al cargar como forma antigua y equivale a `"<n>d"`. `DEFAULT_SETTINGS` pasa a `"2m"` (cotizados) / `"1y"` (fondos, monetario, cripto). Solo `Settings` y su validación: el motor de la regla es de la Fase 5.
2. **Consultas degradadas** (ADR-0015, `data-schema.md` §6.1): todos los comandos de **solo lectura** (`positions`, `lots`, `cash`, `gains`, `income`, `valuations`, `thesis list`, `order list`, `transfer pending`, `account/asset/settings list|show`, `export`, y los nuevos de esta feature) proyectan con `collectErrors: true`; si hay eventos inválidos, imprimen una cabecera de aviso ("N eventos inválidos; ver `atlas check`") y `--json` incluye `invalid_count`. Las mutaciones siguen exigiendo un libro válido.
3. **`settings_changed` que invalida el pasado** (ADR-0015, `data-schema.md` §6.1): es el único evento que puede registrarse aunque la proyección con él deje eventos históricos inválidos. `recordEvent` gana `options.acceptInvalid`; sin él, rechaza listando los eventos que **pasan a ser** inválidos (compara los conjuntos de inválidos antes y después, como hace `reverseEvent` con los dependientes); la CLI (`atlas settings set`) muestra la lista y pide confirmación explícita (flag `--accept-invalid`; la confirmación interactiva no basta).
4. **Validaciones de `fx_rate`** (`data-schema.md` §4): en todo par (`currency`/`sold_currency`/`bought_currency`, `fx_rate`/`fx_rate_sold`/`fx_rate_bought`) del esquema, divisa `EUR` exige tipo exactamente `"1"` (rechazo `eur_fx_rate_not_one`); todo `fx_rate_date` (eventos y efectos `forced_sale`/`grant`) rechaza sábados y domingos (`fx_rate_date_weekend`). Los festivos TARGET no se validan (Ronda 6).
5. **`transfer` pierde `fee?`** (`data-schema.md` §6.2): fuera de las reglas de forma y del flag de la CLI; el mensaje de error/ayuda remite a `standalone_fee` para la comisión de un traspaso de custodia.
6. **`dividend.source_country?`** (ISO 3166-1, dos letras mayúsculas) en validación y CLI (`--source-country`).
7. **`backup` y `export`** piden confirmación si la ruta de destino cae dentro de un árbol de trabajo de git (busca `.git` hacia arriba desde el destino); con `--yes` continúan.

Endurecer la validación dentro de la v1 (puntos 4-6) es aceptable **ahora** porque no existe ningún libro real (el usuario no registra hasta que la app esté lista); anótalo en `plan.md`. El golden actual viola el punto 4 (días 1-5 del mes caen a veces en fin de semana): ver §3.7.

### 3.1 Precios manuales (`manualPrices`)

Proyección `manualPrices(state, date)`: para cada activo, la **última `valuation`** con `date ≤` la pedida (desempate: posición en el fichero), de cualquier cuenta; devuelve `unit_value`, `currency`, `fx_rate`, valor unitario en EUR (`unit_value / fx_rate`, 10 decimales), la fecha de la valoración y su **antigüedad en días**. `stale = antigüedad > settingsAt.stale_price_days` (si el parámetro no está configurado, nunca `stale`, pero la antigüedad siempre se muestra). Los precios son **informativos**: ningún cálculo fiscal los toca (constitución II); nunca se interpola ni se estima (constitución V).

### 3.2 Pesos y desviaciones del núcleo (`coreWeights`, `atlas weights`)

- `coreWeights(state, date)`: solo libro `core`; filas para los activos con posición física > 0 agregada entre cuentas **o con peso objetivo > 0** (Q1 de la 004: un objetivo sin posición es la mayor desviación posible y debe verse — fila con valor cero, peso real 0 % y desviación `−w_i`; no necesita precio y no marca el total como parcial). Por activo: cantidad, precio manual (o "sin precio"), valor EUR, peso real (%), peso objetivo (`target_weights[asset_id]`), desviación en puntos porcentuales; subtotales por `asset_class`; total del núcleo. Si algún activo con posición no tiene precio, sus filas salen como `sin precio` y el total se marca **parcial** (los pesos no se calculan sobre un total parcial: se muestran vacíos y un aviso lo explica; fallo seguro, nunca un número que parece completo).
- `target_weights` se valida al escribir `settings_changed`: claves = `asset_id`, valores decimales ≥ 0 que **suman exactamente 100**. En la proyección, una clave que no es un activo `core` del catálogo genera el aviso `unknown_target_weight`; un activo `core` con posición sin peso asignado, `asset_without_target`.
- Avisos de umbral (aparecen en `weights` y en `contribute`): `deviation_above_threshold` si |desviación| > `deviation_threshold_pp` (regla 3: recuerda que el rebalanceo por venta es decisión anual del usuario; la app solo avisa); `satellite_below_minimum` si el peso de una clase satélite (`gold`, `crypto`) es mayor que 0 e inferior a `satellite_min_weight_pct` (regla 6b). Sin el parámetro configurado, el aviso correspondiente no se evalúa.
- CLI: `atlas weights [--date YYYY-MM-DD]` (por defecto, hoy en `Europe/Madrid`): tabla por activo con subtotales por clase, precios con su antigüedad (marca `⚠` si `stale`), y los avisos al pie. `--json` con todo.

### 3.3 Calculadora de aportación (`contributionPlan`, `atlas contribute`)

- `contributionPlan(state, { amount, date })`, todo en EUR con la aritmética exacta de ADR-0005:
  1. `bucket = round2(amount × bucket_pct_of_contribution / 100)`; `core = amount − bucket`. El presupuesto del cubo se **muestra aparte** y no se asigna (regla del presupuesto; la app nunca elige valores del cubo).
  2. Sobre el núcleo: `target_i = w_i/100 × (V + core)` con `V` = valor total del núcleo a `date`; `gap_i = max(0, target_i − value_i)`.
  3. Si `Σgap ≥ core`: reparto **proporcional al déficit**, `alloc_i = core × gap_i / Σgap`. Si `Σgap < core`: cada activo recibe su `gap_i` íntegro y el sobrante se reparte por pesos objetivo (`w_i`). Un activo sin déficit solo recibe en el segundo caso.
  4. Redondeo a céntimos half-up **una vez por activo**; la suma debe dar exactamente `core`: el residuo de redondeo se ajusta en el activo de mayor déficit.
- Requisitos y fallos: `amount` sale de `--amount` o de `monthly_contribution_eur` (sin ninguno de los dos, error que remite a `atlas settings set`); exige `target_weights` y `bucket_pct_of_contribution` configurados (el cero explícito vale); **rechaza** si algún activo del núcleo **con posición** no tiene precio manual, listando las `valuation` que faltan (fallo seguro: nunca reparte sobre un total parcial); un activo con peso objetivo y sin posición participa con valor cero y no necesita precio (Q1 de la 004).
- CLI: `atlas contribute [--amount <eur>] [--date YYYY-MM-DD]`: muestra el desglose (cubo aparte, tabla del núcleo con déficit y asignación, pesos resultantes tras la aportación) y los avisos de §3.2. **No escribe nada en el libro**: la propuesta se ejecuta a mano en la plataforma y se registra con `atlas order place` / `atlas add buy`, como siempre.

### 3.4 Simulador de traspaso (`atlas transfer simulate`)

`atlas transfer simulate --from-asset <id> --to-asset <id> (--quantity <n> | --all) [--date]`: ambos activos `core` y `transferable` (si no, rechazo con el motivo); mueve en la simulación `quantity × precio_manual(from)` EUR de un activo al otro y muestra pesos antes/después con las mismas reglas de §3.2, recordando que un traspaso entre fondos no es hecho imponible (§5.2). Pura consulta: no escribe, no toca lotes, exige precios manuales de ambos activos. (La spec §6.1.1 lo pide; el `transfer` real ya existe desde la 001.)

### 3.5 Costes (`costSummary`, `atlas costs`)

- Por activo del núcleo: comisiones acumuladas en EUR (suma de `fee/fx_rate` de sus `buy`, `sell` y efectos `forced_sale` de sus `corporate_action` — una `forced_sale` es una venta a todos los efectos, ADR-0011 y Q2 de la 004; las de eventos anulados no cuentan) y en % de lo invertido (Σ coste de compras); TER (`asset.ter`, si está) y coste anual estimado en EUR (`ter × valor actual`, solo si hay precio). Agregado: TER medio ponderado por valor del núcleo y total anual estimado. Para el cubo **solo** el total de comisiones acumuladas por cuenta (la métrica de la regla 14 llega con la Fase 3; no mezcles los libros en ninguna fila).
- CLI: `atlas costs [--date]`.

### 3.6 Aviso de umbral silenciado (`atlas settings set`, constitución IV)

Al registrar un `settings_changed`, evalúa los avisos de §3.2 con la configuración **anterior** y con la **nueva** (mismo libro, misma fecha): si algún aviso activo desaparece solo por el cambio de umbral, la CLI lo lista ("este cambio silencia: deviation_above_threshold de ast_x…") y pide confirmación (vale `--yes`). Si no hay precios suficientes para evaluarlo, se dice y se sigue.

### 3.7 Generador sintético y golden

Retoca `synth/` para que el escenario cumpla el bloque 0 y alimente la Fase 2: `fx_rate_date` siempre en día laborable; `settings_changed` con la forma nueva (`wash_sale_window`, `target_weights` por `asset_id` sumando 100, `stale_price_days`, `deviation_threshold_pp`, `satellite_min_weight_pct`, `bucket_pct_of_contribution`, `monthly_contribution_eur`); el `dividend` USD con `source_country`; sin `fee` en `transfer` (ya no lo hay). **Regenera el golden una sola vez, en un commit propio** con la justificación (decisión (i) de la 003: cambio justificado del generador; el bloque 0 endurece validaciones que el golden actual viola) y congélalo de nuevo. La forma antigua de `Settings` (`wash_sale_window_days`, pesos por clase) queda cubierta por tests unitarios de `settings.ts`, no por el golden.

### 3.8 Tests (constitución VII: el reparto de la aportación es prioridad 4)

- **Propiedades** (`fast-check`): la asignación suma exactamente `core` (céntimos incluidos) para cualquier combinación de pesos, valores y aportación; ningún `alloc_i` es negativo; con `Σgap ≥ core`, ningún activo queda por **encima** de su objetivo por la aportación; tras aplicar la propuesta (simulada), la desviación máxima no crece; `manualPrices` es independiente del orden de registro de las `valuation` (decide la fecha, no la posición, salvo empate).
- **Casos límite obligatorios**: reparto con déficit cero (todo por pesos); un solo activo con déficit; aportación menor que un céntimo por activo; residuo de redondeo; activo con peso 0 y posición viva; activo sin precio (rechazo con lista); precios `stale` (aviso, no rechazo); `--amount 0` (rechazo); cubo al 0 % y al 100 %; simulador con activo no traspasable (rechazo); `settings_changed` que invalida el pasado sin `--accept-invalid` (rechazo con lista) y con él (se escribe y las consultas avisan); EUR con `fx_rate ≠ "1"` (rechazo); `fx_rate_date` en sábado (rechazo); `wash_sale_window_days` antiguo aceptado y equivalente; umbral silenciado (aviso).
- El golden regenerado pasa `check --deep` limpio y sus invariantes de la 003 (prefijos, avisos declarados, snapshot estable).

## 4. Fuera de alcance (no lo hagas aunque parezca fácil)

Motor de la regla de recompra y pérdidas diferidas (Fase 5); salida fiscal agregada (Fase 5); métricas del cubo, reglas 16-18 y comisiones sobre capital operado (Fase 3); evolución temporal del valor e histórico de aportaciones (necesitan historial de precios: Fase 3/4); precios automáticos, `FxRateSource` y cotejo con la tabla del BCE (Ronda 6 / Fase 4); avisos 720/721 (Fase 4); regla 5 (desriesgado); API; web; importadores; cambios de esquema no listados en §3.0.

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`), `build` y CI en verde.
- `atlas weights`, `contribute`, `costs` y `transfer simulate` funcionando sobre el golden regenerado; `atlas check --deep` limpio.
- `docs/` sin cambios (si algo no encaja, es una pregunta).
- README: sección breve de la Fase 2 con un ejemplo (`weights` → `contribute` → `order place`).
- `specs/004-monthly-contribution/questions.md` con lo que hayas preguntado (o vacío, dicho explícitamente) y las notas de implementación.
- PR a `develop` con la checklist de la constitución.

## 6. Decisiones fijadas por este prompt

Reflejadas en `docs/data-schema.md` y `docs/business-rules.md` en `develop` (PR #20 y la PR de este prompt). Si el código que encuentras no coincide, manda el esquema.

- **(a) `target_weights` por `asset_id`** del núcleo, suman exactamente 100; clave desconocida y activo sin peso son **avisos** de proyección, no rechazos (el catálogo puede cambiar después del `settings_changed`).
- **(b) Precio manual = última `valuation`** por activo (cualquier cuenta, `date ≤` la pedida, desempate por posición en el fichero). No hay evento nuevo de precio; los precios de Nivel 2 llegan en la Fase 4.
- **(c) Fallo seguro en el reparto**: sin precio de un activo del núcleo con posición o con peso, la calculadora y el simulador **rechazan** listando lo que falta; `weights` muestra la fila "sin precio" y no calcula pesos sobre totales parciales.
- **(d) Algoritmo de reparto**: proporcional al déficit hasta cubrirlo; sobrante por pesos objetivo; céntimos half-up una vez por activo; residuo al mayor déficit. La calculadora nunca propone ventas (regla 2; la venta es decisión anual, regla 3).
- **(e) `wash_sale_window`** con forma antigua aceptada (ADR-0014); solo `Settings` en esta feature.
- **(f) `settings_changed` con `--accept-invalid`** es la única vía de escritura sobre un libro que queda con inválidos; las consultas degradan con aviso; las demás mutaciones siguen estrictas (ADR-0015).
- **(g) Endurecer validación dentro de la v1** (EUR ⇒ `"1"`, fines de semana, `transfer` sin `fee`, `source_country`) es aceptable porque aún no existe ningún libro real; el golden se regenera **una vez**, en commit propio y justificado.
- **(h) La calculadora no escribe**: propone; el registro sigue siendo `order place` / `add buy` manual (el sistema nunca ejecuta órdenes).
- **(i) Compartimentación intacta**: `weights`, `contribute` y `simulate` son solo `core`; `costs` lista los libros por separado y no suma entre ellos.
