# Presupuesto de dependencias

Constitución VI y ADR-0007: pocas dependencias, cada una justificada. Esta es la lista cerrada; añadir cualquier otra exige actualizar este fichero en la misma PR y justificarlo en la descripción.

## Runtime

| Paquete | Dónde | Justificación |
|---|---|---|
| `big.js` (**vendorizada**, `packages/domain/vendor/`) | `domain` | Decimal exacto (ADR-0005). No es dependencia npm |
| `uPlot` (**vendorizada**, `apps/web/vendor/`) | `web` | Series temporales y barras, 23 KB sin dependencias (ADR-0017). El anillo de reparto se escribe a mano en SVG. No es dependencia npm |
| `@aws-sdk/client-s3` (**versión exacta fijada**: `3.1141.0`) | `adapters`, **solo** en `src/aws/sdk-s3.ts` | Libro, documentos, importaciones (ADR-0002). En la feature 015, el adaptador fino de la interfaz estrecha `ObjectStore` (`GetObject`, `PutObject` con `If-Match` o `If-None-Match` y `ListObjectsV2`; nunca `DeleteObject`), que usan la API y, en E5, las órdenes de administración. **Instalado el 2026-09-26** con la autorización del usuario (`specs/015-api-access/questions.md` §12; `docs/prompts/015-api-access.md` §7 P3). Nunca alcanzable desde la web ni desde el dominio (test de arquitectura) |
| `@aws-sdk/client-ssm` | `adapters` | Parameter Store: la API **lee** la lista permitida, el identificador y el secreto del cliente de Google y la clave de sesión (ADR-0027), y **lee y escribe** los registros de los tokens de dispositivo de la consola, solo bajo `/atlas/<entorno>/device-tokens/` (ADR-0033, punto 9); las órdenes de administración revocan esos registros (ADR-0033, punto 8); más adelante, el token Flex de IBKR (Fase 4). **Versión exacta fijada: `3.1141.0`, solo en `src/aws/sdk-ssm.ts`**, el adaptador fino de la interfaz estrecha `ParameterStore` (`GetParameter`, `PutParameter` y `GetParametersByPath`; nunca `DeleteParameter` ni `LabelParameterVersion`). **Instalado el 2026-09-26** con la autorización del usuario (`specs/015-api-access/questions.md` §12; `docs/prompts/015-api-access.md` §7 P3) |
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
| `esbuild` (**versión exacta fijada**: `0.28.2`, en `apps/api`) | Empaquetado de la Lambda de la API: un solo fichero ESM con el SDK dentro, construido por un guion versionado (`apps/api/scripts/build-lambda.mjs`) y consumido por la 017. **Instalado el 2026-09-26** con la autorización del usuario (feature 015, §7 P3). Como Tailwind, trae su binario nativo por plataforma en `optionalDependencies` (`@esbuild/<plataforma>`, 26 entradas en el *lockfile*): el riesgo de `npm ci` entre sistemas operativos que motivó excluir Tailwind existe también aquí; se acepta porque está presupuestado, solo corre en el *build* de la Lambda y la CI es Linux x64 |
| `vite` | Build del frontend |
| `@types/node` | Tipos de Node en `adapters`, `cli`, `api` |
| `vite-plugin-pwa` | Service worker y manifiesto de la PWA (ADR-0017); solo desarrollo |
| `vite-plugin-solid` | Imprescindible para compilar el JSX de Solid con Vite (ADR-0017); solo desarrollo, no llega al *bundle* |

## Retiradas

| Paquete | Cuándo | Motivo |
|---|---|---|
| `pico.css` (vendorizada) | 2026-09-19 | Sus valores por defecto peleaban con los de la aplicación en casi cada elemento y eran el origen de buena parte de los defectos visuales; se sustituye por una base de estilos propia en `apps/web/src/styles/` (ADR-0023) |

## Prohibido

- CDN externos, fuentes remotas, analítica de terceros (constitución, seguridad).
- Frameworks en `domain` (ni de validación, ni de fechas, ni de utilidades). Se escribe a mano: es poco código y es el que debe durar.
- Paquetes "pequeños de utilidad" (`lodash`, `dayjs`, `uuid`…): la biblioteca estándar cubre lo necesario; ULID se implementa en `domain` (~40 líneas).
- **Excluidos con motivo** tras la investigación de la Ronda 7 (ADR-0017), para que no se vuelvan a proponer: **Tailwind v4** (binario nativo por plataforma en `optionalDependencies`, con fallo documentado de `npm ci` entre sistemas operativos y un caso de suplantación maliciosa del scope); **Observable Plot** (93 KB y 31 subpaquetes de d3, y aun así no hace el anillo de reparto); **ECharts** (197 KB, ocho veces uPlot); **`solid-ui`** (abandonada: un único commit en doce meses, de un bot); **TanStack Table** (una mayor cada cuatro años con rupturas; ordenar y agrupar es lógica de dominio, donde hay cobertura del 100 %).
- **Librería de componentes**: se empieza **sin ninguna**, con HTML nativo (`<dialog>`, `<select>`, `<details>`, `<datalist>`) sobre la base de estilos propia (ADR-0023). `@kobalte/core` solo si una pantalla concreta lo exige, con justificación escrita aquí y **versión exacta fijada** (está en 0.x).
