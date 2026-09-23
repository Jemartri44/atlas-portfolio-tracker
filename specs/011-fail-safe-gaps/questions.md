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

**¿Cambio la segunda comparación a `recorded_at`, o la dirección sostiene `filed_at` a sabiendas de que entonces registrar una presentación pasada exige inventar un `as_of`?**

### P7 — La comparación que sí es buena choca con un defecto conocido y fuera de alcance **(bloquea el bloque 1)**

Incluso con **sólo** la primera comparación (`as_of ≥ 31/12`), un test de la web se queda rojo, y el motivo no es la regla: es el **seguimiento 2 de `implementation-notes.md` §6 de la 010**, *«`today()` de la web no lee el reloj de los casos de uso: su comentario dice que sí, pero usa `new Date()`»*, que §4 de este encargo deja **expresamente fuera de alcance**.

`apps/web/src/ledger/state.ts:185` es `export const today = (): CivilDate => madridDateOf(new Date());`. En `presentar.test.tsx` el reloj inyectado es 2029-07-01 y el libro dorado declara el ejercicio **2027**, pero `filingProposal` recibe `today()` = **la fecha real del sistema**, hoy 2026-09-23. Resultado: la web escribe `as_of` = 2026-09-23 para un ejercicio que acaba el 2027-12-31, y la regla —con razón— lo rechaza.

En **producción** no pasa: la fecha real es la de verdad y un ejercicio que se declara ya ha terminado. Pasa **en el test**, porque el libro dorado vive en el futuro respecto del reloj real. Tres salidas, y ninguna la elijo yo:

- **(i) Arreglar `today()`** para que lea el reloj de los casos de uso. Son pocas líneas, deja el test coherente y mata de paso el seguimiento 2 — pero está **fuera de alcance** por escrito.
- **(ii) Tocar el test de la web** para que su combinación sea coherente. Frágil: vuelve a romperse cuando la fecha real avance.
- **(iii) No rechazar**, y emitir un aviso. Contradice el encargo, que pide rechazo con código propio.

**El bloque 1 queda parado hasta que la dirección elija.** Los bloques 2 a 7 no dependen de él y sigo por ellos; el trabajo hecho está guardado como parche en mi scratchpad (`011-block1-wip.patch`) y el árbol está limpio y verde.

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

*(Y una lección de método propia: el primer commit del bloque 0 entró con **Biome en rojo**. Leí el `$?` del `lint` y comiteé igual sin mirarlo. Reconstruido con `--amend`. El hábito que falta no es redirigir a fichero —eso ya lo hacía—: es **no commitear hasta haber leído el resultado**.)*

### Bloque 1 — `computed.as_of`

Los dos tests escritos antes, vistos en rojo:

```
× refuses a calculation that does not cover the year it declares
× refuses a calculation dated after the filing itself
```

Y al ponerlos en verde aparecieron **P6 y P7**, que es lo que ha parado el bloque.

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
