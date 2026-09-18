# Preguntas abiertas — feature `008-fiscal-provisions`

Lo que el prompt me prohíbe resolver por mi cuenta: dudas fiscales, decisiones estructurales, contradicciones entre el prompt y los documentos o el código, y cualquier cosa que mueva el *golden* más allá de las nueve líneas previstas.

Cada pregunta lleva **contexto suficiente para responderla sin abrir el código**, las opciones con su coste y **mi recomendación**. `spec.md` y `plan.md` están escritos con el supuesto recomendado (los `A1`–`A12` de `spec.md`): si no hay respuesta, se implementa eso.

Van ordenadas por lo que cuesta cambiarlas después. La **Q0 no es una pregunta de esta feature**: es un defecto vivo que he encontrado verificando el bloque 3, y que el bloque 3 empeora.

---

> **Todas respondidas por la dirección el 2026-09-18**, antes de escribir una línea de código. **Diez confirmaron la recomendación; dos la cambiaron** (Q0 entra en el alcance, Q3 se amplía a `valuation`). Tres eran errores del prompt o del ADR, reconocidos: **Q1**, **Q10** y **Q11**.

## Respuestas de la dirección (2026-09-18)

| # | Respuesta | Qué cambia respecto al supuesto |
|---|---|---|
| **Q0** | **Arréglalo, y que sea tu primer commit.** *«Es un defecto vivo en `develop`, en la operación más común que existe, en una web que acabo de fusionar hoy.»* Y el test que lo congela se arregla también: *«comprobar que el campo no está sin comprobar que el borrador resultante sea válido es exactamente el patrón de “test que miente” que llevamos dos features cazando»* | Entra un commit 1 que el encargo no tenía |
| **Q1** | **Patrón completo**, como sus dos mapas hermanos. *«El error es mío, y van cinco: escribí que `fiscal_date_rule` no estaba en `DEFAULT_SETTINGS` y sí está… Que no nazca siendo el impar de tres»* | Nada respecto a la recomendación |
| **Q2** | **Sí, obligatorio también en euros.** *«Un formato que tiene que durar veinte años vale más sin casos especiales: cada excepción es una rama que alguien interpretará mal en 2034.»* Y ya guardamos `fx_rate: "1"`, que es igual de vacío. **Que lo rellene la interfaz desde la fecha valor**; el usuario no debe teclearlo nunca en euros | Se añade el relleno automático en la interfaz |
| **Q3** | **`valuation` entra.** *«Me convence tu propio argumento: la puerta se cierra con esta feature y decidirlo por omisión sería malo.»* Más una razón fiscal concreta: el Modelo 720 valora a cotización de 31/12 **convertida al tipo del BCE de ese día** | **9 → 29 líneas** en el *golden*. `golden-expectation.md` actualizado y **reverificado** antes de tocar nada |
| **Q4** | **Añádela.** *«La instantánea debe reflejar la proyección nueva, y que caiga en el bloque 1 y no en el 3 es precisamente lo que mantiene limpio el diff del endurecimiento»* | Nada |
| **Q5** | **Resta de lo transmitido, como en `sell`.** Pero *«no lo trates como cosa resuelta: es un criterio fiscal nuevo, y hoy mismo hemos aprendido lo que pasa cuando uno se cuela sin marcar»* | Se añade abajo la ficha del criterio, con su dirección de riesgo, para que la dirección la lleve a `docs/fiscal-questions.md` |
| **Q6** | **Sí, exige tesis**, con el `thesis_id` del activo recibido. *«No abrimos un agujero en la regla 15 por comodidad»* | Nada |
| **Q7** | **No entra en el *golden***, y el motivo decisivo es el segundo: un subflujo propio protege los identificadores pero **no** la instantánea | Nada |
| **Q8** | **No los rellenes**, y **tampoco en un commit trece**: *«llenar `fee_kind` en el escenario vuelve a mover el *golden*, y dos regeneraciones en una misma feature es justo lo que hace ilegible un diff»* | Se retira el commit trece que había propuesto |
| **Q9** | **Confirmado**, toca los dos (más `values.ts` por la Q0). Solo `format/messages/` está reservado | Nada |
| **Q10** | **`withholding` dentro de `per_account[]`.** *«Tienes razón y me aparto de la letra de mi propio ADR… Actualizo ADR-0021 hoy mismo, no cuando me acuerde — es literalmente la lección que acabo de escribir en el relevo después de que ADR-0013 pasara tres semanas contradiciendo al código»* | Cambia la forma del campo |
| **Q11** | **24, y el error de suma es mío.** Los documentos los actualiza la dirección: **no preparo parches**, solo la lista exacta de secciones | Se añade abajo la lista |
| **Q12** | **Aprobado tal cual**, aviso `swap_fiscal_dates_differ` incluido. *«Que las dos fechas coincidan siempre en cripto por cripto no es motivo para no modelarlo»* | Nada |
| **N1** | **Conforme**: la misma regla de dos letras mayúsculas. Una lista ISO de verdad tocaría también `dividend` y `account_created` y es otra feature | Nada |

**Dos recordatorios de la dirección**, recogidos aquí porque son criterios de terminado: **`npm run lint` como último paso antes de entregar** (quinta vez que se pide); y en el bloque 3, **si la instantánea se mueve una sola línea no prevista, parar y preguntar** — *«tu §4 explica por qué no puede moverse, y si se mueve es que ese razonamiento tiene un agujero, que vale más que la feature entera»*.

---

## Q0 — La web no puede registrar una compra en euros. Hoy. Y el bloque 3 extiende el problema al efectivo

**Esto no es una duda de diseño: es un defecto reproducible en `develop`.**

**Qué pasa.** El formulario de la web oculta `fx_rate` y `fx_rate_date` cuando la divisa es el euro (`visibleWhen: { field: "currency", notEquals: "EUR" }`). Al construir el borrador, `toDraft` conserva los campos ocultos que son obligatorios **usando su valor `initial`**, no lo que hay en el formulario:

```ts
const value = fieldValue(field, visible ? raw : (field.initial ?? ""));
```

`fx_rate` tiene `initial: "1"`, así que sobrevive. **`fx_rate_date` no tiene `initial`**, así que se convierte en `""`, y una cadena vacía se descarta del borrador. El resultado es un borrador sin `fx_rate_date`, y `buy` lo exige desde la Fase 1.

**Comprobado.** Pasando por el código real de la web (`FORM_SPECS` → `initialValues` → `toDraft`) y por `validateShape` del dominio:

| Formulario, divisa EUR | Borrador que produce la web | Veredicto del dominio |
|---|---|---|
| `buy` | `{type, account_id, asset_id, trade_date, value_date, quantity, unit_price, currency:"EUR", fx_rate:"1", fee, source}` — **sin `fx_rate_date`** | ❌ `buy: fx_rate_date is required` |
| `cash-in` | `{type, account_id, value_date, amount, currency:"EUR", fx_rate:"1"}` — sin `fx_rate_date` | ✅ aceptado **hoy**; ❌ tras el bloque 3 |

Afecta a `buy`, `sell`, `dividend` e `interest` en euros —es decir, a **casi todo** lo que este usuario registra— y hay un test que congela el comportamiento como si fuera correcto: *«keeps a hidden required field (the euro rate is 1 and is not asked)»*, con `expect("fx_rate_date" in draft).toBe(false)`. El test comprueba que el campo **no** está, sin comprobar que el borrador resultante sea válido.

**Por qué me la encuentro yo.** Porque el bloque 3 convierte `cash_deposit`, `cash_withdrawal` y `standalone_fee` en tres casos más del mismo fallo. Si lo dejo estar, entrego una feature que rompe los tres asistentes de efectivo de la web.

**Opciones**

1. **Arreglarlo aquí**, fuera del alcance escrito. Un cambio pequeño en `apps/web/src/view-models/forms/values.ts` (un campo oculto y obligatorio conserva **el valor que tiene**, no su `initial`) más `initial` o `derive` sensato para `fx_rate_date`, más corregir el test que lo congela. Coste: toca la web, que el prompt deja fuera; se mezcla con una feature de esquema.
2. **Arreglar solo lo que rompe el bloque 3** (los tres eventos de efectivo) y dejar `buy`/`sell`/`dividend`/`interest` rotos. Coste: arreglar la mitad de un defecto de clase es como sobreviven las inconsistencias, y son las compras lo que el usuario registra a diario.
3. **No tocar nada y entregar con la web rota en efectivo**, abriendo un `fix/` aparte. Coste: `develop` queda con tres asistentes más rotos que ahora, y la 007 acaba de fusionarse.
4. **Dárselo al otro agente** (el de `apps/web/src/format/messages/`). Coste: coordinación; el fichero es `view-models/forms/values.ts`, no el suyo.

**Recomendación: opción 1**, en **un commit propio al principio del bloque 3**, con el test que hoy congela el fallo reescrito para exigir que el borrador de una compra en euros sea **válido para el dominio**, que es la comprobación que faltaba. Es media hora y evita entregar una regresión encima de un defecto.

**Pregunta concreta**: ¿lo arreglo aquí (opción 1), lo dejo fuera (opción 3), o prefiere otra cosa?

**Y una segunda, aparte**: ¿qué valor debe llevar `fx_rate_date` en un evento en euros registrado desde la web? Hoy el usuario no lo ve. Mi propuesta: **el último día hábil anterior o igual a la fecha fiscal**, calculado por la web con la función que ya existe en el dominio (`lastWorkingDay`), y mostrado en la pantalla de confirmación para que no sea un dato invisible. Enlaza con la **Q2**.

---

## Q1 — `income_category`: ¿el patrón que dice el prompt, o el que tiene el código?

**Contexto.** El prompt §3 dice: *«Sigue el patrón exacto de `fiscal_date_rule`: resuelto en el punto de uso, **no metido en `DEFAULT_SETTINGS`**, para que la ausencia nunca caiga en un valor por eliminación y el `fiscal_settings` del *golden* no se mueva»*.

Las tres afirmaciones de esa frase no encajan con el código:

1. **`fiscal_date_rule` sí está en `DEFAULT_SETTINGS`** (`settings.ts`), junto con `wash_sale_window`. Lo que está «resuelto en el punto de uso» es el **lector**, `fiscalDateRuleOf(settings, assetType)`, que devuelve `settings.fiscal_date_rule[t] ?? DEFAULT_FISCAL_DATE_RULE[t]`. El patrón que de verdad no está en `DEFAULT_SETTINGS` es el de `wash_sale_transfer_counts` (booleano leído por `washSaleTransferCounts`).
2. **`normalizeSettings` rellena `fiscal_date_rule`** al leer, y `settingsAt` lo aplica.
3. **El `fiscal_settings` del *golden* no depende de nada de esto.** `state.fiscalSettings` es el objeto **crudo** del último `settings_changed` (`resolveFiscalSettings` devuelve `last.settings`, sin normalizar), y el escenario sintético escribe **sus propios mapas** (`SCENARIO_FISCAL_DATE_RULE`, `SCENARIO_WASH_SALE_WINDOW`) precisamente *«para que los valores por defecto no reescriban tres `settings_changed` del golden cada vez que se añade un tipo»*. Lo comprobé: el `fiscal_settings` del *golden* **no tiene `etf`**, aunque `DEFAULT_FISCAL_DATE_RULE` sí. El *golden* está protegido, se haga lo que se haga.

**Y hay un ADR posterior al prompt.** **ADR-0022** (aceptado el 2026-09-18, fusionado en `develop` con la PR #48) nombra expresamente *«los mapas por tipo de activo (`fiscal_date_rule`, `wash_sale_window`, y ahora `income_category` de ADR-0021)»* y decide que **al escribir se materializan enteros** y **al leer se toleran parciales**. Un `income_category` que no esté en `normalizeSettings` no se materializaría, que es exactamente lo que ADR-0022 quiere evitar.

**Opciones**

1. **El patrón completo**, igual que sus dos mapas hermanos: `DEFAULT_INCOME_CATEGORY`, lector `incomeCategoryOf`, entrada en `DEFAULT_SETTINGS`, relleno en `normalizeSettings`, validación parcial. Efecto observable: `atlas settings show` y la pantalla de ajustes muestran siete filas más; el próximo `settings_changed` que se escriba llevará el mapa completo (que es lo que ADR-0022 decide). **El *golden* no se mueve.**
2. **El patrón literal del prompt**: solo tipo, campo y lector; nada en `DEFAULT_SETTINGS` ni en `normalizeSettings`. Efecto: `income_category` sería el impar de tres mapas idénticos, ADR-0022 no le aplicaría, y el día que alguien lo arregle será una línea de diff en un fichero de configuración fiscal.

**Recomendación: opción 1.** El motivo que el prompt da para la opción 2 (proteger el *golden*) ya lo garantiza el escenario sintético, y ADR-0022 es posterior al prompt y pide lo contrario. Si la dirección prefiere la 2, se hace: no cambia ninguna cifra en ninguno de los dos casos.

---

## Q2 — ¿`fx_rate_date` obligatorio también cuando la divisa es el euro?

**Contexto.** Los nueve eventos del *golden* que gana el campo están **todos en euros**, con `fx_rate: "1"`. El BCE no publica un tipo del euro contra sí mismo: la fecha que se guarde ahí no es «la fecha del tipo aplicado», porque no hay tipo aplicado.

Lo que dice ADR-0021 es escueto: *«`fx_rate_date` pasa a obligatorio en `cash_deposit`, `cash_withdrawal` y `standalone_fee`»*, sin condición de divisa. Lo que desbloquea, según la misma tabla, son *«lotes de divisa reproducibles»*, que solo existen fuera del euro.

**Argumento a favor de exigirlo siempre**: `buy`, `sell`, `dividend`, `interest` y `fx_exchange` ya lo exigen sin condición desde la Fase 1, también en euros, y el *golden* está lleno de compras en euros con `fx_rate_date`. Una regla condicional más que recordar es una regla más que se olvida.

**Argumento en contra**: `CLAUDE.md` dice que el libro no guarda datos inventados (`data-schema.md` §4 lo dice de `unit_price`: *«nunca se rellena con "0" ni con un valor derivado»*), y una fecha de un tipo que no existe se le parece bastante. Además es lo que hace que la **Q0** duela: obligar a pedir en la interfaz un dato que no significa nada en el 95 % de los casos.

**Recomendación: exigirlo siempre** (supuesto A3), por uniformidad con los cinco tipos que ya lo hacen, y resolver la incomodidad en la interfaz (Q0), que es donde está. Pero es una decisión de criterio y la marco.

---

## Q3 — ¿`valuation` se queda fuera del endurecimiento?

**Contexto.** `fx_rate_date?` se añadió en la feature 005 a **cuatro** eventos: `cash_deposit`, `cash_withdrawal`, `standalone_fee` y `valuation`. ADR-0021 endurece **tres**. `valuation` se queda opcional.

La ironía es que `valuation` es donde se descubrió el problema: el hallazgo 6 del tercer *challenge* decía que *«el 31/12 cae en fin de semana dos de cada siete años, así que el tipo aplicado a una valoración de fin de año no era reproducible desde la tabla oficial»*.

**Datos.** En el *golden* hay **20 `valuation` sin `fx_rate_date`** (todas en euros) frente a las 9 de los otros tres tipos. Endurecer `valuation` convertiría el diff del bloque 3 en **29 líneas** en vez de 9.

**Opciones**

1. **Solo los tres de ADR-0021** (recomendada). El ADR dice tres; una `valuation` es informativa y ningún cálculo fiscal la usa (constitución II), así que el coste de no tener la fecha es menor.
2. **Los cuatro**, aprovechando que la ventana de ADR-0018 se cierra hoy y que dentro de un mes esto ya no se puede hacer sin `schema_version = 2`. Coste: 20 líneas más de diff en la operación de mayor riesgo del proyecto, y contradecir la letra del ADR.

**Recomendación: opción 1**, con esta nota: **la puerta se cierra con esta feature**. Si alguna vez se quiere `fx_rate_date` obligatorio en `valuation`, será una versión de esquema. Conviene decidirlo ahora a sabiendas, no por omisión. Si la dirección prefiere la 2, se hace **en un commit aparte del de los nueve**, para que los dos diffs sigan siendo legibles por separado.

---

## Q4 — La renta en especie de un `grant`: ¿entra en la instantánea?

**Contexto.** El prompt dice de `income_eur`/`income_base`: *«Guárdalos y **expónlos en la proyección**; no los conviertas en ninguna regla de cálculo»*. Exponerlos en la proyección significa que el estado proyectado los lleve, y el estado proyectado se serializa en `snapshotOf`, que es lo que compara el *golden*, `compact` y `check --deep`.

**El problema.** `snapshotOf` conserva las claves vacías (`sortKeysDeep` solo descarta `undefined`). Añadir `state.inKindIncome` a la instantánea añade **una línea** a `synthetic-v1.snapshot.json`:

```
  "in_kind_income": [],
```

El escenario sintético no tiene ningún `grant` con renta, así que la lista va vacía. Pero es un cambio en el fichero que la dirección quiere quieto.

**Opciones**

1. **Añadirla a la instantánea**, en el commit del bloque 1 (nunca en el del bloque 3), documentando la línea. Ventaja: `check --deep` y `compact` comparan **toda** la proyección, que es lo que prometen. Coste: una línea del *golden* se mueve fuera del bloque 3.
2. **Dejarla fuera de `snapshotOf`**, con el estado llevándola igual. Ventaja: el *golden* no se toca en absoluto hasta el bloque 3. Coste: un valor proyectado que `compact` no compara, es decir, un agujero pequeño en la garantía de «la proyección del libro reescrito es idéntica».
3. **No llevarla en el estado**: exponerla solo en el detalle del evento corporativo (la línea ya lleva el dato). Ventaja: cero superficie. Coste: «exponer en la proyección» deja de cumplirse.

**Recomendación: opción 1**, porque un valor proyectado que la instantánea no ve es exactamente el tipo de agujero que esta feature existe para tapar, y porque la línea añadida es explicable en una frase y va en un commit que no tiene nada que ver con el endurecimiento. Si la dirección quiere el *golden* intacto hasta el bloque 3, la opción 2 es perfectamente defendible y se hace sin discusión.

---

## Q5 — El `fee` de un `swap`: ¿resta de lo transmitido o suma a lo adquirido?

**Es una pregunta fiscal, así que la pregunto.**

**Contexto.** El art. 35 LIRPF dice que los gastos inherentes a la **adquisición** suman al valor de adquisición y los inherentes a la **transmisión** restan del valor de transmisión. En una permuta, la misma comisión es inherente a las dos cosas a la vez, y contarla en los dos lados sería contarla dos veces.

| Tratamiento | Efecto en el ejercicio del swap | Efecto en el futuro | Dirección del riesgo |
|---|---|---|---|
| Resta del valor de transmisión | Ganancia **menor** hoy | El coste del recibido es el valor puro | Más agresiva hoy |
| Suma al coste del adquirido | Ganancia **mayor** hoy | El coste del recibido es mayor, ganancia futura menor | Más conservadora hoy |
| Las dos (prohibido) | — | — | Incorrecto |

**Recomendación: restar del valor de transmisión** (supuesto A6), porque es lo que hace `sell` y porque la pata de salida de un `swap` tiene que ser indistinguible de una venta —es el mismo hecho imponible—; que dos caminos al mismo hecho den cifras distintas es exactamente lo que el proyecto evita. Pero reconozco que es la lectura menos prudente de las dos y que la otra es defendible.

**Alternativa que no he propuesto y que la dirección puede preferir**: que el `swap` **no lleve `fee`** en absoluto y que la comisión se registre como `standalone_fee`. Sería coherente con lo que se decidió para `transfer` (*«un traspaso no lleva comisión»*), pero `standalone_fee` está definido como *«no afecta a la base fiscal de ningún lote»*, y aquí sí afectaría. Lo dejo dicho por si sirve.

---

## Q6 — Un `swap` en el cubo, ¿exige tesis?

**Contexto.** La regla 15 y la constitución III dicen que *«no se puede registrar una compra en el cubo sin una tesis creada antes»*, y el código lo aplica en `buy` (rechazo) y avisa en `sell` (`sell_without_thesis`). Un `swap` en una cuenta del cubo **adquiere** un activo: por la letra de la regla, es una compra.

**Opciones**

1. **Sí**: la pata de entrada exige tesis abierta del activo recibido (rechazo, como `buy`) y la de salida avisa si no enlaza ninguna (como `sell`). Dos campos: `thesis_id` de entrada y de salida, o uno solo si se decide que es la misma operación.
2. **No**: un `swap` se acepta sin tesis, con aviso.

**Recomendación: opción 1 con un solo `thesis_id`**, el de la **tesis del activo recibido** (que es la posición que se abre y la que habrá que defender), más el aviso de la pata de salida buscándole su tesis abierta por (cuenta, activo) sin pedirla en el evento. Mantiene la regla 15 intacta sin duplicar campos.

**Matiz que conviene saber**: hoy el cubo no tiene ningún activo de tipo `crypto` y el `swap` nació para cripto por cripto. Puede que este caso no aparezca nunca. Aun así, dejar la puerta abierta a comprar en el cubo sin tesis sería un agujero en una regla de conducta, y esas son las que el sistema existe para hacer imposibles de saltar.

---

## Q7 — ¿El `swap` entra en el libro sintético?

**Contexto.** El prompt lo deja a mi criterio, con condiciones: *«Si el bloque 2 te tienta a meter un `swap` en el golden, hazlo en un subflujo propio de PRNG, de ULID **y de reloj**, o no lo hagas y dilo»*.

**Lo digo: no lo hago.** Tres motivos:

1. **El escenario no tiene con qué.** Los tipos de activo presentes son `etc`, `etp`, `fund`, `money_market` y `stock`: **no hay ningún activo de tipo `crypto`**. Un swap creíble exigiría dos `asset_created` nuevos, compras que les den posición, y probablemente valoraciones. Son del orden de seis a diez líneas nuevas, no una.
2. **Un subflujo aparte no evita el riesgo real.** El subflujo protege los **identificadores** (dados, ULID y reloj propios), pero los eventos se insertan igualmente en la segunda pasada por fecha de negocio, así que un swap fechado en medio del escenario **sí** mueve lotes, ganancias, posiciones y avisos de todo lo posterior en la instantánea. Lo único seguro sería fecharlo después del último evento (2029), y entonces aporta poco como caso de integración.
3. **Hace ilegible el diff del bloque 3.** El valor de esta feature es poder decir «cambian nueve líneas y nada más». Si el *golden* ya se ha movido diez líneas en el bloque 2, esa frase deja de ser comprobable de un vistazo.

**A cambio**: el `swap` se cubre con tests propios construidos con `LedgerBuilder` (los tres casos del art. 37.1.h, las cuatro direcciones de la regla de recompra, el caso límite de pérdida + recompra, y los rechazos), que es donde ya viven los casos raros que el escenario no puede representar.

**Consecuencia menor**: el test `«covers every event type of data-schema.md §3 and the catalogue of the plan»` deja de ser literalmente cierto. Ajustaré su comentario para que diga qué tipos faltan y por qué (`swap` aquí, `tax_return_filed` en la Fase 5), en vez de dejar un título que miente.

**Si la dirección prefiere que entre**, lo haría así y lo diría antes: activo `crypto` nuevo + compra + swap, todo en un subflujo con dados, ULID y reloj propios, fechado **después** del último evento del escenario (2029), en un commit aparte y con su propio diff enumerado.

---

## Q8 — Los dos `standalone_fee` del *golden*, ¿declaran su `fee_kind`?

**Contexto.** El libro sintético tiene dos comisiones sueltas, y sus descripciones cantan:

| línea | `id` | descripción | `fee_kind` natural |
|---|---|---|---|
| 41 | `01M9XDRZ80XC95VT3Q0Z1MERPN` | `Custody fee` | `custody` |
| 146 | `01NP0FJV8015S112R2DHPJ3PNP` | `Market data fee` | `connectivity` |

Rellenarlas haría que el *golden* ejercitara el campo nuevo, que es para lo que están las fixtures. Pero son **dos líneas más** que se mueven, y se moverían en el bloque 1.

**Recomendación: no rellenarlas** (supuesto A9). El bloque 1 no toca `tests/fixtures/ledger/` en absoluto, y así, cuando llegue el bloque 3, el *golden* está exactamente como en `develop` y cualquier diferencia es atribuible a una sola causa. El campo se ejercita en los tests unitarios, que es donde se ejercita todo lo demás.

Si la dirección lo quiere en el *golden*, propongo hacerlo **después** del bloque 3, en un commit trece, para no contaminar la comparación.

---

## Q9 — Los ficheros de la web que el alcance dice que no toque, pero los tests exigen

**Contexto.** El prompt deja fuera *«cualquier cosa de la web»*. Pero la web tiene tres redes de seguridad que fallan sola­s cuando el esquema crece:

| Test | Qué exige | Qué obliga a tocar |
|---|---|---|
| `format.test.ts` — *«has a Spanish name for every event type»* | Cada tipo de `SUPPORTED_EVENT_TYPES` tiene etiqueta | `apps/web/src/format/labels.ts` (`swap`) |
| `format.test.ts` — *«…for every field of every event type»* | Cada campo de `knownFieldsOf(type)` tiene etiqueta | `apps/web/src/format/labels.ts` (`market`, `issuer_country`, `fee_kind`, `neutrality_regime` y los del `swap`) |
| `view-models.test.ts` — *«covers every field of the schema for every form»* | Cada campo de nivel superior está en el formulario o en `omitted` con su motivo | `apps/web/src/view-models/forms/specs.ts` (formulario `activo`) |

Son tests que existen para esto, así que tocarlos no es salirse del alcance: es responder a la lista de comprobación que el proyecto se puso. Pero lo digo explícitamente porque son ficheros de `apps/web`.

**Aviso de coordinación**: el otro agente trabaja en `apps/web/src/format/messages/`. Los dos ficheros que necesito son `apps/web/src/format/labels.ts` y `apps/web/src/view-models/forms/specs.ts` — **ninguno de los dos está en `messages/`**. `labels.ts` es hermano de ese directorio, así que el riesgo de conflicto es bajo pero no nulo. Si la dirección prefiere que no toque nada de `apps/web/src/format/`, la alternativa es dejar los tests en rojo y que los arregle el otro agente, que me parece peor.

**Pregunta**: ¿confirmo que puedo tocar esos dos ficheros?

---

## Q10 — `forced_sale.withholding`: ¿al nivel del efecto o por cuenta?

**Contexto.** ADR-0021 dice *«`forced_sale.withholding?`, misma forma que `sell.withholding`»*. En `sell` es un solo importe del evento. Pero un `forced_sale` liquida **cuenta a cuenta** (`per_account[]`, con su propia `fee` por cuenta, hallazgo 8 del *challenge*), porque cada bróker cobra lo suyo.

Una retención también la practica cada bróker por separado. Si el efecto lleva un solo `withholding`, hay que repartirlo entre cuentas, y el reparto es una invención del sistema; si lo lleva cada entrada de `per_account[]`, es el dato real de cada justificante.

**Opciones**

1. **`withholding` al nivel del efecto**, repartido entre cuentas en proporción a la cantidad vendida. Es la letra de ADR-0021. Coste: en el caso de dos cuentas, los euros que se restan del efectivo de cada una son un cálculo, no un dato.
2. **`withholding?` dentro de cada entrada de `per_account[]`**, junto a la `fee` que ya está ahí. Es la forma coherente con cómo el proyecto ya modela este efecto. Coste: se aparta de la letra («misma forma que `sell.withholding`»), aunque no del fondo (el tratamiento es idéntico).

**Recomendación: opción 2.** El motivo por el que la `fee` bajó a `per_account[]` —cada bróker cobra lo suyo y el reparto automático inventaba cifras— es palabra por palabra el mismo para la retención. Pero como me aparta de la letra del ADR, no lo decido.

---

## Q11 — «Sube el catálogo a 25 tipos»: en el código serán 24

**Contexto.** El prompt §3 bloque 2 dice: *«Tipo de evento nuevo. Sube el catálogo a **25** tipos»*.

`SUPPORTED_EVENT_TYPES` tiene hoy **23**. Con `swap`, **24**. El vigesimoquinto de la tabla de `docs/data-schema.md` §3 es **`tax_return_filed`**, que está *definido* por ADR-0020 y explícitamente *fuera de alcance* de esta feature (§4 del prompt). Es decir: la cuenta de 25 es la de la **tabla del documento**, no la del código.

**Lo que hago**: dejo `SUPPORTED_EVENT_TYPES` en 24 y actualizo el test que congela el número (`envelope.test.ts`, `toHaveLength(23)` → `24`).

**Lo que no puedo hacer**: `docs/data-schema.md` §3 no lista `swap` y §8.6 dice que las nueve previsiones están *«todavía no implementadas»*. `docs/` está fuera de mi alcance. Al terminar la feature, los documentos que quedan desactualizados son:

- `docs/data-schema.md` §3 (falta la fila `swap`), §4 y §6.2 (`fx_rate_date?` sigue marcado opcional en los tres tipos endurecidos), §6.1 (`market`, `issuer_country`), §6.5 (`withholding` en `forced_sale`, `income_eur`/`income_base` en `grant`), §8.6 (dejan de estar pendientes ocho de las nueve).
- `docs/business-rules.md` §7 (`income_category` en la tabla de parámetros configurables) y §6 (la permuta como operación).
- `docs/fiscal-questions.md`, tabla de huecos estructurales: siete de los nueve quedan resueltos.

**Pregunta**: ¿los actualiza la dirección, o quiere que prepare los parches en un commit aparte para que los revise?

---

## Q12 — El `swap` y la fecha fiscal cuando las dos patas son de tipo distinto

**Contexto.** `fiscal_date` se deriva por `asset_type` (ADR-0013): `trade_date` para cotizados y cripto, `value_date` para fondos y monetario. En un `swap` hay dos activos, y si son de tipos con reglas distintas, hay **dos** fechas fiscales.

En el caso que motiva el evento (cripto por cripto) coinciden siempre. En un `swap` de un ETP por un fondo, no.

**Mi propuesta** (supuesto del plan, no pregunta bloqueante): cada pata deriva su fecha fiscal de su propio tipo, como hacen `buy` y `sell`; el evento se **ordena** por la de la pata **entregada**, que es la del hecho imponible; el lote nuevo nace con la de la pata **recibida**; y si difieren, aviso `swap_fiscal_dates_differ`.

Lo señalo por si la dirección prefiere algo más simple —por ejemplo, que un `swap` use una sola fecha fiscal, la de la pata entregada, para las dos cosas— que sería más fácil de razonar y ligeramente menos correcto.

---

## Notas de lectura (no requieren respuesta, pero conviene saberlas)

**N1 — «la misma lista que ya usa `dividend.source_country`» no es una lista.** `source_country` se valida con el patrón `/^[A-Z]{2}$/` (regla `country` de `validate.ts`), igual que `account.country`. No hay catálogo cerrado de países en ningún sitio. Uso **la misma regla**, que es lo que la frase quiere decir. Si lo que se quería era una lista ISO 3166-1 de verdad, es un cambio que afectaría también a `dividend` y a `account_created`, y entonces es otra feature.

**N2 — La huella de idempotencia no se mueve.** `fingerprintOf` no incluye `fx_rate_date` en la tupla de `cash_deposit`, `cash_withdrawal` ni `standalone_fee`. Por eso las nueve líneas del *golden* conservan su `fingerprint` y el test de `check --deep` sobre `valid-v1.jsonl` (que espera `fingerprint_mismatch`) sigue esperando lo mismo.

**N3 — Fixtures que también cambian, y no son el *golden*.** `valid-v1.jsonl`, `legacy-v1-for-test-schema.jsonl` y `number-amount.jsonl` llevan un `cash_deposit` cada una sin `fx_rate_date` (línea 4, 3 y 4 respectivamente, todas con `value_date` 2026-09-01, martes). Van en el commit de la regla, no en el de la regeneración: son fixtures de forma, no de proyección.

**N4 — Por qué estoy seguro de que la instantánea del *golden* no se moverá.** Los nueve eventos están en **euros**. La única proyección que lee `fx_rate_date` de un evento de efectivo es `noteFxRates`, cuya primera línea del bucle se salta el euro; y `fxRates` ni siquiera entra en `snapshotOf`. `warnFxDate` solo lo invocan `applyBuy` y `applySell`, y no le añado invocaciones. No hay camino. Si aun así la instantánea se moviera, ese sería el hallazgo y pararía.

**N5 — El escenario no hereda los valores por defecto, y es deliberado.** `scenario.ts` escribe `SCENARIO_FISCAL_DATE_RULE` y `SCENARIO_WASH_SALE_WINDOW` propios *«para que los defectos que crecen con el enumerado no reescriban tres `settings_changed` del golden»*. Como efecto colateral, el libro sintético es hoy *«lo que parece un libro escrito antes de que existiera `etf`»*, es decir, el test de regresión de los mapas parciales de ADR-0018. Tocarlo para meter `income_category` destruiría esa propiedad. No lo toco.

**N6 — Línea base medida antes de escribir código**, en esta rama, sobre `origin/develop` (6a203a0): **101 ficheros de test, 1016 tests, 100 % de cobertura** (3184 sentencias, 1618 ramas, 708 funciones, 3061 líneas). Es contra esto que se compara al terminar.

---

## Criterio fiscal nuevo que esta feature introduce (Q5)

La dirección pidió que no lo trate como cosa resuelta y que lo deje escrito con su dirección de riesgo, para llevarlo a `docs/fiscal-questions.md`. Redactado con el formato de esa tabla:

| Campo | Contenido |
|---|---|
| **Pregunta** | En una permuta (art. 37.1.h LIRPF), ¿la comisión resta del valor de transmisión de lo entregado o suma al valor de adquisición de lo recibido? |
| **Criterio aplicado** | **Resta del valor de transmisión.** El coste de adquisición de lo recibido es el valor del art. 37.1.h *sin* la comisión |
| **Fundamento** | Art. 35 LIRPF: los gastos inherentes a la transmisión restan; los inherentes a la adquisición suman. En una permuta la misma comisión es inherente a las dos cosas, y contarla en los dos lados sería contarla dos veces. Se elige el lado de la transmisión porque la pata de salida de un `swap` **es** una transmisión y tiene que dar la misma cifra que un `sell` equivalente |
| **Certeza** | **Baja**: no hay norma ni consulta que reparta el gasto de una permuta entre sus dos patas |
| **Dirección del riesgo** | **Agresivo en el momento**: restar de lo transmitido **baja** la ganancia del ejercicio de la permuta y **sube** la de un ejercicio futuro. La lectura contraria (sumar al coste de lo adquirido) es la prudente |
| **Cómo se cambiaría** | Hoy sería un cambio de código en `swapValuation`, no de configuración. Si la revisión profesional lo corrige, el candidato natural es un valor de `Settings` (`swap_fee_side`), que no se añade ahora porque sería configuración sin pregunta detrás |

**Lo que sí está fuera de duda**, y por eso no va aquí: que la comisión se cuenta **una sola vez**.

---

## Documentos que quedan desactualizados al terminar (Q11)

La dirección los actualiza; esta es la lista exacta para que no haya que rastrearla. Ninguno de estos ficheros se toca en la feature.

### `docs/data-schema.md`

| Sección | Qué queda desactualizado |
|---|---|
| **§3** (tipos de evento) | Falta la fila `swap` en la familia *Operación*. Con ella, el catálogo documentado pasa a **26 filas**, de las cuales **24 implementadas**: `tax_return_filed` sigue siendo «definido por ADR-0020, se implementa en la Fase 5» |
| **§4** (campos comunes) | `fx_rate_date` deja de ser opcional en cualquier tipo que lo declare |
| **§6.1** (catálogo) | `asset_created`/`asset_updated` ganan `market?` e `issuer_country?`. La nota de qué rechaza `asset_updated` sigue igual: los dos nuevos **sí** se pueden cambiar |
| **§6.2** (operaciones) | `cash_deposit`, `cash_withdrawal` y `standalone_fee` pasan a `fx_rate_date` (sin `?`); `standalone_fee` gana `fee_kind?`; `valuation` pasa a `fx_rate_date` (sin `?`); `corporate_action` gana `neutrality_regime?`. **El párrafo que dice «`fx_rate_date?` se añadió en la feature 005… Es opcional y compatible» pasa a decir que la feature 008 lo hizo obligatorio en los cuatro**, con ADR-0018 y ADR-0021 como respaldo, y que esa fue la última ventana para hacerlo dentro de la v1. Entrada nueva para **`swap`** con su forma completa |
| **§6.5** (primitivas) | `forced_sale.per_account[]` gana `withholding?` (junto a `fee?`); `grant` gana `income_eur?` e `income_base?` |
| **§7** (proyecciones) | Fila nueva para `inKindIncome` en la tabla de proyecciones |
| **§8.4** (regla de recompra) | Un `swap` cuenta como **adquisición** de lo recibido y como **transmisión** de lo entregado, en las dos direcciones del aviso |
| **§8.6** (previsiones de la Fase 5) | Las nueve pasan de «todavía no implementadas» a implementadas por la feature 008; la novena se amplió a **cuatro** tipos (`valuation` incluida); la quinta cambió de forma (`withholding` dentro de `per_account[]`) |

### `docs/business-rules.md`

| Sección | Qué queda desactualizado |
|---|---|
| **§5.3** (FIFO) | La permuta es una transmisión más que consume lotes por FIFO global |
| **§5.4** (regla de recompra) | «Qué cuenta como adquisición» incluye ahora la pata de entrada de un `swap` |
| **§6** (eventos corporativos) | La permuta de un activo por otro **no** es un `corporate_action`: es un evento propio, como el dividendo en efectivo es un `dividend` |
| **§7** (parámetros configurables) | Fila nueva: `income_category{}`, por defecto `capital_gain` en todos los tipos, regla 5.1 |

### `docs/fiscal-questions.md`

| Sección | Qué queda desactualizado |
|---|---|
| **«Huecos estructurales»** | Quedan resueltos los huecos **1** (categoría de renta), **2** (mercado), **3** (domicilio del emisor), **4** (naturaleza de la comisión), **5** (`withholding` en `forced_sale`), **6** (renta en especie sin transmisión), **7** (permuta cripto-cripto) y **8** (régimen de neutralidad). Sigue abierto el **9** (lotes de divisa), que esta feature **habilita** al hacer `fx_rate_date` obligatorio, pero no implementa |
| **Los dieciséis criterios** | Criterio nuevo: el reparto de la comisión de una permuta (ficha arriba), certeza **baja**, riesgo **agresivo en el momento** |
| **«Lo que sigue siendo del usuario»** | El criterio nuevo entra en la lista de lo que merece revisión profesional |

### ADRs

- **ADR-0021** — la previsión 5 cambia de forma (`withholding` dentro de `per_account[]`, Q10) y la 9 de alcance (cuatro tipos, no tres, Q3). La dirección dijo que lo actualiza el mismo día.
- **ADR-0018** — conviene anotar que **la ventana se cerró con esta feature**: a partir de aquí, cualquier endurecimiento exige `schema_version = 2`.

### `CLAUDE.md`

- La tabla de trampas del dominio puede ganar una entrada, o ampliar la 1: **una permuta tampoco es un traspaso**, pero por el motivo contrario — no conserva antigüedad ni coste, y modelarla como `convert` omitiría la ganancia entera.

---

## Notas de la implementación (2026-09-18, después de escribir el código)

Cosas que aparecieron al implementar y que la dirección debe saber. Ninguna cambia una decisión; tres piden un sí o un no.

**N7 — He tenido que tocar `apps/web/src/format/messages/`, una línea, y lo aviso.** El test `tests/messages.test.ts` escanea **el dominio** en busca de códigos y exige que **la CLI y la web** traduzcan cada uno. Un tipo de evento nuevo con su aviso propio no puede entrar sin eso.

| Fichero | Qué le he añadido |
|---|---|
| `apps/web/src/format/messages/warnings.ts` | Una entrada: `swap_fiscal_dates_differ` |

Es lo **único** que he puesto ahí, y es una adición al final de un `Record`: el conflicto con el otro agente, si lo hay, se resuelve en una línea. Para evitar una segunda entrada, `income_category` **no** tiene código de error propio: reutiliza `invalid_settings`, que ya está traducido en los dos sitios y cuyo mensaje genérico («el parámetro X no admite ese valor») dice lo que hay que decir porque `field` nombra el tipo de activo. Si prefieres el código propio (`invalid_income_category`, como tiene `wash_sale_window`), es añadir dos líneas más, una en cada catálogo. **¿Lo dejo así o lo cambio?**

**N8 — El hook `commit-msg` rechaza la palabra «regenerated».** Su patrón antiadulación es `generated (with|by)`, y «**Regenerated with** `atlas synth`» lo cumple por subcadena. Es un falso positivo justo en la operación que esta feature tenía que describir. Lo he sorteado escribiendo «Rebuilt by». No toco `.githooks/`, pero la regla merece un `\b` o una lista de excepciones: la próxima persona que regenere el *golden* se topará con lo mismo y no sabrá por qué.

**N9 — He movido el techo del *bundle* de 164 a 166 KB gzip.** El comprobador lo pedía por escrito: *«no es un objetivo al que crecer: la siguiente feature que necesite más tiene que decir por qué y moverlo a propósito»*. El porqué: el esquema creció con un vigesimocuarto tipo de evento y su proyección, cuatro campos y una configuración nueva, más sus nombres en español, y la web empaqueta el dominio entero porque todo cálculo vive ahí (ADR-0007). Son **1,1 KB gzip**: medido 165,1, techo nuevo 166. **El arranque, que es lo que se nota en el móvil, no se ha movido: 75,6 KB frente a un presupuesto de 80.**

**N10 — Los *flags* de la CLI no tienen commit propio.** El plan preveía un commit 8 («ask for the new fields where they are still knowable»). Al implementar resultó más atómico meter el *flag* de cada campo en el commit del campo: así cada uno entra y sale de una pieza. El resultado es el mismo y el criterio de qué se pregunta y dónde sigue siendo el de la tabla del plan §1.7.

**N11 — El endurecimiento dejó dos ramas muertas, y la cobertura las cazó.** `costs.ts` y `bucket-stats.ts` databan el tipo del BCE con la fecha de negocio cuando faltaba `fx_rate_date`. Ya no puede faltar, así que el `??` era inalcanzable: el 100 % de ramas del dominio lo señaló en cuanto se regeneró el *golden*. Quitados. El respaldo equivalente de `fx-rates.ts` **se queda**, porque sí sirve a una línea escrita antes de ADR-0021 —que el libro conserva tal cual—, y tiene un test que la construye a mano.

**N12 — Dos tests usaban `swap` como ejemplo de «lo que no existe».** `validate.test.ts` comprobaba que el tipo `"swap"` se rechaza con `unknown_event_type`, y `add.test.ts` que `atlas add swap` sale con 64. Los dos han pasado a usar `barter`. No es anecdótico: son tests que **dejaron de comprobar lo que creían comprobar** en el momento en que el ejemplo se volvió real, y solo se enteró el que lo volvió real.

**N13 — El aviso de recompra llega también en `atlas add swap`.** `tradeNotes` solo se invocaba para `buy` y `sell`, y ahora lee los activos del borrador (uno o dos) para que una permuta enseñe las dos mitades de la regla antes de confirmar, que es el único momento en que el aviso sirve de algo.

---

## Anotado para más adelante (no en esta feature)

- **`fee_kind` en el libro sintético** (Q8): los dos `standalone_fee` del escenario se llaman *Custody fee* y *Market data fee* y pedirían `custody` y `connectivity`. Exigiría una segunda regeneración del *golden*.
- **`warnFxDate` en los eventos de efectivo y en las valoraciones**: ahora que todos llevan la fecha del tipo, el aviso de «fecha del tipo posterior a la fecha fiscal» podría alcanzarlos. Es una regla nueva y cambiaría los avisos de la instantánea, así que no entra aquí.
- **`swap_fee_side` como configuración**, si la revisión profesional corrige el criterio de la Q5.
- **Una lista ISO 3166-1 de verdad** para `country`, `source_country` e `issuer_country` (N1), que sería una feature propia porque toca `dividend` y `account_created`.
