# Preguntas abiertas — feature 004-monthly-contribution

Dudas encontradas al leer la documentación y el código que el prompt me prohíbe resolver por mi cuenta (§2 bis: `docs/` intocable, nada fiscal ni estructural se decide en esta feature). Cada una lleva el supuesto provisional con el que sigo trabajando; si el usuario elige otra opción, se ajusta antes de implementar la parte afectada.

## Q1 — ¿`atlas weights` lista los activos del núcleo con peso objetivo y sin posición?

**Contexto.** El prompt §3.2 dice que `coreWeights` cubre "**solo** activos `core` con posición física > 0 agregada entre cuentas". Dos líneas más abajo, §3.3 exige precio manual para "algún activo del núcleo **con posición o con peso objetivo**", y el aviso `asset_without_target` cubre el caso inverso (posición sin peso). Un activo con peso objetivo del 10 % y posición cero —el caso normal cuando el usuario añade una clase nueva a su plan, y también el de un fondo del que acaba de traspasar todo— quedaría fuera de la tabla, y con él la mayor desviación posible: `−10 pp` no se vería en ninguna fila ni dispararía `deviation_above_threshold`.

**Opciones.**
- **(a) Literal.** Solo filas con posición > 0. La tabla refleja lo que se tiene. Inconveniente: el aviso de la regla 3 nunca se dispara para un activo a cero, que es justo cuando más lejos está del objetivo; y `contribute` sí le asigna dinero, de modo que la propuesta contiene un activo que `weights` no menciona.
- **(b) Posición > 0 **o** peso objetivo > 0** (supuesto provisional). El activo sale con cantidad y valor cero, peso real `0 %`, objetivo `w_i` y desviación `−w_i`. Ningún número del resto de filas cambia (su valor es cero). Coherente con §3.3 y con `contribute`.
- **(c) Todos los activos `core` del catálogo**, incluso sin posición ni peso. Añade ruido: activos vendidos hace años reaparecen para siempre.

**Supuesto provisional: (b).** Spec A2, FR-011.

**Respuesta del usuario (2026-08-31): (b) refinada.** El universo de filas es "posición > 0 **o** peso objetivo > 0". La fila del activo con objetivo y sin posición va con valor cero, **sin precio** y **sin marcar el total como parcial**: una posición nula vale cero sin necesidad de precio, así que no falta ningún dato. Solo un activo **con posición** y sin precio hace parcial el total, y solo esos exige `contribute`. El prompt §3.2/§3.3 lo dice ya así tras la PR #22. Recogido en spec A2, FR-011 y FR-015.

## Q2 — ¿Las comisiones de un `forced_sale` cuentan en `atlas costs`?

**Contexto.** El prompt §3.5 define las comisiones acumuladas por activo como "suma de `fee/fx_rate` de sus `buy` y `sell`". Pero desde la feature 002 hay una tercera vía por la que un bróker cobra una comisión de negociación sobre un activo: el efecto `forced_sale` de un `corporate_action` lleva `fee?` por cuenta (`data-schema.md` §6.5, "con la comisión de cada bróker anotada por cuenta") y esa comisión reduce el valor de transmisión exactamente igual que la de un `sell` (`primitives.ts`). En el libro sintético, el contrasplit con liquidación de picos cobra `0,5` por cuenta.

**Opciones.**
- **(a) Literal: solo `buy` y `sell`.** Coincide con la letra del prompt. Inconveniente: "comisiones acumuladas del activo" excluiría comisiones reales de ese activo que sí están en el libro y que sí afectaron a la ganancia declarada.
- **(b) `buy`, `sell` y `forced_sale`** (supuesto provisional), porque `forced_sale` **es** una venta a todos los efectos (ADR-0011, decisión de la 002) y su comisión es una comisión de negociación del mismo activo. La fila sigue siendo por activo y el libro no se mezcla.
- **(c) Añadir también `standalone_fee`.** No: no lleva activo (es de cuenta) y `data-schema.md` §6.2 dice explícitamente que no afecta a la base fiscal de ningún lote. Queda fuera de las dos tablas (spec A10).

**Supuesto provisional: (b).** Spec FR-019.

**Respuesta del usuario (2026-08-31): (b).** Los `fee` de `forced_sale` cuentan en `atlas costs`, por activo en el núcleo y por cuenta en el cubo. `standalone_fee` sigue fuera (spec A10).

## Q3 — `atlas settings set --wash-sale-window-days`: ¿se conserva el flag antiguo?

**Contexto.** ADR-0014 y `data-schema.md` §8.4 dicen que `wash_sale_window_days` "se sigue aceptando **al cargar**" y equivale a `"<n>d"`. No dicen nada sobre escribir en la forma antigua desde la CLI. Hoy existe el flag `--wash-sale-window-days`; si se conserva junto al nuevo, un `settings_changed` podría llevar las dos formas a la vez (spec A7 resuelve el conflicto: manda la nueva) y el libro acumularía configuraciones en un formato que el propio ADR llama "antiguo".

**Supuesto provisional (spec A8): la CLI escribe solo la forma nueva.** `--wash-sale-window` sustituye a `--wash-sale-window-days`, que pasa a dar un error de uso remitiendo al nuevo. La lectura de la forma antigua sigue garantizada (y con tests), que es lo que exige el ADR. No hay ningún libro real que dependa del flag.

**Respuesta del usuario (2026-08-31): el supuesto.** La CLI escribe solo la forma nueva.

---

## Decisiones menores aprobadas por el usuario (2026-08-31)

1. **`--target-weights` en `atlas settings set`.** No existía ningún flag para fijar los pesos objetivo y sin él la Fase 2 no es usable; se añade como pares `asset_id=peso` separados por comas, con el `parseAssignments` que ya existe. Se considera implícito en el prompt §3.2, no una ampliación de alcance.
2. **Regeneración del *golden* verificada.** Antes de congelarlo se comprueba que las únicas diferencias frente al anterior son las declaradas (fechas de tipo de cambio en día laborable, `settings_changed` en la forma nueva con pesos por `asset_id`, `dividend.source_country`, `transfer` sin `fee`), para que la regeneración no tape una regresión de proyección.
3. **Notas de lectura**, todas aceptadas, incluidas la comparación literal de `"1"` y el rechazo explícito `transfer_fee_not_allowed` (el prompt solo pedía sacar `fee` de las reglas de forma; un rechazo explícito es mejor que ignorarlo en silencio, que es justo lo que el hallazgo 6 quería evitar).

---

## Notas de lectura (no bloquean; se resuelven a favor del documento más reciente)

- **`valuation` no lleva `fx_rate_date`.** El prompt §3.0.4 pide rechazar fines de semana en "todo `fx_rate_date` (eventos y efectos `forced_sale`/`grant`)". `valuation`, `cash_deposit`, `cash_withdrawal` y `standalone_fee` no tienen ese campo, así que la regla del fin de semana no les aplica; la de `EUR ⇒ "1"` sí, porque todos llevan el par `currency`/`fx_rate`.
- **`fx_rate = "1.0000"` en euros se rechaza.** El prompt dice "tipo exactamente `"1"`". Se interpreta literalmente como comparación de cadena, no de valor decimal: el libro guarda el tipo *tal cual lo publica el BCE* y para el euro eso es `1`. Un `"1.0000"` sería un tipo inventado con decimales que nadie publicó. Queda recogido en la spec (Historia 5, escenario 1) por si el usuario prefiere la comparación numérica.
- **`target_weights` con valores negativos.** `validateSettings` ya exige que sumen 100 pero no que sean no negativos, de modo que `{a: "-50", b: "150"}` pasa hoy. El prompt §3.2 dice "valores decimales ≥ 0"; se añade la comprobación (FR-012). No es un cambio de esquema: es la regla que el documento ya describía.
- **Efectivo y pesos.** Los pesos objetivo se aplican sobre el valor de los **activos** del núcleo; el efectivo de las cuentas (ADR-0004) no entra en `V` ni en ninguna fila de `weights`. Aparecerá en la vista de patrimonio total, que no es de esta feature.
- **`atlas check` ya proyectaba en modo degradado** desde la 001; el bloque 0 extiende ese modo al resto de consultas, no lo inventa.
- **`--accept-invalid` en libros ya degradados.** La comparación de conjuntos antes/después (ADR-0015, espejo de `reverseEvent`) hace que un `settings_changed` inocuo sobre un libro ya roto se acepte sin el flag. Es lo que dice el ADR ("los eventos que **pasan a ser** inválidos"), y evita que el usuario tenga que usar el flag para cualquier cambio de configuración mientras repara el libro.

---

## Notas de implementación (2026-08-31, tras `/speckit-implement`)

Decisiones de detalle que no cambian documentos pero conviene que el usuario conozca.

1. **La configuración se lee a la fecha consultada, no a hoy** (corrige el supuesto A5 original). `weights`, `contribute`, `costs` y `transfer simulate` usan `settingsAt(--date)`. Con `settingsAt(hoy)` una consulta a una fecha pasada devolvía la configuración por defecto (sin pesos objetivo) y era inútil; además `business-rules.md` §7 exige poder saber qué pesos regían en cada momento. El aviso de umbral silenciado de `settings set` sí evalúa a **hoy**, que es cuando el cambio empieza a regir.
2. **La rama del sobrante del reparto solo es alcanzable con un peso objetivo "huérfano".** Como `target_i = w_i × (V + core)` y los pesos suman 100, `Σ(target − value) = core` exactamente, así que `Σgap ≥ core` **siempre** salvo que parte del plan apunte a activos que no están en la tabla (`unknown_target_weight`). En ese caso el sobrante se reparte entre las filas **en proporción al peso que sí tienen** (normalizado sobre la suma de los pesos presentes), no sobre 100: repartir sobre 100 dejaría un resto sin asignar que acabaría entero en el activo de mayor déficit por la vía del residuo.
3. **`normalizeSettings` se aplica en `settingsAt`, no al proyectar.** Así `state.settingsHistory` conserva literalmente lo que dice la línea y la instantánea del *golden* no cambia por una normalización de lectura. `settingsAt` es el punto de lectura documentado (`data-schema.md` §6.1), y es donde la forma antigua de la ventana se convierte en `"<n>d"`.
4. **`costSummary` recibe los eventos además del estado.** Las comisiones por operación no se acumulan en la proyección: hacerlo cambiaría `snapshotOf` y obligaría a regenerar el *golden* otra vez. Se recorren los eventos no anulados, como ya hace `deepCheck`.
5. **La tabla de costes incluye los activos que se tienen aunque nunca hayan operado.** Un activo llegado por `convert` (canje de clase, fusión de fondos) no tiene comisiones propias pero sí TER: dejarlo fuera infravaloraba el TER medio ponderado del núcleo. Se detectó ejecutando el `quickstart.md` sobre el libro sintético.
6. **Salida `--json` de las consultas: sobre `{ invalid_count, data }`.** Uniforme para los diecisiete comandos de solo lectura. Antes cada comando emitía su payload desnudo (a veces un array), donde no cabe un contador; una envoltura distinta por comando habría sido peor. Es un cambio de forma de la salida, no documentado en ningún sitio antes de esta feature.
7. **`lastWorkingDay` en `dates/civil-date.ts`.** El generador y los constructores de libros de test derivaban `fx_rate_date` de la fecha valor, que cae en fin de semana una de cada tres veces. La función retrocede al viernes, que es lo que ADR-0013 dice que se hace cuando el BCE no publica. Los festivos TARGET siguen sin validarse (Ronda 6).
8. **Fechas de test desplazadas.** Varias fixtures y libros de test usaban `2027-01-10` (domingo) y `2027-05-01`/`2027-05-02` (sábado y domingo) como `fx_rate_date`; se movieron al día hábil siguiente. Ningún test cambia de significado: solo la fecha del tipo de cambio.
9. **El aviso de umbral silenciado compara por `(código, detalles)`**, no por mensaje: un cambio de redacción no puede convertirse en un "aviso silenciado" falso.
10. **`recordEvent` proyecta con `collectErrors`** para poder listar los inválidos, pero el criterio de rechazo no se relaja para ningún evento que no sea `settings_changed`: si la proyección del candidato tiene algún inválido, se lanza el error del primero, como antes.
11. **Un evento nuevo puede *reparar* un libro degradado.** Tras un `settings_changed` con `--accept-invalid`, registrar la compra que faltaba vuelve a dejar el libro válido y las consultas dejan de avisar. Hay test.
12. **Serie de commits del bloque 0.** Entre `feat(settings): add wash_sale_window per asset type` y `chore(fixtures): regenerate the synthetic golden ledger` la batería queda roja en los tests que comparan el *golden* byte a byte: el generador no puede producir el fichero congelado hasta que las validaciones nuevas están puestas, y el fichero no puede regenerarse hasta que el generador cambia. Es inherente a congelar un *golden*; el resto de la batería sigue verde en cada commit.
13. **El *golden* se refresca en dos commits de esta rama**, no en uno: el segundo (`feat(synth): move the plan onto the surviving assets after a conversion`) corrige un defecto del escenario que solo se vio al ejecutar `contribute` sobre el fichero ya regenerado (el plan seguía apuntando a fondos canjeados). Sigue siendo **una sola regeneración** desde `develop`, que nunca vio el estado intermedio.
14. **Toolchain**: sin cambios (TypeScript 7.0.2, Biome 2.5.11, Vitest 4.1.11, fast-check 4.9.0, Node 22.23.2); cero dependencias nuevas.

### `quickstart.md` ejecutado a mano (2026-08-31)

Con el binario compilado, sobre un libro sintético de semilla 1: `check --deep` limpio (solo el aviso declarado `same_asset_two_accounts`), `settings show` muestra `wash_sale_window` en la forma nueva, y `weights`, `contribute`, `costs` y `transfer simulate` responden a `2028-12-31` sin rechazos. Dos desviaciones respecto al documento: los pasos usan `--date 2028-12-31` (el escenario sintético vive en 2026-2028, así que "hoy" es anterior a todo el libro) y el simulador se prueba contra `ast_bonds_i`, el fondo superviviente tras el cambio de clase.

---

## Notas de la revisión (2026-09-18, correcciones de los dos revisores)

Lo que cambia respecto a lo implementado en la primera vuelta. Nada de esto reabre una decisión: son defectos corregidos y la limpieza que pidió la dirección.

### 1. La corrección de fondo: la proyección se corta a la fecha consultada (`asOf`)

**El defecto.** `coreWeights` leía `state.positions`, la foto **tras aplicar todos los eventos del libro**, mientras `--date` solo afectaba a precios y configuración (nota 1 de las notas de implementación). Sobre el *golden*, `atlas weights --date 2027-06-30` informaba `ast_bonds` con cantidad 0 (el `share_class_change` que lo vacía es de 2028) y `ast_bonds_i` con 28,759 participaciones que nacen en 2028. `contribute` repartía sobre esos valores y `transfer simulate --all` movía una cantidad que en esa fecha no existía.

**El contrato nuevo** (lo fija la dirección; la documentación lo recogerá en `data-schema.md` §7 y en un ADR):

- `ProjectOptions` gana `asOf?: CivilDate`; `loadAndProject` lo propaga.
- **Pasada A** (catálogo, configuración, tesis, rectificaciones, en orden de fichero): **no cambia**, se aplica completa. Las referencias se siguen resolviendo contra el catálogo completo (`data-schema.md` §7.1).
- **Pasada B** (operaciones y seguimiento, por `(fecha de negocio, posición en el fichero)`): con `asOf`, **se ignoran por completo** los eventos con fecha de negocio posterior. No entran en lotes, posiciones, efectivo, ganancias, rendimientos, órdenes ni solicitudes pendientes, valoraciones ni avisos. El corte es **inclusivo**: un evento con fecha igual a `asOf` sí cuenta.
- La fecha de negocio es la que ya ordenaba la pasada B (`businessDateOf`); no hay una segunda función.
- **Sin `asOf` el comportamiento es exactamente el de antes.** Lo fija una propiedad `fast-check` que compara `snapshotOf` con y sin `asOf` puesto a la fecha del último evento.
- `costSummary` recorre eventos crudos, así que recibe `asOf` y filtra con la misma `businessDateOf`.
- Los comandos de solo lectura con `--date` (`weights`, `contribute`, `costs`, `transfer simulate`, `valuations`) proyectan con `{ collectErrors: true, asOf: date }`. Los que no tienen `--date` siguen proyectando el libro completo.
- `manualPrices` conserva su filtro por fecha (defensa en profundidad) y sigue usando la fecha pedida para la antigüedad y para `stale`.

**El supuesto A3/A5 del spec queda superado por esto.** Ya no basta con decir que "la configuración y los precios se leen a la fecha consultada": el **estado entero** se lee a la fecha consultada. La nota 1 de las notas de implementación sigue siendo cierta pero es ahora un caso particular del corte.

### 2. Rechazos nuevos

- **`no_target_weight_in_table`** (`contributionPlan`). Si la suma de los pesos objetivo **de las filas de la tabla** es cero, se rechaza. Antes el sobrante no se repartía, la suma no cuadraba y el residuo metía **toda** la aportación en la primera fila por orden alfabético: un activo con objetivo 0 % y sin déficit, cuya desviación crecía. El caso real es un plan que apunta a `asset_id` mal escritos (aviso `unknown_target_weight`). El mismo rechazo cubre la tabla vacía, que antes moría en la invariante interna `split_not_exact` (ahora también traducida al español, aunque no debería llegar nunca al usuario).
- **`missing_manual_prices` con el estado "antes" parcial** (`simulateTransfer`). Antes solo se comprobaba el precio de los dos activos implicados; si faltaba el de un **tercer** activo del núcleo, `deriveWeights` dejaba todos los pesos vacíos y la CLI imprimía una tabla en blanco con código de salida 0. Ahora rechaza listando `before.missing_prices` (decisión (c) del prompt §6), y la CLI publica los avisos y la marca de parcialidad de **antes** y de después.
- **La existencia de precio se consulta a `manualPrices`, no a la fila de `coreWeights`.** Un activo destino `core`, `transferable` y **con** valoración, pero sin posición ni peso objetivo (simular el traspaso íntegro a un fondo nuevo antes de meterlo en el plan) se rechazaba con un diagnóstico falso. Ahora se añade a la simulación con valor cero antes del traslado, y aparece en las dos tablas.
- **Rangos de los parámetros porcentuales** (`validateSettings`, especificación §5.2): `bucket_pct_of_contribution`, `satellite_min_weight_pct`, `bucket_stop_loss_pct` y `bucket_max_weight_pct` en `[0, 100]`; `deviation_threshold_pp`, `monthly_contribution_eur` y `bucket_max_cumulative_contribution` ≥ 0; `stale_price_days` y `transfer_max_days` enteros **> 0** (antes se aceptaba el cero). `model_720/721_alert_threshold_eur` se dejan sin rango: el prompt no los lista.
- **`--date` se valida en todos los comandos de consulta** y falla como error de uso. Antes `atlas weights --date manana` imprimía una tabla completa con antigüedad `NaN` y, por comparación lexicográfica, el último precio y la última configuración del libro.
- **Una mutación sobre un libro degradado nombra al culpable** (`ledger_has_invalid_events`, `InvalidLedgerError`): id y tipo del evento inválido anterior, cuántos hay y remisión a `atlas check`. Antes lanzaba el error del primer inválido del candidato (p. ej. `insufficient_position`) como si acusara al evento nuevo. Se distingue del caso en que el evento nuevo **sí** rompe uno recordado, que sigue lanzando el error de ese evento (ADR-0003).

### 3. Otras correcciones

- **`mergeSettings` descarta `wash_sale_window_days`**: la CLI escribe solo la forma nueva (decisión Q3). Antes `...current` sobre lo que devuelve `settingsAt` conservaba la forma antigua y cada `atlas settings set` sobre un libro antiguo escribía **las dos**, perpetuándola.
- **`costSummary` ignora los eventos inválidos** y trata la cuenta desconocida como "sin libro" (fuera de las dos tablas). Un `buy`/`sell` inválido contaba, y como `accounts.get(id)?.book === "bucket"` es `false` para una cuenta desconocida, en un libro degradado una operación del cubo podía aterrizar en la tabla del **núcleo**: la única vía encontrada de mezclar libros.
- **Ningún cero con aspecto de completo**: la fila TOTAL de `weights` muestra el porcentaje realmente sumado (vacío si el total es cero) en vez de un `100.00 %` fijo, y el subtotal de una clase que contiene una posición **sin precio** se marca `(parcial)` igual que el total.
- **Los avisos del dominio se escriben en inglés** y la CLI traduce el `code` al español (`describeWarning` en `messages.ts`), que es el contrato de `errors.ts`. Se han traducido también los seis avisos anteriores a esta feature, que salían en inglés por el mismo canal.

### 4. Limpieza

- `newlyInvalid` devuelve el `LedgerState` del candidato y solo proyecta el libro actual cuando el candidato tiene inválidos: **una** proyección por mutación en el camino que escribe (antes tres), y **dos** solo en un `settings_changed` que deja eventos inválidos. Hay un test que cuenta las proyecciones, para que la cifra de `plan.md` siga siendo verdad.
- `contributionPlan` usa un array de registros en vez de siete arrays alineados por índice; desaparecen doce *casts*. El resultado numérico no cambia.
- `WashSaleWindow` se estrecha a los valores que acepta el validador: `"2m"`, `"1y"` o `<n>d`.
- `coreQuantityOf` exige el conjunto de cuentas del núcleo y sus dos llamantes lo construyen **fuera** del bucle sobre los activos.
- El valor de una posición a precio manual vive junto a `ManualPrice` (`positionValueOf` en `prices.ts`); los avisos se formatean en un solo sitio (`describeWarnings`); los porcentajes y los euros, en `apps/cli/src/output/format.ts`.
- `index.ts` deja de exportar `newlyInvalid`, `describeAffected`, `CandidateCheck`, `addDays`, `daysBetween`, `isWeekend` y `lastWorkingDay`: fontanería interna que nadie usa fuera de `packages/domain/src`.
- Tres aserciones flojas de `contribution.test.ts` ahora fijan lo que dicen fijar: el mapa exacto del derrame del residuo, el `code` de cada uno de los seis rechazos y una comparación de importes con `Money` en vez de `Number`.

### 5. Nota que pidió el revisor sobre el *golden* regenerado

En el *golden* regenerado, `ast_bonds` pasa de 9 a 10 lotes cerrados, `ast_bonds_i` de 12 a 13 abiertos y `ast_smallcap` de 3 a 4 cerrados. **No es una regresión de proyección**: está demostrado que el mismo flujo de eventos reproduce el snapshot anterior. Es el desplazamiento de fechas del PRNG (los `fx_rate_date` movidos a día hábil) el que mueve una compra al otro lado de la fusión de fondos.

**Para la próxima feature:** las valoraciones deben tener su propio subflujo de PRNG. El flujo único hizo cambiar 116 de los 160 ids del *golden* al tocar la generación de fechas, lo que convierte cualquier retoque del escenario en un fichero irreconocible.

### 6. Lo que sigue pendiente de la dirección

- **Mensajes de `invalid_settings` en inglés.** `validateSettings` lanza todos sus rechazos con el código `invalid_settings` y `messages.ts` no lo traduce, así que el usuario ve el mensaje técnico en inglés (también los rangos nuevos). Es deuda anterior a esta revisión y no estaba en la lista de correcciones; se deja anotado.
- **Más superficie pública sin usar.** Además de los siete símbolos retirados, `compareCivilDates`, `daysInMonth`, `isLeapYear`, `madridDateOf`, `sha256Hex` y `utf8Encode` tampoco se usan fuera de `packages/domain/src`. No se han tocado porque no estaban en la lista y parecen API pública legítima para la web.
