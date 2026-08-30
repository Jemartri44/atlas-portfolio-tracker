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

**Estados:** Propuesta → Aceptada → (Reemplazada por NNNN | Retirada).

**Plantilla:** Contexto · Opciones consideradas (ventajas / inconvenientes) · Decisión · Consecuencias.
