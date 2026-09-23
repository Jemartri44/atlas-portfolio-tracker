# ADR-0025 — La salida de `compact` ante una huella no verificable queda registrada en el libro

**Estado:** Aceptada (2026-09-23), por decisión de la dirección, que añade la condición de atomicidad de la sección «La renuncia y la compactación son todo o nada». Nace de la pendiente 3 de `docs/pendientes-post-010.md` y del bloque 8 del prompt 011, cuyas decisiones (a), (b) y (d) fija la dirección.

## Contexto

**Compactar es la única vía de migrar el libro a una versión de esquema nueva** (`docs/data-schema.md` §5, ADR-0006): `compact` reescribe todas las líneas a la versión actual y archiva el original. Nada más lo hace — el cargador migra **en memoria** y el fichero nunca se reescribe por una migración.

Desde la feature 010, `compactLedger` verifica la huella de cada presentación **antes** de reescribir y se niega con `CompactRejectedError` si alguna falla, por cualquiera de los tres motivos que `FingerprintCheck` distingue (`lines`, `digest`, `unreadable`). La razón es buena: resellar una huella que no cuadra convertiría un registro roto en uno de fiar.

**La consecuencia no lo es.** Un libro con una huella rota —o simplemente ilegible en la versión que la huella declara, que ni siquiera es una edición— **no se puede volver a compactar nunca**, así que queda **congelado en su versión de esquema para siempre**. No hay salida ni en el dominio (`CompactPlan` no tiene campo) ni en la CLI (`atlas compact` solo acepta los flags globales) ni procedimiento escrito en ningún documento. El único rodeo que le queda al usuario es **editar el `.jsonl` a mano**, que es exactamente lo que la huella existe para detectar.

Pesan tres restricciones. El libro es **append-only** (ADR-0003): nada se edita ni se borra, así que no se puede añadir un campo a una presentación ya escrita. **Lo declarado es un hecho** con consecuencias legales (ADR-0020): no se corrige ni se reescribe. Y **después de compactar, `resealFilings` vuelve a sellar cada presentación sobre el prefijo reescrito**, de modo que el fichero ya no diría por ninguna otra vía que aquella huella nunca llegó a comprobarse.

## Opciones consideradas

1. **Dejarlo como está.** *Ventaja:* cero trabajo, y la huella conserva su garantía entera. *Inconveniente:* es un fallo de supervivencia a veinte años —peor que cualquier cosa de la que la huella protege, porque la huella detecta una edición a mano y esto impide **leer el libro** dentro de diez años— y empuja al usuario justo hacia la edición manual.
2. **Un `--force` que compacte sin verificar nada.** *Ventaja:* una línea. *Inconveniente:* renuncia a la verificación de **todas** las presentaciones para arreglar **una**, y no deja rastro: después de resellar, el fichero parece intacto.
3. **Una salida explícita y por presentación, sin registrar nada.** *Ventaja:* acotada. *Inconveniente:* el hecho vive en la memoria de quien lo hizo. Dentro de diez años, el libro afirma una huella que nadie comprobó y nada lo dice.
4. **Una salida explícita, por presentación y registrada en el propio libro** (elegida).

## Decisión

**El rechazo sigue siendo lo que pasa por defecto.** Nadie compacta un libro con una huella rota sin enterarse.

**La salida hay que pedirla a propósito y es por presentación**: el usuario acepta que la huella de **esa** presentación no se pueda verificar y sigue protegido en las demás. No es un `--force` que lo arrasa todo. En la consola es una opción con valor y repetible, `atlas compact --accept-unverified <filing_id>`.

**El hecho queda registrado en el libro**, con un tipo de evento nuevo, **`filing_fingerprint_waived`**, escrito **dentro del mismo `compact` y antes de reescribir**, de modo que entra en el libro compactado y `resealFilings` lo sella con lo demás. Lleva cuatro cosas, y las cuatro porque **después de resellar es la única traza que queda en el fichero**:

| Campo | Por qué |
|---|---|
| `filing_id` | Qué presentación. Una renuncia no autoriza a las demás |
| `reason` (`digest` \| `unreadable`) | **Nunca juntas en un «no verificable» genérico**: una significa que las cifras no cuadran y la otra que no se pueden leer, y no llevan a la misma acción |
| `declared_schema_version`, `declared_lines` | Lo que la huella declaraba en ese momento. Después de compactar, el libro ya no los tiene en ninguna parte |
| `recorded_at` (del sobre) | **Cuándo lo dio por bueno el usuario**: es la mitad de la frase que `check` tiene que seguir diciendo para siempre |

Más `notes?`. Es un **documento administrativo**, como una presentación: no tiene fecha de negocio y no lo corta `asOf` (ADR-0016, `data-schema.md` §7.1).

**No toca lo presentado.** Dice algo **sobre** la presentación; no la corrige ni la reescribe (ADR-0020).

**`schema_version` sigue en 1.** ADR-0018 clasifica «añadir un tipo de evento» como cambio **compatible**, con dos precedentes que dejaron la versión en 1: `swap` (ADR-0021) y `tax_return_filed` (ADR-0020). Un cliente antiguo que se encuentre la línea la rechazará por tipo desconocido, que es exactamente lo que le pasa hoy con `swap`.

**La renuncia y la compactación son todo o nada** (condición de la dirección). Una renuncia escrita sin que la compactación llegue a completarse sería **una línea que afirma un hecho que no ocurrió**: una huella dada por buena que nunca llegó a saltarse. Y en un libro de solo añadir esa línea no se puede borrar después — la única forma de «retirarla» sería una anulación que habla de algo que nunca pasó.

Se garantiza por **dónde se escribe**: la renuncia entra en la **misma lista de eventos** que `compactLedger` entrega a `LedgerStore.replace`, no en una escritura propia anterior. `replace` es la única operación que reescribe el libro y archiva el original **antes** de reemplazarlo; o sustituye el fichero entero —con la renuncia dentro— o no sustituye nada. Cualquier fallo posterior a construir la lista y anterior al reemplazo —un etag que ha cambiado, la proyección que difiere, un archivo que ya existe, la red— **deja el libro exactamente como estaba, sin renuncia**. Nada escribe la renuncia por separado, y ese es el invariante: **no hay ningún camino que escriba la renuncia y no reescriba el libro.**

Queda probado con un test que **interrumpe la compactación después del punto en que la renuncia se escribiría** y comprueba que el libro no la tiene.

**Una salida explícita registra el hecho, no lo borra.** `check` y `check --deep` lo siguen diciendo **siempre**, sin caducar y sin esconderse, con las palabras del caso —no verificable, y lo diste por bueno tú el tal día—, ni como acusación de haber editado a mano ni como certificado de que todo está bien. Si el aviso desapareciera, la salida se convertiría en una forma de limpiar el expediente, y entonces no sería una salida: sería un borrado.

**Y la comparación de lo declarado lo advierte.** `filingComparison` reparte la diferencia entre lo declarado y lo calculado en cuatro causas, y una de ellas —«el motor calcula distinto que entonces»— solo se sostiene si se puede afirmar que **lo demás es igual**, es decir, si el prefijo está verificado. Cuando no lo esté, la comparación no atribuye con seguridad a esa causa y lo dice como **nota del informe con su código**, no como frase que cada interfaz decida poner (ADR-0024).

## Consecuencias

- El catálogo sube a **26 tipos de evento**; `docs/data-schema.md` §3 y §6 lo recogen, y §5 deja de decir que «hoy no hay salida».
- Un libro deja de poder quedarse congelado en su versión de esquema, que es el punto entero.
- Se vuelve más difícil, **a propósito**: compactar con una huella rota exige nombrar la presentación y deja rastro permanente. Nadie lo hace por inercia.
- Lo que **no** cambia: la huella conserva su significado, resellar sigue siendo lo que hace `compact`, y lo presentado sigue siendo intocable.
- **Aceptado a sabiendas:** el aviso de `check` no caduca nunca, así que un libro con una renuncia lo dirá durante veinte años. Es lo que se quiere: el hecho no prescribe.
- **La renuncia no existe sin la compactación que la motiva**, y eso acota lo que puede salir mal: un intento fallido no deja rastro, y un rastro implica que el libro se reescribió.
- Relacionadas: ADR-0003 (append-only), ADR-0006 (`compact`), ADR-0018 (qué cambio de esquema es compatible), ADR-0020 (lo declarado es un hecho) y ADR-0024 (la salvedad la emite el motor).
