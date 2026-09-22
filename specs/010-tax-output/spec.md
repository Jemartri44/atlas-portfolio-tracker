# Especificación de la feature: La salida fiscal (`010-tax-output`)

**Rama**: `feature/010-tax-output`

**Creada**: 2026-09-19

**Estado**: **aprobado por la dirección el 2026-09-19**: las once preguntas respondidas (supuestos S1–S17 confirmados, Q10 con un test más) y una decisión fiscal nueva, los ETC y los ETP como rendimiento del capital mobiliario por defecto (FR-005). Solo especificación y plan: no hay código. La rama sale de `feature/visual-system` (`2cdc078`), apilada sobre `feature/009-tax-engine` y la PR #59, porque ninguna está todavía en `develop`; el primer commit trae el prompt, la ADR-0020 enmendada y el criterio #11 corregido de la PR #60. La implementación empieza cuando las ramas de las que depende estén integradas (excepción decidida por la dirección el 2026-09-19).

**Entrada**: `docs/prompts/010-tax-output.md` con sus respuestas P1–P7; ADR-0020 (con sus dos enmiendas y su nota de erratas), ADR-0022, ADR-0021, ADR-0013, ADR-0016, ADR-0018, ADR-0003, ADR-0015, ADR-0019, ADR-0023; `docs/fiscal-questions.md` (#1–#23 y la cuestión ETC/ETP); `specs/009-tax-engine/` (spec, plan y `questions.md` con N1–N36); `docs/design/system.md` y `docs/design/brief.md`.

**Preguntas**: [`questions.md`](questions.md), respondidas. Cada supuesto de abajo (S1–S17) remite a la suya y está **confirmado**.

---

## Resumen

La 009 calcula la base del ahorro. Esta feature la **usa**: lo que el usuario teclea en la Agencia Tributaria, lo que presentó y los Modelos 720 y 721. Es la más peligrosa de las dos, porque una cifra del motor la revisa un test y una casilla de la salida la teclea una persona.

Cinco piezas, en este orden:

0. **Una corrección del motor** (P5): la cadena de ejercicios descartaba en silencio una Renta presentada de un ejercicio sin cifras en el libro. Y la configuración nueva: umbrales de los modelos informativos y fechas de la temporada de Renta.
1. **`tax_return_filed`**: el libro guarda lo presentado, lo que la aplicación calculaba ese día y la huella del libro. Un ejercicio presentado queda **cerrado**: nada se rechaza, todo avisa y nombra la declaración.
2. **La Renta por casillas**: una capa sobre el informe de la 009 que no recalcula nada. Casillas como **datos por ejercicio**, con fuente oficial, fecha y certeza; sin correspondencia comprobada, **conceptos sin números**.
3. **Los Modelos 720 y 721**, en su propio módulo, fuera de `tax/`: el único cálculo fiscal que lee precios, y solo de Nivel 1.
4. **La pantalla fiscal de la web** (`/fiscal`), con el sistema «papel y tinta», y **la CLI** (`atlas tax --boxes`, `atlas m720`, `atlas m721`, `atlas filed`).

Seis reglas gobiernan la feature entera:

- **R1 — Una casilla equivocada es peor que ninguna.** Nunca la casilla de otro ejercicio; nunca una casilla sin fuente oficial; lo que el motor no calcula entero se rotula como lo que es (decisión (e)).
- **R2 — Lo presentado es un hecho.** Se guarda tal cual, se compara y no se corrige (decisión (a), ADR-0020). Una complementaria sustituye, no anula (decisión (b)).
- **R3 — Cerrado avisa, nunca rechaza, y nombra la declaración** (decisión (c)), por fecha **y** cuando se mueve una cifra declarada (P4).
- **R4 — La Renta sigue sin leer un precio**, ahora con el 720 dentro. El motor de la Renta solo lee presentaciones `renta`, y de ellas solo los pendientes (decisión (d)); se demuestra tres veces.
- **R5 — Nunca «no obligado» con datos incompletos** (decisión (h)).
- **R6 — Los valores por defecto no cambian nada salvo lo que la dirección decidió**: la categoría de los ETC y los ETP (FR-005), con su predicción. Fuera de eso, sin presentaciones y sin tocar la configuración, `atlas tax` da las mismas cifras que hoy, y lo que el informe gane es campo nuevo, enumerado antes.

---

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Registrar lo que presenté, y que el libro lo recuerde (Prioridad: P1)

En junio, el usuario presenta su Renta. En la aplicación, desde el ejercicio, abre «Registrar lo presentado»: el formulario llega **precargado con lo calculado**, corrige lo que de verdad presentó (una cifra que su gestor cambió, por ejemplo), pone la referencia del justificante y confirma. Al año siguiente presenta una complementaria.

**Por qué esta prioridad**: sin esto no hay ejercicio cerrado, ni ancla del arrastre, ni regla de los 20.000 € del 720 (ADR-0020). Es lo que hace útil todo lo demás.

**Prueba independiente**: el cálculo a mano de la complementaria (plan §6.3): una Renta con unos pendientes, una complementaria con otros, la compensación del ejercicio siguiente anclada en la complementaria, la anulación de la original rechazada y la comparación entre lo declarado y lo calculado con sus causas.

**Escenarios de aceptación**:

1. **Dado** un ejercicio calculado, **cuando** el usuario registra su Renta, **entonces** el libro guarda lo que el usuario confirma (`declared`), lo que la aplicación calculaba en ese momento (`computed`, con la configuración con que lo calculó) y la huella del libro anterior al evento. Sin confirmación explícita no se escribe nada (decisión (l)).
2. **Dado** una Renta en vigor de un ejercicio, **cuando** se registra otra del mismo modelo y ejercicio **sin** `supersedes`, **entonces** se rechaza. **Con** `supersedes` a la que está en vigor, es una complementaria y pasa a estar en vigor.
3. **Dado** un `supersedes` que apunta a otro modelo, a otro ejercicio o a una presentación ya sustituida, **entonces** se rechaza.
4. **Dado** una presentación sustituida por una complementaria, **cuando** se intenta anular, **entonces** se rechaza (la complementaria la ha consumido, ADR-0003). La que está en vigor sí se puede anular: es para lo que nunca se presentó.
5. **Dado** una presentación con `filed_at` no posterior al 31/12 de su ejercicio, **entonces** se rechaza.
6. **Dado** una consulta a una fecha anterior a `filed_at`, **cuando** se pide el ejercicio, **entonces** esa presentación no existe todavía: ni cierra el ejercicio ni ancla nada (ADR-0016: un documento administrativo se filtra por su propia fecha).
7. **Dado** un libro con una presentación, **cuando** se compacta con una migración de por medio, **entonces** la huella sigue verificando (S1, Q1).
8. **Dado** un libro cuyos eventos anteriores a una presentación ya no corresponden a su huella, **cuando** se ejecuta `atlas check` o la verificación de la web, **entonces** se señala.

---

### Historia 2 — Un ejercicio declarado queda cerrado, y la aplicación lo dice (Prioridad: P1)

En 2028 el usuario encuentra un dividendo de 2026 que no registró; en enero de 2027 recompra un fondo que vendió con pérdida en diciembre de 2026, con la Renta de 2026 ya presentada; cambia la ventana de recompra de las acciones. En los tres casos quiere saber **qué declaración habría que revisar y cuánto se mueve**, antes de escribir.

**Por qué esta prioridad**: es el problema 1 de ADR-0020, y P4 lo amplió: la regla por fecha sola callaría justo la recompra de enero.

**Prueba independiente**: en un libro con la Renta de 2026 presentada, registrar una compra el 10/01/2027 dentro de la ventana de una pérdida del 20/12/2026 **avisa de la Renta de 2026** con la base de antes y de después, aunque la fecha de la compra sea de 2027.

**Escenarios de aceptación**:

1. **Dado** un evento cuya fecha de negocio cae en un ejercicio con una presentación en vigor, **cuando** se registra, corrige o anula, **entonces** no se rechaza: avisa, nombrando la declaración (modelo, ejercicio, fecha de presentación) y diciendo cuánto mueve cada cifra declarada (o que no mueve ninguna).
2. **Dado** un evento de otro ejercicio que **mueve** una cifra de un ejercicio presentado (base, pendientes por origen y categoría, diferido a 31/12; en el 720 y el 721, el valor de una categoría o la lista de bienes), **cuando** se registra, corrige o anula, **entonces** avisa igual.
3. **Dado** un `settings_changed`, **cuando** se prepara en la CLI o en el diálogo de Configuración de la web, **entonces** el aviso usa `movedTaxYears` (Q12 de la 009) y distingue los ejercicios **declarados** de los simplemente pasados.
4. **Dado** los tres casos, **cuando** se muestran, **entonces** la CLI y la web usan el **mismo código** de aviso y la web lo enseña en la vista previa de Registrar, en la corrección, en la anulación y en el diálogo de Configuración, con el aviso único (`.notice`) y el diálogo que ya existen.
5. **Dado** un evento de un ejercicio pasado **sin** presentación registrada, **cuando** se registra, **entonces** la salida lo dice en una nota informativa, no como aviso de declaración (S8, Q8).

---

### Historia 3 — La Renta, anclada en lo que presenté (Prioridad: P1)

El primer ejercicio real del usuario en la aplicación será 2026. Llega con pérdidas pendientes de 2023 y 2024 que declaró antes de usarla. Las registra con su Renta de 2025, y espera que 2026 las compense y que, si no puede, le avise cuando caduquen.

**Por qué esta prioridad**: es el caso normal del primer año, y el defecto de la 009 (P5) iba en la dirección que cuesta dinero sin que nadie se entere.

**Prueba independiente**: el caso de P5 con su nombre: un libro que empieza en 2026 y una Renta de 2025 presentada con pendientes de 2023; en 2026 se compensan hasta donde toca y lo que queda **caduca** en 2027 con su nota `tax_loss_expires`.

**Escenarios de aceptación**:

1. **Dado** una Renta presentada de un ejercicio anterior al primero con cifras en el libro, **cuando** se calcula cualquier ejercicio posterior, **entonces** la cadena arranca en el primero de los dos, nunca antes de 2018, y los pendientes declarados se compensan y caducan como los calculados. **Hoy se descartan en silencio** (P5, verificado en esta rama: base de 2026 de 300,00 en lugar de 100,00).
2. **Dado** ese mismo caso, **cuando** se muestra el ejercicio de la presentación, **entonces** la salida dice que esos pendientes **vienen de lo declarado antes de la aplicación**, no que «difieren de lo calculado».
3. **Dado** varias presentaciones, **cuando** se construye el ancla, **entonces** solo cuentan las `renta` en vigor con `filed_at` no posterior a la fecha de consulta, y de ellas solo los pendientes. Nunca una `720` o `721`, nunca una sustituida (decisión (d)).
4. **Dado** que `taxYear`, `movedTaxYears` y el aviso de ejercicio cerrado cuentan la base, **cuando** se comparan, **entonces** cuentan lo mismo: comparten una sola cadena, con el ancla construida dentro.
5. **Dado** un ejercicio con Renta en vigor, **cuando** se pide su informe, **entonces** dice que está **cerrado** y desde cuándo; enseña lo declarado frente a lo calculado hoy, cifra a cifra; y si difieren, **por qué**, separando: lo que el usuario cambió al presentar, un **cambio del motor** (el mismo libro y la misma configuración dan hoy otra cifra), un **cambio de configuración** y **eventos registrados después** de la presentación. Cada causa con su importe; las cuatro suman la diferencia total.

---

### Historia 4 — La Renta por casillas (Prioridad: P1)

En mayo de 2027, el usuario abre Renta WEB con la aplicación al lado y quiere ir casilla a casilla: qué número, qué rótulo, qué importe, y de dónde sale cada uno.

**Por qué esta prioridad**: es el sentido de la Fase 5 («salida agregada por casilla», especificación §13) y es donde un error lo teclea el usuario.

**Prueba independiente**: la Renta de 2025 de un libro construido a mano, casilla a casilla contra la fuente oficial (plan §6.4); y la de un ejercicio sin correspondencia, que sale por conceptos y lo dice.

**Escenarios de aceptación**:

1. **Dado** un ejercicio con correspondencia comprobada, **cuando** se pide su salida por casillas, **entonces** cada concepto sale con su número de casilla, su rótulo **literal**, la fuente oficial con su URL, la fecha de comprobación y su certeza.
2. **Dado** un ejercicio sin correspondencia (hoy, todos menos 2025), **cuando** se pide, **entonces** sale la base **por conceptos, sin ningún número de casilla**, y lo dice. **Nunca** la casilla de otro ejercicio.
3. **Dado** un concepto sin correspondencia en un ejercicio que sí la tiene para otros, **entonces** ese concepto sale sin número y lo dice.
4. **Dado** una transmisión, **cuando** se ordena, **entonces** va al apartado que fije el criterio nuevo de la ficha F1 (fondos; en 2025, un apartado propio para los ETF; acciones negociadas; monedas virtuales; o rendimientos del capital mobiliario si su categoría de renta lo dice), y lleva ese criterio con su certeza. Un ETC o un ETP va por defecto a la casilla de rendimientos por transmisión de otros activos financieros (0031), un título por fila y con su signo; solo si el usuario lo configura como ganancia sale sin casilla, y lo dice.
5. **Dado** una transmisión, **cuando** se muestra por operación, **entonces** da lo que pide el formulario de ese año: fechas, valor de transmisión, valor de adquisición, resultado y la parte no computable por recompra o la imputada de ejercicios anteriores. Lo que el libro no tiene (el NIF de una gestora) **se dice que falta**, no se inventa.
6. **Dado** una casilla cuyo importe el motor no calcula entero (la deducción por doble imposición), **entonces** la salida da lo que sí sabe **rotulado como tal** («primer límite», no «importe de la casilla»).
7. **Dado** cualquier cifra, **entonces** conserva los criterios de los que depende y la marca de dudosa que ya lleva en el informe de la 009.
8. **Dado** una pérdida diferida, **cuando** se muestra por casillas, **entonces** sigue la forma del formulario (ficha F5): pérdida obtenida e imputable en su operación, lo liberado de ejercicios anteriores en su apartado propio, y la recompra como la marca sin número que es. Los totales coinciden con el informe.

---

### Historia 5 — El Modelo 720, con fallo seguro (Prioridad: P1)

En febrero, el usuario quiere saber si tiene que presentar el 720 por lo que tiene en IBKR: si está obligado, si ya lo presentó y le toca volver a hacerlo, y qué le falta para saberlo.

**Por qué esta prioridad**: decir «no obligado» cuando sí lo está es la dirección con consecuencias; la regla de los 20.000 € y la extinción no se podían evaluar sin la 010 (ADR-0020, problema 2).

**Prueba independiente**: los dos cálculos a mano del 720 (plan §6.1 y §6.2), al céntimo.

**Escenarios de aceptación**:

1. **Dado** un 31/12 pasado, **cuando** se pide el 720, **entonces** cuenta solo lo que está en cuentas cuyo país no es `ES` (una cuenta española en ómnibus queda fuera aunque el fondo sea extranjero), con **las cantidades y el efectivo de ese 31/12** (proyección con `asOf`, ADR-0016), por **posición física por cuenta**, y agregando los dos libros por contribuyente, dicho así (constitución III).
2. **Dado** la categoría **cuentas**, **entonces** da por cuenta el saldo a 31/12 y el **saldo medio del cuarto trimestre** (el saldo de cada día del 1/10, o del día en que la cuenta aparece, al 31/12; S4), los dos al **tipo del 31/12**, neteando los negativos con los positivos; hay obligación si **cualquiera** de los dos saldos conjuntos supera el umbral.
3. **Dado** la categoría **valores** (fondos, ETF, ETC, ETP y acciones), **entonces** valora cada bien con la valoración registrada (Nivel 1) **del 31/12** y el tipo del BCE del **último día de lunes a viernes no posterior al 31/12**. Una valoración de otra fecha, o un tipo de otra fecha, se enseñan **con su fecha y marcados**. Nunca una cotización externa.
4. **Dado** los importes, **entonces** cada bien se redondea half-up a céntimos **una vez** y la categoría es la suma de los bienes redondeados (#6).
5. **Dado** una categoría cuyo valor es exactamente 50.000,00, **entonces** no obliga; con 50.000,01, sí.
6. **Dado** una categoría con algún bien sin valor, sin tipo o con uno marcado, **entonces** el veredicto es «no se puede determinar», salvo que lo que sí tiene valor ya supere el umbral: entonces «obligado», diciendo con qué valores marcados se decidió. **Nunca «no obligado»** con datos incompletos.
7. **Dado** un 720 presentado, **cuando** se evalúa un ejercicio posterior, **entonces** la categoría obliga si **sube más de** 20.000 € sobre el **último 720 en vigor** (20.000,00 no obliga; 20.000,01 sí), en las cuentas mirando **cada uno de los dos saldos**; **o** si se ha dejado de ser titular de un bien de la lista de ese 720 (S7, Q7). Una categoría que no se declaró entonces obliga como la primera vez.
8. **Dado** la categoría a la altura del umbral de aviso, **entonces** hay aviso previo.
9. **Dado** el año en curso, **entonces** se enseña con las cantidades y precios de la fecha de consulta, rotulado como estado a esa fecha, **sin veredicto**.
10. **Dado** cualquier salida del 720, **entonces** dice de qué criterios depende (#11 y los que numere la dirección) con su certeza.

---

### Historia 6 — El Modelo 721, mínimo (Prioridad: P2)

**Por qué esta prioridad**: con la cartera actual (cripto vía ETP) será cero casi siempre; tiene que existir y no merece más (decisión (j)).

**Escenarios de aceptación**:

1. **Dado** `crypto` en una cuenta cuyo país no es `ES`, **entonces** cuenta, con la salida diciendo: «se cuenta todo lo que hay en cuentas extranjeras; si alguna es de autocustodia, no entraría» (P6).
2. **Dado** un ETP, **entonces** nunca entra en el 721: es un valor del 720.
3. **Dado** el conjunto, **entonces** un único umbral (50.000 €) sobre el saldo a 31/12, con la misma maquinaria de veredicto del 720 y una sola categoría. La regla de los 20.000 € y la extinción **se aplican**: las fuentes oficiales lo confirman con certeza alta (art. 42 quater.6; S10 bis). Un ejercicio anterior a 2023, primero del modelo, no tiene 721 y lo dice.

---

### Historia 7 — La pantalla fiscal de la web (Prioridad: P1)

En mayo, en el móvil, con la privacidad puesta, el usuario abre la tarjeta fiscal que el Resumen le sube arriba en temporada de Renta: ve su base (enmascarada), los criterios dudosos con su dirección, lo que caduca este año, la Renta por casillas y el estado del 720. Registra lo presentado desde la propia pantalla.

**Por qué esta prioridad**: el usuario vive en la web (ADR-0019), y la pantalla se usa pocas veces al año pero en las semanas en que importa tiene que ser lo primero que ve (P1).

**Prueba independiente**: capturas medidas a 400×890 con DPR 3 y a 2045×1141, 360 sin desplazamiento lateral, libro vacío y con datos, privacidad puesta y quitada, claro y oscuro; una presentación registrada desde la web con el antes y el después; la tarjeta del Resumen dentro y fuera de temporada.

**Escenarios de aceptación**:

1. **Dado** `/fiscal`, **entonces** no es un sexto destino de la barra: se llega desde una tarjeta del Resumen y desde Ajustes, y **no marca como actual ningún destino** (P1).
2. **Dado** la temporada de Renta (configurable, por defecto del 1 de abril al 30 de junio, bordes incluidos) **o** algo del 720 o del 721 que hacer, **entonces** la tarjeta fiscal va arriba del todo en el Resumen; el resto del año, discreta y al final. «Algo que hacer» lo decide el dominio (S14).
3. **Dado** el selector de ejercicio, **entonces** por defecto es el año natural anterior al de la fecha de consulta, y «cerrado» solo lo dice un ejercicio con presentación registrada.
4. **Dado** la base del ahorro, **entonces** es la cifra protagonista, rotulada **total fiscal, cartera y cubo juntos** y «es la base, no lo que pagas», con su desglose (ganancias y pérdidas, rendimientos, compensación paso a paso y base); cada total se abre en sus operaciones, **nombradas por activo y fecha**, nunca por identificador.
5. **Dado** cualquier cifra, **entonces** lleva los criterios de los que depende **en llano** (nunca `2:listed`): etiqueta de aviso para uno en disputa, neutra para certeza media o baja, la lista completa plegada. Un test falla si falta el nombre de algún criterio del catálogo en cualquiera de las dos interfaces.
6. **Dado** el apartado de criterios dudosos, **entonces** cada uno dice su certeza, el dinero en juego (diferencia, exposición o «no cuantificable desde el libro»), las operaciones afectadas y **la dirección en palabras**. Con la privacidad activa se ven la dirección y la certeza, no el dinero.
7. **Dado** las pérdidas pendientes, **entonces** se enseñan por año de origen y tipo de renta con el ejercicio tras el que caducan; lo que caduca en el ejercicio elegido, como aviso.
8. **Dado** el 720 y el 721, **entonces** valor por categoría, veredicto, motivo, lo que falta como bloque `.pending` con su acción (nunca como error) y la comparación con la última presentación. **Con la privacidad activa, ni barra ni porcentaje frente al umbral**; el veredicto sí se ve.
9. **Dado** «Registrar lo presentado», **entonces** el formulario llega precargado con lo calculado y **enmascarado hasta recibir el foco** (`system.md` §5.10), con la vista previa en una frase y la confirmación; si ya hay una presentación de ese modelo y ejercicio, es el de una complementaria y lo dice. Después, el ejercicio sale «declarado el dd/mm/aaaa», con lo declarado frente a lo calculado y, si el libro cambió, qué y por qué.
10. **Dado** los estados: libro vacío (un único estado vacío con el siguiente paso), ejercicio sin nada que declarar (base 0,00, dicho con calma), libro con eventos inválidos (la lista de lo que hay que reparar y «Verificar», nunca cifras), cargando (esqueleto del tamaño de lo que llega).
11. **Dado** el paquete, **entonces** la pantalla fiscal es un trozo de carga perezosa; el arranque no crece más allá de su margen; la tarjeta del Resumen carga lo que necesite del motor **después de pintar**, con su esqueleto.

---

### Historia 8 — La CLI (Prioridad: P2)

**Escenarios de aceptación**:

1. **Dado** `atlas tax <año> --boxes [--json]`, **entonces** la Renta por casillas con la procedencia de cada correspondencia, o la declaración de que no la hay.
2. **Dado** `atlas m720 <año> [--json]` y `atlas m721 <año> [--json]`, **entonces** el estado del modelo con su veredicto. Nunca `atlas tax 720` (el analizador leería el año 720).
3. **Dado** `atlas filed <renta|720|721> <año>`, **entonces** propone lo calculado, lo enseña, deja sustituir cada cifra por lo presentado (`--set <clave>=<importe>`), pide confirmación (`--yes`), y `--supersedes <id>` para una complementaria. `ARITY` y `BOOLEAN_FLAGS` al día.
4. **Dado** `atlas tax <año>`, **entonces** enseña si el ejercicio está declarado y la comparación de la Historia 3.
5. **Dado** `atlas settings set`, `add`, `ca`, `edit` y `delete`, **entonces** avisan del ejercicio cerrado con el mismo código que la web.

---

### Historia 9 — Poder fiarse, con el 720 dentro (Prioridad: P1)

**Escenarios de aceptación**:

1. **Estructural**: el test transitivo de arquitectura sigue viendo `tax/` (con los datos de las casillas) como camino fiscal, y **ni `tax/` ni `project-ledger.ts` alcanzan el módulo del 720 y el 721**, a ninguna profundidad, igual que no alcanzan `prices.ts` ni `valuations.ts`.
2. **Por borrado**: borrar **todos los precios y todas las presentaciones `720` y `721`** deja el informe fiscal y la salida por casillas de **todos** los ejercicios **idénticos byte a byte**, en el libro sintético y en los libros a mano de la 009 y de esta feature.
3. **Que la prueba no esté vacía**: el mismo borrado **sí** cambia la salida del 720.
4. **Valores por defecto**: `synthetic-v1.tax.json` solo se mueve por FR-005 (las dos ventas forzosas de `ast_gold` de 2027 pasan a rendimientos, y la base no cambia), exactamente como diga su predicción. Fuera de eso, sin presentaciones y sin tocar la configuración, `atlas tax` da las mismas cifras de principio a fin de la feature, y la instantánea del libro solo gana la clave `filings` (vacía), también con su predicción comiteada antes.

---

### Casos límite

Cada uno con test propio y con su nombre:

- 50.000,00 y 50.000,01 en cada umbral (720 por categoría y por saldo; 721).
- Subida de 20.000,00 y de 20.000,01 sobre el **último** 720 presentado, en cada saldo de las cuentas.
- Aviso **exactamente** en su umbral (45.000,00).
- Una cadena de **dos** complementarias.
- Una presentación con `filed_at` el 31/12 de su ejercicio (rechazo) y el 01/01 siguiente (aceptada).
- Dos presentaciones sin `supersedes` (rechazo).
- Un precio que falta con lo conocido por debajo y por encima del umbral.
- Efectivo negativo que se netea.
- Una consulta a una fecha anterior a `filed_at`.
- Una cuenta que cambia de país (S6, Q6).
- La temporada de Renta: 31/03, 01/04, 30/06 y 01/07, en la posición de la tarjeta del Resumen.
- La huella tras un `compact` con la migración de prueba v1→v2 de la 003.
- Una Renta presentada de un ejercicio anterior al primero con cifras (P5), con compensación y caducidad.
- Una recompra de enero que mueve la base de un diciembre ya presentado (P4).
- Un 31/12 en sábado y en domingo (el tipo del viernes, sin marca; la valoración, del 31/12).
- Una valoración del 30/12 (marcada) y un tipo del 30/12 con el 31/12 entre semana (marcado).

---

## Requisitos

### Bloque 0 — Corrección del motor, configuración y cálculos a mano

- **FR-001** (P5, primer commit de la feature): la cadena de ejercicios DEBE empezar en el primero de estos dos, **el primer ejercicio con cifras o la primera Renta presentada en vigor**, y nunca antes de 2018. El test del caso lleva su nombre y cubre la compensación y la caducidad con su nota `tax_loss_expires`.
- **FR-002**: `Settings` DEBE ganar, opcionales, resueltos en el punto de uso con su valor por defecto documentado y materializados al escribir (ADR-0022, N12 de la 009): `model_720_threshold_eur` (50.000), `model_720_increase_eur` (20.000), `model_721_threshold_eur` (50.000) y `model_721_increase_eur` (20.000; las fuentes oficiales confirman que la regla se aplica al 721, nota N3); `model_720_alert_threshold_eur` y `model_721_alert_threshold_eur` pasan a tener su valor por defecto (45.000, `business-rules.md` §7), que hoy no existe en el código; y `renta_season_start` / `renta_season_end` (`"04-01"` y `"06-30"`).
- **FR-003**: la validación DEBE rechazar un aviso por encima de su umbral con un **código propio** (`alert_above_threshold`), traducido en las dos interfaces; y una temporada con fechas que no existen o con el inicio posterior al fin (`invalid_renta_season`).
- **FR-004**: los tres cálculos a mano (plan §6.1–§6.3) y la Renta de 2025 por casillas (§6.4) DEBEN estar escritos en `questions.md` y comiteados **antes** del código que los calcula.
- **FR-005** (decisión de la dirección, respuesta a Q2): `income_category.etc` y `income_category.etp` DEBEN pasar a `movable_capital` por defecto. Certeza alta para el ETC (DGT V0267-25) y media para el ETP, que depende de la estructura de cada producto; los dos siguen siendo configurables. La predicción de lo que mueve en `synthetic-v1.tax.json` y en los tests de la 009 se escribe y se comitea antes, y **se para si se mueve algo no previsto**. El libro a mano de la 009 fija `capital_gain`, que es lo que su cálculo dice.

### Bloque 1 — `tax_return_filed`

- **FR-010**: el evento DEBE tener la forma de plan §1.1: `model`, `tax_year` (≥ 2018), `filed_at` (posterior al 31/12 de `tax_year` y no posterior a la fecha de registro), `receipt_reference`, `supersedes?`, `declared`, `computed` y `ledger_fingerprint`. Importes como cadenas decimales en euros.
- **FR-011**: es un tipo **nuevo y compatible** (ADR-0018): sigue `schema_version = 1`; el catálogo sube a **25 tipos**; sus traducciones, etiquetas y formularios existen en las dos interfaces.
- **FR-012**: se proyecta en la **pasada A**, en orden de fichero, tras el catálogo y las tesis, y **se filtra por `filed_at`**, no por `asOf` (ADR-0016).
- **FR-013**: una segunda presentación del mismo modelo y ejercicio sin `supersedes` DEBE ser inválida; un `supersedes` a otro modelo, a otro ejercicio, a una presentación sustituida o anulada, o con `filed_at` anterior al de la sustituida, también. En vigor está la última de la cadena con `filed_at` no posterior a la fecha de consulta.
- **FR-014**: anular una presentación sustituida DEBE rechazarse por la vía que ya existe para lo consumido (ADR-0003): la sustituta queda inválida sin ella.
- **FR-015**: la huella DEBE cubrir todos los eventos que preceden a la presentación en el fichero, **no cambiar con `compact` ni con una migración**, y permitir reproducir el cálculo de aquel día (algoritmo en plan §1.3, pregunta Q1). `integrity` y `atlas check` DEBEN señalar una presentación cuya huella no corresponde (`filing_fingerprint_mismatch`).
- **FR-016**: el ancla DEBE construirse **dentro** de la cadena que comparten `taxYear`, `movedTaxYears` y el aviso de ejercicio cerrado, solo con presentaciones `renta` en vigor a la fecha de consulta y solo con sus pendientes. `TaxOptions.filed` desaparece: el ancla no tiene otra puerta.
- **FR-017**: un ejercicio con presentación en vigor queda **cerrado para ese modelo**. Registrar, corregir o anular un evento DEBE avisar, sin rechazar, cuando su fecha cae en un ejercicio cerrado **y** cuando mueve una cifra declarada (P4). El aviso nombra la declaración y cuánto mueve cada cifra. Sustituye al aviso genérico de `isPriorYear` y de `&ejercicio=anterior`.
- **FR-018**: `atlas settings set` y el diálogo de Configuración de la web DEBEN usar `movedTaxYears` y distinguir los ejercicios declarados.
- **FR-019**: el informe de un ejercicio con Renta en vigor DEBE decir que está cerrado y desde cuándo, comparar lo declarado con lo calculado hoy cifra a cifra y descomponer la diferencia en sus causas (Historia 3, escenario 5).

### Bloque 2 — La Renta por casillas

- **FR-020**: una capa **sobre** `TaxYearReport` que no recalcula nada: ordena sus cifras en **conceptos** estables del dominio.
- **FR-021**: las casillas DEBEN vivir como **datos por ejercicio** en el dominio, fuera de la lógica. Cada correspondencia: número, rótulo literal, fuente oficial con URL, fecha de comprobación y certeza.
- **FR-022**: sin correspondencia de un ejercicio, **conceptos sin números** y dicho; sin la de un concepto, lo mismo para ese concepto. **Nunca** la casilla de otro ejercicio.
- **FR-023**: el apartado de cada transmisión DEBE seguir el criterio que la dirección numere a partir de la ficha F1, y cada línea lo lleva.
- **FR-024**: por operación, lo que pide el formulario de ese año; lo que el libro no tiene se dice que falta.
- **FR-025**: una casilla que el motor no calcula entera DEBE rotularse con lo que sí es (doble imposición: «primer límite»).
- **FR-026**: el redondeo de las casillas por operación sigue la ficha F2 (Q3): hoy el informe redondea el resultado una vez; el formulario pide transmisión y adquisición por separado y calcula él la diferencia.
- **FR-027**: las filas del formulario se derivan de las pérdidas por su origen (ficha F5, Q10), del diferido pendiente al cierre de cada ejercicio que la cadena ya calcula; la suma de las filas DEBE coincidir con el saldo de ganancias y pérdidas del informe, y un test lo comprueba en cada ejercicio de cada libro de prueba.

### Bloque 3 — Modelos 720 y 721

- **FR-030**: en su propio módulo, **fuera de `packages/domain/src/tax/`**; lee precios **solo** por `prices.ts` y **solo** de Nivel 1.
- **FR-031**: qué cuenta, categorías, dos saldos de las cuentas, cantidades a 31/12 por `asOf`, posiciones físicas por cuenta, dos libros agregados: Historia 5, escenarios 1–3.
- **FR-032**: la regla de fechas de la valoración y del tipo, con marca: Historia 5, escenario 3. `prices.ts` gana la fecha del tipo (`fx_rate_date`) en lo que devuelve.
- **FR-033**: redondeo por bien, veredicto con fallo seguro, volver a presentar, aviso previo, año en curso: Historia 5, escenarios 4–9.
- **FR-034**: el 721 reutiliza la maquinaria con una sola categoría (Historia 6).
- **FR-035**: toda salida del 720 y del 721 lleva sus criterios con su certeza.

### Bloque 4 — La web

- **FR-040**: la pantalla `/fiscal` con los apartados de la Historia 7, el sistema del rediseño sin excepciones (`tokens.css`, componentes existentes, `Amount` como única puerta de la privacidad, sin estilos en línea, sin identificadores internos, **sin gráficas**).
- **FR-041**: la tarjeta fiscal del Resumen y su posición, decidida por el dominio (`fiscalAttention`).
- **FR-042**: el formulario de lo presentado (precargado y enmascarado, complementaria dicha).
- **FR-043**: el ejercicio cerrado en la vista previa de Registrar, la corrección, la anulación y el diálogo de Configuración.
- **FR-044**: los nombres en llano de todos los criterios del catálogo en la web, con un test que falle si falta alguno.
- **FR-045**: presupuesto del paquete: la pantalla es perezosa, el arranque no crece más allá de su margen, el techo total se fija en lo medido más el margen con el motivo escrito en `check-bundle.mjs`; se mide cuánto tarda un informe en el móvil con la CPU frenada ×4.

### Bloque 5 — La CLI

- **FR-050**: `atlas tax <año> --boxes [--json]`; `atlas m720 <año>` y `atlas m721 <año>` con `--json`; `atlas filed <renta|720|721> <año>` con `--set`, `--receipt`, `--filed-at`, `--supersedes` y `--yes`; `ARITY` y `BOOLEAN_FLAGS`.
- **FR-051**: `atlas tax <año>` enseña el cierre y la comparación.
- **FR-052**: los avisos de ejercicio cerrado en `settings set`, `add`, `ca`, `edit` y `delete`.

### Requisitos transversales

- **FR-060**: ninguna regla fiscal fuera de `packages/domain`: qué presentación está en vigor, qué ancla sale, qué casilla corresponde, si hay que presentar el 720, si la tarjeta sube.
- **FR-061**: ningún código de `tax/` ni `project-ledger.ts` alcanza el módulo de los modelos informativos; ni `tax/` lee `state.valuations` ni `state.fxRates` (ya existe) ni el contenido de una presentación `720`/`721`.
- **FR-062**: ninguna dependencia nueva; `docs/` intacto salvo el primer commit que trae la PR #60; `packages/domain` al 100 %.
- **FR-063**: todo código nuevo de aviso o de error, traducido en las dos interfaces, con todo importe por `f.money` y toda cantidad por `f.quantity`.

### Entidades clave

- **Presentación** (`tax_return_filed`): modelo, ejercicio, fecha de presentación, justificante, a qué sustituye, lo declarado, lo calculado (con la configuración y la fecha del cálculo) y la huella.
- **Cadena de presentaciones**: por (modelo, ejercicio), en orden de fichero; en vigor, la última con `filed_at` ≤ la fecha de consulta.
- **Ejercicio cerrado**: (modelo, ejercicio) con presentación en vigor.
- **Impacto en un ejercicio cerrado**: modelo, ejercicio, fecha de presentación, si cae por fecha, y cada cifra declarada que se mueve con su antes y su después.
- **Comparación de lo declarado**: cifra a cifra, con la diferencia descompuesta en cuatro causas.
- **Concepto de la Renta**: identificador estable; su importe, sus operaciones, sus criterios.
- **Correspondencia de casillas**: ejercicio → concepto → casilla, rótulo, fuente, fecha, certeza.
- **Bien del 720/721**: categoría, cuenta, activo (o efectivo), cantidad, valoración con su fecha, tipo con su fecha, valor exacto y redondeado, marcas.
- **Veredicto**: obligado, no obligado, no se puede determinar; motivos (umbral, subida, extinción, primera vez de la categoría); lo que falta; los valores marcados usados.

---

## Criterios de éxito *(obligatorio)*

- **SC-001**: los tres cálculos a mano y la Renta de 2025 por casillas coinciden con el binario **al céntimo**, y están en la historia de git **antes** que el código.
- **SC-002**: borrar precios y presentaciones `720`/`721` deja **idénticos byte a byte** el informe y la salida por casillas de todos los ejercicios del libro sintético, del de la 009 y de los de esta feature; el mismo borrado **cambia** el 720.
- **SC-003**: el test de arquitectura ve `tax/` y los datos de casillas en el camino fiscal y a los modelos informativos fuera de su alcance.
- **SC-004**: el informe fiscal del libro sintético se mueve **solo** lo que predice `income-category-expectation.md` (FR-005), y después no se mueve un byte; la instantánea del libro solo gana `filings: []`, predicho antes.
- **SC-005**: cada caso límite con test de nombre propio, y cada mutante de la lista del prompt (§5) muerto por un test que se nombra.
- **SC-006**: `packages/domain` al 100 % de líneas y ramas; `lint`, `typecheck`, `test:coverage` y `build` en verde.
- **SC-007**: capturas medidas en los tamaños y estados de la Historia 7, con los desbordamientos medidos con la privacidad **quitada**.
- **SC-008**: el arranque de la web no crece más allá de su margen; el techo total se mueve con motivo escrito.

---

## Supuestos

Cada uno está preguntado en `questions.md`; si no hay respuesta, se implementa así.

- **S1** *(Q1)*: la huella es un SHA-256 del contenido canónico de los eventos anteriores, **migrados a la versión que la huella declara**, más su número; `compact` la verifica antes de reescribir y la vuelve a sellar en la versión nueva.
- **S2** *(Q2, ficha F1, respondida)*: apartado de cada transmisión en 2025: `fund` y `money_market` al de IIC (0310–0325); `etf` al apartado nuevo de 2025 para las IIC del art. 75.3.j) RIRPF (2224–2236); `stock` al de acciones negociadas (0326–0340); `crypto` al de monedas virtuales (1800–1814); todo lo que esté en `movable_capital` (**por defecto, los ETC y los ETP**, FR-005) a la casilla 0031, un título por fila y con su signo; un `etc` o `etp` que el usuario configure en `capital_gain`, sin casilla y dicho.
- **S3** *(Q3, ficha F2)*: por operación, valor de transmisión y de adquisición redondeados cada uno una vez; la salida enseña el resultado que calculará el formulario y avisa si difiere en un céntimo del del motor.
- **S4** *(Q4, ficha F3)*: el saldo medio es la media de los saldos al cierre de cada día natural, convertida al tipo del 31/12 (FAQ de la AEAT, certeza alta); el periodo empieza el 1/10 o, si la cuenta aparece en el trimestre, en su primer movimiento (DGT V0630-25); una cuenta cerrada en el trimestre cuenta con saldo cero desde el cierre.
- **S5** *(Q5)*: sin un evento con tipo del 31/12 para una divisa que solo es efectivo, el saldo sale marcado y el veredicto cae en «no se puede determinar» salvo que lo demás ya obligue; la acción dice cómo resolverlo. Un evento para anotar tipos es una decisión aparte, fuera de esta feature.
- **S6** *(Q6)*: el país de una cuenta a 31/12 es el de su último `account_*` registrado hasta ese día (fecha administrativa), y la salida lo dice cuando hay un cambio.
- **S7** *(Q7)*: una extinción obliga en el ejercicio en que se deja de ser titular (bien de la lista del último 720, que se tenía a 31/12 del año anterior y no a 31/12 del año evaluado); una cuenta se extingue al marcarse inactiva, no por quedarse a cero; una venta parcial no es extinción.
- **S8** *(Q8)*: un ejercicio pasado sin presentación registrada da una **nota** informativa («no consta como declarado; si lo presentaste, regístralo»), no el aviso de declaración.
- **S9** *(Q9)*: las alternativas de los criterios dudosos y la diferencia con la configuración anterior se calculan **con el ancla de lo declarado**: el pasado presentado es un hecho en las dos lecturas, y lo que el cambio hace a un ejercicio presentado lo dice la comparación de la Historia 3.
- **S10** *(Q10, ficha F5)*: las filas del formulario van por origen de la pérdida: pérdida obtenida e imputable en la operación que la produjo, y lo liberado de ejercicios anteriores en 0395; un diferido generado por una transmisión con resultado propio positivo pertenece a las pérdidas que ella liberó, a prorrata. Los totales no cambian.
- **S10 bis** *(nota N3)*: la regla de los 20.000 € y la extinción se aplican al 721 (art. 42 quater.6, certeza alta), con `model_721_increase_eur`; el 721 existe desde 2023 (N4).
- **S11**: un bien del efectivo es **la cuenta** (con todas sus divisas convertidas y sumadas); un bien de valores es **(cuenta, activo)**.
- **S12**: los pendientes se guardan con su signo (negativos), como en el motor y en `FiledAnchor`.
- **S13**: `computed` guarda la configuración **resuelta entera** además del `settings_changed` en vigor, porque con `from_code` no vacío la del libro no basta para reproducir (ADR-0022).
- **S14**: la tarjeta del Resumen sube si es temporada de Renta **o** hay algo del 720/721 que hacer; «algo que hacer» incluye un «no se puede determinar» de un 31/12 pasado (Q11).
- **S15**: el efectivo se mueve en la fecha de negocio del evento, no en la de liquidación (nota N1 de `questions.md`).
- **S16**: un veredicto «obligado» decidido con valores marcados cuenta esos valores en la suma y los nombra.
- **S17**: el ancla, los avisos de ejercicio cerrado y la comparación leen presentaciones `renta` para la Renta y `720`/`721` solo para los modelos informativos; el motor de la Renta no importa nada del 720.

---

## Fuera de alcance

Presentar nada ante la Agencia Tributaria o generar su fichero oficial; calcular la cuota; el Impuesto sobre el Patrimonio; cualquier cosa de AWS; resolver cualquier criterio en disputa; los lotes de divisa y las diferencias de cambio del efectivo (Q6 de la 009); inmuebles; aceptar un ADR; tocar `docs/` (lo que haya que cambiar va en `questions.md`).
