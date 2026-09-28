# Contrato: el texto de cada correo (§7.2 (e), **aceptado** el 2026-09-27)

Texto plano, español, sin HTML, sin nada remoto ni enlaces de seguimiento; como mucho `ATLAS_ORIGIN` en la última línea («Abre Atlas: <origen>»). **Asunto en ASCII** (Q5) con el identificador del periodo. Cada línea sale de un **código** del dominio, nunca del `message` de un aviso (regla R3).

**Qué nunca aparece** (§8.1 P9): euros, cantidades, precios, saldos, posiciones, nombres de activos, ISIN, símbolos, identificadores de cuenta o de activo. **Qué puede aparecer**: las clases del núcleo (renta variable, renta fija, oro, cripto), porcentajes, puntos, recuentos, fechas, códigos y el nombre de una fuente (EODHD, Alpha Vantage, BCE). **Con el interruptor encendido**, además y **solo** las cifras marcadas «(importes)».

## 1. Recordatorio mensual (`monthly_reminder`, siempre)

Asunto: `[Atlas] Recordatorio mensual 2026-10`

```
Aportación de octubre de 2026
  Renta variable   62,5 %
  Renta fija       25,0 %
  Oro              12,5 %
  Cripto            0,0 %
  Cubo: presupuesto aparte, fuera del reparto.
  (importes) Total 1.000,00 €; núcleo 950,00 €; cubo 50,00 €; por clase: 593,75 € / 237,50 € / 118,75 € / 0,00 €
  [si aplica] Algún peso usa la aproximación por ETF de referencia (weights_use_approximation).
  [si no se pudo] No se ha podido calcular el reparto: missing_manual_prices. Abre la aplicación.

Acceso
  Último inicio de sesión: hace 34 días (web o consola).
  [≥ ATLAS_OAUTH_IDLE_WARNING_DAYS] Aviso: si nadie inicia sesión antes del 2027-03-01, Google puede borrar el cliente OAuth. Inicia sesión en la web o con `atlas remote login`.
  Tokens de consola vivos: 2. Emitidos en septiembre de 2026: 1. [si hay] Registros ilegibles: 1.
  Si no reconoces una emisión, tu cuenta de Google puede estar comprometida: docs/runbooks/stolen-google-account.md.

Copia fuera de AWS
  Haz la copia a tu disco: atlas backup --to <dir> --from-bucket --env prod

Abre Atlas: <origen>
```

## 2. Avisos (como mucho una vez; una vez por racha)

| Tarea o hallazgo | Asunto | Cuerpo (sin importes) | (importes) |
|---|---|---|---|
| `source_failing` (E2) | `[Atlas] Aviso: fuente de precios eodhd` (el nombre de la fuente, de la lista cerrada) | «EODHD lleva 3 fallos seguidos (umbral 3), desde el 2026-10-03. Los precios conservan su último valor con su antigüedad.» Solo `unavailable`, `rate_limited`, `blocked` e `invalid_response` cuentan; **una vez por racha** | — |
| `currency_unchecked` (E2, Q1) | `[Atlas] Aviso: correspondencias sin contrastar en eodhd` | «2 correspondencias de EODHD no están contrastadas y la nube no las descarga, desde el 2026-10-01. Contrástalas en la consola y súbelas con «atlas admin prices push».» | — |
| `thesis_horizon_exceeded` (E2) | `[Atlas] Aviso: tesis del cubo` | «1 tesis del cubo han superado su horizonte previsto, desde el 2026-10-01. Revísalas en la aplicación.» Nunca el id ni el nombre de la tesis | — |
| `prices_file_unreadable` (E3, observación de la ronda 3 de la PR #106) | `[Atlas] Aviso: ficheros de precios ilegibles` | «2 ficheros de cierres de la nube no se leen y la nube no los toca, desde el …: esos activos se quedan sin precio automático. Mira cuáles con «atlas prices status» en la consola.» Asunto opaco `prices`, de la lista cerrada; **nunca** el `asset_id` | — |
| `ecb_update_rejected` (E2) | `[Atlas] Aviso: historico del BCE` | «La descarga del histórico del BCE del periodo 2026-10-03 cambiaba 3 tipos ya publicados y no se ha activado, desde el 2026-10-03. Sigue en vigor el histórico anterior; la descarga queda aparte en reference/ecb/rejected/.» | — |
| `ecb_calendar_mismatch` (E2) | `[Atlas] Aviso: calendario del BCE` | «2 días del histórico del BCE no cuadran con el calendario TARGET, desde el 2026-10-03.» Un aviso, no un bloqueo | — |
| `ecb_history_damaged` (E2) | `[Atlas] Aviso: historico del BCE danado` | «El histórico del BCE en vigor no cuadra con su manifiesto y no se ha podido deshacer, desde el …: no se usa. Se reconstruirá entero desde el ZIP oficial del BCE en cuanto se pueda descargar; …» Solo cuando el ZIP no responde (con la API sola no se reconstruye) | — |
| `ecb_history_rebuilt` (E2, revisión de la PR #106, B1 (b)) | `[Atlas] Aviso: historico del BCE reconstruido` | «El histórico del BCE en vigor no cuadraba con su manifiesto y se ha reconstruido entero desde el ZIP oficial del BCE (7100 días), desde el …. Lo que había sigue en las versiones anteriores del bucket, sin usarse.» | — |
| `backup_failed`, `backup_object_differs`, `backup_ecb_inconsistent` | `[Atlas] Aviso: volcado 2026-10` | el código y qué hacer (procedimiento 1) | — |
| `integrity_errors`, `restore_rehearsal_differs` | `[Atlas] Aviso: integridad 2026-Q4` | los códigos y sus recuentos | — |
| `ledger_size_above_threshold` | ídem | «El libro ocupa 1.100.000 bytes (umbral 1.048.576): revisa el plazo de las versiones (ADR-0006).» | — |
| `task_failed` | `[Atlas] Aviso: tarea <tarea>` | «Ha fallado el volcado mensual en el periodo 2026-10 (código task_error), desde el 2026-10-01.» La tarea, de la lista cerrada de productores; el periodo, solo si tiene forma de periodo; el código, solo si es uno de los nuestros, y si no, «desconocido» | — |
| `record_unreadable` | `[Atlas] Aviso: registro de <tarea>` | «El registro de monthly_backup (el volcado mensual) del periodo 2026-10 no se puede leer (código job_record_unreadable), desde el 2026-10-01.» Con las mismas listas cerradas (revisión de la PR #104, N4) | — |
| `weekly_review` | `[Atlas] Revision semanal 2026-W41` | «Renta fija se desvía 6,2 puntos de su objetivo (umbral 5).» «El cubo pesa el 12,3 % del patrimonio (máximo 10 %).» Regla 17 por código. **Los porcentajes y los puntos se quedan**: P9 los permite (decidido en la ronda 2 de la revisión de la PR #104, questions §13) | los euros de la regla 17 (aportación bruta y tope) |
| `tax_return_ready` (siempre en enero) | `[Atlas] Renta 2026 lista` | «Los datos de la Renta de 2026 están listos: 3 notas y 2 criterios en disputa.» | — (**nunca** la base ni ninguna cifra, **tampoco con el interruptor**: Q10, decidido el 2026-09-27; desviación del encargo, §3 E4, anotada en questions §9) |
| `informative_thresholds` | `[Atlas] Modelos 720 y 721 de 2026` | **Neutro** (questions §13): «Revisa si te corresponde presentar el modelo 720 de 2026.» / «… el modelo 721 de 2026.» Sin la palabra «umbral», sin ninguna cifra y sin decir si se supera: el texto no deja deducir ninguna cota del patrimonio. La decisión de enviarlo sigue saliendo solo de las valoraciones manuales, con la función del modelo | — («sin cifras», decisión de la ronda 2; antes decía «el valor y el umbral de aviso») |

Los textos definitivos se fijan con sus tests en cada entrega (los de E2, en `packages/domain/test/jobs/notice-mail.test.ts`); un recuento que no es un entero se dice «algunos», nunca como llegó; esta tabla fija **qué información** lleva cada uno y cuál no. **Nada de lo que dice un registro llega a un correo sino por una lista cerrada** (revisión de la PR #104, privacidad B1): un código o un asunto que la redacción no conoce no se envía.
