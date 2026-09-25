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
| [0007](0007-code-structure.md) | Monorepo npm workspaces, arquitectura hexagonal, CLI primero | Aceptada |
| [0008](0008-lint-and-format.md) | Lint y formato: Biome | Aceptada; la revisión que preveía quedó sin objeto (la web usa Solid, ADR-0017) |
| [0009](0009-fifo-scope.md) | FIFO por activo entre cuentas; sin activos compartidos entre libros | Aceptada, verificación fiscal pendiente; enmendada el 2026-09-24 (el lote de una corrección conserva el sitio de su raíz) |
| [0010](0010-transfer-model.md) | Traspaso: hecho contable atómico + eventos de seguimiento | Aceptada |
| [0011](0011-corporate-actions-primitives.md) | Eventos corporativos como composición de 5 primitivas de lote | Aceptada, consecuencias fiscales por verificar |
| [0012](0012-cash-events-and-pending-orders.md) | Eventos de efectivo, base de coste por importe, órdenes pendientes, traspaso de custodia | Aceptada |
| [0013](0013-fiscal-date-and-wash-sale-window.md) | Fecha fiscal y ventana de recompra por tipo de activo; sentido de `fx_rate` | Aceptada; verificación resuelta el 2026-09-18 |
| [0014](0014-wash-sale-window-and-deferral-lineage.md) | Ventana de recompra de fecha a fecha y diferimiento ligado al linaje de lotes | Aceptada, verificación fiscal pendiente (criterios #14 y #15) |
| [0015](0015-degraded-projection-and-settings-acceptance.md) | Proyección degradada en consultas y aceptación de settings_changed que invalida el pasado | Aceptada |
| [0016](0016-project-ledger-as-of.md) | Consulta del libro a una fecha con asOf | Aceptada |
| [0017](0017-web-stack.md) | Stack de la aplicacion web | Aceptada; la parte de Pico, reemplazada por 0023 |
| [0018](0018-schema-evolution-rules.md) | Evolucion del esquema y endurecimiento de validaciones | Aceptada; enmendada el 2026-09-24 (un campo nuevo en una foto completa) |
| [0019](0019-web-local-first.md) | Aplicacion web local-first sin servidor | Aceptada; enmendada el 2026-09-24 (la web de escritorio guarda el libro en IndexedDB y no escribe en la carpeta) |
| [0020](0020-tax-return-filed.md) | Constancia de lo declarado: evento `tax_return_filed` | Aceptada |
| [0021](0021-fiscal-schema-provisions.md) | Previsiones del esquema para la Fase 5: guardar el dato sin decidir el criterio | Aceptada |
| [0022](0022-settings-recorded-in-full.md) | Un `settings_changed` registra la configuración vigente entera | Aceptada |
| [0023](0023-own-base-stylesheet.md) | Base de estilos propia en lugar de Pico CSS | Aceptada |
| [0024](0024-fiscal-caveats-are-report-notes.md) | Una salvedad fiscal es una nota del informe, no una decisión de la interfaz | Aceptada |
| [0025](0025-recorded-fingerprint-waiver.md) | La salida de compact ante una huella no verificable queda registrada en el libro | Aceptada |
| [0026](0026-cloud-sync-layer.md) | La nube como capa sobre lo local: sincronización del libro entre dispositivos | Aceptada; enmendada cuatro veces el 2026-09-24 (la última: cerrojo solo entre consolas, una corrección viva por raíz) |
| [0027](0027-google-sign-in-verified-by-lambda.md) | Acceso solo con Google, verificado en nuestra Lambda; sin Cognito | Aceptada |
| [0028](0028-aws-account-and-security-baseline.md) | Cuentas de AWS dedicadas, entornos y línea base de seguridad | Aceptada |
| [0029](0029-ecb-reference-rates.md) | Tipos del BCE: histórico oficial en local, días sin publicación y comprobación de integridad | Aceptada; enmendada tres veces el 2026-09-24 (la última: lo verificado por la feature 012 y la confirmación de un borrador) |
| [0030](0030-broker-settled-eur.md) | Importe en euros liquidado por el bróker, como dato informativo | Aceptada |
| [0031](0031-daily-close-prices.md) | Precios de cierre diarios: puerto, almacén y política de fallo | Aceptada; enmendada dos veces el 2026-09-24 (los símbolos salen del libro; claves fuera de la carpeta, precedencia de la puerta, el 720 cerrado por estructura, aproximación por ETF, divisa, cupo y lista SIN VERIFICAR) y una tercera al cerrar la 013, el 2026-09-25 (lo verificado; CoinGecko y OpenFIGI retirados; divisa confirmada por el usuario; un cierre en vigor por fecha; precio con valor en euros, `GBX`, nunca el día en curso) |
| [0032](0032-backups-and-restore.md) | Copias de seguridad y restauración del libro | Aceptada |

**Estados:** Propuesta → Aceptada → (Reemplazada por NNNN | Retirada).

**Plantilla:** Contexto · Opciones consideradas (ventajas / inconvenientes) · Decisión · Consecuencias.
