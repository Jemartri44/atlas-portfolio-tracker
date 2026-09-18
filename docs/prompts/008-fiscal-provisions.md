# Prompt 008 — Feature `008-fiscal-provisions`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/008-fiscal-provisions.md`.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a implementar las **nueve previsiones del esquema** que fija **ADR-0021**: los datos que el libro necesita guardar para que el motor fiscal de la Fase 5 pueda escribirse **sin resolver las dudas fiscales que siguen abiertas**.

Es una feature pequeña en superficie y **delicada en el fondo**. Léete entero este prompt antes de tocar nada, especialmente el bloque 3.

## Por qué esta feature existe, y por qué ahora

Una revisión adversarial de `docs/fiscal-questions.md` dejó **seis criterios fiscales en disputa** y destapó una mecánica que ninguno cubría. Esas dudas no se pueden resolver: el usuario no tiene asesor fiscal. Pero **no hace falta resolverlas**: el proyecto ya convive con criterios fiscales abiertos, porque la fecha fiscal y la ventana de recompra son configuración y cambiarlas es un `settings_changed`, no un despliegue (ADR-0013).

Lo que sí hace falta es que el libro **guarde el dato**. No se puede aplicar una ventana de recompra distinta a un valor del Nasdaq y a uno de Fráncfort si el catálogo no guarda dónde cotiza ninguno de los dos.

**Y hay una fecha límite real.** Hacer `fx_rate_date` obligatorio es un **endurecimiento**, y ADR-0018 solo lo permite dentro de la v1 **mientras el libro real esté vacío**: el cargador juzga las líneas viejas con las reglas de hoy, así que endurecer con datos dentro deja el libro **entero** ilegible. El libro real está vacío hoy y deja de estarlo en cuanto el usuario registre su primera operación de verdad. Por eso esta feature va **antes** que el motor fiscal, y no dentro de él.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero, en especial *Domain traps* (las diez) y *Design principles*.
2. `.specify/memory/constitution.md`.
3. **ADR-0021** (es tu encargo: las nueve previsiones, su forma y su porqué), **ADR-0018** (por qué el endurecimiento solo cabe ahora), **ADR-0013** (fecha fiscal, ventana, sentido de `fx_rate`), ADR-0005 (dinero decimal), ADR-0009/0010/0011 (FIFO y primitivas corporativas), ADR-0003 (append-only).
4. `docs/data-schema.md` **§8.6** (la tabla de las nueve), más §3, §4, §6 y §8 enteras.
5. `docs/fiscal-questions.md`: **léelo entero**. No para implementar sus criterios, sino para entender qué duda desbloquea cada campo. Fíjate en la columna de **dirección del riesgo**.
6. `docs/business-rules.md` §5 y §8.
7. El código: `packages/domain/src/schema/`, `settings/`, `projections/`, y `tests/fixtures/ledger/` con su generador `packages/domain/src/synth/`.

Si algo es ambiguo o contradictorio, **no lo resuelvas**: anótalo en `specs/008-fiscal-provisions/questions.md` y avisa. En esta feature, cualquier duda fiscal o estructural **se pregunta, no se decide**.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-008 -b feature/008-fiscal-provisions origin/develop
   cd ../atlas-portfolio-tracker-008 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` en `specs/008-fiscal-provisions/` (español, identificadores en inglés). **Enseña `spec.md` y `plan.md` y espera el visto bueno antes de escribir código.**
3. `/speckit-implement` por bloques, en el orden de abajo. Commits atómicos, Conventional Commits en inglés.
4. Sin PR: la dirección sube y fusiona tras revisar.

## 2 bis. Reglas de operación

- **`packages/domain` al 100 % de líneas y ramas.** Bloqueante en CI.
- **Ninguna dependencia nueva.**
- **No toques `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`.** Lo que creas que debe cambiar, a `questions.md`.
- **`npm run lint` verde antes de cada commit y otra vez como último paso antes de entregar.**
- **Los valores por defecto no pueden cambiar ningún cálculo actual.** Es el criterio de aceptación transversal de toda la feature: si nadie toca la configuración, el sistema debe calcular exactamente lo que calculaba. Compruébalo y dilo.
- Nunca `git push`, nunca fusiones.

## 3. Alcance, en tres bloques y en este orden

### Bloque 1 — Las adiciones compatibles (seis de las nueve)

Campos opcionales, sin efecto sobre nada que se calcule hoy. Cada uno con su validación, su migración *no* necesaria (son opcionales) y sus tests:

- `Settings.income_category: Record<AssetType, "capital_gain" | "movable_capital">`, **por defecto `capital_gain` en todos**. Sigue el patrón exacto de `fiscal_date_rule`: resuelto en el punto de uso, no metido en `DEFAULT_SETTINGS`, para que la ausencia nunca caiga en un valor por eliminación y el `fiscal_settings` del *golden* no se mueva. **Esta feature solo lo guarda y lo expone; no lo consume nadie todavía** — consumirlo es la Fase 5.
- `asset_created.market?` — código MIC o nombre del mercado.
- `asset_created.issuer_country?` — ISO 3166-1 alfa-2, validado contra la misma lista que ya usa `dividend.source_country`.
- `standalone_fee.fee_kind?` — `custody | administration | connectivity | discretionary_management | other`, por defecto `other`.
- `forced_sale.withholding?` — misma forma y mismo tratamiento que `sell.withholding`.
- `corporate_action.neutrality_regime?: boolean`.
- `grant.income_eur?` e `grant.income_base?`: `general | savings`. **Ojo con lo que significan**: hoy `grant` crea lotes pero no declara renta. Estos campos dicen que lo recibido **es renta en el momento de recibirlo**, y en qué base. Guárdalos y expónlos en la proyección; **no los conviertas en ninguna regla de cálculo**: quién tributa qué es Fase 5 y es criterio en disputa (#8 de `fiscal-questions.md`).

Los formularios y asistentes de la CLI deben poder rellenar los que tengan sentido pedir. Usa tu criterio sobre cuáles y dilo en `plan.md`; no conviertas el alta de un activo en un interrogatorio.

### Bloque 2 — El evento `swap`

Permuta de un activo por otro: cripto por cripto es el caso que lo motiva. Hoy solo existe `fx_exchange`, que es para divisas.

- Tipo de evento nuevo. Sube el catálogo a **25 tipos**.
- **Valoración del art. 37.1.h LIRPF: el mayor entre el valor de mercado de lo entregado y el de lo recibido.** Es una regla de dominio con tests propios, incluidos los tres casos: entregado mayor, recibido mayor, e iguales.
- Efecto sobre lotes: **transmisión** del activo entregado (consume lotes por FIFO, registra ganancia) y **adquisición** del recibido, con la fecha del swap y el valor determinado por la regla de arriba. No conserva antigüedad: no es un traspaso ni un canje amparado.
- Cuenta como adquisición a efectos de la regla de recompra, y como transmisión a efectos de avisar de compras previas. Revisa el hueco que se corrigió en la PR #40 y **no lo repitas**.
- Documenta el caso límite: un swap con pérdida seguido de recompra del mismo activo dentro de la ventana.

### Bloque 3 — El endurecimiento, solo y el último

**`fx_rate_date` pasa de opcional a obligatorio** en `cash_deposit`, `cash_withdrawal` y `standalone_fee`.

**Esto rompe el *golden file*, y lo sabemos:** los **nueve** eventos de efectivo y comisión de `tests/fixtures/ledger/synthetic-v1.jsonl` carecen hoy de `fx_rate_date`. La dirección lo ha comprobado antes de escribir este prompt. Así que esta feature **regenera el *golden***, que es la operación de mayor riesgo del proyecto: es donde una regresión de proyección puede colarse disfrazada de "diff esperado".

Reglas, sin excepción:

1. **El bloque 3 va el último y en commits propios**, separado de todo lo demás, para que el diff del *golden* sea legible.
2. **La regeneración va en su propio commit**, cuyo mensaje enumera **exactamente** qué cambia. La dirección lo verificará id por id y clave por clave.
3. **Antes de regenerar, deja escrito qué esperas que cambie.** Después, compara lo que esperabas con lo que salió y **explica cualquier diferencia**. Si cambia algo que no habías previsto, **para y pregunta**: es la señal de que hay una regresión escondida.
4. **El generador sintético comparte su flujo de aleatoriedad**: cualquier evento nuevo en medio rebaraja los identificadores de todo lo posterior (una vez cambiaron 116 de 160). **No añadas eventos nuevos al escenario en esta feature.** Si el bloque 2 te tienta a meter un `swap` en el *golden*, hazlo en un subflujo propio de PRNG, de ULID **y de reloj**, o no lo hagas y dilo.
5. Lo esperable aquí es que cambien **nueve líneas** (las que ganan `fx_rate_date`) y nada más: ni identificadores, ni importes, ni el orden. Si cambia algo más, es un hallazgo, no un detalle.

## 4. Fuera de alcance

**Consumir** cualquiera de los campos nuevos en un cálculo fiscal (eso es la Fase 5); resolver cualquiera de los criterios en disputa de `docs/fiscal-questions.md`; el evento `tax_return_filed` (ADR-0020, también Fase 5); el motor fiscal; cualquier cosa de la web o de AWS; cualquier ADR nuevo (puedes proponerlo, no aceptarlo).

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage`, `build` y CI en verde; `packages/domain` al **100 %** de líneas y ramas.
- **Prueba de que los valores por defecto no cambian nada**: con un libro sin ninguno de los campos nuevos, todas las proyecciones dan el mismo resultado que en `develop`. Dilo con números.
- *Golden* regenerado con su commit propio y su diff enumerado y explicado.
- `docs/` sin cambios.
- `specs/008-fiscal-provisions/questions.md` con lo preguntado y las notas.

## 6. Decisiones fijadas por este prompt

- **(a) Se guarda el dato, no se decide el criterio.** Ninguna de las nueve previsiones resuelve una pregunta fiscal: cada una permite responderla en los dos sentidos. Es lo que dice ADR-0021 y es el corazón de la feature.
- **(b) Los valores por defecto preservan el comportamiento actual.** Sin tocar configuración, el sistema calcula lo mismo que antes. Es criterio de aceptación, no una aspiración.
- **(c) `income_category` se guarda y no se consume.** Consumirlo —hacer que un ETC tribute como rendimiento del capital mobiliario— es Fase 5 y depende de una duda abierta. Aquí solo se abre la puerta.
- **(d) El `swap` no conserva antigüedad ni coste**: no es un traspaso ni un canje amparado por el régimen de neutralidad, y su valoración es la del art. 37.1.h.
- **(e) El endurecimiento de `fx_rate_date` va ahora o no va.** ADR-0018 solo lo permite con el libro real vacío. Es la razón de que esta feature se adelante al motor fiscal.
- **(f) El bloque 3 va solo, el último, y su regeneración del *golden* se enumera y se verifica.** Lo esperable son nueve líneas; cualquier otra cosa es un hallazgo.

## 7. Respuestas a las preguntas de la 008

Doce preguntas del implementador tras leer el prompt y medir sobre `develop`. Dos encontraron defectos que este prompt no preveía.

- **(Q0) Defecto vivo en `develop`, y entra aquí como primer commit: la web no puede registrar una compra en euros.** El formulario oculta `fx_rate_date` cuando la divisa es EUR, y el borrador conserva los campos ocultos obligatorios usando su `initial`; `fx_rate` tiene `initial: "1"` y sobrevive, **`fx_rate_date` no tiene ninguno**, así que desaparece y el dominio rechaza el evento. Afecta a `buy`, `sell`, `dividend` e `interest`, o sea a casi todo lo que el usuario registra a diario, en una web recién fusionada. Verificado por la dirección en el código. Se arregla también el test que congelaba el fallo como correcto (comprobaba que el campo no estaba, sin comprobar que el borrador resultante fuera válido).
- **(Q1) Error de este prompt.** Decía que `income_category` siguiera «el patrón exacto de `fiscal_date_rule`: no metido en `DEFAULT_SETTINGS`». **`fiscal_date_rule` sí está en `DEFAULT_SETTINGS`**; el patrón descrito era el de `wash_sale_transfer_counts`. Y ADR-0022, posterior a este prompt, nombra `income_category` entre los mapas que un `settings_changed` materializa. Se aplica **el patrón completo**, como sus dos mapas hermanos.
- **(Q2) `fx_rate_date` obligatorio también en euros.** Cinco tipos ya lo exigen y un formato que debe durar veinte años vale más sin casos especiales: cada excepción es una rama que alguien interpretará mal en 2034. Ya se guarda `fx_rate: "1"`, que es igual de vacío. **Lo rellena la interfaz desde la fecha valor**; el usuario no lo teclea nunca en euros.
- **(Q3) `valuation` entra en el endurecimiento**, ampliando ADR-0021. Motivo fiscal: el Modelo 720 valora a cotización de 31/12 **convertida al tipo del BCE de ese día**, así que una valoración en divisa sin la fecha de su tipo es justo el dato que ADR-0013 prohíbe perder. El diff del *golden* pasa de **9 a 29 líneas**, con la misma disciplina de predicción escrita antes y enumeración después. Se decide ahora porque **la puerta de ADR-0018 se cierra con esta feature**.
- **(Q4)** La renta en especie entra en la instantánea, en el bloque 1 y no en el 3: es lo que mantiene limpio el diff del endurecimiento.
- **(Q5) La comisión de un `swap` resta de lo transmitido**, como en una venta, porque la pata de salida *es* una transmisión. **Es un criterio fiscal nuevo**, no un detalle de implementación: queda registrado como el **#17** de `docs/fiscal-questions.md`, con certeza media y dirección de riesgo **agresiva en el momento**.
- **(Q6)** Un `swap` en el cubo exige tesis, con el `thesis_id` del activo recibido. No se abre un agujero en la regla 15 por comodidad.
- **(Q7) El `swap` no entra en el *golden*.** El motivo decisivo, del implementador: un subflujo propio de PRNG protege los identificadores pero **no la instantánea**, porque el evento se inserta por fecha de negocio y arrastra lotes y ganancias de todo lo posterior. Se cubre con `LedgerBuilder`.
- **(Q8) `fee_kind` no se rellena en el *golden*.** Hacerlo lo movería por segunda vez en la misma feature, y dos regeneraciones es justo lo que vuelve ilegible un diff.
- **(Q9)** Confirmado tocar `format/labels.ts` y `view-models/forms/specs.ts`: sus tests de exhaustividad fallan solos y ninguno está en `format/messages/`.
- **(Q10) Enmienda a ADR-0021 el mismo día**: `forced_sale.withholding` va **dentro de `per_account[]`**, no uno por evento. Una venta forzosa liquida cuenta a cuenta y su `fee` ya vive ahí desde el *challenge* 2; una retención única no podría repartirse.
- **(Q11) Son 24 tipos, no 25.** Error de suma de este prompt: contaba `tax_return_filed`, que está fuera de alcance. Los documentos los actualiza la dirección; el implementador solo anota qué secciones quedan desactualizadas.
- **(Q12)** Un `swap` entre activos con reglas distintas tiene **dos** fechas fiscales: cada pata deriva la suya, el evento se ordena por la de la pata entregada, el lote nuevo nace con la de la recibida, y hay aviso `swap_fiscal_dates_differ`. Que coincidan siempre en cripto por cripto no es motivo para no modelarlo.
- **(N1)** `issuer_country` se valida con la misma regla de dos letras mayúsculas que `source_country`. Una lista ISO de verdad tocaría también `dividend` y `account_created`: otra feature.
