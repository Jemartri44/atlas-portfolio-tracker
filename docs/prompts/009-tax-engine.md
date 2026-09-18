# Prompt 009 — Feature `009-tax-engine`

> Copia este texto íntegro al asistente implementador, o indícale que lea `docs/prompts/009-tax-engine.md`.
>
> **Requisito previo: la feature 008 (`docs/prompts/008-fiscal-provisions.md`) tiene que estar fusionada.** Esta feature consume los campos que aquella añade. Si no lo está, para y avisa.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker** (`~/projects/atlas-portfolio-tracker`). Vas a construir el **núcleo del motor fiscal**: las cifras de la declaración de la Renta española, calculadas exclusivamente a partir del libro.

Esta es **la parte del proyecto donde un error cuesta más caro**. Todo lo demás se nota: una gráfica mal dibujada se ve, un peso mal calculado chirría. Un lote mal consumido en 2027 se descubre en una comprobación de Hacienda en 2032. Trabaja en consecuencia.

## 0. Tres cosas que tienes que entender antes de leer nada más

**El usuario no tiene asesor fiscal.** Los criterios que aplica este motor los fijó la dirección del proyecto leyendo la normativa, y una revisión adversarial posterior encontró que **tres eran incorrectos y seis siguen en disputa**. Eso no bloquea la feature —los criterios son configuración— pero **cambia lo que el motor tiene que producir**: no basta con dar un número, hay que decir de qué criterio depende.

**Este motor no calcula lo que se paga.** Calcula **la base**: ganancias y pérdidas patrimoniales, rendimientos del capital mobiliario, compensaciones y arrastres. No puede calcular la cuota, porque no ve el resto de la declaración (mínimo personal, rendimientos del trabajo, el tipo medio efectivo real). Cualquier salida que use los tramos del ahorro es **una estimación de la base, etiquetada como tal**, nunca "lo que debes".

**Ninguna cifra del IRPF depende de un precio de mercado** (constitución II). Los precios son informativos. La única excepción es el **Modelo 720**, que por ley se valora a cotización de 31/12: es una declaración informativa, no liquidativa, y va claramente separada del resto por ese motivo. Si te encuentras leyendo un precio para calcular una ganancia, algo va mal.

## 1. Lee antes de hacer nada, en este orden

1. `CLAUDE.md` entero. Las diez *Domain traps* son el índice de lo que puede salir mal aquí; siete de las diez te afectan directamente.
2. `.specify/memory/constitution.md`: **II** (ningún cálculo fiscal depende de precios), **III** (compartimentación y sus dos excepciones — la salida fiscal **agrega los dos libros**, siempre etiquetada como total fiscal), **V** (fallo seguro).
3. **`docs/fiscal-questions.md` entero.** No es contexto, es tu especificación de criterios. Fíjate en las columnas de **certeza** y de **dirección del riesgo**, y en qué significa el grado **en disputa**.
4. **ADR-0020** (`tax_return_filed`: qué deja registrado el libro sobre lo declarado), **ADR-0021** (las nueve previsiones del esquema y por qué existen), ADR-0013 (fecha fiscal, ventana, `fx_rate`), ADR-0014 (la ventana de fecha a fecha), ADR-0005 (dinero decimal), ADR-0009/0010/0011 (FIFO, traspasos, primitivas), ADR-0016 (`asOf`).
5. `docs/business-rules.md` §5 entera y §8; `docs/data-schema.md` §8 entera, en especial §8.4 y §8.6.
6. El código: `packages/domain/src/projections/` completo, sobre todo `gains.ts`, `wash-sale.ts`, `income.ts`, `fiscal-lots.ts`, `primitives.ts` y `operations.ts`. Ya existe más de lo que parece: `realizedGains`, `investmentIncome` y `fiscalLots` llevan tiempo funcionando.

Si algo es ambiguo, contradictorio o te bloquea, **no lo resuelvas**: `specs/009-tax-engine/questions.md` y avisa. Aquí no se adivina nada.

## 2. Flujo de trabajo

1. Worktree separado, rama desde `develop` **actualizado**:
   ```bash
   cd ~/projects/atlas-portfolio-tracker && git fetch origin && git worktree add ../atlas-portfolio-tracker-009 -b feature/009-tax-engine origin/develop
   cd ../atlas-portfolio-tracker-009 && git config core.hooksPath .githooks && nvm use && npm ci
   ```
2. Spec Kit en `specs/009-tax-engine/` (español, identificadores en inglés). **Enseña `spec.md` y `plan.md` y espera el visto bueno antes de escribir código.**
3. Implementación por bloques, commits atómicos, Conventional Commits en inglés.
4. Sin PR: la dirección sube y fusiona tras revisar.

## 2 bis. Reglas de operación

- **`packages/domain` al 100 % de líneas y ramas.** Bloqueante.
- **Ninguna dependencia nueva.**
- **No toques `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`.**
- **`npm run lint` verde antes de cada commit y otra vez como último paso antes de entregar.**
- Nunca `git push`, nunca fusiones.
- **Ni una regla fiscal fuera del dominio.** La CLI y la web muestran; no calculan.

## 3. Alcance

### 3.1 El ejercicio fiscal consolidado

Una proyección que, dado un año, produce **todo lo que hace falta para la base del ahorro**:

- **Ganancias y pérdidas patrimoniales** por transmisión, con su FIFO **consolidado por activo homogéneo a través de cuentas y de los dos libros** (constitución III: la salida fiscal agrega núcleo y cubo, **siempre etiquetada como total fiscal**, nunca mezclada en ninguna otra vista).
- **Rendimientos del capital mobiliario**: dividendos, intereses, y —si `Settings.income_category` lo dice— las transmisiones de los tipos de activo marcados como `movable_capital`. **Por defecto todo sigue siendo ganancia patrimonial**, así que sin tocar configuración el comportamiento no cambia (ADR-0021).
- **Aplicación de la regla de recompra**: qué pérdidas quedan **diferidas** este ejercicio y cuáles se **liberan** de ejercicios anteriores. Hoy el sistema solo **avisa**; aquí es donde por fin se calcula.
- **Compensaciones**: entre ganancias y pérdidas, y el cruce con los rendimientos del capital mobiliario **hasta el 25 %, en los dos sentidos**. Es **obligatorio compensar el máximo posible cada ejercicio**: no se puede guardar una pérdida para un año mejor, y si el motor no lo hace así, una pérdida se pierde por caducidad al quinto año sin que nadie se entere.
- **Arrastre a cuatro ejercicios**, anclado en lo efectivamente declarado cuando exista un `tax_return_filed` (ADR-0020) y en el cálculo propio cuando no.
- **Conversión de divisa por fecha fiscal**, con el tipo del BCE tal y como se publicó y su fecha (ADR-0013). Nunca se convierte y se descarta el original.

### 3.2 La procedencia de cada cifra

**Toda cifra de salida tiene que poder desarmarse hasta los eventos que la producen.** No es una funcionalidad opcional: es el principio de que todo valor derivado sea recomputable, aplicado justo donde importa. Un total de ganancias que no se puede abrir en las transmisiones que lo componen, y cada una en sus lotes, es inauditable — y auditar esto es exactamente lo que puede pasar.

### 3.3 Las cifras dicen de qué criterio dependen

Esto es lo que distingue a esta feature de un motor fiscal cualquiera, y es **obligatorio**.

Seis criterios de `docs/fiscal-questions.md` están **en disputa** y varios más tienen certeza media. Una cifra calculada bajo un criterio discutible **no puede presentarse igual que una calculada bajo el art. 35, que no discute nadie**.

- Cada cifra de salida lleva **qué criterios se han aplicado para obtenerla**, con su grado de certeza.
- La salida incluye un apartado propio: **qué cifras dependen de un criterio en disputa, cuánto dinero hay en juego en cada una, y en qué dirección** (si el criterio está mal, ¿se declara de más o de menos?).
- Cambiar un criterio es un `settings_changed` y **recalcula**; la salida tiene que poder decir en qué se diferencia del cálculo anterior.

El destinatario de esto es doble: el usuario, para saber dónde está pisando terreno firme; y un asesor fiscal, el día que lo haya, para poder revisar **solo lo dudoso** en lugar de todo.

### 3.4 Lo que el motor se niega a hacer

Con un mensaje claro, no con un número aproximado:

- **No calcula la cuota ni lo que se paga.** Produce la base. Si se usan los tramos del ahorro, la salida dice "estimación de la base", nunca "impuesto a pagar".
- **No calcula la deducción por doble imposición entera**: el límite del tipo medio efectivo exige la base liquidable completa, que el motor no ve. Calcula lo que sí puede (el impuesto extranjero limitado al tipo del convenio) y **dice explícitamente qué falta y por qué**. Y que el exceso no deducible **se pierde**: en IRPF no hay arrastre.
- **No presenta nada ante nadie.** Nunca.

### 3.5 Salida por la CLI

`atlas tax <año>`, con el detalle por operación y los agregados, en tabla y en `--json`. El formato de la declaración por casillas y la pantalla web son la **feature siguiente**: aquí se entrega el motor y una salida honesta por consola, terminada, antes que media interfaz.

## 4. Fuera de alcance

El evento `tax_return_filed` en sí (ADR-0020: es la feature siguiente, junto con la salida por casillas); los Modelos 720 y 721; la pantalla fiscal de la web; **resolver cualquier criterio en disputa**; cualquier cosa de AWS; cualquier ADR nuevo (puedes proponerlo, no aceptarlo).

## 5. Criterios de terminado

- `lint`, `typecheck`, `test:coverage`, `build` y CI en verde; `packages/domain` al **100 %**.
- **Un ejercicio completo calculado a mano y contrastado con el motor**, operación por operación, escrito en `questions.md`. Si no lo has hecho a mano, no está terminado.
- **Casos límite obligatorios** (`CLAUDE.md` § *Tests*): varios lotes con la misma fecha; fracciones; contrasplit con pico en efectivo; **recompra exactamente en el límite de la ventana**, por los dos lados; traspaso parcial; un traspaso que conserva antigüedad a través de tres saltos; una pérdida diferida cuyos lotes se traspasan antes de liberarse; y un ejercicio en el que una pérdida **caduca**.
- **Demostración de que ninguna cifra del IRPF cambia si se borran todos los precios del libro** (constitución II). Es la prueba más importante de la feature: bórralos y comprueba que sale lo mismo.
- **Demostración de que los valores por defecto no cambian nada** respecto a `develop`.
- `docs/` sin cambios; `specs/009-tax-engine/questions.md` con lo preguntado.

## 6. Decisiones fijadas por este prompt

- **(a) El motor calcula la base, no la cuota.** No puede ver el resto de la declaración y fingir que sí sería el peor error posible: daría una cifra creíble y falsa.
- **(b) Toda cifra dice de qué criterio depende**, y hay un apartado propio con las que dependen de uno en disputa, el dinero en juego y la dirección del riesgo. Sin esto, la feature no está terminada.
- **(c) Toda cifra se desarma hasta sus eventos.** Inauditable es inaceptable en la única parte del proyecto que puede acabar auditada.
- **(d) La compensación es obligatoria en la cuantía máxima cada ejercicio.** No es una opción del usuario; hacerlo mal pierde pérdidas por caducidad.
- **(e) La salida fiscal agrega los dos libros** (constitución III, primera excepción) y va **siempre etiquetada como total fiscal**. En ninguna otra vista se mezclan.
- **(f) Ningún cálculo del IRPF lee un precio**, y se demuestra borrándolos. El 720 es la excepción legal y va en la feature siguiente, separado por ese motivo.
- **(g) `income_category` se consume aquí pero su valor por defecto no cambia nada**: sin tocar configuración, todo sigue siendo ganancia patrimonial (ADR-0021).
- **(h) Se entrega el motor con salida de consola terminada**, no media pantalla web. Lo pequeño y acabado antes que lo grande a medias (decisión (g) de la 006).

## 7. Respuestas a las preguntas del motor fiscal

Quince preguntas del implementador tras leer el prompt y medir sobre `develop`. Una encontró un defecto vivo y tres encontraron errores de este prompt.

- **(Q14) Defecto vivo en `develop`, primer commit del bloque 0.** Cuando un `corporate_action` se rechaza, el estado se revierte pero **no se deshacen las adquisiciones ni la renta en especie** que había anotado. Deja una adquisición fantasma que el motor usaría para aplazar una pérdida que no existe. Solo ocurre en modo degradado, que es justo el modo en que se lee un libro que hay que reparar.
- **(Q1) Cuatro reglas de la recompra** que `data-schema.md` §8.4 no fijaba, ahora criterios **#18 a #21** de `docs/fiscal-questions.md`: solo cuenta lo que permanece en el patrimonio tras la venta; cada unidad recomprada aplaza una sola vez; la regla se aplica por operación; y lo liberado se suma y vuelve a pasar por la regla. **#18 y #19 son la lectura mayoritaria y son agresivas frente a la alternativa**, y así constan.
- **(Q2)** Orden de la compensación del art. 49 en dos fases, como el manual práctico de la AEAT: criterio **#22**.
- **(Q3)** El 25 % y los cuatro años son **configuración con valor por defecto**, no constantes: el 25 % cambió cuatro veces entre 2015 y 2018.
- **(Q4) Error de este prompt.** Daba por hecho que el tipo de cada convenio de doble imposición existía en algún sitio, y **no existe**. Se configura por país, sin valores por defecto, y **sin tipo no se calcula deducción**.
- **(Q5)** Solo se deducen del capital mobiliario las comisiones de custodia y administración: criterio **#23**.
- **(Q6)** Las diferencias de cambio del efectivo quedan fuera, y la salida lo dice con todas las letras.
- **(Q7)** La renta en especie de un `grant` no se integra (criterio #8 vigente) y aparece entre los dudosos como exposición.
- **(Q8)** "Dudoso" es: en disputa, certeza media o baja, los criterios nuevos y la categoría de los ETC/ETP.
- **(Q9)** El ancla de lo declarado es parámetro del motor desde ya. **Enmienda a ADR-0020 el mismo día**: las pérdidas pendientes se guardan separadas por categoría de renta, porque compensan distinto.
- **(Q10) Error de este prompt.** Pedía una "estimación de la base" usando los tramos del ahorro, y **los tramos dan una cuota, no una base**. No se aplican: el motor produce la base y se para ahí, que es lo que dice su propia decisión (a).
- **(Q11)** Un libro con eventos inválidos no da cifras fiscales: da la lista de lo que hay que reparar.
- **(Q12)** El aviso al cambiar la configuración pasa al dominio con una función nueva, porque hoy callaría cuando un cambio mueve la base sin mover ninguna ganancia.
- **(Q13) Premisa inexacta de este prompt.** `fiscal_date_rule` tampoco tenía código de error propio; ahora lo tienen los dos.
- **(Q15)** Sin una lista de mercados de la UE, no se clasifica: toda pérdida cotizada con ventana de dos meses declara que depende del criterio #2.
- **El aviso de recompra actual y el motor no pueden contar historias distintas.** Con el #18 adoptado, el aviso que nombra una compra consumida por la propia venta es falso: se alinea al final de la feature, en commit propio y con la disciplina de una regeneración del *golden*. De paso, los dos mensajes de recompra nombran la compra y el año fiscal con número, en vez de "este ejercicio", que leído un año después es falso.
- **Erratas de este prompt**, además de las anteriores: `fiscal-lots.ts` no existe (la función está en `lots.ts`) y `business-rules.md` no tiene §8 (era `data-schema.md` §8).
