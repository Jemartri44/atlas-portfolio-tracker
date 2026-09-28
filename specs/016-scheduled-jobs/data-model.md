# Modelo de datos: `016-scheduled-jobs` (**PROPUESTA**, §7.2 (d) y (f))

Nada de esto va en el libro: **el esquema del libro no cambia**. Todos los objetos son JSON en una línea terminada en `\n`, leídos con UTF-8 estricto, rechazando claves repetidas y claves desconocidas; un objeto de un formato más nuevo se dice (`*_newer_format`) y no se reescribe. Los instantes, en UTC con `Z`; las fechas y los periodos, de `Europe/Madrid`.

## 1. El registro de ejecución: `jobs/<familia>/<tarea>/<periodo>.json`

Un objeto por tarea y periodo; lo escribe **solo** la función de su familia (`ecb`, `prices`, `mail`, `backup`, `integrity`).

```json
{"run_format":1,"task":"prices_update","period":"2026-10-03","state":"done","claimed_at":"2026-10-03T05:00:01Z","attempts":1,"closed_at":"2026-10-03T05:00:40Z","outcome":{"code":"prices_updated","counts":{"updated":7,"up_to_date":3,"failed":1,"calls_eodhd":9}},"frequencies":{"ignored":[{"key":"reconciliation","code":"job_not_available"}]},"findings":[{"code":"source_failing","subject":"alpha_vantage","counts":{"consecutive_failures":3,"threshold":3},"dates":["2026-10-03"]}]}
```

| Campo | Regla |
|---|---|
| `run_format` | `1` |
| `task`, `period` | los de la clave; si no cuadran, ilegible (`job_record_unreadable`) |
| `state` | `claimed` → (`sending` → `send_failed` \| cerrado) → `done` \| `failed` \| `send_unknown` (plan §5.3); y `expired`: el periodo pasado de un aviso que quedó abierto se cierra así, **sin enviar** (ronda 1 de la PR #109, avisos B1 y N4) |
| `claimed_at`, `closed_at?` | instantes |
| `attempts` | entero ≥ 1; cada reclamación de un registro no cerrado lo sube |
| `outcome?` | `{ code, counts? }`; `counts`, enteros con nombres del catálogo de códigos |
| `frequencies?` | lo que la lectura tolerante ignoró, por código (R9) |
| `findings?` | `{ code, subject, counts?, dates? }` (plan §5.4). **`subject` nunca es un `asset_id`, un símbolo, un ISIN, una cuenta ni un importe**: una fuente, un `thesis_id`, `ecb`, `backup`, `integrity` |
| `objects?` | solo el volcado (`monthly_backup`), **también en un intento que falla y en la reclamación del siguiente**, que lo hereda (ronda 1 de la PR #109, copias N3): un reintento solo guarda como suyo (`kept_from_earlier_attempt`) un objeto con los bytes que esta lista dice; cualquier otro es `backup_object_differs`. Formato: `[{ key, sha256, kept_from_earlier_attempt? }]`, con cada `key` bajo `backups/<su periodo>/` y sin `..`, el SHA-256 en hexadecimal y `kept_from_earlier_attempt` solo como `true`. Otra tarea con `objects`, ilegible |

- Un registro ilegible **no** cuenta como libre: la tarea se niega (`job_record_unreadable`, con un `ERROR`). **Salvo el recordatorio mensual**, que lo reclama con `If-Match` sobre su ETag y envía, para no perder el mes; uno de un formato más nuevo no se toca nunca. El de un productor lo avisa el correo como `record_unreadable`, con la tarea como `subject` (revisión de la PR #104, N4).
- Un registro `claimed` o `sending` reclamado hace menos que `ATLAS_JOB_MAX_RUN_SECONDS` es de una ejecución que puede seguir en marcha: nadie lo retoma (`job_in_progress`, N3).
- **Los `findings` de un registro nunca traen `task_failed` ni `record_unreadable`**: los fabrica la función de correo, y de un productor solo se envían sus códigos con sus asuntos, de listas cerradas (revisión de la PR #104, privacidad B1).
- Los registros **no se borran** (ningún rol tiene `DeleteObject`): unos cientos al año, bytes.

## 2. La racha de un aviso: `jobs/mail/notices/<code>--<subject>.json`

```json
{"notice_format":1,"code":"source_failing","subject":"alpha_vantage","streak_since":"2026-10-03","state":"sent","claimed_at":"2026-10-04T06:00:02Z","sent_at":"2026-10-04T06:00:03Z"}
```

`state`: `open` (condición presente, sin avisar) → `sending` → `sent` \| `send_failed` \| `send_unknown`; `closed` cuando la condición desaparece del último registro cerrado. Si vuelve, se reescribe con otro `streak_since` y `open`. `<code>` y `<subject>`: `[a-z0-9_]{1,64}` y `[A-Za-z0-9_-]{1,64}`; cualquier otra cosa no forma una clave (sin recorrido de rutas).

## 3. El último inicio de sesión web: `access/last-web-sign-in.json` (Q3; §8.1 P6)

```json
{"web_sign_in_format":1,"last_web_sign_in":"2026-10-03"}
```

**Exactamente** esas dos claves. Lo escribe la API al terminar un inicio de sesión web, **solo si la fecha nueva es posterior** (`If-Match` sobre lo leído; `If-None-Match: *` si no existía); un `precondition_failed` o un fallo transitorio se registran con su código y no hacen fallar el inicio de sesión. Lo lee el correo.

## 4. `positions.json` del volcado (E4; legible sin la aplicación)

Construido por `positionsDocument` (`packages/domain/src/jobs/positions.ts`) a partir del `ledger.jsonl` **del mismo volcado**:

```json
{
  "positions_format": 1,
  "as_of": "2026-10-01",
  "generated_at": "2026-10-01T01:15:04.000Z",
  "ledger": { "sha256": "…", "lines": 812 },
  "note": "Informativo. Valores con el último precio conocido; nunca una cifra fiscal.",
  "core": [
    { "account_id": "…", "asset_id": "…", "isin": "…", "name": "…", "asset_class": "equity",
      "quantity": "12.5", "cost_eur": "1500.00", "value_eur": "1650.40",
      "price": { "date": "2026-09-30", "source": "eodhd", "approximation": false } }
  ],
  "bucket": [
    { "account_id": "…", "asset_id": "…", "name": "…", "quantity": "3", "cost_eur": "300.00",
      "value_eur": null, "price": { "source": "none" } }
  ],
  "cash": [ { "account_id": "…", "book": "core", "currency": "EUR", "amount": "120.00", "value_eur": "120.00" } ],
  "totals": {
    "core": { "eur": "…", "partial": false },
    "bucket": { "eur": "…", "partial": true },
    "cash": { "eur": "…", "partial": false }
  },
  "warnings": ["partial_net_worth"]
}
```

- **Importes como cadenas decimales redondeadas a céntimos**, como las enseña una pantalla (ADR-0005). **La cantidad va exacta**, como la tiene el libro.
- **Sin precio**, la posición lleva `value_eur: null` y `price: {"source": "none"}`, nunca un cero.
  - Un bloque con alguna posición sin valor en euros lleva `partial: true`.
  - Una posición sin lotes abiertos detrás (la forma de `lots_mismatch`) lleva `cost_eur: null`.
- **El precio dice de dónde sale**: `manual`, o la fuente del cierre de la nube (`eodhd`, `alpha_vantage`). Una aproximación por el ETF de referencia lleva `approximation: true`.
- `isin` solo aparece si el activo lo tiene.
- **Núcleo y cubo van separados**, y los totales desglosados, cada uno con su `partial`: **no hay total de los dos** (constitución III).
- `warnings` lleva **los códigos** de los avisos de la proyección, una vez cada uno y ordenados. Nunca su texto, que lleva importes e identificadores.
- `ledger.sha256` y `ledger.lines` son los del `ledger.jsonl` del mismo volcado: dicen de qué libro sale.
- Sangría de dos espacios y un salto de línea final: el volcado se lee a mano.
- **Cambios respecto de la propuesta de E1**, dichos en questions §20.2:
  - los totales llevan `partial`;
  - `price.source` es `manual` o la fuente (antes decía `close`);
  - el efectivo lleva `value_eur`.

## 5. Lo que ya existe y cambia de dueño en la nube

| Objeto | En local lo escribe | En la nube lo escribe |
|---|---|---|
| `reference/ecb/*` | `atlas fx update` | la función del BCE (nunca la consola: §8.1 P16) |
| `prices/<activo>.jsonl`, `prices/_status.json` | `atlas prices update` | la función de precios |
| `prices/symbols.json` | `atlas prices symbols set/remove`, `purge` | **solo** `atlas admin prices push` (§8.1 P18) |
| `prices/config.json` | el usuario | **no existe** en la nube (§8.2 M5) |
| `backups/<YYYY-MM>/*` | — | la función del volcado |
| `jobs/<familia>/*` | — | la función de esa familia |
| `access/last-web-sign-in.json` | — | la API |
