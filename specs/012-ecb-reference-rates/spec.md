# Especificación de la feature: Tipos de referencia del BCE, con el bloque 0 delante (`012-ecb-reference-rates`)

**Rama**: `feature/012-ecb-reference-rates`, creada desde `origin/develop` (`d5dcc13`)

**Creada**: 2026-09-24 (Europe/Madrid)

**Estado**: **aprobada por la dirección el 2026-09-24, con una decisión estructural** (`questions.md` §8, D1-D2). El paso 0 salió **que no**: la File System Access API no permite crear un fichero de forma exclusiva (`questions.md` §1). La dirección decidió que **la web deja de escribir en la carpeta compartida**: guarda el libro en IndexedDB, como el móvil, y de la carpeta solo **lee** (el histórico del BCE y la importación de un libro). El único escritor de la carpeta es la consola, con el cerrojo `"wx"`. Con eso la parada se levanta por diseño y la feature sigue entera.

**Entrada**: `docs/prompts/012-ecb-reference-rates.md` entero (§0–§6, decisiones (a)–(bb)); ADR-0026 (Partes B y C, con sus tres enmiendas), ADR-0029 (con sus dos enmiendas), ADR-0030 (con su enmienda); ADR-0003, ADR-0005, ADR-0006, ADR-0013, ADR-0016, ADR-0018 (enmienda del 2026-09-24), ADR-0019, ADR-0024, ADR-0025 (enmienda); ADR-0027, ADR-0028, ADR-0031 y ADR-0032 para saber dónde acaba el encargo; `docs/data-schema.md` §1, §2, §4, §5, §6.2, §6.3; `docs/fiscal-questions.md` #1, #4, #5 y sus dos tablas; `docs/decision-roadmap.md`, Ronda 8.

**Preguntas**: [`questions.md`](questions.md). El paso 0 con sus fuentes, la parada, las opciones que se le abren a la dirección (sin elegir ninguna) y lo que se ha encontrado de paso.

---

## Resumen

Dos cosas en una feature, en este orden y por este motivo: el libro real empieza a llenarse en cuanto la feature esté lista.

**Bloque 0 — que no se pierda ninguna línea del libro.** Hoy se puede perder una línea por dos ventanas conocidas: los dos almacenes de carpeta (consola y web de escritorio) comparan el etag y después escriben sin nada en medio, y el almacén de IndexedDB lee y reescribe en varias transacciones (en `write`, en `markExported` y en la exportación). El bloque 0 las cierra así: **la web deja de escribir en la carpeta** (D1), **la consola toma un cerrojo consultivo por carpeta del libro** con creación exclusiva, e **IndexedDB gana una primitiva de comparar y escribir en una sola transacción**; añade la regla **«una operación anulada tiene como mucho una corrección viva»** y el campo informativo **`broker_settled_eur`**, que solo se puede capturar con el extracto delante.

**Bloques 1–6 — los tipos del BCE en local.** El histórico oficial se descarga desde la consola y se guarda byte a byte junto al libro; el dominio lo lee, **propone** el tipo al registrar, **comprueba** los tipos del libro contra él y **avisa**; lo que se registra antes de que el tipo exista se guarda como **borrador fuera del libro**; y un cambio de `fiscal_date_rule` que deja tipos que ya no corresponden se **avisa, se señala, se anota y se propone corregir**, nunca se recalcula en silencio.

Cuatro reglas atraviesan la feature (§0 y §6 del encargo):

1. **Perder una línea del libro es lo peor que puede pasar**, y el cerrojo solo vale si adquirirlo es **atómico**. En el navegador no lo es (`questions.md` §1), así que **el navegador no escribe en la carpeta**: un solo escritor por almacén (D1).

**Consecuencia asumida por la dirección, dicha sin suavizar:** hasta que exista la sincronización (feature 014), **la web y la consola de escritorio no comparten un libro vivo**. Cada una tiene el suyo —la consola, el fichero de la carpeta; la web, el del navegador— y se pasa de una a otra **exportando e importando**. Lo que se registra en una no aparece en la otra hasta entonces.
2. **El libro es la única fuente de la fiscalidad.** El histórico propone, comprueba y avisa; no corrige, no recalcula, no confirma nada solo (§6 (d)).
3. **Toda comparación de tipos es numérica** (§6 (e)); **sin histórico se dice «no comprobado», nunca «sin hallazgos»** (§6 (f)).
4. **La web no descarga nada de terceros** y **nada del BCE entra en el arranque** del paquete web (§6 (g), (r)).

## Escenarios de usuario y pruebas

### Historia 1 — Que nada escriba a la vez en la carpeta del libro (Prioridad: P1)

La consola es la única que escribe en la carpeta. Dos consolas (dos terminales, o un comando lanzado mientras otro corre) no pueden pisarse; la web no escribe en ella nunca.

**Por qué esta prioridad**: es la única pérdida de la ronda que no se puede rectificar después, y existe hoy.

**Prueba independiente**: dos escritores de consola sobre la misma carpeta, a la vez; cuenta de líneas antes y después.

**Escenarios de aceptación**:

1. **Dado** que una consola tiene tomado el cerrojo de la carpeta, **cuando** otra intenta registrar, **entonces** no escribe y dice quién lo tiene, desde cuándo, y que basta esperar o, si sabe que quien lo tenía ya no está, romperlo con su comando.
2. **Dado** un cerrojo caducado, **cuando** pasa cualquier cantidad de tiempo, **entonces** nadie lo rompe solo; solo el usuario, a petición.
3. **Dado** que una escritura falla a mitad, **entonces** el cerrojo se suelta igualmente.
4. **Dado** que el usuario rompe un cerrojo cuyo dueño seguía vivo, **entonces** la comprobación de pertenencia antes de renombrar reduce la probabilidad de que escriban los dos, y el mensaje **no** promete más que eso.
5. **Dado** la web de escritorio con una carpeta enlazada, **entonces** la web solo lee de ella (el histórico del BCE, o un libro para importar con confirmación) y su libro vive en el navegador.

### Historia 2 — Dos pestañas sobre el almacén del navegador sin perder nada (Prioridad: P1)

En el móvil (o sin carpeta), el libro vive en IndexedDB. Una pestaña exporta mientras otra registra.

**Prueba independiente**: dos contextos del navegador sobre el mismo origen; una escritura y un `markExported` intercalados; ninguna línea desaparece.

**Escenarios de aceptación**:

1. **Dado** que otra pestaña escribió desde que esta leyó, **cuando** esta escribe, **entonces** recibe conflicto y no pisa nada.
2. **Dado** una exportación, **cuando** se guarda la fecha de exportación, **entonces** no se reescribe el texto del libro.
3. **Dado** que el usuario importa un fichero encima de un libro que ya tiene, **entonces** la aplicación le pide confirmación explícita antes de sustituirlo.

### Historia 3 — Una operación corregida no se cuenta dos veces (Prioridad: P1)

**Escenarios de aceptación**:

1. **Dado** `O`, anulación de `O`, `C1 → O`, **cuando** aparece `C2 → O` sin que `C1` esté anulada **en ese punto del fichero**, **entonces** `C2` es inválida, con su código y sus dos traducciones, aunque más adelante en el fichero se anule `C1`.
2. **Dado** `O`, anulación de `O`, `C1 → O`, anulación de `C1`, `C2 → O`, **entonces** es válido.

### Historia 4 — Guardar lo que el bróker movió en euros (Prioridad: P1)

**Escenarios de aceptación**:

1. **Dado** una compra en dólares, **cuando** el usuario teclea `broker_settled_eur`, **entonces** se guarda tal cual, se enseña junto al importe convertido al tipo del BCE y **ninguna** cifra lo lee.
2. **Dado** un dividendo retenido entero en origen, **entonces** se admite `"0"`; **dado** una compra, un cero se rechaza; un negativo se rechaza siempre; en euros se rechaza; omitido significa **desconocido**.
3. **Dado** la misma operación con y sin el campo, **entonces** la huella de duplicados es la misma.

### Historia 5 — El tipo propuesto al registrar (Prioridad: P2)

**Escenarios de aceptación**:

1. **Dado** un histórico descargado y un evento en divisa con activo elegido, **entonces** la aplicación propone `fx_rate` y `fx_rate_date` de la **última publicación en o antes de la fecha fiscal** según `fiscal_date_rule`, nunca de `trade_date`.
2. **Dado** que el usuario teclea otro tipo y el histórico es concluyente, **entonces** se pide confirmación explícita mostrando el oficial; no es un rechazo.
3. **Dado** que no hay histórico, **entonces** se teclea como hoy y no se propone nada.
4. **Dado** un evento en euros, **entonces** la fecha oculta del tipo también sale de la fecha fiscal.

### Historia 6 — Comprobar los tipos del libro y anotarlo (Prioridad: P2)

**Escenarios de aceptación**:

1. **Dado** el histórico, **cuando** se ejecuta la comprobación profunda, **entonces** cada línea en divisa se contrasta con cuatro hallazgos, cada uno con su literal y traducido en las dos interfaces: tipo distinto, día sin publicación, fecha que no es la última publicación en o antes de la fecha de referencia, divisa que el BCE no publica.
2. **Dado** que no hay histórico, **entonces** la comprobación dice que los tipos están **sin contrastar**; «Libro íntegro: sin hallazgos» no sale.
3. **Dado** una transmisión del informe fiscal que depende de un evento con hallazgo —ella misma o las compras cuyos lotes consume—, **entonces** lleva una nota con código y **ninguna cifra cambia**.

### Historia 7 — Registrar antes de que se publique el tipo (Prioridad: P3)

**Escenarios de aceptación**:

1. **Dado** una operación en divisa cuya fecha fiscal aún no tiene publicación, **entonces** se guarda como borrador fuera del libro, validado como vista previa sin inventar tipo.
2. **Dado** borradores pendientes, **entonces** un contador visible en todas las pantallas lo recuerda.
3. **Dado** que el tipo ya está publicado, **entonces** la aplicación avisa y propone confirmar con el tipo oficial ya puesto; **nunca** confirma sola.
4. **Dado** un borrador, **entonces** no cuenta en posiciones, efectivo, pesos ni fiscalidad.

### Historia 8 — Cambiar `fiscal_date_rule` sin recalcular en silencio (Prioridad: P3)

**Escenarios de aceptación**:

1. **Dado** un cambio que deja líneas con un tipo que ya no corresponde a su nueva fecha fiscal, **entonces** el aviso lo dice **antes** de confirmar; lo que solo el histórico puede decir se dice como «no se puede verificar contra el oficial» cuando no lo hay.
2. **Dado** esas líneas, **entonces** la aplicación propone la corrección —posiblemente una **cadena** de anulaciones y correcciones que incluye a las dependientes—, la enseña entera con el aviso de cada ejercicio presentado que toque, y la escribe **de una vez o no la escribe**.

### Casos límite

- Un día hábil que todavía no está en el histórico **no se resuelve** con el anterior.
- `0.85950` y `0.8595` son el mismo tipo.
- Un histórico nuevo que cambia un tipo ya publicado no sustituye al anterior: se conservan los dos y sigue activo el anterior.
- La descarga sin red, ilegible o con un ZIP roto no toca el fichero que hay.
- El calendario TARGET solo se contrasta en los años que usa el libro; un desacuerdo avisa, nunca bloquea.
- Una línea en euros (`fx_rate = "1"`) no se contrasta.
- El proceso se corta entre registrar un borrador y quitarlo.

## Requisitos

### Requisitos funcionales

**Bloque 0**

- **FR-001**: Toda escritura de la consola en la carpeta del libro —el libro, `archive/`, `drafts/`, `reference/ecb/` y, cuando exista, `sync/`— DEBE ir bajo **un solo cerrojo consultivo por carpeta**, tomado antes de comparar el etag y soltado después de renombrar, también si la escritura falla.
- **FR-002**: La adquisición del cerrojo DEBE ser atómica (creación exclusiva). **La web no escribe nunca en la carpeta** (D1): solo lee el histórico del BCE y, para importarlo con confirmación, un libro.
- **FR-003**: El cerrojo DEBE decir quién lo tiene y desde cuándo; su caducidad es solo informativa; romperlo es un acto del usuario, con un comando de la consola.
- **FR-004**: Antes de renombrar, el escritor DEBE comprobar que el cerrojo sigue siendo suyo, presentado como reducción de riesgo, nunca como garantía.
- **FR-005**: En IndexedDB, toda lectura seguida de escritura del libro guardado DEBE ir en una sola transacción de lectura y escritura; `markExported` no reescribe el texto; la exportación lee el texto y anota su fecha en la misma transacción; importar no hereda la fecha de exportación del libro sustituido (D4).
- **FR-006**: Importar un libro encima de otro DEBE pedir confirmación explícita.
- **FR-007**: La proyección DEBE rechazar, en orden de fichero, una segunda corrección viva de la misma operación, con código propio.
- **FR-008**: `broker_settled_eur` DEBE existir como campo opcional en `buy`, `sell`, `dividend`, `interest` y `standalone_fee`, con los bordes de §6 (n), fuera de la huella, sin subir `schema_version`, y legible solo desde una lista cerrada de módulos.

**Bloques 1–6**

- **FR-009**: El dominio DEBE leer el histórico sin normalizar lo guardado y resolver el tipo de una divisa y una fecha con desenlaces cerrados (resuelto, aún no publicado, divisa no publicada, último valor demasiado antiguo).
- **FR-010**: Una actualización del histórico DEBE sustituir al anterior solo si contiene, con el mismo valor numérico, todos sus tipos.
- **FR-011**: La consola DEBE descargar el histórico (ZIP preferido, API de respaldo), guardarlo tal cual con su procedencia y decir qué ha hecho; sin red o con datos ilegibles no toca nada.
- **FR-012**: Registrar DEBE proponer el tipo desde la fecha fiscal y pedir confirmación cuando el tecleado difiere del oficial concluyente; la decisión de cuándo confirmar la toma el dominio.
- **FR-013**: La comprobación profunda DEBE emitir los cuatro hallazgos del BCE recorriendo **la única enumeración** de campos de tipo del esquema, con el guardián de esa enumeración reescrito por pareja.
- **FR-014**: El informe fiscal DEBE llevar una nota con código en las transmisiones que dependan de un evento con hallazgo (o con `fx_rate_date_after_fiscal_date`), sin mover ninguna cifra.
- **FR-015**: Los borradores DEBEN vivir fuera del libro, con su propia validación, sin contar en ninguna cifra y sin confirmarse solos.
- **FR-016**: Un cambio de `fiscal_date_rule` DEBE avisar antes de confirmar, señalarse después, anotarse en el informe y proponer una corrección que se escribe de una vez.
- **FR-017**: El criterio fiscal nuevo de ADR-0029 punto 10 DEBE entrar en el catálogo y en las dos tablas de `docs/fiscal-questions.md` en el mismo commit.

### Entidades clave

- **Cerrojo de la carpeta**: un fichero en la carpeta del libro con quién lo tiene, desde cuándo y un testigo propio.
- **Histórico del BCE**: el CSV oficial, byte a byte, con su procedencia; una lectura en memoria, nunca una copia normalizada.
- **Borrador**: una operación completa sin tipo, fuera del libro, pendiente de confirmar.
- **Hallazgo del BCE**: un resultado de la comprobación profunda con su código y la línea a la que se refiere.

## Criterios de éxito

- **SC-001**: Con dos consolas sobre la misma carpeta escribiendo a la vez, **ninguna** línea se pierde en ninguna repetición; y la web no tiene ningún camino que escriba en la carpeta.
- **SC-002**: Con dos pestañas sobre el almacén del navegador, ninguna línea se pierde por una exportación o un registro intercalados.
- **SC-003**: Ninguna cifra fiscal cambia por el histórico: los ficheros dorados existentes no se mueven.
- **SC-004**: Sin histórico, ninguna pantalla ni salida de la consola dice «sin hallazgos» sobre tipos que no ha contrastado.
- **SC-005**: El arranque del paquete web no crece por nada del BCE.

## Supuestos

- Con la decisión D1, la ubicación de la carpeta y el navegador del usuario dejan de importar para la exclusión: la web no escribe en la carpeta. Leerla sigue exigiendo un Chromium de escritorio (Chrome o Edge); en cualquier otro, el histórico se importa a mano como en el móvil.
- El usuario todavía no usa el modo de fichero directo de la web (dirección, D1): retirarlo no le hace perder nada.
