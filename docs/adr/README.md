# Registros de decisión de arquitectura (ADR)

Un fichero por decisión, numerado y nunca reescrito: una decisión que cambia se **reemplaza** por un ADR nuevo que la referencia.

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-backend-language.md) | Lenguaje del backend y del dominio | Aceptada |
| [0002](0002-ledger-storage.md) | Almacenamiento del libro mayor | Aceptada |
| [0003](0003-append-only-ledger.md) | Libro mayor append-only con lotes como proyección | Aceptada |
| [0004](0004-cash-scope.md) | Efectivo: saldos derivados por cuenta, colchón fuera de alcance | Aceptada |
| [0005](0005-money-representation.md) | Representación de dinero y cantidades (`big.js` vendorizada, redondeo tardío) | Aceptada |
| [0006](0006-ledger-file-schema.md) | Esquema del libro en S3 (un registro de eventos, versión por línea, BCE íntegro) | Aceptada |
| [0007](0007-code-structure.md) | Monorepo npm workspaces, arquitectura hexagonal, CLI primero | Aceptada; enmendada el 2026-11-03 (`@atlas/access` sale del dominio) |
| [0008](0008-lint-and-format.md) | Lint y formato: Biome | Aceptada (2026-08-30); la revisión prevista quedó sin objeto (la web usa Solid, ADR-0017) |
| [0009](0009-fifo-scope.md) | FIFO por activo entre cuentas; sin activos compartidos entre libros | Aceptada (2026-08-30); criterio de Atlas; enmendada el 2026-09-24 |
| [0010](0010-transfer-model.md) | Traspaso: hecho contable atómico + eventos de seguimiento | Aceptada |
| [0011](0011-corporate-actions-primitives.md) | Eventos corporativos como composición de 5 primitivas de lote | Aceptada (2026-08-30); consecuencias fiscales: criterios de Atlas |
| [0012](0012-cash-events-and-pending-orders.md) | Eventos de efectivo, base de coste por importe, órdenes pendientes, traspaso de custodia | Aceptada |
| [0013](0013-fiscal-date-and-wash-sale-window.md) | Fecha fiscal y ventana de recompra por tipo de activo; sentido de `fx_rate` | Aceptada (2026-08-30); la decisión 2 (ventana en días) la revisa ADR-0014 |
| [0014](0014-wash-sale-window-and-deferral-lineage.md) | Ventana de recompra de fecha a fecha y diferimiento ligado al linaje de lotes | Aceptada (2026-08-31); criterio de Atlas (#14, #15); revisa la decisión 2 de ADR-0013 |
| [0015](0015-degraded-projection-and-settings-acceptance.md) | Proyección degradada en consultas y aceptación de settings_changed que invalida el pasado | Aceptada; notas del 2026-09-25 (feature 014: `acceptInvalid` se niega con la sincronización configurada, y qué es «configurada») |
| [0016](0016-project-ledger-as-of.md) | Consulta del libro a una fecha con asOf | Aceptada |
| [0017](0017-web-stack.md) | Stack de la aplicacion web | Aceptada (2026-09-18); la parte de Pico, reemplazada por ADR-0023 |
| [0018](0018-schema-evolution-rules.md) | Evolucion del esquema y endurecimiento de validaciones | Aceptada; enmendada el 2026-09-24 (un campo nuevo en una foto completa) |
| [0019](0019-web-local-first.md) | Aplicacion web local-first sin servidor | Reemplazada en lo esencial por ADR-0035 (2026-10-06) |
| [0020](0020-tax-return-filed.md) | Constancia de lo declarado: evento `tax_return_filed` | Aceptada (2026-09-18); enmendada el 2026-09-18 y el 2026-09-19 |
| [0021](0021-fiscal-schema-provisions.md) | Previsiones del esquema para la Fase 5: guardar el dato sin decidir el criterio | Aceptada |
| [0022](0022-settings-recorded-in-full.md) | Un `settings_changed` registra la configuración vigente entera | Aceptada |
| [0023](0023-own-base-stylesheet.md) | Base de estilos propia en lugar de Pico CSS | Aceptada (2026-09-19); sustituye la parte de Pico de ADR-0017 |
| [0024](0024-fiscal-caveats-are-report-notes.md) | Una salvedad fiscal es una nota del informe, no una decisión de la interfaz | Aceptada |
| [0025](0025-recorded-fingerprint-waiver.md) | La salida de compact ante una huella no verificable queda registrada en el libro | Aceptada (2026-09-23); enmendada el mismo día |
| [0026](0026-cloud-sync-layer.md) | La nube como capa sobre lo local: sincronización del libro entre dispositivos | Aceptada (2026-09-24); la Parte B (la cola) la reemplaza ADR-0035; las Partes A y C siguen; nota del 2026-11-03 (ADR-0037) |
| [0027](0027-google-sign-in-verified-by-lambda.md) | Acceso solo con Google, verificado en nuestra Lambda; sin Cognito | Aceptada (2026-09-24); enmendada (la última, 2026-11-03, por ADR-0037); sustituye a Cognito |
| [0028](0028-aws-account-and-security-baseline.md) | Cuentas de AWS dedicadas, entornos y línea base de seguridad | Aceptada (2026-09-24); ADR-0034 la sustituye en parte |
| [0029](0029-ecb-reference-rates.md) | Tipos del BCE: histórico oficial en local, días sin publicación y comprobación de integridad | Aceptada (2026-09-24); enmendada tres veces |
| [0030](0030-broker-settled-eur.md) | Importe en euros liquidado por el bróker, como dato informativo | Aceptada (2026-09-24); enmendada el mismo día; acotada por ADR-0036 |
| [0031](0031-daily-close-prices.md) | Precios de cierre diarios: puerto, almacén y política de fallo | Aceptada (2026-09-24); enmendada cuatro veces (la cuarta, 2026-11-03: una sola fuente, EODHD) |
| [0032](0032-backups-and-restore.md) | Copias de seguridad y restauración del libro | Aceptada (2026-09-24); la capa 1 y el paso 6 los reemplaza ADR-0035 |
| [0033](0033-console-device-token.md) | Acceso de la consola a la API: token de dispositivo emitido al final de un inicio de sesión que abre la propia consola | Reemplazada por ADR-0037 (2026-11-03) |
| [0034](0034-shared-aws-account.md) | Despliegue en una cuenta de AWS compartida con otros proyectos | Aceptada (2026-09-25); sustituye en parte a ADR-0028 y ADR-0027 |
| [0035](0035-cloud-ledger-single-source.md) | Atlas siempre en la nube: el libro de S3 como única fuente de verdad, sin cola local | Aceptada (2026-10-06); enmienda en parte ADR-0019 y ADR-0026; la consola como cliente de la API la retira ADR-0037 |
| [0036](0036-currency-first-gains-and-currency-lots.md) | Ganancias en divisa primero en la divisa, y lotes de divisa | Aceptada (2026-10-27); enmienda ADR-0030 |
| [0037](0037-web-only-access.md) | La consola no tiene acceso propio a la API; cerrar todas las sesiones desde la web | Aceptada (2026-11-03); reemplaza a ADR-0033 y enmienda ADR-0027 y ADR-0035 |

**Estados:** Propuesta → Aceptada → (Reemplazada por NNNN | Retirada).

**Plantilla:** Contexto · Opciones consideradas (ventajas / inconvenientes) · Decisión · Consecuencias.
