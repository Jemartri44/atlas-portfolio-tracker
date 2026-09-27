# Investigación: `016-scheduled-jobs`

La verificación con fuente (bloque 0 de E1) está en [`questions.md`](questions.md) §1, con citas literales y fecha. Aquí, solo las decisiones de diseño que salen de ella y del código (`questions.md` §3).

| Decisión | Motivo | Alternativas descartadas |
|---|---|---|
| Suponer **más de una** ejecución por periodo y defenderse con el registro de ejecución condicional | Lambda reintenta dos veces un error, reencola una limitación hasta seis horas y puede entregar el mismo evento dos veces; Scheduler reintenta la invocación (questions §1.4) | Confiar en «una vez» de la plataforma: la documentación dice lo contrario |
| El manejador **no lanza** por un fallo previsto: cierra el registro como `failed` | Así el reintento automático de Lambda (que se propone a 0) solo cubre lo imprevisto, y el reintento lo decide el dominio al día siguiente | Dejar que Lambda reintente: repetiría envíos y reservas sin saber en qué paso se cortó |
| Programaciones fuera de 02:00-03:00 de Madrid, `FlexibleTimeWindow = OFF` | Scheduler se salta una hora que no existe en marzo (questions §1.4) | — |
| El periodo sale del reloj inyectado, no del evento (Q6) | Programaciones lejos de medianoche y edad máxima de una hora: un reintento no cruza de día | `<aws.scheduler.scheduled-time>` en el evento |
| `ses:SendEmail` con `ses:FromAddress`, `ForAllValues:StringEquals ses:Recipients`, `Null ses:Recipients = false` y `ses:ApiVersion = 2` | Verificado para la v2 (questions §1.1); la condición `Null` cierra la trampa de `ForAllValues` | Confiar en el *sandbox* (ADR-0034, fila 12) |
| Asunto en ASCII, cuerpo en UTF-8 (Q5) | SES exige RFC 2047 en el asunto, y no está verificado que lo haga solo (questions §1.5) | Codificar RFC 2047 a mano |
| `PriceStore` de S3 con `config()` construido de las variables de la función | `updatePrices` lee la configuración del almacén (`cascade.ts:188`); así el caso de uso no cambia para eso (§8.2 M5) | Un `prices/config.json` en el bucket (descartado por la dirección) |
| Opción `symbols: "read_only"` de `updatePrices` (Q1) | La cascada escribe `symbols.json` al contrastar y al limpiar los días de una purga (`cascade.ts:170`, `:258`) | Descartar las escrituras en silencio en el almacén |
| ECB en S3: previous → fichero → manifiesto, y deshacer desde `previous/` | El nombre en vigor es fijo por fuente (ADR-0029), S3 no tiene `rename`, y el lector detecta el desacuerdo por el SHA-256 (plan §7.1) | Un diario de intención: un objeto más y un estado más que probar |
| Un solo artefacto con un módulo común de construcción para `lambda.zip` y `jobs.zip` (**PROPUESTA P-H**) | `build-lambda.mjs` tiene la entrada fijada a `apps/api`; duplicarlo son 140 líneas que divergirían | Duplicar el guion en `apps/jobs/scripts/` |
| El `Notifier` de fichero, en `packages/adapters/test/` como `test-only-` | Lo cubre el guardián de los dobles que ya existe (015, G-double) sin excepción nueva | En `src/` con una excepción: §8.2 m3 solo admite una, la fuente simulada |
