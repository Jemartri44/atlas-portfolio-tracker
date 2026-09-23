# Preguntas abiertas y comprobaciones — feature `011-fail-safe-gaps`

Escrito **antes de tocar una línea de código**, como pide §2.2 del encargo. **La dirección respondió el 2026-09-23**: las respuestas están en §8, y lo que cambian está ya aplicado en `plan.md` y en `spec.md`. Contiene:

1. Las **dos comprobaciones previas** que el encargo exige antes de tocar nada, con la salida de mis propios comandos.
2. Las **cinco preguntas** para la dirección (P1–P5), con cuáles bloquean.
3. Las **cuatro observaciones sobre el propio encargo** (E1–E4), tres de ellas verificadas ejecutando.
4. La lista de documentos que la dirección tendrá que actualizar.
5. Los apartados que se rellenan durante la implementación: cómo vi cada test en rojo, y lo que se decida sobre la marcha.

Todo medido sobre `origin/develop` (`c141cb0`), en el *worktree* `../atlas-portfolio-tracker-011`, el **2026-09-23** (Europe/Madrid).

---

## 0. Línea de partida, medida

| Qué | Resultado |
|---|---|
| `npm run lint` (redirigido a fichero, leyendo `$?`) | **verde**, 559 ficheros |
| `npm run test:coverage` | **verde**: 1.782 tests en 186 ficheros; **100 %** de sentencias (5503/5503), ramas (2950/2950), funciones (1224/1224) y líneas (5232/5232) |
| `npm run build` | **verde**: `ARRANQUE 72.9 KB gzip (presupuesto 73.5 KB)` · `TOTAL 235.0 KB gzip (presupuesto 236.0 KB)` |

> **Aviso de método, no del árbol.** Con la máquina cargada (media de carga **81** en 28 núcleos, por otros agentes de la sesión) la suite de `web` agota su tiempo de espera y da **16 fallos** de `Test timed out in 5000ms`, con tests de 52 segundos. Con `--maxWorkers=2` pasan **los 449**. No es una regresión de `develop`: es contención. Queda escrito para que nadie lo confunda con un fallo real, y para que yo ejecute la suite acotando los *workers* mientras haya otros agentes vivos.

---

## 1. Comprobación previa del bloque 3 — las dos premisas de la huella

**Resultado: las dos se sostienen.** El cambio se puede hacer dentro de `schema_version = 1`.

### Premisa 1 — el cambio solo afecta a líneas de presentación

Leída la función `tupleOf` **entera** (`packages/domain/src/schema/fingerprint.ts`), no sólo su rama: es un `switch (event.type)` con **12 etiquetas `case`** que reparten por tipo de evento y un `default` que devuelve `undefined`. `filed_at` aparece **una sola vez** en todo el fichero, dentro de la rama `tax_return_filed`:

```
$ git grep -n "filed_at" -- packages/domain/src/schema/fingerprint.ts
packages/domain/src/schema/fingerprint.ts:111:        event.filed_at,

$ grep -c 'case "' packages/domain/src/schema/fingerprint.ts
12
```

Borrar esa línea deja la tupla en `["", "", "", "", event.type, event.model, String(event.tax_year), event.receipt_reference]`. **No puede colisionar con otro tipo de evento**, porque `event.type` va dentro de la tupla y es único por tipo; lo que sí pasa es que la tupla de una presentación deja de tener nueve posiciones y pasa a tener ocho, lo cual es irrelevante: se une con `|` y se resume, no se lee por posición.

### Premisa 2 — no existe ninguna línea `tax_return_filed` escrita en el repositorio

```
$ git ls-files '*.jsonl' | while read f; do echo "$(grep -c tax_return_filed "$f") $f"; done
0 tests/fixtures/ledger/empty.jsonl
0 tests/fixtures/ledger/future-version.jsonl
0 tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl
0 tests/fixtures/ledger/no-trailing-newline.jsonl
0 tests/fixtures/ledger/number-amount.jsonl
0 tests/fixtures/ledger/synthetic-v1.jsonl
0 tests/fixtures/ledger/tax-hand-v1.jsonl
0 tests/fixtures/ledger/valid-v1.jsonl

$ git ls-files | grep -vE '\.(ts|tsx|md)$' | xargs grep -ln tax_return_filed
apps/web/scripts/check-bundle.mjs
```

**Cero** en los ocho `.jsonl`. El único fichero seguido que no es código ni documento y menciona el tipo es `apps/web/scripts/check-bundle.mjs`, donde aparece **como nombre en un comentario**, no como línea de libro. No hay carpeta `archive/` en el repositorio (`git ls-files | grep -i archive` no devuelve nada) ni ningún `.json`/`.csv` con presentaciones.

**Ninguna prueba fija hoy la huella de una presentación como literal.** Los únicos literales `sha256:` relacionados son valores **escritos a mano**, no calculados: `packages/domain/test/samples.ts:352` (`fingerprint: "sha256:renta-2025"`) y `apps/web/test/closed-year.test.ts:84` (`"sha256:filing"`). `packages/domain/test/schema/fingerprint.test.ts` no compara ninguna huella de presentación contra un literal: sólo comprueba el prefijo `sha256:` y comparaciones relativas. Por tanto la expectativa es **cero movimientos de ficheros dorados**, y si alguno se moviera, se para y se pregunta.

**Argumento de calendario, para el commit** (decisión (c)): el evento `tax_return_filed` existe desde la feature 010, fusionada en `develop` el **2026-09-23**. No puede existir en el mundo una línea anterior cuya huella cambie, y el argumento **no depende de ningún dato sobre el libro privado del usuario**.

---

## 2. Comprobación previa del bloque 4 — el mapa de guardias

**Resultado: el alcance real es mayor que el del inventario y coincide con el del encargo.** Las **cuatro** lecturas alternativas del dominio están **sin guardia**, y las cuatro se han **reproducido ejecutando**, con traza de pila, no leyendo.

### Quién llama a quién

```
taxYear / taxYearWithChain (tax/year.ts:824)
 ├─ computeCore  → taxChain          LECTURA PRINCIPAL — debe seguir lanzando
 ├─ filingComparison (year.ts:846)   →  readingOf (comparison.ts:111) → taxChain   ✗ sin guardia   [1]
 ├─ criterionStakes  (year.ts:880)   →  computeCore (year.ts:110)     → taxChain   ✗ sin guardia   [2]
 └─ settingsDiff     (year.ts:883)   →  computeCore (year.ts:110)     → taxChain   ✗ sin guardia   [3]

closedYearImpact (closed-years.ts:105) → figuresOf (closed-years.ts:74) → taxChain ✗ sin guardia   [4]
 ├─ apps/cli/src/commands/shared.ts      closedYearNotes   → try/catch de DomainError  (tapado)
 ├─ apps/cli/src/commands/rectify.ts     closedNotes       → try/catch de DomainError  (tapado)
 ├─ apps/web/src/ledger/write.ts         impactOf          → try/catch de DomainError  (tapado)
 └─ apps/cli/src/commands/catalogue.ts   confirmMovedYears → SIN try                   ★ DESNUDO

movedTaxYears (year.ts:172) → taxChain   ✓ ÚNICA guardia del dominio: try/catch sobre el código
                                            `tax_year_unsupported` (year.ts:184-193)
```

El orden importa: **`filingComparison` se llama antes** que `criterionStakes` y que `settingsDiff`, así que la lectura del informe de comparación es la primera que revienta. El inventario no la contaba.

### Reproducido, con trazas de pila

Libro de prueba: una venta de un fondo con **fecha de contratación 2017-12-28** y **fecha valor 2018-01-03**. Con `fiscal_date_rule.fund = value_date` la ganancia es de **2018** (ejercicio soportado, informe calculable); con `trade_date` cae a **2017** y la cadena tiene que empezar por debajo del primer año soportado. Es el mecanismo que describe el encargo: la configuración alternativa arrastra la cadena.

```
A: DomainError tax_year_unsupported
   at taxChain (packages/domain/src/tax/chain.ts:268)
   at computeCore (packages/domain/src/tax/year.ts:110)
   at criterionStakes (packages/domain/src/tax/year.ts:476)
   at taxYearWithChain (packages/domain/src/tax/year.ts:880)
   at taxYear (packages/domain/src/tax/year.ts:813)

B: DomainError tax_year_unsupported            ← con una Renta presentada cuya `computed.settings`
   at taxChain (packages/domain/src/tax/chain.ts:268)     es la que alcanza más atrás
   at readingOf (packages/domain/src/filings/comparison.ts:111)
   at filingComparison (packages/domain/src/filings/comparison.ts:150)
   at taxYearWithChain (packages/domain/src/tax/year.ts:846)
   at taxYear (packages/domain/src/tax/year.ts:813)

C: DomainError tax_year_unsupported            ← closedYearImpact con dos configuraciones distintas
   at taxChain (packages/domain/src/tax/chain.ts:268)
   at figuresOf (packages/domain/src/filings/closed-years.ts:74)
   at closedYearImpact (packages/domain/src/filings/closed-years.ts:134)

A' (con `criterionStakes` guardado a mano, para destapar la siguiente):
   DomainError tax_year_unsupported
   at taxChain (packages/domain/src/tax/chain.ts:268)
   at computeCore (packages/domain/src/tax/year.ts:110)
   at settingsDiff (packages/domain/src/tax/year.ts:753)
   at taxYearWithChain (packages/domain/src/tax/year.ts:883)
```

`settingsDiff` está **enmascarada** por `criterionStakes`, que lanza antes: sólo aparece cuando la segunda está guardada. Es exactamente lo que va a pasar al implementar el bloque 4, y por eso la guardia hay que ponerla en **los cuatro sitios**, no en el primero que se vea fallar.

### La cara peor: el comando que revienta

El mismo libro, con una Renta de 2018 presentada, y el cambio de ajuste que arrastra la cadena:

```
$ atlas settings set --fiscal-date-rule fund=trade_date
No se han podido evaluar los avisos (faltan precios de fnd_a); se continúa.
Este cambio mueve las ganancias realizadas de ejercicios anteriores:
ejercicio  antes EUR  después EUR
---------  ---------  -----------
2017       0          2000
2018       2000       0
Error (tax_year_unsupported): El motor fiscal aplica el régimen de compensación vigente desde 2018; 2017 es anterior (o no es un año).
                                                                                   ← código de salida 1
```

**Muere antes de preguntar, y el ajuste no llega a escribirse.** No es un informe que no se puede consultar: es un cambio de configuración imposible. Y sobre el mismo libro, **antes** de tocar nada:

```
$ atlas tax 2018
Error (tax_year_unsupported): El motor fiscal aplica el régimen de compensación vigente desde 2018; 2017 es anterior (o no es un año).
                                                                                   ← código de salida 1
```

Un ejercicio **soportado y calculable** cuyo informe no se puede obtener. Es literalmente lo que el bloque 4 existe para arreglar.

*(Los dos guiones de sondeo viven en mi scratchpad, con `011` en el nombre, y no entran en el repositorio.)*

---

## 3. Preguntas para la dirección

### P1 — ¿Qué significa «`as_of` anterior al ejercicio que declara»? **(resuelta, §8)**

El encargo pide validar que `computed.as_of` no sea anterior al ejercicio que declara. Caben dos lecturas y dan reglas distintas:

- **(a)** `as_of > ${tax_year}-12-31` — el **espejo exacto** de la regla que ya existe para `filed_at`. Dice: las cifras definitivas de un ejercicio no se calculan antes de que el ejercicio acabe.
- **(b)** `as_of ≥ ${tax_year}-01-01` — la **lectura literal**. Admite haber calculado en noviembre lo que se presentó en junio; la comparación no se rompe, porque lo ocurrido después lo absorbe la causa `later_events`.

**Proponía (a)**, porque hace de `declared` y `computed` dos fotos del mismo ejercicio cerrado. La segunda comparación, `as_of ≤ filed_at`, no tiene ambigüedad y es la que incumple la muestra. La tercera, «no futura», **no se escribe**: se deduce, y sería una rama que ningún test puede cubrir.

> **Respuesta de la dirección: ninguna de las dos, y el motivo importa.** La regla no es una fecha: es que **`as_of` cubra el ejercicio entero que declara**. De ahí sale la comparación, **y no al revés**: hay que comprobar **cómo corta `asOf`**. Si el corte **incluye** su fecha, `as_of` del 31/12 del ejercicio es válida y la regla es «no anterior al 31/12»; si excluye, empieza el 1 de enero siguiente. La (a) rechazaría un cálculo hecho exactamente al cierre del ejercicio, que es el corte más natural que existe y describe algo que pudo pasar de verdad: **rechazar una línea legítima es peor que aceptar una rara**, porque deja al usuario sin forma de apuntar la realidad. La (b) es demasiado laxa por el otro lado.

**Comprobado, ejecutando** *(guion `011-asof-probe` en mi scratchpad)*:

1. **El corte incluye su fecha.** `projections/project-ledger.ts:413` es `entry.date > options.asOf → continue`, así que un evento fechado exactamente en `asOf` entra. Medido sobre un libro con una venta de fecha fiscal 2027-12-31:

   ```
   ganancias con asOf = 2027-12-31 (la propia fecha fiscal): 1
   ganancias con asOf = 2027-12-30 (el día anterior):        0
   ganancias sin asOf:                                       1
   ```

2. **Y un hallazgo de paso: `taxChain` no aplica ese corte.** Proyecta el prefijo entero y usa `computed.as_of` como **`options.today`**, que no filtra eventos:

   ```
   base de 2027 con today = 2027-07-01: 50
   base de 2027 con today = 2029-01-01: 50
   ```

   `today` gobierna otras dos cosas: qué presentaciones están **en vigor** (`filed_at <= today`) y qué queda **provisional** en la regla de recompra (`end >= today`, `wash-sale.ts:451`). El corte real del prefijo es **por recuento de líneas**; `as_of` es la fecha que lo data, y un `as_of` dentro del ejercicio dice que la foto se tomó con el ejercicio corriendo, así que lo que faltaba por pasar no podía estar en el prefijo. El razonamiento de la dirección se sostiene igual, por esta otra vía.

**Regla que se implementa**, por la rama inclusiva: **`as_of ≥ ${tax_year}-12-31`** (se rechaza lo anterior al 31/12; el 31/12 **es válido**), más `as_of ≤ filed_at`. La tercera no se escribe.

### P2 — Tres celdas de certeza que el formato nuevo obliga a escribir **(conforme, §8)**

El bloque 7 pasa `docs/fiscal-questions.md` a una fila por variante, y eso obliga a dar **una** certeza a cada uno de los 34 identificadores. En 31 de ellos la fila ya decía un solo valor. En **tres** el documento sólo dice el conjunto de su fila, y el valor concreto sale del catálogo:

| Identificador | Certeza que tomaría | Qué dice hoy la fila | Qué dice el catálogo |
|---|---|---|---|
| `2:other` | **Baja** | «En disputa (valores no UE) / Baja (cripto) / Media (fondos)» — nada sobre una ventana a medida | `low` |
| `24:etc_gain` | **Baja** | «Media (ETC) / Baja (ETP)» — nada sobre la lectura contraria del ETC | `low` |
| `24:etp_gain` | **Media** | ídem — nada sobre la lectura contraria del ETP | `medium` |

Los tres valores **coinciden con lo que el catálogo ya declara**, que es lo que autoriza la decisión (k), así que por defecto los escribo así. Los enumero **antes** porque son afirmaciones nuevas del documento y porque la dirección puede querer vetar alguna. *(Las cuatro celdas de riesgo que el encargo decide —`2:listed_1y`, `2:fund_1y` y `2:crypto` conservadoras, `2:other` ambas— **coinciden las cuatro** con el catálogo: ahí no hay nada que preguntar.)*

### P3 — ¿Sigue valiendo el argumento circular del test antideriva? **(respondida, §8)**

El test existe porque **el documento es donde la dirección decide** y el catálogo es una copia. Rellenar el documento **desde el catálogo** invierte eso durante un commit. Es exactamente lo que la decisión (k) manda hacer con las cuatro celdas mudas, y lo asumo; lo pregunto sólo para que quede escrito que la dirección lo sabe y lo quiere así, porque después del commit el test deja de poder distinguir «el documento lo decidió» de «el código lo decidió».

### P4 — La ADR del bloque 8 **(aprobada la forma, §8)**

Comprobado **pronto**, como pide el encargo: **registrar la salida no exige subir `schema_version`**. Exige un **tipo de evento nuevo**, y ADR-0018 clasifica «añadir un tipo de evento» como cambio **compatible** (`swap` y `tax_return_filed` son los precedentes y dejaron la versión en 1).

Pero sigue siendo un cambio de esquema, así que lo propondré como **ADR en estado `Propuesta`** con `/adr`, y la acepta la dirección. Lo que propondrá, resumido para que se pueda decidir antes de que exista:

- Evento **`filing_fingerprint_waived`**: `filing_id`, `reason` (`"digest" | "unreadable"`), `schema_version_checked` y `notes?`. Fechado por su `recorded_at`, como **documento administrativo**: sin fecha de negocio y fuera del corte de `asOf` (ADR-0016).
- **No toca lo presentado** (ADR-0020): habla *sobre* la presentación. Línea **nueva**, porque el libro es *append-only*.
- Se escribe **dentro del mismo `compact`**, antes de reescribir, de modo que entre en el libro reescrito y `resealFilings` la selle con las demás. Es la única traza que queda: después de resellar, el fichero no lo diría de ninguna otra forma.
- `check` y `check --deep` emiten por ella un hallazgo permanente, sin caducar.

> **Respuesta de la dirección: forma aprobada**, con cuatro exigencias sobre lo que el evento tiene que llevar, porque después de resellar es la única traza que quedará en el fichero: **(1)** qué presentación y qué motivo (`digest` o `unreadable`), nunca juntos en un «no verificable» genérico, porque uno significa que las cifras no cuadran y el otro que no se pueden leer; **(2)** la **versión de esquema y el recuento de líneas** que la huella declaraba en ese momento, que después de compactar el libro ya no tiene en ninguna parte; **(3)** **cuándo lo dio por bueno el usuario**, que es la mitad de la frase que `check` tiene que seguir diciendo para siempre; **(4)** que **no toca la presentación**: dice algo *sobre* ella. Escribirlo dentro de `compact` antes de reescribir es correcto.

Aplicado en `plan.md` §8. Queda sólo escribir la ADR en estado `Propuesta` y que la dirección la acepte; los bloques 0–7 no esperan a nada.

### P5 — El texto del bloque 0 mientras el bloque 8 no exista **(sin objeción, §8)**

FR-004 dice que el mensaje nuevo no prometa una salida bloqueada. Mi propuesta de `todo` para la web, en el bloque 0:

> «Las líneas anteriores a esa declaración están escritas en un formato que la aplicación no sabe releer en la versión que la huella declara. **No es una edición**: no hay copia que restaurar. Conserva el archivo tal cual y no lo edites a mano; la comprobación no puede confirmar la huella.»

Y en el bloque 8 pasaría a nombrar la salida («…puedes compactar autorizándolo expresamente, y quedará registrado»). **¿Le parece bien a la dirección ese reparto en dos pasos**, o prefiere que el bloque 0 ya nombre la salida y el bloque 8 se dé por hecho? *(No bloquea: si no hay respuesta, hago los dos pasos.)*

### P6 — La comparación `as_of ≤ filed_at` rechaza una línea legítima **(bloquea el bloque 1)**

**Encontrado al implementarlo, y contradice al encargo.** El encargo da por sentado que `as_of` posterior a `filed_at` es una incoherencia —«calculado dos días después de presentarlo»— y de ahí deduce que «no futura» sobra. **Al escribir la comparación, cuatro tests de las dos interfaces se pusieron rojos, y ninguno estaba fijando un defecto: son el camino de producción.**

| Qué se rompió | Por qué |
|---|---|
| `apps/cli/test/commands/filed.test.ts` ×2 | `atlas filed 720 2027 --filed-at 2028-03-15` con el reloj en 2028-06-10: `filingProposal` escribe `as_of: options.today` = **2028-06-10**, posterior al `filed_at` que el usuario declara |
| `apps/web/test/presentar.test.tsx` ×2 | lo mismo desde el formulario: `filed_at` tecleado 2028-06-12, `as_of` el día de hoy |

**`as_of` es «el día del cálculo»** (`data-schema.md` §6.6, y `filingProposal` lo escribe como `options.today`). Cuando el usuario **presenta en Hacienda y lo registra después** —que es el flujo que ADR-0020 describe como normal, «un paso manual nuevo que el usuario tiene que hacer una vez al año»—, el cálculo es **posterior** a la presentación. No es absurdo: es lo que pasa. Forzar `as_of ≤ filed_at` obligaría a escribir un `as_of` que la aplicación no usó, que es afirmar lo que no se ha comprobado — justo lo que esta ronda existe para impedir.

**Lo que sí es absurdo y nadie comprueba: `as_of` en el futuro** (`as_of > recorded_at`). Sin la comparación con `filed_at`, esa **ya no se deduce** y pasa a ser la segunda que hay que escribir. El recuento vuelve a ser dos:

1. `as_of ≥ ${tax_year}-12-31` — cubre el ejercicio.
2. `as_of ≤ recorded_at` (en `Europe/Madrid`, como ya hace `filed_at`) — no se calcula en el futuro.

Y con eso, **la muestra `SAMPLES.tax_return_filed` no era incoherente**: `as_of` 2026-06-20 con `filed_at` 2026-06-18 es exactamente «presenté el 18 y lo registré el 20». La he dejado como estaba, a la espera.

> **Respuesta de la dirección: tenías razón, y retiro la comparación.** «Mi error estaba en la premisa, no en el razonamiento: di por hecho que `as_of` era el cálculo **que acompañó a la presentación**, y no lo es. Es el corte con el que la aplicación calculó **cuando registraste** lo que ya habías presentado. Y el flujo normal —presentas en Hacienda un día y lo apuntas aquí otro— produce `as_of` posterior a `filed_at` **siempre**. Mi comparación no rechazaba un caso raro: rechazaba el caso corriente.»
>
> **Y la muestra tampoco era incoherente**: «me equivoqué al mandarte corregirla. *Presenté el 18, lo registré el 20* es exactamente lo que dice.»
>
> **La segunda comparación pasa a ser `as_of ≤ recorded_at`**, «y es mejor comparación que la mía: calcular con un corte posterior al momento en que la línea entra en el libro es imposible, así que la comparación dice algo que de verdad no puede pasar».

**Implementado así**, con los códigos `as_of_before_year_end` y `as_of_in_future`. La muestra se quedó como estaba. **Dos errores del encargo retirados, y los dos eran de la dirección**, escritos aquí a petición suya: una instrucción borrada en silencio vuelve tres rondas después porque alguien cree que se olvidó.

| Retirada | Qué decía | Por qué se cae |
|---|---|---|
| La comparación `as_of ≤ filed_at` | §3 bloque 1 del encargo la daba por buena y deducía de ella que «no futura» sobraba | `as_of` es el día del cálculo, no el de la presentación: registrar después de presentar la produce siempre |
| «Corrige la muestra» | §3 bloque 1: «`as_of` el 2026-06-20 y `filed_at` el 2026-06-18: calculado dos días después de presentarlo. Corrígela» | No hay nada que corregir: es «presenté el 18, lo registré el 20» |

### P7 — La comparación que sí es buena choca con un defecto conocido y fuera de alcance **(bloquea el bloque 1)**

Incluso con **sólo** la primera comparación (`as_of ≥ 31/12`), un test de la web se queda rojo, y el motivo no es la regla: es el **seguimiento 2 de `implementation-notes.md` §6 de la 010**, *«`today()` de la web no lee el reloj de los casos de uso: su comentario dice que sí, pero usa `new Date()`»*, que §4 de este encargo deja **expresamente fuera de alcance**.

`apps/web/src/ledger/state.ts:185` es `export const today = (): CivilDate => madridDateOf(new Date());`. En `presentar.test.tsx` el reloj inyectado es 2029-07-01 y el libro dorado declara el ejercicio **2027**, pero `filingProposal` recibe `today()` = **la fecha real del sistema**, hoy 2026-09-23. Resultado: la web escribe `as_of` = 2026-09-23 para un ejercicio que acaba el 2027-12-31, y la regla —con razón— lo rechaza.

En **producción** no pasa: la fecha real es la de verdad y un ejercicio que se declara ya ha terminado. Pasa **en el test**, porque el libro dorado vive en el futuro respecto del reloj real. Tres salidas, y ninguna la elijo yo:

- **(i) Arreglar `today()`** para que lea el reloj de los casos de uso. Son pocas líneas, deja el test coherente y mata de paso el seguimiento 2 — pero está **fuera de alcance** por escrito.
- **(ii) Tocar el test de la web** para que su combinación sea coherente. Frágil: vuelve a romperse cuando la fecha real avance.
- **(iii) No rechazar**, y emitir un aviso. Contradice el encargo, que pide rechazo con código propio.

> **Respuesta de la dirección: se amplía el alcance y el seguimiento 2 entra.** «Un componente que lee el reloj de pared en vez del reloj inyectado **es un defecto**, no una preferencia de estilo: la aplicación se comporta distinto según cuándo la mires y no hay forma de escribir un test determinista sobre nada que dependa de la fecha. El límite de alcance lo puse yo **antes de saber que el bloque 1 chocaba con él**: un límite que te obliga a elegir entre un test frágil y renunciar a una validación correcta está puesto en el sitio equivocado. **Se mueve el límite, no la validación.**» Las otras dos salidas quedan descartadas por lo mismo que el campo opcional del ancla: **no se dobla el diseño para que un test pueda expresarse**. En su propio commit, con el motivo escrito, y **midiendo el radio antes de tocar**.

**El radio, medido antes de tocar nada.** `today()` lo llaman **diez** ficheros de `apps/web/src`, pero todos llaman al **mismo ayudante**: el arreglo es **una línea** en `apps/web/src/ledger/state.ts`, que pasa a leer `store.deps()?.clock.now()` y cae al reloj de pared cuando todavía no hay libro abierto (el chip del origen y el selector de fecha se pintan antes). Ningún sitio de llamada cambia. No hay cascada, así que no paré.

Lo que sí hay, y es del mismo tamaño: **13 ficheros de test y 23 llamadas** usan el ayudante `today("YYYY-MM-DD")`, que movía el reloj de pared con `vi.setSystemTime`. Resuelto **en el ayudante**, no en los 23 sitios: el instante de las dependencias pasa a ser una variable que ese ayudante mueve y el `afterEach` restaura, de modo que la pantalla y el dominio siguen mirando **el mismo día**, que es justo el defecto que se arregla.

**Y destapó dos bombas de relojería.** Con la suite entera, **tres** tests rojos de 450, ninguno por la regla nueva:

| Test | Qué daba por bueno | Cuándo habría reventado solo |
|---|---|---|
| `no-jargon.test.tsx` | «la del cambio de configuración del **01/09/2026**», la vigente según el reloj **de pared** | en **marzo de 2028**, al pasar el `settings_changed` siguiente del libro dorado |
| `screens.test.tsx` ×2 | un aviso de recompra cuya ventana de un año sigue abierta | al pasar **2027**, cuando la ventana cierra y el bloque de Atención se queda sin ese aviso |

Los dos se han fijado a una fecha propia, que es lo que el arreglo hace posible. **Ese es el argumento entero**: no eran tests que el cambio rompiera, eran tests que solo funcionaban hoy.

### P8 — Propuesta: que el hook de pre-commit no deje pasar el analizador en rojo

**No lo hago**, y lo escribo aquí porque la dirección lo pide así: añadir configuración de herramientas es decisión del usuario y se la propone la dirección, no yo.

**El hecho.** Un commit con Biome en rojo ha entrado **tres rondas seguidas**:

| Cuándo | Cómo se leyó el resultado | Cómo se arregló |
|---|---|---|
| Feature 009/010, §3 de `implementation-notes.md` | `npm run lint \| tail` — el código de salida de la tubería es el de `tail` | `git reset --soft`, dos commits reconstruidos |
| Feature 010, §10.9 de las mismas notas | lo mismo, **otra vez**, con la advertencia ya escrita | `git reset --soft` |
| Feature 011, bloque 0 | redirigido a fichero y `$?` leído… y comiteado sin mirarlo | `git commit --amend` |

**Lo que dice el patrón.** Las dos primeras veces se corrigió el hábito («no uses tubería»); la tercera lo hizo alguien que **ya tenía ese hábito** y falló igual, un paso más allá. Cuando algo muerde tres veces, el problema deja de ser de quien lo sufre: **es que nada lo impide**.

**La propuesta.** `.githooks/pre-commit` ya ejecuta `gitleaks`; que ejecute también el analizador y rechace el commit si no está limpio. Coste: unos segundos por commit sobre 559 ficheros —medido: **~150 ms**—. Efecto: la clase entera de fallo desaparece, en vez de repetirse una ronda más.

### P9 — El techo del paquete web se agota al pintar el ancla **(bloquea la mitad web del bloque 6)**

**Medido, no estimado.** El encargo dice que si no cabe, se para y se avisa, y que el techo no se sube por iniciativa del implementador ni se esconde con una importación dinámica. No cabe **por 23 bytes**.

| Momento | Arranque | Total | Margen del total |
|---|---|---|---|
| `develop`, antes de empezar | 72,9 | 235,0 | 1,0 KB |
| tras el bloque 2 (estado vacío de la tarjeta) | 72,9 | 235,2 | 0,8 KB |
| tras el bloque 4 (motivo nuevo + cierre del mapa) | 73,0 | 235,5 | 0,5 KB |
| tras el bloque 5 (tercer desenlace, en dos interfaces) | 73,0 | 235,9 | **0,1 KB** |
| tras la mitad **de dominio** del bloque 6 | 73,0 | 235,9 | 0,1 KB |
| **con el ancla pintada en la web** | 73,0 | **236,0 → la comprobación falla** | **−23 bytes** |

Exacto: **241.687 bytes** gzip de JS y CSS contra un techo de **241.664** (236,0 × 1024). El `build` sale en rojo con `el bundle entero pesa 236.0 KB gzip y el presupuesto es 236.0 KB`.

**El arranque no es el problema**: 73,0 contra 73,5, con 0,5 KB de margen. Lo que se agota es el **total**, y el trozo que crece es el de la pantalla fiscal, que es perezoso — o sea, bytes que solo se descargan quien abre `/fiscal`.

**Lo que está hecho y committeado**, porque no cuesta un byte de web: el dominio conserva **todas** las anclas, la consola las imprime todas, el dorado se movió exactamente en las cuatro líneas predichas y el mutante 8a muere. **Lo que falta es pintarlo en la pantalla**, que es la mitad que da valor al usuario y la que no cabe. El trabajo está escrito y medido, guardado como parche en mi scratchpad (`011-block6-web.patch`, 142 líneas): la tarjeta de pérdidas pendientes gana un `Notice` por ancla, encima de la tabla, con los dos importes por `Amount` y el hecho visible con la privacidad puesta.

**Lo que no hago, y por qué:** no subo el techo (es de la dirección), no meto una importación dinámica (el encargo lo prohíbe por nombre) y no recorto el texto del aviso para que quepa por los pelos, porque eso es doblar el diseño para que quepa en un número y el margen volvería a agotarse en el bloque 8.

**Tres salidas, y la elige la dirección:**

- **(i) Subir el techo del total.** Es lo que se ha hecho cada vez que se apretó, y `check-bundle.mjs` lleva el motivo escrito de cada subida. Con el ancla pintada mediría **236,1**; a lo medido más 1 KB serían **237,1**, que deja sitio al bloque 8.
- **(ii) Pagarlo con algo que sobre.** No he buscado dónde recortar porque recortar otra pantalla para pagar ésta es una decisión de producto, no mía. Si la dirección quiere, lo mido.
- **(iii) Dejar la mitad web del bloque 6 fuera de esta ronda.** El dominio ya conserva las anclas y la consola las dice; la pantalla seguiría sin contarlo, que es el defecto que el bloque existe para cerrar. **La desaconsejo**: el usuario mira la pantalla, no la consola.

**Y el bloque 8 todavía no ha medido.** Sus mensajes —el hallazgo de la huella no verificable y la nota de la comparación— también llegan a la web. Con 0,1 KB de margen, van a chocar con lo mismo.

### P10 — El bloque 8 se pasa del techo que acabas de poner, por 208 bytes **(bloquea la entrega)**

Paré otra vez, que es lo que pediste: «si el 8 no cabe cuando llegues, para otra vez; prefiero decidirlo dos veces que dejarte un colchón que se gaste solo».

| | Arranque | Total |
|---|---|---|
| techo | 73,5 (intacto) | **236,7** |
| con el ancla pintada | 73,0 | 236,0 |
| **con el bloque 8 dentro** | **73,3** | **236,9** |

Exacto: **242.589** bytes contra **242.381**. Se pasa por **208 bytes**. El **arranque no se toca y sigue por debajo**: 73,3 de 73,5, aunque con menos margen que antes.

**Por qué el arranque sube 0,3.** El hecho de una renuncia tiene que poder decirlo `atlas check` **y la pantalla de Verificación**, que lee `integrity(state)`, y eso obliga a proyectar la renuncia: `project-ledger.ts`, `state.ts` e `integrity.ts` están en el camino de arranque. Es el mismo reparto que la 010 eligió para el aviso de ejercicio cerrado —el **hecho** en el arranque, la **cifra** en el trozo perezoso— y por la misma razón: sin proyectarla, `check` a secas no podría decirlo y la salida se convertiría en una forma de limpiar el expediente.

**Por qué el total sube 0,9 y no 0,4 como estimé.** Mi estimación contaba solo los textos. Lo que de verdad entró: los dos textos del hallazgo y del error en la web (+0,2), la nota nueva del informe con su traducción (+0,2), el tipo de evento con su forma, su rótulo y los de sus tres campos (+0,2) y la proyección de la renuncia con su tipo (+0,3). **La estimación era mía y era baja**; lo digo porque el margen que pediste «no más» lo pedí yo mal calculado.

**Comprobado otra vez sobre los mapas de origen de los 59 trozos: cero módulos en más de uno** (296 módulos). No hay duplicación escondida bajo el techo.

**Lo que no hago:** subirlo por mi cuenta. La decisión es tuya, y el cierre de ronda lleva el trinquete que pediste —los dos techos a lo medido más un margen pequeño, con lo que hay dentro escrito—, así que basta con que digas el número. Con lo medido hoy serían **73,5 el arranque** (sin tocar, y ya es lo medido más 0,2) y **237,9 el total** (lo medido más uno, como se ha hecho siempre).

Todo lo demás del bloque 8 está **hecho y verde**: `lint`, `typecheck`, 1.820 tests y **100 %** de dominio. Lo único rojo es `npm run build`, y solo por el techo.

---

## 4. Observaciones sobre el propio encargo

El encargo pide expresamente que verificar sus afirmaciones y decirlo sea trabajo hecho. Cuatro cosas.

### E1 — Confirmada la retirada de §6 (f): el mensaje **no** culpa al año pedido

El inventario decía que «el mensaje culpa al ejercicio que el usuario pidió» y el encargo lo retiró. **Confirmado ejecutando**: con `atlas tax 2018` el texto es «…vigente desde 2018; **2017** es anterior», el año al que llega la cadena, no el pedido. No hay nada que arreglar ahí.

*(Dicho eso, y sin tocarlo: el texto que el usuario lee sigue siendo confuso, porque pidió 2018 y se le contesta sobre 2017 sin decir por qué la cadena tiene que llegar hasta ahí. No entra en el alcance y no lo toco; lo anoto por si la dirección quiere que entre.)*

### E2 — `tests/messages.test.ts` **no** exige las dos traducciones de un hallazgo, y añadir la de `errors.ts` en el bloque 0 lo pone en rojo

El encargo dice, del código nuevo del bloque 0: «`tests/messages.test.ts` te exigirá las dos traducciones en cuanto exista el código; la de la web son **dos** textos, el de `errors.ts` y el par `what`/`todo` de `findings.ts`». **Medido, con cuatro ejecuciones del test:**

| Qué hice | Resultado |
|---|---|
| Emitir el código nuevo con un **ternario** dentro de `error(…)` | **Rojo**, y por el sitio equivocado: el escáner busca `error(\s*"literal"`, así que deja de ver **los dos** códigos y la entrada de `filing_fingerprint_mismatch` en `findings.ts` pasa a ser «entrada muerta» |
| Emitirlo con **dos llamadas separadas** con literal, sin traducirlo | **Rojo**: «`filing_fingerprint_unreadable` sin traducir» en `findings.ts` |
| Traducirlo en `findings.ts` **y** en `errors.ts` | **Rojo**: `has no dead entry in the web catalogue` — `['filing_fingerprint_unreadable']` |
| Traducirlo **sólo** en `findings.ts` | **Verde**, los 6 tests |

El motivo: un hallazgo emitido por el ayudante `error(…)` de `deep-check.ts` **no** cuenta como código del dominio para ese test (los patrones de `CODE_PATTERNS` no incluyen `error(` ni `warning(`), así que la CLI no está obligada a traducirlo —imprime el mensaje inglés del dominio, que es el hueco conocido que el propio test documenta— y una entrada en `errors.ts` se caza como muerta.

**Dos consecuencias para la implementación**, ya recogidas en el plan:

1. La emisión del bloque 0 va en **dos llamadas con literal**, nunca en un ternario.
2. La entrada de `errors.ts` entra en el **bloque 8**, cuando el mismo código pase a ser motivo de rechazo de `compact` y deje de estar muerta. En el bloque 0 se traduce en `findings.ts` (obligatorio) y se añade el `case` de la CLI (no lo exige ningún test, pero es el que hace falta en cuanto el código llegue a `describeError`).

**Decisión de la dirección: no se arregla en esta ronda.** Arreglar el escáner obligaría a la consola a traducir todos los hallazgos, y eso es otra feature; queda apuntado para la siguiente. Lo que sí queda **prohibido en esta ronda es el ternario**: los códigos se escriben como literales. Y este apartado se queda escrito con sus cuatro ejecuciones precisamente para que el arreglo se pueda hacer sin volver a descubrirlo.

*(Lo que el punto ciego significa, dicho entero: ese test guarda la invariante de que todo código del dominio se traduce en las dos interfaces, y **un ternario esconde los dos códigos a la vez** — el nuevo y el que ya estaba.)*

### E3 — `BOOLEAN_FLAGS` no está en `main.ts`, y la opción del bloque 8 no puede ser booleana

El encargo dice que el *flag* nuevo de `compact` lleva «su entrada en `ARITY` y `BOOLEAN_FLAGS` de `apps/cli/src/main.ts`». Tres precisiones:

- `BOOLEAN_FLAGS` vive en **`apps/cli/src/args.ts`** (línea 28); en `main.ts` está `ARITY`.
- `ARITY` cuenta **palabras posicionales** por comando, no opciones: `compact: 1` significa que `atlas compact` no lee ninguna palabra más. Una opción con valor **no la cambia**.
- Y el propio encargo pide que la salida sea **por presentación** («acepto que la huella de **esta** presentación no se pueda verificar»), así que la opción **lleva valor** y por tanto **no puede** ir en `BOOLEAN_FLAGS`: esa lista es justamente la de las que nunca llevan valor (N32/N33 de la 009).

Lo que sí hay que tocar es `REPEATABLE_FLAGS` de `args.ts` —para poder nombrar varias presentaciones— y el `assertKnownFlags` de `apps/cli/src/commands/compact.ts`, que hoy sólo admite las globales. Propuesta de nombre: **`--accept-unverified <filing_id>`**, repetible.

> **Conforme la dirección**, que confirma el motivo —la salida es **por presentación**, así que la opción lleva valor— y da por buena la forma `--accept-unverified <filing_id>`, repetible, que es exactamente lo que pedía al decir que no quería un `--force` que lo arrasa todo. **El encargo nombró mal el fichero de las listas de opciones**: `BOOLEAN_FLAGS` está en `apps/cli/src/args.ts`, no en `main.ts`.

### E4 — El tipo del bloque 5 llega a **diez** ficheros, pero el compilador sólo romperá en **dos**

El encargo dice que `ClosedYearImpact` «llega a ocho puntos de uso» y que «lo que cambia es el tipo, y el compilador te va a enseñar la lista entera». Medido:

```
$ grep -rln ClosedYearImpact apps/*/src
apps/cli/src/output/closed-years.ts
apps/web/src/components/ClosedYearNotice.tsx
apps/web/src/ledger/write.ts
apps/web/src/routes/ajustes/SettingsDialogs.tsx
apps/web/src/routes/ajustes/configuracion.tsx
apps/web/src/routes/movimientos/ReverseDialog.tsx
apps/web/src/routes/movimientos/detail.tsx
apps/web/src/routes/registrar/Effect.tsx
apps/web/src/routes/registrar/EventForm.tsx
apps/web/src/routes/registrar/preview-step.ts

$ grep -rln '\.moves' apps/*/src
apps/cli/src/output/closed-years.ts
apps/web/src/components/ClosedYearNotice.tsx
```

Son **diez** ficheros los que nombran el tipo y **dos** los que leen `.moves`. Los otros ocho sólo lo **transportan** (`readonly ClosedYearImpact[]` de una firma a otra), así que sustituir `moves` por la unión cerrada **no los rompe**: el compilador enseñará dos sitios, no diez. La advertencia del encargo («eso no lo hace barato») es cierta en el fondo y engañosa en el método: **no me puedo fiar del compilador para enumerar las consumidoras del bloque 5**, y las enumero a mano. Queda escrito porque es justo la clase de supuesto que deja una interfaz sin actualizar.

> **La dirección no lo ve como un problema, y tiene razón**: si el desenlace nuevo **sustituye** a `moves`, las dos que leen `.moves` son exactamente las dos que tienen que cambiar, y el compilador las señala. Las otras ocho transportan el tipo y no tienen nada que decidir. La enumeración a mano se queda como **verificación**, no como red principal.

---

## 5. Documentos que la dirección tendrá que actualizar

No los toco (§2 bis): los traslada la dirección. Lista mínima, que se completará al cerrar la feature.

| Documento | Qué cambia |
|---|---|
| `docs/data-schema.md` **§4** | La tupla de la huella de idempotencia: para `tax_return_filed` deja de incluir `filed_at` (bloque 3). |
| `docs/data-schema.md` **§5** | El contrato de `compact`: deja de ser cierto que «hoy no hay salida», y hay que describir la salida explícita, por presentación y **registrada** (bloque 8). |
| `docs/data-schema.md` **§3 y §6** | El tipo de evento nuevo del bloque 8 y el recuento de tipos (pasaría de 25 a 26), si la dirección acepta la ADR. |
| `docs/data-schema.md` **§6.6** | La validación de `computed.as_of` (bloque 1). |
| `docs/data-schema.md` **§7** | La tabla de `deepCheck`: el código nuevo del caso `unreadable` y el hallazgo permanente de la renuncia (bloques 0 y 8). Y el aviso de ejercicio cerrado, que gana su tercer desenlace (bloque 5). |
| `docs/business-rules.md` **§5.12** | El párrafo «Con una salvedad, y hay que conocerla», que describe el hueco del aviso de ejercicio cerrado como abierto y dice que «se cierra en la ronda siguiente»: es ésta (bloque 5). |
| `docs/pendientes-post-010.md` | Las nueve pendientes vivas pasan a hechas, o a lo que la dirección decida. |
| `docs/prompts/README.md` | La entrada del prompt 011. |
| `docs/adr/README.md` | El índice, si la ADR del bloque 8 se acepta. |

---

## 6. Cómo vi cada test en rojo

Arreglo por arreglo. Un test que no he visto fallar no es un test.

### Bloque 0 — los dos mensajes

**Los tres tests se escribieron antes que el arreglo** y se vieron en rojo, cada uno por su motivo, no por un error de compilación:

```
× says a fingerprint cannot be verified, under a code of its own
  AssertionError: expected [ 'outdated_lines', …(1) ] to include 'filing_fingerprint_unreadable'
× names the schema version of the fingerprint, not the count of lines it covers
  AssertionError: the given combination of arguments (undefined and string) is invalid …
× carries the declared version on every check, not only on the one that fails
  AssertionError: expected [ [ undefined, undefined ] ] to deeply equal [ [ undefined, 1 ] ]
```

Y el de los mensajes, visto en rojo **antes** de traducir nada:

```
FAIL tests/messages.test.ts > translates every finding the domain can raise
  AssertionError: expected [ 'filing_fingerprint_unreadable' ] to deeply equal []
```

**Mutantes 1 y 2 del encargo, los tres muertos**, con un guion que afirma que la sustitución ocurre (`assert original.count(old) == 1`), comprueba el fichero después y lo restaura:

```
KILLED   1a swap the codes (unreadable under digest's code)
KILLED   1b swap the codes (digest under unreadable's code)
KILLED   2 print the line count where the version goes
```

*(Y una lección de método propia: el primer commit del bloque 0 entró con **Biome en rojo**. Redirigí a fichero y leí el `$?`… y comiteé igual sin mirarlo. Reconstruido con `--amend`. **La lección no es redirigir: es no commitear hasta haber leído el resultado.** Redirigir sin mirar es el mismo error con un paso más — confirmado por la dirección, que además señala que van **tres rondas seguidas** con esta trampa y que eso ya no es un problema de hábito. Ver la propuesta P8.)*

### Bloque 1 — `computed.as_of`

Los dos tests escritos antes, vistos en rojo:

```
× refuses a calculation that does not cover the year it declares
× refuses a calculation dated after the filing itself
```

Y al ponerlos en verde aparecieron **P6 y P7**, que pararon el bloque. Resueltos los dos, se rehízo con las comparaciones buenas, vistas en rojo otra vez:

```
× refuses a calculation that does not cover the year it declares
× refuses a calculation dated after the line that carries it
```

**Mutante 3, muerto en sus tres formas:**

```
KILLED   3a drop the comparison against the end of the tax year
KILLED   3b drop the comparison against recorded_at
KILLED   3c let the last day of the year through as too early
```

*(Y un tercer test se puso rojo por su cuenta, el de las plantillas de mensajes de la web: su catálogo de «qué detalle del dominio es una fecha» no conocía `as_of`, así que lo renderizaba como `12.5` y saltaba la regla de los decimales con punto. Añadido `as_of` —y `recorded_at`— a esa lista, que es dato del test, no una relajación de la regla.)*

### Bloque 4 — la lectura alternativa que no se puede calcular

**Ocho tests escritos antes**, los ocho en rojo con el mismo `DomainError: the engine applies the compensation regime in force since 2018; 2017 is earlier` — que es el defecto, no un fallo de compilación.

**Mutantes 5 y 6, los seis muertos**, cada guardia por separado:

```
KILLED   5a drop the guard of the filing comparison
KILLED   5b drop the guard of the criteria readings
KILLED   5c drop the guard of the previous settings
KILLED   5d drop the guard of the closed-year figures
KILLED   5e drop the guard of movedTaxYears
KILLED   6 let the guard swallow any error
```

**El cierre del mapa de la web no es vacío**, comprobado quitando una entrada: `typecheck` en rojo nombrando `no_carrier_left`.

Y una rama que la cobertura cazó: el `lines.length > 0` del caso nuevo no tenía su lado falso. En vez de borrarla, el caso que la ejerce —**un ejercicio al que ningún criterio se aplica**, aunque su lectura alternativa siga sin poder calcularse— es el invariante que la función ya declaraba: un criterio se deja fuera **solo** cuando ninguna cifra del ejercicio lo aplica.

### Bloque 6 — el ancla de lo declarado

Tres tests escritos antes, en rojo por lo que tenían que estar:

```
× keeps every substitution the chain applied, not the last one
× carries what it computed and what was declared, for each one
× is an empty list, not a missing field, when nothing was filed
  AssertionError: expected undefined to deeply equal []
```

**Mutante 8a, muerto:** `KILLED   8a keep only the last substitution`. *(El 8b —no pintarla en la web— se queda sin matar mientras la pantalla no la pinte: ver P9.)*

**El fichero dorado se movió, y exactamente como estaba predicho.** Predicción escrita y comiteada **antes** de regenerar (`anchors-expectation.md`), y comparada después de dos formas:

```
$ diff antes.json después.json
2a3    >     "anchors": [],
224a226  >     "anchors": [],
1378a1381 >     "anchors": [],
1839a1843 >     "anchors": [],
líneas añadidas: 4 · líneas quitadas: 0

comparación clave por clave: 4 diferencias
  + /2026/anchors = []
  + /2027/anchors = []
  + /2028/anchors = []
  + /2029/anchors = []
```

Ni una cifra movida, y `synthetic-v1.jsonl`, `synthetic-v1.snapshot.json` y `tax-hand-v1.jsonl` intactos.

### Bloque 5 — el aviso que se calla

El caso que hoy calla, **escrito primero y visto en rojo**: libro con eventos inválidos en las dos lecturas y una recompra de enero de 2028 —fuera del ejercicio presentado por fecha— que movería la base de 2027. Antes: `impacts` vacío, silencio. Ahora: `{ status: "not_compared", reason: "invalid_reading" }`.

**Mutante 7, muerto en sus dos mitades:**

```
KILLED   7a never emit the third outcome
KILLED   7b emit it always, even when it was compared
```

*(Y el guion volvió a abortar por un ancla que ya no existía —el `figuresOf` del bloque 4 había cambiado esas líneas—, antes de escribir nada. El lote se rehízo **entero**, no se continuó.)*

### Bloque 8 — la salida registrada de `compact`

Los tests escritos antes, en rojo:

```
× lets the user accept one unverifiable fingerprint by name, and records it
× writes no waiver when the compaction does not go through
```

**La atomicidad que exigió la dirección, probada.** El test interrumpe la compactación **en `replace`**, que es después del punto en que la renuncia se construye y lo único que escribe, y comprueba que el libro queda **byte a byte como estaba** y sin renuncia. El invariante es de dónde se escribe: la renuncia viaja **dentro de la misma lista** que se entrega a `replace`, y no hay ningún camino que la escriba por separado.

**Mutante 11, muerto en sus tres mitades:**

```
KILLED   11a accept the compaction without the user asking for it
KILLED   11b accept it without leaving the record
KILLED   11c make check stop saying it afterwards
```

**Y la trampa del ternario volvió a morder**, esta vez en `compact.ts`: al hacer que el rechazo nombre **cuál** de los dos motivos es —porque solo uno de ellos acusa a alguien—, escribí `new CompactRejectedError(cond ? "a" : "b", …)` y el escáner de `tests/messages.test.ts` dejó de ver **los dos** códigos, marcando como muertas las dos traducciones que ya existían. Rehecho con dos `throw` de literal.

**Las dos veces, y por qué importa que sean dos.**

| Cuándo | Qué pasó | Qué lo paró |
|---|---|---|
| Bloque 0 | Al emitir el código nuevo con un ternario dentro de `error(…)`, el escáner dejó de ver los dos códigos y la traducción que ya existía pasó a «entrada muerta» | **Medirlo**: cuatro ejecuciones del test, apuntadas en E2, y la regla escrita en el plan — literales, nunca un ternario |
| Bloque 8 | Lo mismo, en otro fichero (`compact.ts`) y con otro constructor (`CompactRejectedError`) | **La regla escrita**, que ya estaba en el plan cuando volví a caer |

La primera vez costó cuatro ejecuciones y un rato de no entender por qué fallaba el sitio equivocado. La segunda, el tiempo de leer mi propia nota. **Es el argumento entero de por qué se escriben las lecciones**: no para acordarse, sino para que dejen de depender de que uno se acuerde.

### Bloque 7 — el test antideriva

Se ve en rojo **por construcción**: es el mutante que el propio encargo pide, y lo mata en las **dos** direcciones nombrando **las dos** entradas, que es lo que se pedía.

```
KILLED   10a swap them in the catalogue  — nombra: ['2:fund_2m', '2:fund_1y']
KILLED   10b swap them in the document   — nombra: ['2:fund_2m', '2:fund_1y']
```

**Las 34 filas coinciden una a una con el catálogo**, y el test ya no tiene exenciones: `DOCUMENT_SILENT` y la regla de «la certeza más dudosa la lleva alguien» han desaparecido, y una celda que no diga exactamente una de las ocho palabras del vocabulario es una fila que el test **se niega a leer** en vez de leer con holgura.

### P7 — el reloj de la web

El arreglo se vio en rojo **antes de existir**, en los tres tests que destapó, y la suite entera lo confirmó: **3 rojos de 450**, los tres por bombas de relojería, ninguno por la regla. El detalle está en P7.

### Bloque 2 — la asimetría de los criterios firmes

Los dos tests escritos antes. El de la web se vio en rojo **dos veces y por motivos distintos**, y la primera no valía: apuntaba al ejercicio 2029 del libro dorado, que está **vacío** (sin líneas, sin pendientes y base 0), así que la pantalla enseñaba su único estado vacío y la tarjeta no se pintaba por otra razón. Apuntado a **2028** —con cifras, cuatro dudosos y ningún criterio firme que mueva nada— se vio en rojo por lo que tenía que verse:

```
× says that no settled criterion moves anything, instead of empty headings
  AssertionError: expected '\n10. Criterios firmes: lo que moverí…' to contain 'Ninguno'
× keeps the card of the settled criteria when none of them moves anything
  AssertionError: expected undefined to be defined
```

**Mutante 9, muerto en las dos interfaces**, con dos sustituciones en el fichero de la web y las dos afirmadas:

```
KILLED   9a hide the web card when it is empty
KILLED   9b print the empty table again in the console
```

*(Y el guion de mutación hizo su trabajo: abortó dos veces por un ancla que aparecía **dos** veces —las dos tarjetas comparten esas tres líneas—, en vez de dar por muerto un mutante que nunca se escribió. Es la lección de §3 de las notas de la 010, funcionando.)*

### Bloque 3 — la huella de duplicados

Un test escrito antes, rojo por la colisión que no ocurría:

```
× identifies a filing by model, year and receipt, not by the date it was filed
  AssertionError: expected 'sha256:b6be9fcf…' to be 'sha256:ea209d06…'
```

Y **ningún fichero dorado se movió**, que era la predicción: `git status tests/fixtures/` vacío después del cambio, con la suite entera en verde.

**Mutante 4, muerto en sus dos mitades:**

```
KILLED   4a put filed_at back into the tuple
KILLED   4b take receipt_reference out of the tuple
```

---

## 6 bis. Verificación en navegador (2026-09-23)

**20 capturas medidas**, fuera del repositorio, en `~/atlas-private/capturas/2026-09-23-fail-safe-gaps/`, con el guion que las hizo al lado (`011-cdp.mjs`, `011-shots.mjs`, `011-shots-writes.mjs` y las dos semillas). Chromium de Playwright conducido por CDP desde el scratchpad, sin una sola dependencia nueva en el repositorio.

**La matriz**: 400×890 con densidad 3 (el teléfono del usuario), 2045×1141 (su monitor) y 360 de ancho; con datos y con el libro vacío; con la privacidad quitada —que es como se miden los desbordamientos— y puesta; claro y oscuro. En las veinte, `scrollWidth === clientWidth` **comprobado en el navegador**, no a ojo, y ningún elemento sobresale del ancho del documento.

**Qué se miró, y qué enseña:**

- **El ancla de lo declarado**, con **dos** Rentas presentadas: las dos aparecen, en orden, encima de la tabla de pendientes, diciendo lo que la aplicación calculaba y lo que el usuario declaró.
- **Con la privacidad puesta**: el **hecho** sobrevive («Anclado en lo que declaraste en 2027») y **todos** los importes salen enmascarados, incluidos los dos del ancla.
- **La tarjeta de criterios firmes vacía**, con su estado nuevo, y con entradas.
- **Ajustes → Verificación** con el hallazgo de la huella no verificable, sus dos enlaces y la fecha en que el usuario la dio por buena.
- **El tercer desenlace del aviso de ejercicio cerrado**, en la escritura de **Configuración**, con la causa `by_design` de un Modelo 720.
- **El libro vacío**, que sigue enseñando un solo estado vacío con el siguiente paso.

**Y dos cosas que solo se vieron mirando**, que es el argumento entero de por qué las capturas no son opcionales:

1. **Un defecto de mi arnés, no de la pantalla.** La primera tanda salió con el reloj real del sistema, y el libro dorado vive en 2026-2029: las presentaciones de 2027 y 2028 estaban **en el futuro**, ninguna en vigor, y la pantalla enseñaba «No hay nada que declarar» sin una sola ancla. Con el reloj fijado en 2030 apareció lo que había que ver. *(Y es la otra cara del arreglo de P7: ahora que `today()` lee un reloj, el arnés puede fijarlo.)*
2. **Un defecto de verdad: «Afecta a el Modelo 720».** En español `a` + `el` es **al**. Nadie lo había visto porque un 720 solo llegaba a ese aviso cuando lo que se escribía caía **por fecha** dentro de su ejercicio; desde que existe el tercer desenlace llega **siempre que se escribe algo**, y la primera captura del caso nuevo lo enseñó. Arreglado en las dos interfaces, con su test en la consola, que comprueba además que la Renta conserva su artículo.

---

## 7. Decisiones tomadas sobre la marcha

*(Vacío. Aquí van las que aparezcan al implementar y no estuvieran en el plan, con su motivo.)*

---

## 8. Respuestas de la dirección (2026-09-23)

Las cinco preguntas respondidas, dos correcciones al plan y una instrucción de método. Lo que cambia está aplicado en `plan.md` y en `spec.md`.

- **P1 — ninguna de mis dos opciones, y el motivo importa.** La regla no es una fecha: es que **`as_of` cubra el ejercicio entero que declara**; si el cálculo se hizo con un corte que deja fuera media declaración, las cifras declaradas son incompletas y el reparto en las cuatro causas sale falso, que es lo que la validación existe para impedir. **La comparación se deriva de cómo corta el libro, no al revés**, y hay que comprobarlo y escribir en el plan cuál se comprobó y cómo. Además: la (a) rechazaría un cálculo hecho exactamente al cierre del ejercicio, el corte más natural que existe y algo que pudo pasar de verdad — **rechazar una línea legítima es peor que aceptar una rara**, porque deja al usuario sin forma de apuntar la realidad. Comprobado que el corte **incluye** su fecha ⇒ **`as_of ≥ 31/12` del ejercicio**. Conforme con `as_of ≤ filed_at` y con **no escribir** la tercera: «una rama que ningún test puede cubrir no se escribe y luego se justifica: no se escribe».
- **P2 — adelante.** Las tres celdas de certeza coinciden con el catálogo.
- **P3 — qué garantiza el test y qué no**, para que no se le pida lo que no da: es **un trinquete contra la deriva futura, no una prueba de que los valores de hoy sean correctos**. Lo de hoy es correcto porque está razonado en el documento de criterios y en los comentarios por variante del catálogo, no porque dos ficheros digan lo mismo. **Esa frase va en la cabecera del test**, que es donde alguien la leerá dentro de dos años.
- **P4 — forma aprobada**, con las cuatro exigencias sobre el evento (arriba, en P4, y aplicadas en `plan.md` §8). Se escribe como **ADR en estado `Propuesta`** y la acepta la dirección.
- **P5 — sin objeción** al reparto en dos pasos.
- **E2 — no se arregla en esta ronda**, pero queda escrito con sus cuatro ejecuciones; **prohibido el ternario**. Apuntado para la ronda siguiente.
- **E3 — conforme**, con la errata del encargo corregida aquí.
- **E4 — no es un problema**: el compilador señala las dos que hay que cambiar, que son las dos que leen `.moves`.

**Dos correcciones al plan:**

1. **La forma del ancla.** Dejarla opcional **para no mover un fichero dorado** es el orden invertido: *el dorado registra lo que el diseño decide, no lo decide*. Si «no hubo sustituciones» y «lista vacía» significan lo mismo, un campo **siempre presente** es más simple y evita confundir «no lo sé» con «no hubo». La instrucción: **mirar qué convención sigue el resto del informe y hacer lo mismo**, coherencia interna por encima de la preferencia de la dirección y por encima del dorado; y si eso mueve líneas del dorado, es un **movimiento previsto** que se predice, se escribe, se comitea y se regenera. Comprobado: las **listas** del informe se serializan aunque estén vacías (`in_kind`, `doubtful`, `settled`, `notes`) y lo que se omite son los campos que no son listas (`filing`, `settings_diff`). Luego **`anchors: AnchorDifference[]`, siempre presente**, y el dorado gana una clave `"anchors": []` en cada uno de sus cuatro ejercicios. Predicción en `anchors-expectation.md`, comiteada antes de regenerar.
2. **El ternario del bloque 0 queda prohibido**; literales.

**Instrucción de método:** usar el límite de procesos al ejecutar la suite, y **no concluir nunca una regresión de una suite ejecutada bajo carga**.
