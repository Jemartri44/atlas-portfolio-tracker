# Qué hacer con cada correo de Atlas

> Borrador de la feature 016 (E4). La dirección lo pasará a `docs/runbooks/` al cerrar la feature.

**Cuándo usarlo.** Cuando llega un correo de Atlas que no es el recordatorio mensual. Cada aviso llega **una vez por racha**: si la causa sigue ahí, no vuelve a llegar al día siguiente; si desaparece y reaparece, llega otra vez. Los avisos periódicos (revisión semanal, Renta, modelos 720 y 721) llegan **como mucho una vez** en su periodo, y solo cuando hay algo que hacer.

**Lo que un correo nunca trae**, salvo que actives los importes (procedimiento `mail-recipient-and-amounts.md`): euros, cantidades, precios, posiciones, nombres de activos, ISIN, símbolos ni cuentas. **La Renta y los modelos 720 y 721 no llevan ninguna cifra**, estén como estén los importes. Para ver qué hay detrás, abre la aplicación o la consola.

**Dónde mira cada paso.** Los registros de las tareas viven en el bucket de datos, bajo `jobs/<familia>/<tarea>/<periodo>.json`, con el código de lo que pasó y sus recuentos, nunca un importe. Para leerlos hace falta el rol de administración, con credenciales de vida corta y MFA (ADR-0034, fila 16). **Trabaja en una carpeta fuera del repositorio** (por ejemplo `~/personal/atlas/privado/`), nunca en la del libro.

| Asunto del correo | Sección |
|---|---|
| `[Atlas] Recordatorio mensual AAAA-MM` | [Recordatorio mensual](#recordatorio-mensual) |
| `[Atlas] Aviso: fuente de precios …` | [Una fuente de precios falla](#una-fuente-de-precios-falla) |
| `[Atlas] Aviso: correspondencias sin contrastar en …` | [Correspondencias sin contrastar](#correspondencias-sin-contrastar) |
| `[Atlas] Aviso: tesis del cubo` | [Tesis del cubo](#tesis-del-cubo) |
| `[Atlas] Aviso: ficheros de precios ilegibles` | [Ficheros de precios ilegibles](#ficheros-de-precios-ilegibles) |
| `[Atlas] Aviso: historico del BCE …`, `calendario del BCE` | [Histórico del BCE](#histórico-del-bce) |
| `[Atlas] Aviso: tarea …`, `registro de …` | [Una tarea falla o su registro no se lee](#una-tarea-falla-o-su-registro-no-se-lee) |
| `[Atlas] Aviso: volcado AAAA-MM` | [El volcado mensual](#el-volcado-mensual) |
| `[Atlas] Aviso: integridad AAAA-Qn` | [La integridad trimestral](#la-integridad-trimestral) |
| `[Atlas] Revision semanal …`, `Revision mensual …` | [Revisión semanal](#revisión-semanal) |
| `[Atlas] Renta AAAA lista`, `[Atlas] Renta AAAA` | [La Renta de enero](#la-renta-de-enero) |
| `[Atlas] Modelos 720 y 721 de AAAA` | [Los modelos 720 y 721](#los-modelos-720-y-721) |

## Recordatorio mensual

Llega siempre, una vez al mes. Si llega dos veces con el mismo mes en el asunto, es un reintento (el recordatorio se envía **al menos una vez**): ignora el segundo.

- **La aportación del mes**: el reparto por clase. Si dice que no se pudo calcular, el código dice por qué (por ejemplo `missing_manual_prices`): abre la aplicación.
- **El último inicio de sesión**: si avisa del cliente OAuth, inicia sesión en la web o con `atlas remote login` antes de la fecha que dice. Google borra un cliente sin uso a los seis meses (ADR-0027).
- **Los tokens de la consola**: si no reconoces una emisión, sigue `docs/runbooks/stolen-google-account.md`.
- **La copia fuera de AWS**: haz la copia a tu disco con la orden del correo.

## Una fuente de precios falla

`source_failing`: la fuente lleva los fallos seguidos que dice el correo, contados solo por `unavailable`, `rate_limited`, `blocked` e `invalid_response` (ADR-0031, tercera enmienda). Mientras tanto, los precios conservan su último valor con su antigüedad.

1. Si es un día aislado, espera: el correo no vuelve mientras dure la racha, y la siguiente ejecución lo intenta otra vez.
2. Si pasa de unos días, comprueba en la web de la fuente si ha cambiado sus condiciones o si la clave sigue valiendo. Para cambiar la clave, sigue `docs/runbooks/price-api-keys.md`.

## Correspondencias sin contrastar

`currency_unchecked`: la nube no descarga una correspondencia que nadie contrastó (la nube nunca contrasta, Q1). Contrástala en la consola y súbela: procedimiento `cloud-symbols-and-budgets.md`.

## Tesis del cubo

`thesis_horizon_exceeded`: una o más tesis del cubo pasaron su horizonte previsto. El correo no dice cuáles. Ábrelas en la aplicación (Cubo) y decide si la cierras o si amplías el horizonte. La condición de invalidación es texto libre y no avisa sola (§8.2 B1).

## Ficheros de precios ilegibles

`prices_file_unreadable`: hay ficheros de cierres de la nube que no se leen, y la nube no los toca. Esos activos se quedan sin precio automático. Mira cuáles en la consola, con `atlas prices status`, en una carpeta sincronizada.

## Histórico del BCE

`ecb_update_rejected`, `ecb_calendar_mismatch`, `ecb_history_damaged`, `ecb_history_rebuilt` y `ecb_rebuilt_unverified`: sigue `ecb-history-in-the-cloud.md`, que dice qué hacer con cada uno. Un calendario que no cuadra es un aviso, no un bloqueo.

## Una tarea falla o su registro no se lee

- **`task_failed`**: la tarea se cerró como fallida en el periodo que dice el correo, con su código (por ejemplo `ledger_absent`, que significa que no hay libro en el bucket). Se vuelve a intentar sola en su próxima ejecución. Si el aviso vuelve tras cerrarse la racha, lee su registro (`jobs/<familia>/<tarea>/<periodo>.json`).
- **`record_unreadable`**: el registro de una tarea no se lee, y la tarea **no lo toma por libre**. Bájalo, míralo y, si está roto, **no lo borres a mano sin entender por qué**: guarda la versión rota (el bucket está versionado) y avisa a la dirección.

## El volcado mensual

El volcado vive en `backups/AAAA-MM/`, **para siempre**: el libro, `positions.json`, el histórico del BCE en vigor con su manifiesto y `prices/`. Nadie lo sobrescribe: la tarea escribe cada objeto con `If-None-Match: *`, y la política del bucket niega cualquier escritura en `backups/*` sin esa condición.

**Comprobar un volcado contra su registro.** El registro del mes (`jobs/backup/monthly_backup/AAAA-MM.json`) guarda el SHA-256 de cada objeto que escribió o que encontró. Cambia `PERIODO` por el mes del correo y `<bucket-de-datos>` por el nombre del bucket. Cada objeto sale como `bien` o como `MAL`:

<!-- ensayo: comprobar-volcado -->
```sh
PERIODO='2026-10'
BUCKET='<bucket-de-datos>'
AWS_PROFILE=atlas-prod-admin aws s3api get-object --bucket "$BUCKET" --key "jobs/backup/monthly_backup/$PERIODO.json" registro.json > /dev/null
jq -r '.objects[] | [.key, .sha256] | @tsv' registro.json | while IFS="$(printf '\t')" read -r clave huella; do
  AWS_PROFILE=atlas-prod-admin aws s3api get-object --bucket "$BUCKET" --key "$clave" objeto.tmp > /dev/null
  real=$(sha256sum objeto.tmp | cut -d ' ' -f 1)
  if [ "$real" = "$huella" ]; then printf 'bien %s\n' "$clave"; else printf 'MAL %s\n' "$clave"; fi
done
rm -f objeto.tmp registro.json
```

- **`backup_object_differs`**: la tarea encontró en el volcado un objeto con otros bytes que no dejó ella, y no escribió nada más. Solo la función del volcado escribe `backups/`, así que **alguien más escribió ahí**. Trátalo como un incidente de seguridad: mira quién lo escribió en el historial de eventos de CloudTrail (90 días) y las versiones del objeto (`aws s3api list-object-versions --prefix backups/AAAA-MM/`). **No lo borres**: ningún rol de Atlas puede, y es la prueba. El volcado de ese mes queda incompleto; el del mes siguiente se hace con normalidad.
- **`backup_ecb_inconsistent`**: el volcado no guardó el manifiesto del BCE porque el fichero que ya tenía, de un intento anterior del mes, es de otra generación que la del manifiesto en vigor. El resto del volcado está completo. El histórico del BCE se puede volver a bajar del BCE cuando haga falta, así que no hay nada que recuperar.
- **`backup_positions_missing`**: el libro del volcado no se proyecta sin errores, así que el volcado no lleva `positions.json`. El libro, los precios y el BCE sí están. Mira el libro con `atlas check --deep` en la consola y rectifica lo que diga. Es el mismo libro que dice el correo de integridad.
- **`task_failed` del volcado** con el código `ledger_absent`: no hay libro en el bucket. En `prod` no debería pasar nunca: mira `ledger/ledger.jsonl` y sus versiones.

## La integridad trimestral

La tarea recalcula el libro desde cero con las comprobaciones de `atlas check --deep`, ensaya la restauración con el último volcado **en memoria**, sin escribir nada, y mide el tamaño del libro.

- **`integrity_errors`**: `atlas check --deep` encuentra errores en el libro vivo. El correo dice los códigos y cuántos hay. Ejecútalo en la consola sobre una carpeta sincronizada: dice qué eventos son. **Un error de registro se rectifica, no se restaura** (ADR-0032): una anulación (`reversal`) y el evento corregido.
- **`restore_rehearsal_differs`**: el último volcado **no reproduce** el libro vivo cortado en los mismos eventos. Los códigos dicen qué difiere:
  - `event_missing_in_live`, `event_differs` u `order_differs`: el volcado tiene eventos que el libro vivo no tiene, o con otro contenido, o en otro orden. El libro es de solo añadir, así que algo lo reescribió después del volcado, por ejemplo un `atlas admin compact` o una restauración.
  - `positions_differ`, `cash_differ`, `lots_differ`, `gains_differ` o `income_differ`: con los mismos eventos, las proyecciones no coinciden.
  - `dump_missing`: no hay ningún volcado cerrado con su libro.
  - `dump_unreadable`: el libro del volcado no es el que guardó su registro, o no se lee.
  - `dump_invalid`: el libro del volcado no se proyecta.

  **No restaures desde ese volcado sin mirarlo antes.** `atlas admin restore --from backups/AAAA-MM --env prod` enseña la comparación evento a evento antes de pedir que teclees el entorno. Si la ves y no escribes el entorno, no se toca nada. Después, avisa a la dirección.
- **`ledger_size_above_threshold`**: el libro ocupa más que el umbral de la función (`ATLAS_LEDGER_SIZE_WARNING_BYTES`, 1 MB por defecto). El correo dice el tamaño y el umbral. No es un error: es el momento de revisar el plazo de expiración de las versiones no vigentes del bucket (ADR-0006, ADR-0028, «Revisión del plazo de las versiones»). Es una decisión de la dirección.

## Revisión semanal

Llega solo si se pasa algún umbral de `Ajustes`: la desviación de un activo del núcleo sobre `deviation_threshold_pp`, o las reglas 17 y 18 del cubo. Dice la clase del activo y los puntos, nunca el activo. Ábrelo en la aplicación (Resumen o Cubo) y corrígelo con la aportación del mes o como diga el plan. Lo que dice «Sin medir» es una regla que no se pudo medir, por ejemplo por falta de precios: no es un aviso por sí solo.

## La Renta de enero

Llega en enero, como mucho una vez: los datos de la Renta del ejercicio anterior están listos, con cuántas notas y cuántos criterios en disputa lleva. **Nunca lleva la base ni ninguna cifra.** Ábrelos en la aplicación (Fiscal) o con `atlas tax AAAA`, y revisa las notas y los criterios antes de presentar. Si dice que no se pudieron preparar, el código dice por qué.

## Los modelos 720 y 721

Llega en enero, solo si hay algo que hacer con el 720 o el 721 del año que acaba. Esa decisión la toman las mismas funciones que los modelos, **con valoraciones manuales y nunca con precios automáticos**. El texto es neutro a propósito: no dice ninguna cifra ni si se pasa un umbral. Abre la aplicación (Fiscal, modelos informativos) y revisa las valoraciones a 31 de diciembre de las cuentas en el extranjero. Se presenta de enero a marzo.

---

**Lo que se ha probado y lo que no.**
- **El bloque «Comprobar un volcado contra su registro»** se ejecuta tal cual, con `dash` y un `aws` simulado, en `tests/runbook-016.test.ts`: dice `bien` de cada objeto del volcado y `MAL` del que se ha cambiado.
- **Lo demás**, porque necesita AWS real, se prueba en la 018, en `dev`:
  - el historial de CloudTrail;
  - las versiones del bucket;
  - la política de `backups/*`;
  - los permisos del rol de administración sobre `jobs/*` y `backups/*`.
