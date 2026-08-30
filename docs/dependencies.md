# Presupuesto de dependencias

Constitución VI y ADR-0007: pocas dependencias, cada una justificada. Esta es la lista cerrada; añadir cualquier otra exige actualizar este fichero en la misma PR y justificarlo en la descripción.

## Runtime

| Paquete | Dónde | Justificación |
|---|---|---|
| `big.js` (**vendorizada**, `packages/domain/vendor/`) | `domain` | Decimal exacto (ADR-0005). No es dependencia npm |
| `@aws-sdk/client-s3` | `adapters` | Libro, documentos, importaciones (ADR-0002) |
| `@aws-sdk/client-ssm` | `adapters` | Token de IBKR (Fase 4) |
| `@aws-sdk/client-ses` | `adapters` | Correo (Fase 4) |
| Framework web (Svelte o Solid) | `web` | Ronda 7 |

`packages/domain` **no tiene dependencias npm en runtime**. Se comprueba en CI (`package.json` sin `dependencies`).

## Desarrollo

| Paquete | Justificación |
|---|---|
| `typescript` | Lenguaje |
| `@biomejs/biome` | Lint y formato (ADR-0008) |
| `vitest` | Tests, comparte config con Vite |
| `@vitest/coverage-v8` | Cobertura 100% en `domain` |
| `fast-check` | Tests de propiedades (FIFO, primitivas, dinero) |
| `esbuild` | Empaquetado de Lambda |
| `vite` | Build del frontend |
| `@types/node` | Tipos de Node en `adapters`, `cli`, `api` |

## Prohibido

- CDN externos, fuentes remotas, analítica de terceros (constitución, seguridad).
- Frameworks en `domain` (ni de validación, ni de fechas, ni de utilidades). Se escribe a mano: es poco código y es el que debe durar.
- Paquetes "pequeños de utilidad" (`lodash`, `dayjs`, `uuid`…): la biblioteca estándar cubre lo necesario; ULID se implementa en `domain` (~40 líneas).
