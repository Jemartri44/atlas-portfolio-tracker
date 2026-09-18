# Presupuesto de dependencias

Constitución VI y ADR-0007: pocas dependencias, cada una justificada. Esta es la lista cerrada; añadir cualquier otra exige actualizar este fichero en la misma PR y justificarlo en la descripción.

## Runtime

| Paquete | Dónde | Justificación |
|---|---|---|
| `big.js` (**vendorizada**, `packages/domain/vendor/`) | `domain` | Decimal exacto (ADR-0005). No es dependencia npm |
| `pico.css` (**vendorizada**, `apps/web/vendor/`) | `web` | Base de estilo, un fichero MIT sin dependencias (ADR-0017). No es dependencia npm |
| `uPlot` (**vendorizada**, `apps/web/vendor/`) | `web` | Series temporales y barras, 23 KB sin dependencias (ADR-0017). El anillo de reparto se escribe a mano en SVG. No es dependencia npm |
| `@aws-sdk/client-s3` | `adapters` | Libro, documentos, importaciones (ADR-0002) |
| `@aws-sdk/client-ssm` | `adapters` | Token de IBKR (Fase 4) |
| `@aws-sdk/client-ses` | `adapters` | Correo (Fase 4) |
| `solid-js` (**fijada a 1.9.x**) | `web` | Framework de la SPA (ADR-0017). 4 paquetes, 5,33 KB gzip, compila con `tsc` 7 sin herramienta extra |
| `@solidjs/router` (**versión exacta fijada**) | `web` | Rutas de la SPA; sin dependencias propias. Llegó a 1.0.0 después de ADR-0017 |

`packages/domain` **no tiene dependencias npm en runtime**. Se comprueba en CI (`package.json` sin `dependencies`).

## Desarrollo

| Paquete | Justificación |
|---|---|
| `typescript` | Lenguaje |
| `@biomejs/biome` | Lint y formato (ADR-0008) |
| `vitest` | Tests, comparte config con Vite |
| `@vitest/coverage-v8` | Cobertura 100% en `domain` |
| `fast-check` | Tests de propiedades (FIFO, primitivas, dinero) |
| `happy-dom` | Entorno de DOM para los tests de la web. Autorizado en la feature 007 (decisión (h) de su prompt): la 006 se hizo sin él y funcionó, pero las gráficas y los asistentes nuevos tienen comportamiento que no se prueba bien solo desde el grafo de importaciones. Solo desarrollo, nunca llega al *bundle* |
| `esbuild` | Empaquetado de Lambda |
| `vite` | Build del frontend |
| `@types/node` | Tipos de Node en `adapters`, `cli`, `api` |
| `vite-plugin-pwa` | Service worker y manifiesto de la PWA (ADR-0017); solo desarrollo |
| `vite-plugin-solid` | Imprescindible para compilar el JSX de Solid con Vite (ADR-0017); solo desarrollo, no llega al *bundle* |

## Prohibido

- CDN externos, fuentes remotas, analítica de terceros (constitución, seguridad).
- Frameworks en `domain` (ni de validación, ni de fechas, ni de utilidades). Se escribe a mano: es poco código y es el que debe durar.
- Paquetes "pequeños de utilidad" (`lodash`, `dayjs`, `uuid`…): la biblioteca estándar cubre lo necesario; ULID se implementa en `domain` (~40 líneas).
- **Excluidos con motivo** tras la investigación de la Ronda 7 (ADR-0017), para que no se vuelvan a proponer: **Tailwind v4** (binario nativo por plataforma en `optionalDependencies`, con fallo documentado de `npm ci` entre sistemas operativos y un caso de suplantación maliciosa del scope); **Observable Plot** (93 KB y 31 subpaquetes de d3, y aun así no hace el anillo de reparto); **ECharts** (197 KB, ocho veces uPlot); **`solid-ui`** (abandonada: un único commit en doce meses, de un bot); **TanStack Table** (una mayor cada cuatro años con rupturas; ordenar y agrupar es lógica de dominio, donde hay cobertura del 100 %).
- **Librería de componentes**: se empieza **sin ninguna**, con HTML nativo (`<dialog>`, `<select>`, `<details>`, `<datalist>`) sobre Pico. `@kobalte/core` solo si una pantalla concreta lo exige, con justificación escrita aquí y **versión exacta fijada** (está en 0.x).
