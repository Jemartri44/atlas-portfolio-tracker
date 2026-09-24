# Especificación de la feature: Precios de cierre diarios, desde la consola (`013-daily-close-prices`)

**Rama**: `feature/013-daily-close-prices`, creada desde `origin/develop` (`6a8ac2d`)

**Creada**: 2026-09-24 (Europe/Madrid)

**Estado**: **borrador, en el alto del plan.** Pendiente del visto bueno de la dirección y de las respuestas de `questions.md` (§1, el bloque 0, y §3, las preguntas). No hay código de producción escrito.

**Entrada**: `docs/prompts/013-daily-close-prices.md` entero (§0–§6.5); ADR-0031 con su enmienda y su segunda enmienda (manda sobre el prompt si discrepan); ADR-0019 (enmienda del 2026-09-24), ADR-0026 Parte B (enmendada), ADR-0029 (tres enmiendas), ADR-0018 (enmienda); ADR-0005, ADR-0007, ADR-0013, ADR-0016, ADR-0017, ADR-0028; ADR-0027 y ADR-0032 solo para el borde del encargo; `docs/data-schema.md` §1, §5, §7; `docs/specification.md` §7, §9.5, §11.8; constitución 1.6.0.

**Preguntas y verificaciones**: [`questions.md`](questions.md).

---

## Resumen

Los precios de cierre diarios de los activos del libro, **descargados por la consola en local** desde tres APIs gratuitas con clave (EODHD como principal, Alpha Vantage como respaldo, CoinGecko para cripto), **guardados junto al libro en `prices/`** —nunca en el libro— y **leídos por la puerta única de precios** en las vistas de la consola y de la web de escritorio. Son **informativos**: ninguna cifra fiscal los lee, y lo primero que se construye es la prueba de que no pueden llegar a leerlos.

Cinco reglas atraviesan la feature (§0 del encargo):

1. **Ningún cálculo fiscal lee un precio automático.** El Modelo 720 lee solo la valoración manual del libro, por una función propia en un fichero hoja; `tax/` no alcanza nada de precios; las cotizaciones nunca entran en el estado del libro ni en `Settings`. Los guardianes se extienden **antes** de crear un solo módulo de precios, por alcance en el grafo de importaciones y no por nombres.
2. **La web no descarga y no escribe.** Quien descarga es la consola; la web de escritorio lee `prices/` de la carpeta enlazada o de una importación a mano; **en el móvil no hay precios automáticos hasta que exista la nube** (features 014-016), solo la importación a mano.
3. **Los activos que se descargan salen del libro de la consola.** Un activo dado de alta solo en la web no tiene precio automático hasta la sincronización, o hasta pasarlo al libro de la consola exportando e importando.
4. **La cascada degrada, nunca inventa**: principal → respaldo → último valor conocido con su antigüedad → entrada manual. Nunca se interpola, nunca se convierte con un tipo del BCE que no existe, y **un valor de CoinGecko sin renovar en 24 horas deja de enseñarse**. Con cero fuentes automáticas todo sigue funcionando.
5. **Las claves son secretos del usuario**: viven fuera de la carpeta del libro (`~/.config/atlas/secrets.json`), la web no las lee nunca, y ninguna aparece en un mensaje, un fichero escrito o un registro.

## Escenarios de usuario y pruebas

### Historia 1 — Que un precio automático no pueda llegar a la fiscalidad (Prioridad: P1)

El usuario sabe que su Renta y su Modelo 720 salen igual con precios automáticos o sin ellos, y que nadie puede cambiarlo sin que un test se ponga rojo.

**Por qué esta prioridad**: un precio de mercado en una declaración es el error que no se ve hasta una inspección (trampa 5, constitución II).

**Prueba independiente**: la salida de `tax`, `gains`, `income`, `m720`, `m721` y `filed`, y los ficheros dorados, byte a byte con y sin `prices/`, con `prices/` sembrado de cotizaciones **posteriores** a las valoraciones de los activos del 720, dentro del ejercicio.

**Escenarios de aceptación**:

1. **Dado** un libro con valoraciones a 31 de diciembre y cotizaciones automáticas posteriores dentro del ejercicio, **cuando** se calcula el Modelo 720, **entonces** usa la valoración manual; y **cuando** se pide la misma fecha en una vista de presentación, **entonces** gana la cotización más reciente (el test demuestra que las cotizaciones del caso sí ganarían).
2. **Dado** un módulo de precios nuevo cualquiera, **cuando** alguien lo importa desde `tax/`, desde `project-ledger.ts` o desde `informative/`, a cualquier profundidad, **entonces** un test de arquitectura se pone rojo, aunque no se nombre ningún tipo prohibido.
3. **Dado** que alguien añade una clave a `LedgerState` o a `Settings`, **entonces** un test se pone rojo hasta que la lista congelada se actualice a mano.

### Historia 2 — Descargar los cierres del día desde la consola (Prioridad: P1)

El usuario ejecuta la orden de actualizar precios; la consola descarga los cierres de los activos de su libro por orden de prioridad, dentro del cupo gratuito de cada fuente, los guarda junto al libro y dice qué ha hecho.

**Por qué esta prioridad**: es el valor de la feature.

**Prueba independiente**: con adaptadores falsos (sin red, sin claves reales), un libro sintético y un cupo pequeño: qué se pide, en qué orden, qué se guarda y qué se dice.

**Escenarios de aceptación**:

1. **Dado** un libro con posiciones del cubo, un índice de referencia, ETF de referencia y resto del núcleo, y un cupo menor que el número de activos, **cuando** se actualiza, **entonces** se piden en ese orden de prioridad, lo que no cabe conserva su último valor con su antigüedad y la salida dice cuántos se quedaron fuera y cuánto queda de cada cupo.
2. **Dado** que la fuente principal falla con `unavailable` o `not_found`, **entonces** se pide al respaldo; **dado** un `blocked` o `rate_limited`, **entonces** esa fuente no se vuelve a llamar en la ejecución.
3. **Dado** un cierre ya guardado para (activo, fecha, fuente) con el mismo valor numérico, **entonces** no se escribe nada; con un valor distinto, se añade una línea, gana la más reciente y la diferencia se enseña.
4. **Dado** dos ejecuciones a la vez, **entonces** entre las dos no gastan más del cupo configurado.
5. **Dado** que no hay claves configuradas, **entonces** no se llama a nadie y la consola lo dice sin tratarlo como error; todo lo demás funciona igual.
6. **Dado** que una fuente supera el número configurado de fallos seguidos, **entonces** la orden termina con un código distinto y lo dice.

### Historia 3 — Ver el valor de la cartera con precios automáticos (Prioridad: P1)

En la consola y en la web de escritorio, las vistas que enseñan un valor (posiciones, patrimonio, cubo, pesos, costes, aportación) usan el precio más reciente disponible, con su origen, su fuente y su antigüedad.

**Prueba independiente**: un libro con valoraciones manuales y un `prices/` sintético; cada vista, con y sin `prices/`.

**Escenarios de aceptación**:

1. **Dado** una valoración manual y una cotización posterior, **entonces** se enseña la cotización; **con la misma fecha**, la manual.
2. **Dado** una cotización en una divisa cuyo tipo del BCE no se puede resolver para su fecha, **entonces** se enseña en su divisa, se dice que falta el valor en euros y no se suma en ninguna cifra en euros.
3. **Dado** un valor de CoinGecko, **entonces** va acompañado de «Powered by CoinGecko» con su dirección (texto en la consola, enlace en la web); **dado** que lleva más de 24 horas sin renovarse, **entonces** no se enseña ni cuenta, se dice que ha caducado, y si hay una valoración manual más antigua se enseña esa con su antigüedad.
4. **Dado** un fondo sin cierre propio con ETF de referencia y un liquidativo real que lo ancle, **entonces** su valor es una aproximación marcada como tal en todas partes, y la calculadora de la aportación dice que algún peso depende de una aproximación.
5. **Dado** el móvil, **entonces** la web dice que no hay precios automáticos hasta que exista la nube y ofrece la importación a mano.

### Historia 4 — Decir de qué símbolo se descarga cada activo (Prioridad: P2)

Al dar de alta un activo con ISIN, la consola puede proponer su símbolo (OpenFIGI) y el usuario lo confirma o no; la correspondencia se ve, se cambia y se quita con una orden propia. Vive en `prices/symbols.json`, nunca en el libro.

**Escenarios de aceptación**:

1. **Dado** un alta con ISIN y OpenFIGI caído, **entonces** el alta sigue igual.
2. **Dado** una propuesta no confirmada, **entonces** no se guarda nada.
3. **Dado** un activo sin correspondencia, **entonces** no gasta cupo y se dice que no tiene símbolo.
4. **Dado** que la divisa devuelta por la fuente (o sus metadatos) no coincide con la declarada, **entonces** el cierre no se guarda y queda un fallo registrado con su propio literal.

### Historia 5 — El estado de las fuentes (Prioridad: P2)

`atlas prices status` dice, por fuente, los fallos seguidos, el último éxito, el tipo del último fallo y lo gastado hoy; y por activo, la antigüedad de su último cierre.

### Historia 6 — Que ninguna clave se escape (Prioridad: P1)

**Prueba independiente**: una clave centinela en todos los tests; ninguna salida, excepción, mensaje, fichero escrito ni `_status.json` la contiene.

**Escenarios de aceptación**:

1. **Dado** un `secrets.json` mal escrito, **entonces** el mensaje no cita su contenido.
2. **Dado** un fallo de red, **entonces** el mensaje dice la fuente y el tipo de fallo, nunca la URL con su clave.
3. **Dado** que `~/.config/atlas/` está dentro de la carpeta del libro, o al revés, **entonces** la consola se niega y lo dice.
4. **Dado** un `secrets.json` con permisos más abiertos que `600`, **entonces** la consola hace lo que decida la dirección (`questions.md`, propuesta P-S).

### Casos límite

- Un cierre posterior a la fecha pedida nunca se devuelve; entre dos cierres no se fabrica ninguno.
- Dos fuentes con cierre para la misma fecha: gana la primera en el orden configurado; nunca se promedia.
- Una subunidad (`GBX`) nunca se trata como su divisa (`GBP`).
- Un tipo del BCE aún no publicado para la fecha de la cotización: no se convierte con el del día anterior.
- Una línea de precio que no se entiende es un error dicho, nunca un precio a medias.
- La aproximación sin liquidativo real que la ancle, o sin cierre del ETF en la fecha del ancla, no existe: se dice por qué.
- `atlas.config.json` mal escrito: la web dice qué clave no entiende (`invalid_local_config`), no «el navegador no guarda datos».
- `cache/` no entra en `atlas backup` ni en la exportación.
- Una ejecución cortada deja cada fichero como estaba antes o como después.

## Requisitos

### Requisitos funcionales

- **FR-001** Antes de crear ningún módulo de precios, los guardianes de arquitectura consideran «que sabe de precios» todo lo que alcanza `projections/prices.ts` o cualquier fichero de los módulos de precios nuevos, leído del grafo y de la carpeta; y los mutantes del bloque 1 se ven fallar.
- **FR-002** El Modelo 720 lee su precio por una función de solo valoración manual en un fichero hoja; desde `informative/` no se alcanza nada de precios salvo esa hoja; `tax/` no alcanza nada de precios.
- **FR-003** Las claves de `LedgerState` y de `Settings` están congeladas en un test; ningún `import()` dinámico en `packages/domain`.
- **FR-004** Para enseñar un valor gana el dato de fecha más reciente; con la misma fecha, la valoración manual. Solo `priceAt` y `manualPrices` cambian.
- **FR-005** `unit_value_eur` es opcional; ninguna vista suma en euros una cotización sin tipo, y lo dice.
- **FR-006** El puerto `PriceSource` devuelve cierres o uno de seis fallos con tipo, cada uno con su literal; el fallo de divisa tiene un literal propio.
- **FR-007** `prices/<asset_id>.jsonl` solo se añade; identidad (`asset_id`, `date`, `source`) y comparación numérica; nunca se guarda el valor en euros.
- **FR-008** CoinGecko: solo el último valor, en un fichero propio en `cache/` que se sobrescribe; caduca a las 24 horas sin renovar; atribución con texto y enlace.
- **FR-009** Cascada, orden de fuentes y presupuesto configurables en `prices/config.json`; prioridad fija de ADR-0031; el cupo se reserva bajo el cerrojo antes de llamar; ninguna llamada de red con el cerrojo tomado.
- **FR-010** Toda escritura en `prices/` y `cache/` bajo el cerrojo de la carpeta, atómica; lo que decide si un cierre ya está se lee dentro del cerrojo.
- **FR-011** Las claves, en `~/.config/atlas/secrets.json` (o XDG), fuera de la carpeta del libro; la web no lo lee; todas las fugas de §6.4 (e) cerradas.
- **FR-012** Órdenes `atlas prices update`, `atlas prices status` y la de símbolos; la propuesta de OpenFIGI en `atlas asset add`, opcional.
- **FR-013** Las vistas de precios de la consola y de la web enseñan origen, fuente, antigüedad, marca de antiguo, marca de aproximación y atribución; `--json` lleva lo mismo.
- **FR-014** Las vistas fiscales no cambian ni un byte con `prices/` presente.
- **FR-015** La web lee `prices/`, `symbols.json` y la caché de CoinGecko de la carpeta, o de una importación a mano, en carga diferida; no escribe en la carpeta; nada de precios en el arranque.
- **FR-016** Cada código nuevo, traducido en las dos interfaces, con el escáner de mensajes extendido.
- **FR-017** Se arregla el motivo «storage» ante un `atlas.config.json` mal escrito en la web.

### Entidades clave

- **Cierre** (`prices/<asset_id>.jsonl`): `schema_version`, `date`, `close` (cadena decimal), `currency`, `source`, `fetched_at`.
- **Correspondencia de símbolos** (`prices/symbols.json`): por `asset_id`, símbolo por fuente y divisa declarada.
- **Estado de las fuentes** (`prices/_status.json`): por fuente, fallos seguidos, último éxito, tipo del último fallo, lo gastado hoy y el día del proveedor al que corresponde.
- **Configuración de precios** (`prices/config.json`): orden de fuentes, cupo diario por fuente, umbral de fallos seguidos.
- **Secretos** (`~/.config/atlas/secrets.json`): una clave por fuente.
- **Último valor de CoinGecko** (`cache/coingecko.json`, nombre propuesto): por `asset_id`, el último valor con su hora.

## Criterios de éxito

- **SC-001** La salida fiscal es idéntica byte a byte con y sin `prices/`, con cotizaciones que ganarían en una vista.
- **SC-002** Con cero claves, cero red o las tres fuentes caídas, todas las órdenes y vistas de hoy funcionan igual.
- **SC-003** Ninguna salida, fichero ni excepción contiene la clave centinela, en ningún test.
- **SC-004** Dos ejecuciones concurrentes no gastan más del cupo configurado.
- **SC-005** El arranque del paquete web no sube de su techo (73,8 KB gzip).
- **SC-006** Con las claves reales del usuario (bloque 6): cada fuente responde para su activo, la segunda ejecución no gasta cupo en lo que ya está al día y la web enseña lo que la consola descargó.

## Supuestos

- El usuario crea las tres claves; la feature se construye y prueba sin ellas.
- El libro de la consola es el que decide qué se descarga (P5).
- La hora del proveedor que reinicia el cupo diario sale del bloque 0; donde no la publica, se usa la propuesta de `questions.md` §2.
