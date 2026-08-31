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
