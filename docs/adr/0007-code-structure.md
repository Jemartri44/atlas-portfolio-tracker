# ADR-0007 — Estructura del código: monorepo, arquitectura hexagonal y CLI primero

**Estado:** Aceptada (2026-08-30).

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
| `LedgerStore` | Cargar y guardar el libro con escritura condicional | S3, fichero local, memoria |
| `StatementSource` | Obtener movimientos de un origen externo | IBKR Flex (API), MyInvestor (fichero), CSV de exchange; futuro: PSD2/bancos, APIs de brókers |
| `PriceSource` | Precio informativo de un activo en una fecha | Yahoo, CoinGecko, manual |
| `FxRateSource` | Tipo de cambio BCE por fecha | CSV íntegro del BCE |
| `DocumentStore` | Guardar fuentes documentales y extractos importados | S3, fichero local |
| `Notifier` | Enviar avisos | SES, consola |
| `Clock` | Fecha y hora actuales | sistema, fijo en tests |

El AWS SDK solo aparece en `adapters` (S3 para el libro y documentos, SSM para el token de IBKR, SES para correo). La CLI en local no lo carga.

3. **CLI primero.** `apps/cli` es la interfaz de la Fase 1: registrar, proyectar, importar, exportar, generar datos sintéticos, compactar. Usable con datos reales sobre fichero local desde el primer día; la API llega en la Fase 4 y reutiliza los mismos casos de uso.

4. Fijado sin discusión: Node = última LTS soportada por Lambda al arrancar (24 si está disponible, si no 22), en `.nvmrc` y `engines`; ESM; `tsconfig` con `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`; `vitest` + `fast-check`; `esbuild` para empaquetar Lambda.

5. **Presupuesto de dependencias** en `docs/dependencies.md`: `domain` → ninguna en runtime; `adapters` → clientes modulares del AWS SDK v3; `web` → el framework y nada más al principio; desarrollo → typescript, vite, vitest, fast-check, esbuild y la herramienta de lint (ADR-0008, pendiente). Toda adición se justifica en la PR.

## Consecuencias

- Lint y formato quedan abiertos en ADR-0008 (Biome frente a ESLint + Prettier); no bloquea el primer código porque el formato se puede aplicar después.
- Los casos de uso (`recordTransaction`, `importStatement`, `projectPositions`…) viven en `domain/usecases` y reciben los puertos por parámetro; CLI, API y web solo los invocan.
