# ADR-0026 — La nube como capa sobre lo local: sincronización del libro entre dispositivos

**Estado:** Aceptada (2026-09-24), por decisión de la dirección, que elige la opción 2. Ronda 8. El marco —la nube se **añade** a lo local y no lo sustituye— lo fija también la dirección. Completa ADR-0019, que no queda reemplazado.

## Contexto

ADR-0019 dejó la web funcionando entera en el dispositivo y aplazó a propósito una cosa: ver el mismo libro en dos dispositivos sin mover un fichero. Prometía que «el adaptador de S3 se suma a los otros sin tocar ni una línea del dominio». **Esa promesa es verdad solo si toda escritura se hace con conexión.** Un adaptador de S3 da un fichero compartido con escritura condicional (`If-Match`, ADR-0002 y ADR-0006); no dice qué pasa cuando dos dispositivos añaden líneas **sin conexión** y después se sincronizan, que es el caso que la dirección pide resolver.

**Lo que decide la dirección (2026-09-24), con su motivo:** la nube es una capa añadida. La web y la consola siguen funcionando sin conexión y sin servidor, porque eso es lo que ya funciona hoy y lo que protege al usuario si la nube desaparece. La nube aporta tres cosas: sincronización del libro, tareas programadas y correos. **El modelo de dominio no cambia, y todo lo que la ronda añade es compatible según ADR-0018** (corregido el mismo día: el primer texto decía «el dominio no cambia», y la ronda sí añade cosas). Lo que se añade:

- el caso de uso puro de reaplicar una cola sobre un libro (este documento);
- los ficheros de estado del dispositivo, fuera del libro (`sync/`, y `drafts/` de ADR-0029);
- el campo opcional `broker_settled_eur` (ADR-0030) y el campo opcional `price_symbols` del catálogo (ADR-0031), sin subir `schema_version`;
- las funciones puras del BCE: lectura del histórico, resolución del tipo, calendario TARGET y hallazgos de integridad (ADR-0029);
- el puerto `PriceSource` y un puerto de almacén de precios (ADR-0031).

Restricciones que pesan:

- El libro es append-only (ADR-0003) y **el orden canónico es la posición en el fichero** (ADR-0006, `data-schema.md` §2), precisamente porque dos dispositivos con relojes distintos generan identificadores desordenados.
- `append` nunca re-serializa lo que ya está escrito, y el cargador rechaza versiones de esquema más nuevas (`data-schema.md` §5).
- Las mutaciones exigen un libro válido; las consultas degradan (ADR-0015).
- Una huella repetida es un **aviso con confirmación**, nunca un rechazo ni un silencio (ADR-0012).
- `settings_changed` y los `*_updated` del catálogo guardan el **estado completo**, no un parche (ADR-0022, `data-schema.md` §6.1): el último que se aplica gana entero.
- La validación está siempre en el backend (constitución, Seguridad).
- Los dos almacenes locales tienen una ventana entre comprobar el etag y escribir (ADR-0025, enmienda; `docs/pendientes-post-010.md`, «Lo que la 011 deja apuntado», punto 1). En S3, la escritura condicional hace la comparación y la escritura en una sola petición.

**Qué puede salir mal, que no es de bytes sino de significado.** Juntar dos colas de líneas es trivial; lo difícil es que el resultado siga significando algo:

1. **Duplicado.** La misma operación, registrada en el móvil y en el portátil.
2. **Consumo cruzado.** El portátil anula una compra; el móvil, sin saberlo, registra una venta que consume sus lotes. Cada uno por separado es válido; juntos, no (ADR-0003 rechaza anular algo consumido).
3. **Doble rectificación** del mismo evento, una en cada dispositivo.
4. **Fotos concurrentes.** Dos `settings_changed`, o dos `asset_updated` del mismo activo: como cada uno es una foto completa, el que se aplique después **borra en silencio** el cambio del otro.
5. **Avisos nuevos.** Una operación que no avisaba en su dispositivo avisa tras juntar: una huella que ahora está repetida, un ejercicio que el otro dispositivo marcó como presentado.
6. **Versiones distintas.** Una PWA antigua en caché con líneas pendientes frente a un remoto con líneas de una versión de esquema más nueva.
7. **Remoto reescrito** —por `compact` o por una restauración— mientras un dispositivo tiene líneas pendientes.
8. **Reloj desajustado.** `recorded_at` decide qué configuración rige (`settingsAt`); un dispositivo con la hora mal escribe fechas de registro falsas.

## Opciones consideradas

1. **Solo se escribe con conexión.** Con la nube activada, un dispositivo sin conexión consulta pero no registra; cada escritura es un `append` condicional contra el remoto y un conflicto se reintenta sobre la versión nueva, como ya describe ADR-0006. *Ventajas:* no hay fusión; ninguno de los ocho casos existe. *Inconvenientes:* rompe lo que ADR-0019 prometió («sin conexión no se pierde ninguna funcionalidad, ni siquiera registrar operaciones») y lo que la dirección acaba de reafirmar; y empuja al usuario a registrar «luego», que es justo lo que la regla 20 del plan quiere evitar.

2. **Cola local y reordenación de lo pendiente al sincronizar** (*rebase*). Lo sincronizado nunca se mueve; lo que un dispositivo añadió sin conexión se vuelve a validar, línea a línea, **encima** de lo que llegó del remoto, y lo que ya no cabe se retiene para que el usuario decida. *Ventajas:* se registra sin conexión; los ocho casos se detectan con el motor que ya existe (la validación de registrar, la huella de duplicados) más una regla de sincronización para las fotos concurrentes; el remoto nunca recibe un libro inválido. *Inconvenientes:* las líneas pendientes tienen **posición provisional**; hay que construir la interfaz de lo retenido; y el usuario, alguna vez, tendrá que rehacer algo.

3. **Unión automática por identificador.** El libro como conjunto de líneas; sincronizar es unir los dos conjuntos. *Ventajas:* automática, sin intervención. *Inconvenientes:* los casos 2, 3 y 4 solo se descubren **después** de escribir, cuando el libro compartido ya es inválido o ya ha perdido un cambio de configuración; un libro inválido bloquea las mutaciones en **todos** los dispositivos a la vez. Y la unión no se puede deshacer en un libro append-only.

4. **Un fichero por dispositivo** (`ledger/<dispositivo>.jsonl`), fusionados al proyectar. *Ventajas:* no hay conflictos de escritura; cada dispositivo solo añade al suyo. *Inconvenientes:* los conflictos de significado son los mismos que en la opción 3 y se descubren igual de tarde; no hay orden canónico entre ficheros salvo el reloj, que ADR-0006 descartó por no fiable; y reemplaza la decisión 1 de ADR-0006 (un único `ledger.jsonl`).

5. **Un solo dispositivo escritor, o un cerrojo con caducidad.** *Ventajas:* sin fusión. *Inconvenientes:* un cerrojo olvidado en el móvil bloquea el portátil; si caduca, vuelven los conflictos; y obliga a decidir antes de salir de casa en qué dispositivo se va a registrar.

## Decisión

### Parte A — lo que fija la dirección, sea cual sea la opción

- **Capa, no sustituto.** Todo dispositivo sincronizado guarda el libro **entero** y funciona sin la nube. Si la nube desaparece, se pierde la sincronización, no el libro.
- **La API es la única que escribe el libro en S3 desde Internet, y solo sabe añadir.** Una petición de la API nunca reescribe ni borra líneas: comprueba que lo que sube **empieza por los bytes que hay** y añade detrás, con `PutObject` condicional. IAM no puede expresar «solo añadir» sobre un objeto, así que lo garantiza el código de la Lambda y lo hace reversible el versionado del bucket (ADR-0028). `compact` y la restauración (ADR-0032) **no** se exponen en la API: son operaciones de administración, con credenciales de vida corta, fuera del camino que alcanza Internet.
- **La Lambda valida con el dominio antes de escribir**: rechaza líneas de una versión de esquema que no conoce, decodifica cada línea, proyecta el libro con ellas añadidas y rechaza si alguna es inválida. Una huella repetida **exige confirmación explícita en la propia petición**, por línea; sin ella, la línea no se escribe. Así la idempotencia no depende de que el cliente sea correcto.
- **Réplicas idénticas byte a byte.** La API añade las líneas **tal como las serializó el cliente**, sin re-serializarlas, de modo que el fichero de cada dispositivo sincronizado es exactamente el remoto y se puede comprobar por su hash. El etag del puerto `LedgerStore` sigue siendo opaco: el cliente trabaja con el SHA-256 de los bytes (como `BlobLedgerStore`) y la Lambda traduce a la condición de S3.
- **Nadie reescribe el remoto sin que se note.** Si el remoto deja de empezar por los bytes que un dispositivo sincronizó, el dispositivo descarga el remoto entero y comprueba que **todo identificador que ya había sincronizado sigue estando**. Una compactación lo cumple (conserva los identificadores). Si falta alguno, el dispositivo **no sube nada** y avisa: alguien ha reescrito el historial.

### Parte B — la sincronización: opción 2

**Se elige la opción 2** (decisión de la dirección, 2026-09-24). Motivo: es la única que mantiene el registro sin conexión que prometió ADR-0019 y descubre los conflictos **antes** de que el libro compartido sea inválido. Lo que no cabe se retiene para que decida el usuario y **nunca se pierde**. Su forma:

**En el dispositivo, un solo fichero y un marcador.** El libro local sigue siendo el mismo `ledger.jsonl` (o su equivalente en IndexedDB). Un fichero de estado aparte, `sync/state.json`, recuerda cuántas líneas y qué hash tenía el prefijo sincronizado. Las líneas posteriores a ese prefijo son las **pendientes**. Así la consola no cambia nada para registrar sin conexión: su `append` de siempre crea una línea pendiente. El marcador es una caché: si se pierde, la parte común con el remoto es lo sincronizado.

**La regla nueva, dicha sin rodeos:** *las líneas sincronizadas no se mueven nunca; las pendientes tienen posición provisional.* Al sincronizar, una línea pendiente puede quedar detrás de las que llegaron del remoto, **con sus bytes intactos**. Es la única excepción a «la posición en el fichero es definitiva», y solo afecta a lo que ningún otro dispositivo ha visto todavía.

**Sincronizar es, en este orden:**

1. Descargar el remoto. Si empieza por el prefijo sincronizado, lo nuevo es su cola; si no, aplicar la comprobación de identificadores de la parte A.
2. Descartar de las pendientes las que el remoto ya tiene por `id` (una sincronización anterior que se cortó después de subir).
3. **Reaplicar las pendientes una a una, en su orden local, encima del remoto**, con la misma validación que registrar. Cada una acaba en uno de tres estados:
   - **aceptada**;
   - **retenida por error**: el dominio la rechaza (casos 2 y 3), o depende de otra retenida;
   - **retenida para confirmar**: aparece un aviso de los que piden confirmación que no tenía al registrarse (caso 5), o es una **foto concurrente** (caso 4): un `settings_changed`, o un `*_updated` de una cuenta o un activo que el remoto también cambió desde el prefijo sincronizado. Esto último no lo ve el dominio; es la única regla propia de la sincronización.
4. Subir las aceptadas con la condición del remoto descargado. Es un `POST`, así que lleva el hash del cuerpo que exige CloudFront delante de la Lambda (ADR-0027). Si otro dispositivo escribió entretanto, la API responde conflicto y se vuelve al paso 1.
5. Rehacer el fichero local para que sea exactamente el remoto. Si solo ha llegado cola del remoto, es un `append` puro. Si además había pendientes que cambian de sitio, es un `replace` que **archiva antes** los bytes locales anteriores, con el contrato que ya tiene `LedgerStore.replace`.

**Lo retenido nunca se pierde ni se sube solo.** Se guarda tal cual en `sync/held.jsonl`, se enseña con su motivo y el usuario elige: confirmar (duplicado, ejercicio cerrado), rehacer (una foto concurrente se rehace sobre el estado actual, con el formulario precargado) o descartar, que es explícito y deja la línea en `sync/discarded.jsonl`.

**Quién sincroniza.** La web: en el móvil sobre IndexedDB; en el escritorio **sobre la carpeta que comparte con la consola**, de modo que la consola queda sincronizada sin autenticarse. En esta ronda la consola no inicia sesión contra la nube.

**Casos límite escritos:**

- **Versiones (caso 6).** Un cliente antiguo no carga un remoto más nuevo, por el contrato del cargador; sus pendientes esperan en el dispositivo hasta que se actualice. La API rechaza líneas de una versión que no conoce. Consecuencia de despliegue: **la Lambda se actualiza antes que los clientes** que escriban una versión nueva.
- **Reloj (caso 8).** La API rechaza un `recorded_at` posterior a su propia hora más una tolerancia configurable. No arregla un reloj atrasado; lo acota.
- **El primer dispositivo** sube su libro entero si el remoto está vacío. **Uno que se une con libro propio** no se fusiona solo: el usuario elige entre empezar desde el remoto o subir sus líneas como pendientes, que pasan por el paso 3 (la huella de duplicados las delatará si ya estaban).

## Consecuencias

- **El esquema de eventos no cambia por la sincronización.** El dominio gana un **caso de uso puro** —reaplicar una cola sobre un libro y clasificar el resultado—, con cobertura del 100 %, que usan el cliente y la Lambda. Es una capacidad nueva, no un cambio del modelo.
- Ficheros de estado del dispositivo fuera del libro: `sync/state.json`, `sync/held.jsonl`, `sync/discarded.jsonl`. Ninguno es fuente de verdad del libro.
- La ventana del etag desaparece **en el remoto** (la condición la evalúa S3) y **sigue en los almacenes locales**; con dos escritores locales —la consola y la web sobre la misma carpeta— sigue siendo un riesgo pequeño y ya anotado.
- Las líneas pendientes pueden cambiar de sitio al sincronizar, y con ellas el desempate de dos operaciones del mismo día de negocio entre dispositivos. Queda aceptado y debe decirse en la interfaz: una vista de antes de sincronizar puede cambiar después.
- El contrato HTTP (rutas, cuerpos, códigos, la confirmación por línea) se fija por escrito en `docs/api.md` **antes** de implementar, en el encargo de la feature.
- Documentos y extractos (`documents/`, `imports/`) no entran en esta decisión: se suben por la API con la regla de añadir y nunca sobrescribir, y su detalle va en la feature.
- **Riesgos aceptados:** una línea pendiente vive solo en su dispositivo hasta que se sincroniza, así que borrar los datos del navegador antes de sincronizar la pierde (hoy pasa lo mismo con todo el libro); y el usuario tendrá que rehacer a mano, alguna vez, lo retenido.
- Relacionadas: ADR-0002, ADR-0003, ADR-0006, ADR-0012, ADR-0015, ADR-0019, ADR-0022, ADR-0025, ADR-0027 (quién puede llamar a la API), ADR-0028 (plataforma) y ADR-0032 (restauración).
