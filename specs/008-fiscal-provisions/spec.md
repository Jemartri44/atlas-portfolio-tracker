# Especificación de la feature: Previsiones del esquema para la Fase 5 (`008-fiscal-provisions`)

**Rama**: `feature/008-fiscal-provisions`

**Creada**: 2026-09-18

**Estado**: **Aprobada por la dirección el 2026-09-18**, con dos cambios sobre el borrador: `valuation` **entra** en el endurecimiento (Q3) y el defecto del formulario de la web se arregla aquí, en el primer commit (Q0). Las doce respuestas están en [`questions.md`](questions.md).

**Entrada**: `docs/prompts/008-fiscal-provisions.md`, ADR-0021 (las nueve previsiones), ADR-0018 (la ventana que se cierra), ADR-0022 (la configuración se registra entera)

---

## Resumen

El libro no guarda los datos que harían falta para aplicar **ninguna** de las dos lecturas de los seis criterios fiscales que la revisión adversarial del 2026-09-18 dejó **en disputa**. ADR-0021 decide guardarlos: nueve previsiones que **no resuelven ninguna pregunta fiscal**, sino que hacen que cualquiera de las dos respuestas sea implementable el día que llegue.

La feature hace tres cosas, en este orden y por este motivo — más un arreglo previo que no estaba en el encargo y que el bloque 3 obliga a hacer (**Q0**):

1. **Seis adiciones compatibles** (campos opcionales): `Settings.income_category`, `asset_created.market`, `asset_created.issuer_country`, `standalone_fee.fee_kind`, `forced_sale.withholding`, `corporate_action.neutrality_regime` y `grant.income_eur`/`income_base`. Nada de esto cambia una cifra.
2. **Un tipo de evento nuevo, `swap`**: la permuta de un activo por otro (cripto por cripto es el caso que la motiva), con la regla de valoración del **art. 37.1.h LIRPF** — *el mayor* entre el valor de mercado de lo entregado y el de lo recibido. Hoy no existe: `fx_exchange` es solo para divisas.
3. **Un endurecimiento, y solo uno**: `fx_rate_date` pasa de opcional a **obligatorio** en `cash_deposit`, `cash_withdrawal`, `standalone_fee` y `valuation`. Los cuatro, no tres: la dirección amplió el alcance de ADR-0021 (**Q3**) porque el Modelo 720 valora a 31/12 **al tipo del BCE de ese día**, y una valoración en divisa sin la fecha de su tipo es exactamente el dato que ADR-0013 dice que no se puede perder.

**Y antes que nada, el commit 0**: hoy, en `develop`, la web **no puede registrar una compra en euros**, porque el formulario descarta `fx_rate_date` al ocultarlo. El bloque 3 extendería el mismo fallo a los asistentes de efectivo y de valoración, así que se arregla primero y en commit propio.

**El calendario lo manda el tercero.** Endurecer una validación dentro de la v1 solo es legal mientras el libro real esté vacío (ADR-0018), porque el cargador juzga las líneas viejas con las reglas de hoy: endurecer con datos dentro no deja el libro degradado, lo deja **ilegible entero**. El libro real está vacío hoy y deja de estarlo con la primera operación de verdad.

Tres reglas gobiernan la feature entera y aparecen en casi todos los requisitos:

- **R1 — Se guarda el dato, no se decide el criterio.** Ninguna previsión presupone qué contestará una revisión profesional. Cada una permite responder en los dos sentidos.
- **R2 — Los valores por defecto preservan el comportamiento actual.** Sin tocar configuración, el sistema calcula exactamente lo que calculaba. Es criterio de aceptación, no aspiración.
- **R3 — Nadie consume lo nuevo.** `income_category`, `fee_kind`, `issuer_country`, `market`, `neutrality_regime`, `income_eur` e `income_base` se guardan, se validan y se muestran. Ninguno entra en un cálculo fiscal: eso es la Fase 5.

El `swap` es la única excepción a R3, y lo es porque no puede no serlo: un evento que transmite un activo **tiene** que consumir lotes y registrar ganancia, o sería un evento que miente.

---

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Que el endurecimiento quepa, y que quepa hoy (Prioridad: P1)

El usuario está a punto de registrar su primera operación real. A partir de ese momento, hacer obligatorio `fx_rate_date` deja de ser una línea de validación y pasa a ser `schema_version = 2` con su migración. La ventana de ADR-0018 se cierra sola.

**Por qué esta prioridad**: es lo único de la feature que tiene fecha límite, y es irreversible en el mal sentido. Todo lo demás se puede añadir mañana; esto no.

**Prueba independiente**: un `cash_deposit`, un `cash_withdrawal`, un `standalone_fee` y una `valuation` sin `fx_rate_date` son rechazados al cargar y al registrar, con el error `missing_field`; con el campo, se aceptan. El libro sintético y las tres fixtures que llevan efectivo se regeneran y siguen cargando, proyectando y verificando limpias.

**Escenarios de aceptación**:

1. **Dado** un libro con un `cash_deposit` sin `fx_rate_date`, **cuando** se carga, **entonces** el cargador lo rechaza con `missing_field` nombrando el campo y el tipo, como ya hace con cualquier campo obligatorio.
2. **Dado** `atlas add cash-in` sin `--fx-rate-date`, **cuando** se intenta registrar, **entonces** falla antes de escribir y el mensaje dice en español qué falta.
3. **Dado** un `standalone_fee` con `fx_rate_date` en sábado, **cuando** se valida, **entonces** se rechaza con `fx_rate_date_weekend`, exactamente igual que en `buy` desde la feature 004.
4. **Dado** el libro sintético regenerado, **cuando** se proyecta, **entonces** su instantánea (`synthetic-v1.snapshot.json`) es **idéntica byte a byte** a la anterior: el endurecimiento no mueve ninguna cifra.
5. **Dado** el libro sintético regenerado, **cuando** se compara con el anterior, **entonces** las únicas diferencias son **veintinueve** líneas que ganan `fx_rate_date`; ni un identificador, ni un importe, ni una huella, ni el orden.
6. **Dado** el formulario de efectivo de la web con divisa euro, **cuando** se registra, **entonces** el borrador lleva `fx_rate_date` y el dominio lo acepta — y lo mismo una compra, una venta, un dividendo y un interés en euros, que **hoy no se pueden registrar**.

---

### Historia 2 — Permutar un activo por otro sin que el libro mienta (Prioridad: P1)

El usuario cambia un criptoactivo por otro en una plataforma. No hay euros por medio: entrega A y recibe B. Hoy tendría que registrarlo como una venta y una compra —que da la cifra correcta por casualidad y la fecha incorrecta siempre— o como un `fx_exchange`, que es para divisas y no toca lotes.

**Por qué esta prioridad**: es un hecho imponible que el libro **no sabe representar**. Un evento que no existe se registra mal, y se registra mal en silencio.

**Prueba independiente**: se registra un `swap` sobre un libro sintético de prueba y se comprueba que consume lotes del activo entregado por FIFO, registra la ganancia con el valor del art. 37.1.h, y abre un lote del activo recibido con la fecha del swap y ese mismo valor.

**Escenarios de aceptación**:

1. **Dado** un swap en el que el valor de mercado de lo **entregado** es mayor, **cuando** se proyecta, **entonces** la transmisión y la adquisición se valoran por ese importe.
2. **Dado** un swap en el que el valor de mercado de lo **recibido** es mayor, **cuando** se proyecta, **entonces** se valoran por ese otro.
3. **Dado** un swap con los dos valores iguales, **cuando** se proyecta, **entonces** el resultado es el mismo por los dos caminos (la regla no depende de cuál se mire).
4. **Dado** un swap, **cuando** se proyecta, **entonces** el lote nuevo tiene la **fecha del swap**, **no** la del lote consumido: un swap no es un traspaso ni un canje amparado por el régimen de neutralidad.
5. **Dado** un swap que transmite con pérdida un activo comprado dentro de la ventana anterior, **cuando** se registra, **entonces** avisa (`wash_sale_window_prior_buy`).
6. **Dado** un swap que **recibe** un activo vendido con pérdida dentro de la ventana, **cuando** se registra, **entonces** avisa (`wash_sale_window_repurchase`): la pata de entrada es una adquisición.
7. **Dado** un swap con pérdida seguido de una **recompra del activo entregado** dentro de la ventana, **cuando** se registra la recompra, **entonces** avisa. Es el caso límite documentado.
8. **Dado** un swap cuya cantidad entregada supera la posición física de la cuenta, o cuyos activos están en libros distintos, o cuyo activo de entrada es el mismo que el de salida, **cuando** se proyecta, **entonces** se rechaza con un error propio.
9. **Dado** un swap en una cuenta del cubo, **cuando** se registra sin tesis abierta para el activo recibido, **entonces** se rechaza igual que un `buy` (regla 15). *(Supuesto A7; ver `questions.md` Q6.)*

---

### Historia 3 — Guardar hoy lo que el motor fiscal necesitará (Prioridad: P2)

El usuario da de alta un ETC de oro domiciliado en Jersey que cotiza en Xetra. Dentro de tres años alguien tendrá que decidir si tributa como ganancia patrimonial o como rendimiento del capital mobiliario, si le aplica el art. 95 LIRPF y si su ventana de recompra es de dos meses o de un año. Ninguna de esas preguntas se contesta hoy. Las tres son incontestables si el catálogo no guarda dónde cotiza y dónde está domiciliado.

**Por qué esta prioridad**: guardarlo hoy es gratis; añadirlo dentro de tres años exige migrar un libro con operaciones y reconstruir información que ya no se puede reconstruir (¿dónde cotizaba aquel valor excluido de cotización en 2029?).

**Prueba independiente**: se da de alta un activo con `market` e `issuer_country`, se registra una comisión con `fee_kind`, se configura `income_category` y se comprueba que **ninguna** proyección cambia respecto al mismo libro sin esos campos.

**Escenarios de aceptación**:

1. **Dado** un `asset_created` con `market` e `issuer_country`, **cuando** se proyecta, **entonces** el catálogo los conserva y ninguna cifra cambia.
2. **Dado** un `issuer_country` que no es un código ISO 3166-1 alfa-2, **cuando** se valida, **entonces** se rechaza con la misma regla que ya aplica a `dividend.source_country`.
3. **Dado** un `standalone_fee` sin `fee_kind`, **cuando** se lee, **entonces** vale `other`, y el efectivo y los costes son exactamente los de antes.
4. **Dado** unos `Settings` sin `income_category`, **cuando** se lee la categoría de un tipo de activo, **entonces** es `capital_gain` para todos, que es el comportamiento de hoy.
5. **Dado** un `forced_sale` con `withholding` en una de sus cuentas, **cuando** se proyecta, **entonces** se trata **igual** que el `withholding` de un `sell`: no toca la base fiscal y sale del efectivo que entra **en esa cuenta**, sin repartirse a las demás.
6. **Dado** un `corporate_action` con `neutrality_regime`, **cuando** se proyecta, **entonces** el valor queda registrado y **no** altera qué secuencia de primitivas admite el `kind`.
7. **Dado** un `grant` con `income_eur` e `income_base`, **cuando** se proyecta, **entonces** el importe y la base quedan visibles en la proyección y **no** entran en `investmentIncome`, en `realizedGains` ni en ninguna base imponible.
8. **Dado** cualquiera de los campos nuevos, **cuando** se abre el detalle del evento en la web, **entonces** se muestra con su nombre en español y no en `snake_case`.

---

### Casos límite

- **`fx_rate_date` en fin de semana**: rechazo (`fx_rate_date_weekend`). Ya existía para los cinco tipos que lo tenían obligatorio; ahora alcanza a tres más. En el libro sintético hay exactamente uno: el `cash_withdrawal` con fecha valor **sábado 2028-04-08**, cuyo tipo aplicado es el del **viernes 2028-04-07**.
- **`fx_rate_date` en un evento en EUR**: se sigue exigiendo, y **la interfaz lo rellena sola** desde la fecha de negocio; el usuario no lo teclea nunca en euros. El BCE no publica un tipo del euro contra sí mismo, pero ya guardamos `fx_rate: "1"`, que es igual de vacío, y un formato que tiene que durar veinte años vale más sin casos especiales. *(Q2, respondida.)*
- **`valuation` entra en el endurecimiento**: las **veinte** `valuation` en euros del libro sintético ganan el campo. Entre ellas, las **cinco del 31/12/2028, que cae en domingo**, cuyo tipo es el del viernes 2028-12-29: justo el caso que motivó el hallazgo 6 del tercer *challenge*. *(Q3, respondida.)*
- **Swap con `fee`**: la comisión resta del valor de transmisión —como en un `sell`— y **no** se suma al coste de adquisición de lo recibido; contarla en los dos lados sería contarla dos veces. *(Supuesto A6; ver `questions.md` Q5.)*
- **Swap entre activos de distinto tipo con reglas de fecha fiscal distintas**: cada pata deriva su fecha fiscal de su propio `asset_type`, como hacen `buy` y `sell`. Si las dos difieren, aviso `swap_fiscal_dates_differ`; el evento se ordena por la fecha fiscal de la pata **entregada**, que es la del hecho imponible.
- **Swap de un activo consigo mismo**: rechazo. No es una operación.
- **Swap que cruza libros** (`core` ↔ `bucket`): rechazo, como el `transfer`.
- **Anular un `swap` ya consumido**: el mecanismo de ADR-0003 vale sin cambios; el `swap` entra en la re-proyección como cualquier otro evento y su anulación se rechaza si algo posterior dependía de él.
- **Un `grant` con `income_eur` y coste cero**: sigue sin contar como adquisición para la regla de recompra (no hay desembolso). Declarar renta y no contar como adquisición son dos cosas distintas y así se quedan.
- **Fixtures que no son el *golden***: `valid-v1.jsonl`, `legacy-v1-for-test-schema.jsonl` y `number-amount.jsonl` llevan un `cash_deposit` cada una sin `fx_rate_date`. Las tres cambian una línea. Son fixtures de forma, no de proyección.

---

## Requisitos

### Requisitos funcionales — Bloque 1: las seis adiciones compatibles

- **FR-001**: `Settings` DEBE admitir `income_category: Partial<Record<AssetType, "capital_gain" | "movable_capital">>`, validado por valor (un tipo de activo presente con un valor desconocido se rechaza) y **parcial** como los otros dos mapas por tipo de activo (ADR-0018).
- **FR-002**: El dominio DEBE exponer un lector `incomeCategoryOf(settings, assetType)` que resuelva el valor por defecto **en el punto de uso**: `capital_gain` para todos los tipos. La ausencia nunca debe caer en un valor por eliminación.
- **FR-003**: **Nada DEBE consumir `income_category`.** Ninguna proyección, ningún aviso, ninguna cifra. Se guarda, se lee y se muestra.
- **FR-004**: `asset_created` y `asset_updated` DEBEN admitir `market?` (cadena no vacía: código MIC o nombre del mercado) e `issuer_country?` (ISO 3166-1 alfa-2, misma validación que `dividend.source_country`).
- **FR-005**: `asset_updated` DEBE seguir rechazando los cambios que ya rechaza (`asset_type`, `currency`) y DEBE **permitir** cambiar `market` e `issuer_country`: un valor puede cambiar de mercado sin ser otro producto.
- **FR-006**: `standalone_fee` DEBE admitir `fee_kind?` con valores `custody | administration | connectivity | discretionary_management | other`. Ausente significa `other`, resuelto en el punto de uso.
- **FR-007**: Cada entrada de `forced_sale.per_account[]` DEBE admitir `withholding?` (cadena decimal no negativa), junto a la `fee?` que ya lleva, con **el mismo tratamiento** que `sell.withholding`: resta del efectivo que entra en esa cuenta y no toca la base fiscal ni el coste de los lotes. Va por cuenta y no por evento porque un `forced_sale` liquida cuenta a cuenta y cada bróker practica su propia retención; repartir un solo importe entre cuentas sería inventar cifras, que es justo por lo que la `fee` bajó ahí (hallazgo 8 del *challenge* 2).
- **FR-008**: `corporate_action` DEBE admitir `neutrality_regime?: boolean`. NO DEBE alterar la tabla de composición por `kind` (`KIND_RULES`) ni ninguna transformación de lotes.
- **FR-009**: El efecto `grant` DEBE admitir `income_eur?` (cadena decimal no negativa) e `income_base?` (`general | savings`). Los dos van juntos: uno sin el otro se rechaza.
- **FR-010**: La renta en especie de un `grant` DEBE quedar **visible en la proyección**, separada de `investmentIncome` y sin entrar en ninguna base imponible ni en `realizedGains`.
- **FR-011**: La CLI DEBE permitir rellenar `market`, `issuer_country` (`atlas asset add|update`), `fee_kind` (`atlas add fee`), `withholding` en un `forced_sale` y `neutrality_regime` (asistentes de eventos corporativos), e `income_category` (`atlas settings set`).
- **FR-012**: El formulario de alta de activo de la web DEBE ofrecer `market` e `issuer_country` como campos **opcionales**, sin convertir el alta en un interrogatorio. Los demás campos nuevos no tienen formulario propio en la web y NO DEBEN crearlo.
- **FR-013**: Todo campo nuevo DEBE tener nombre en español en el catálogo de etiquetas de la web, para que el detalle de un evento no lo pinte en `snake_case`.

### Requisitos funcionales — Bloque 2: el evento `swap`

- **FR-020**: El esquema DEBE incorporar el tipo de evento `swap`, permuta de un activo por otro dentro de una cuenta, con los dos valores de mercado, su divisa, su tipo del BCE y su fecha.
- **FR-021**: El valor de la operación DEBE ser **el mayor** entre el valor de mercado de lo entregado y el de lo recibido (art. 37.1.h LIRPF), con tests para los tres casos: entregado mayor, recibido mayor e iguales.
- **FR-022**: La pata de salida DEBE consumir lotes del activo entregado por **FIFO global** (ADR-0009) y registrar ganancia o pérdida, exactamente como un `sell`.
- **FR-023**: La pata de entrada DEBE abrir un lote del activo recibido con la **fecha fiscal del swap** y el valor de FR-021. NO DEBE heredar ni la fecha ni el coste del lote consumido.
- **FR-024**: El `swap` DEBE contar como **adquisición** del activo recibido a efectos de la regla de recompra, y como **transmisión** del activo entregado a efectos de avisar de compras previas. Las **cuatro** direcciones deben funcionar: aviso al recibir un activo vendido antes con pérdida; aviso al entregar con pérdida un activo comprado antes; aviso al comprar después un activo entregado antes con pérdida; aviso al vender después con pérdida un activo recibido antes. Es el hueco que corrigió la PR #40 y no se repite.
- **FR-025**: El `swap` DEBE mover `physicalPositions` de las dos patas en la cuenta del evento, y NO DEBE mover efectivo salvo por su `fee`.
- **FR-026**: El `swap` DEBE rechazarse si los activos coinciden, si cruzan libros, si la cuenta no tiene posición física suficiente o si los lotes abiertos no cubren la cantidad entregada.
- **FR-027**: El `swap` DEBE tener huella de idempotencia (`fingerprint`) como el resto de operaciones.
- **FR-028**: La CLI DEBE ofrecer `atlas add swap`. La web NO entra en esta feature.
- **FR-029**: El `swap` **no se añade al libro sintético**. Se cubre con tests propios. *(Supuesto A8; ver `questions.md` Q7.)*

### Requisitos funcionales — Bloque 3: el endurecimiento

- **FR-030**: `fx_rate_date` DEBE pasar a **obligatorio** en `cash_deposit`, `cash_withdrawal`, `standalone_fee` y `valuation`, que son los cuatro que lo ganaron como opcional en la feature 005. Ningún otro tipo cambia.
- **FR-031**: La regla de fin de semana (`fx_rate_date_weekend`) DEBE seguir aplicándose a los cuatro.
- **FR-032**: El generador sintético DEBE emitir `fx_rate_date` en los cinco puntos donde hoy no lo emite —`deposit()`, `fee()`, `withdrawal()`, el `cash_deposit` del subflujo `bucket-programme` y la rama en euros de `valuation()`— con el **último día hábil** anterior o igual a la fecha de negocio (`lastWorkingDay`), que es lo que ya hace en los otros trece.
- **FR-033**: El *golden* y las tres fixtures con efectivo DEBEN regenerarse. El cambio DEBE ser **exactamente** el añadido de `fx_rate_date` en **veintinueve** líneas del *golden* y una en cada una de las otras tres. Cualquier otra diferencia es un hallazgo y **para la feature**.
- **FR-034**: `synthetic-v1.snapshot.json` DEBE quedar **idéntico byte a byte**. El endurecimiento no toca ninguna proyección, y la instantánea es la prueba.
- **FR-035**: La regeneración DEBE ir en **su propio commit**, el último, cuyo mensaje enumera exactamente qué cambia.
- **FR-036**: El formulario de la web DEBE producir un borrador **válido para el dominio** cuando la divisa es el euro, en los cuatro tipos endurecidos y en `buy`, `sell`, `dividend` e `interest`. El test que hoy congela el fallo —que comprueba que el campo **no** está sin comprobar que el borrador sea válido— DEBE reescribirse para exigir la validez.

### Requisitos transversales

- **FR-040**: **Ningún valor por defecto DEBE cambiar un cálculo.** Con un libro sin ninguno de los campos nuevos, todas las proyecciones DEBEN dar exactamente el mismo resultado que en `develop`, demostrado con números.
- **FR-041**: `packages/domain` DEBE mantener **100 % de líneas y ramas**.
- **FR-042**: NO DEBE añadirse ninguna dependencia.
- **FR-043**: NO DEBEN tocarse `docs/`, `.githooks/`, `.claude/`, `.specify/` (salvo el `feature.json` ignorado por git) ni `CLAUDE.md`.
- **FR-044**: Las dudas fiscales o estructurales van a `questions.md`, no se resuelven.

### Entidades clave

- **`IncomeCategory`** — `capital_gain | movable_capital`. Qué naturaleza tiene la renta que produce un tipo de activo. Configuración, por tipo de activo, con historial. Hoy no la lee nadie.
- **`FeeKind`** — `custody | administration | connectivity | discretionary_management | other`. Qué es una comisión suelta. Decide, en la Fase 5, si el art. 26.1.a) LIRPF permite deducirla del rendimiento del capital mobiliario.
- **`SwapEvent`** — permuta de un activo por otro: una transmisión y una adquisición en el mismo hecho, con la valoración del art. 37.1.h. Sin antigüedad heredada.
- **`InKindIncome`** — renta recibida sin transmisión (fork, airdrop, escisión no amparada, dividendo en especie): importe en euros y base (`general | savings`). Se registra; no tributa nada todavía.
- **Mercado y domicilio del emisor** — dos cadenas del catálogo de activos que no entran hoy en ningún cálculo y sin las cuales, dentro de tres años, dos criterios fiscales no son aplicables ni en un sentido ni en el otro.
- **`fx_rate_date` de una valoración** — la fecha del tipo del BCE aplicado a una foto de 31/12. Sin ella, la valoración del Modelo 720 no es reproducible desde la tabla oficial los años en que el 31/12 cae en fin de semana, que son dos de cada siete.

---

## Criterios de éxito *(obligatorio)*

- **SC-001**: El libro sintético regenerado difiere del anterior en **exactamente veintinueve líneas**, y la diferencia en cada una es **exactamente** la aparición de la clave `fx_rate_date` con el valor predicho antes de regenerar. Verificado id por id.
- **SC-002**: `synthetic-v1.snapshot.json` es idéntico byte a byte antes y después de la feature.
- **SC-003**: El libro regenerado es igual, byte a byte, al resultado de aplicar al libro anterior una transformación trivial y auditable (insertar veintinueve claves). Prueba de que el generador no ha cambiado nada más.
- **SC-004**: Un libro escrito sin ninguno de los campos nuevos produce, en `develop` y en esta rama, la **misma instantánea** de proyección.
- **SC-005**: `lint`, `typecheck`, `test:coverage` y `build` en verde, con `packages/domain` al 100 % de líneas y ramas.
- **SC-006**: Un `cash_deposit`, un `cash_withdrawal`, un `standalone_fee` y una `valuation` sin `fx_rate_date` son rechazados; con él, aceptados. Cuatro tests, uno por tipo.
- **SC-010**: El borrador que la web produce para una compra en euros es **aceptado** por `validateShape`. Hoy no lo es.
- **SC-007**: Los tres casos de la regla del art. 37.1.h (entregado mayor, recibido mayor, iguales) tienen test propio y el resultado es el esperado en los tres.
- **SC-008**: El catálogo de tipos de evento del código pasa de 23 a 24 (el vigesimoquinto de `docs/data-schema.md` §3 es `tax_return_filed`, que la Fase 5 implementará).
- **SC-009**: Cero dependencias nuevas; `docs/` sin modificar.

---

## Supuestos

**Todos resueltos por la dirección el 2026-09-18.** Diez confirmaron la recomendación; **dos la cambiaron** (A4 y el alcance de Q0). Las respuestas completas, con su razonamiento, están en [`questions.md`](questions.md).

- **A0** *(nuevo, Q0)* — El defecto del formulario de la web se arregla **en el primer commit de la feature**, con el test que lo congelaba reescrito para exigir que el borrador resultante sea válido para el dominio.
- **A1** *(confirmado, Q1)* — `income_category` sigue **el patrón real** de `fiscal_date_rule` en el código: constante `DEFAULT_INCOME_CATEGORY` completa, lector `incomeCategoryOf`, entrada en `DEFAULT_SETTINGS` y relleno en `normalizeSettings`. El *golden* no se mueve porque el escenario sintético escribe sus propios mapas y **no** hereda `DEFAULT_SETTINGS` (`scenario.ts`, `SCENARIO_FISCAL_DATE_RULE`).
- **A2** — `income_category` se valida por valor pero **no** se exige completo: mapa parcial, como los otros dos (ADR-0018).
- **A3** *(confirmado, Q2)* — `fx_rate_date` se exige también cuando la divisa es el euro, y **la interfaz lo rellena** desde la fecha de negocio: el usuario no lo teclea nunca en euros.
- **A4** *(**cambiado**, Q3)* — `valuation` **sí** entra en el endurecimiento. El *golden* pasa de 9 a **29** líneas, con la misma disciplina: predicción escrita antes, enumeración completa después.
- **A5** *(confirmado, Q4)* — La renta en especie de un `grant` se acumula en `state.inKindIncome` y entra en `snapshotOf`, lo que añade **una línea** (`"in_kind_income": []`) a `synthetic-v1.snapshot.json`, en el commit del bloque 1 y **nunca** en el del bloque 3.
- **A6** *(confirmado, Q5)* — El `fee` de un `swap` resta del valor de transmisión y no suma al coste de adquisición. **No es cosa resuelta**: es un criterio fiscal nuevo, **agresivo en el momento**, anotado como tal en `questions.md` para que la dirección lo lleve a `docs/fiscal-questions.md`.
- **A7** *(confirmado, Q6)* — Un `swap` en el cubo exige tesis abierta para el activo **recibido** (como un `buy`) y avisa si la pata de salida no enlaza ninguna (como un `sell`).
- **A8** *(confirmado, Q7)* — El `swap` **no** entra en el libro sintético.
- **A9** *(confirmado y ampliado, Q8)* — El `fee_kind` de los dos `standalone_fee` del libro sintético **no** se rellena, **ni ahora ni en un commit posterior**: dos regeneraciones en una misma feature es lo que hace ilegible un diff. Queda anotado para más adelante.
- **A10** *(confirmado, Q9)* — Se tocan `apps/web/src/format/labels.ts` y `apps/web/src/view-models/forms/specs.ts` porque sus tests de exhaustividad lo exigen, más `apps/web/src/view-models/forms/values.ts` por A0. Ninguno está en `apps/web/src/format/messages/`, que es lo único reservado al otro agente.
- **A11** — El `swap` no lleva `order_id` ni cierra órdenes pendientes: `order_placed` tiene `side: buy | sell` y una permuta no es ninguno de los dos.
- **A12** — El `swap` no admite `amount` como base alternativa: sus dos valores de mercado **son** la base, y la regla del art. 37.1.h necesita los dos por separado.
- **A13** *(confirmado, Q10)* — `withholding` va **dentro de `per_account[]`** en el efecto `forced_sale`, no al nivel del efecto. La dirección actualiza ADR-0021.
- **A14** *(confirmado, Q12)* — Cada pata del `swap` deriva su fecha fiscal de su propio tipo de activo; el evento se ordena por la de la pata entregada; aviso `swap_fiscal_dates_differ` si difieren.

---

## Fuera de alcance

- **Consumir** cualquiera de los campos nuevos en un cálculo fiscal. Eso es la Fase 5.
- Resolver cualquiera de los seis criterios **en disputa** de `docs/fiscal-questions.md`.
- El evento `tax_return_filed` (ADR-0020).
- El motor fiscal: `realizedGains` consolidado, compensación de pérdidas, diferimiento cuantificado, salida por modelos.
- Lotes de divisa y el FIFO por divisa del criterio #4. El endurecimiento de `fx_rate_date` los **habilita**; no los implementa.
- Rellenar `fee_kind` en el libro sintético (Q8): queda anotado para una feature posterior, porque exigiría una segunda regeneración del *golden*.
- Cualquier pantalla nueva de la web y cualquier cosa de AWS.
- Cualquier ADR nuevo. Se pueden proponer; no se aceptan.
