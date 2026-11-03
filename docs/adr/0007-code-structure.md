# ADR-0007 — Estructura del código: monorepo, arquitectura hexagonal y CLI primero

**Estado:** Aceptada (2026-08-30). Nota del 2026-09-25 sobre los adaptadores de `PriceSource` y enmienda del 2026-11-03 sobre `@atlas/access` y las puertas (ver al final).

## Contexto

TypeScript en todo (ADR-0001) con el dominio compartido entre Lambda, CLI y navegador exige que `domain` sea isomorfo: sin APIs de Node ni de navegador, sin I/O, sin dependencias en runtime salvo `big.js` vendorizada (ADR-0005). El usuario quiere poder conectar en el futuro bancos y APIs de brókers sin tocar el núcleo.

## Opciones consideradas

- Gestor: **npm workspaces** (viene con Node, un lockfile, `npm audit` de serie) frente a pnpm (más rápido y estricto, pero una herramienta más que versionar y que los asistentes confunden con npm).
- Interfaz de la Fase 1: **CLI primero** frente a API mínima primero.
- Arquitectura: **hexagonal (puertos y adaptadores) con núcleo funcional puro** frente a capas convencionales.

## Decisión

1. **Monorepo con npm workspaces.** Un `package-lock.json`, `npm ci` en CI.

```
packages/domain      núcleo puro: tipos, money, eventos, proyecciones, FIFO, fiscal, puertos (interfaces). Cero I/O, cero deps npm en runtime.
packages/adapters    implementaciones de los puertos. Aquí viven el AWS SDK v3 (clientes modulares S3, SSM, SES), parsers y fuentes de precios.
apps/cli             interfaz de la Fase 1 sobre LedgerStore de fichero local o S3.
apps/api             Lambda con Function URL: valida JWT, compone dominio + adaptadores, persiste.
apps/web             SPA (Vite); usa domain para proyectar y simular sin conexión.
infra/               Terraform.
```

2. **Arquitectura hexagonal.** El dominio define los **puertos** como interfaces; los adaptadores los implementan; las apps componen. Regla de dependencia: `domain` no importa de ningún otro paquete; `adapters` importa de `domain`; las apps importan de ambos. Se comprueba con un test de arquitectura (grafo de imports).

| Puerto | Responsabilidad | Adaptadores previstos |
|---|---|---|
| `LedgerStore` | Cargar el libro (eventos migrados y líneas crudas) y guardarlo con escritura condicional: `append` y `replace` (reescritura completa tras archivar el original, solo para `compact`; *añadido el 2026-08-30 al preparar la feature 003*) | S3, fichero local, memoria |
| `StatementSource` | Obtener movimientos de un origen externo | IBKR Flex (API), MyInvestor (fichero), CSV de exchange; futuro: PSD2/bancos, APIs de brókers |
| `PriceSource` | Precio informativo de un activo en una fecha | ~~Yahoo, CoinGecko, manual~~ EODHD (ADR-0031; nota al final) |
| `FxRateSource` | Tipo de cambio BCE por fecha | CSV íntegro del BCE |
| `DocumentStore` | Guardar fuentes documentales y extractos importados | S3, fichero local |
| `Notifier` | Enviar avisos | SES, consola |
| `Clock` | Fecha y hora actuales | sistema, fijo en tests |
| `RandomSource` | Bytes aleatorios para el ULID (el dominio no puede usar `globalThis.crypto` sin romper su aislamiento) | Web Crypto en `adapters`, determinista en tests. *Añadido el 2026-08-30 al implementar la feature 001* |

El AWS SDK solo aparece en `adapters` (S3 para el libro y documentos, SSM para el token de IBKR, SES para correo). La CLI en local no lo carga.

3. **CLI primero.** `apps/cli` es la interfaz de la Fase 1: registrar, proyectar, importar, exportar, generar datos sintéticos, compactar. Usable con datos reales sobre fichero local desde el primer día; la API llega en la Fase 4 y reutiliza los mismos casos de uso.

4. Fijado sin discusión: Node = última LTS soportada por Lambda al arrancar (24 si está disponible, si no 22), en `.nvmrc` y `engines`; ESM; `tsconfig` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; `vitest` + `fast-check`; `esbuild` para empaquetar Lambda.

5. **Presupuesto de dependencias** en `docs/dependencies.md`: `domain` → ninguna en runtime; `adapters` → clientes modulares del AWS SDK v3; `web` → el framework y nada más al principio; desarrollo → typescript, vite, vitest, fast-check, esbuild y la herramienta de lint (ADR-0008, pendiente). Toda adición se justifica en la PR.

## Consecuencias

- Lint y formato quedan abiertos en ADR-0008 (Biome frente a ESLint + Prettier); no bloquea el primer código porque el formato se puede aplicar después.
- Los casos de uso (`recordTransaction`, `importStatement`, `projectPositions`…) viven en `domain/usecases` y reciben los puertos por parámetro; CLI, API y web solo los invocan.

## Nota del 2026-09-25 (cierre de la feature 013)

Los adaptadores que la tabla preveía para `PriceSource` —Yahoo y CoinGecko— **están retirados por ADR-0031**: Yahoo porque sus condiciones prohíben el acceso automatizado, y CoinGecko en su tercera enmienda, porque sus condiciones describen el plan gratuito como para probar. El único adaptador que existe es **EODHD** (`packages/adapters/src/prices/`). La entrada manual no es un adaptador del puerto: es la `valuation` del libro, que la puerta de precios lee aparte. Nada más de esta ADR cambia.

## Enmienda del 2026-11-03: `@atlas/access` sale del dominio

Las reglas del acceso a la API (ADR-0027) vivían en `packages/domain/src/access/` tras la puerta `@atlas/domain/access`, aunque no son de inversión y la web no las usa. Pasan a un paquete propio, **`packages/access` (`@atlas/access`)**: la lista permitida, las cargas firmadas, la comprobación del ID token de Google, los identificadores, la marca de «cerrar todas las sesiones» ([ADR-0037](0037-web-only-access.md)) y la fecha del último inicio de sesión web. La fontanería HTTP (tabla de rutas, códigos, cuerpos, cookies, configuración de la Lambda y rutas del libro) baja a `apps/api/src/access/`, porque solo la usa la API. Las reglas del libro de la administración (`compareForRestore`, `parseAdminConfig`) no son acceso y se quedan en el dominio, en `domain/src/admin/`, tras `@atlas/domain/admin`.

- **Regla de dependencias:** `@atlas/access` importa solo el barril de `@atlas/domain` (sus errores y guardas puras, sin copiarlas; ninguna otra puerta). Los adaptadores, la API y la consola pueden importarlo. **El dominio y la web nunca lo alcanzan.** Lo fijan `tests/architecture/access.test.ts`, `domain-imports.test.ts` y `api.test.ts`.
- **Cobertura:** cada área se mide en una pasada propia (`npm run test:coverage:<área>`). `packages/access` y `apps/api/src/access` van al 100 %, porque son seguridad.
- No cambia ninguna línea de lógica: se movieron los ficheros y sus pruebas.

### Las puertas de los paquetes (P6, 2026-11-03)

- **Una sola lista de puertas: los `exports` de cada `package.json`.** Los alias de Vite y de Vitest se generan de ellos (`scripts/workspace-aliases.mjs`), igual que ya los leían el empaquetado de las Lambdas y los tests de arquitectura. Ninguna configuración nombra una puerta a mano, y `tests/workspace-aliases.test.ts` lo fija.
- **Las puertas no se unen.** Las candidatas están separadas por una frontera que importa:
  - `aws-jobs` y `aws-daily`: la API no alcanza el envío de correo, y ni la API ni la función de correo alcanzan las claves de precios.
  - `aws-admin`: la API nunca llega a la administración.
  - `remote-answers`: la web la usa fuera del motor de la sincronización.
  - `rebalance`: lleva el motor fiscal, que no puede viajar con `portfolio`.
- **El grupo de chunks del dominio** (`advancedChunks` en `apps/web/vite.config.ts`) se mantiene. Medido sin él, el arranque pasa de 74,5 a 77,3 KB gzip y el total de 335,0 a 340,7.

