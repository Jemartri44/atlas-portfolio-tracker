# Atlas Portfolio Tracker

Aplicación personal para gestionar una cartera de inversión a 20 años: libro mayor *append-only*, lotes fiscales FIFO, traspasos entre fondos y preparación de los datos de la Renta. **Nunca ejecuta órdenes**: cada operación se hace a mano en la plataforma y se registra aquí.

## Estado

- **Fases 1, 2 y 3 completas.** El libro mayor con lotes FIFO, traspasos y eventos corporativos; la aportación mensual repartida según los pesos objetivo; y el seguimiento del cubo especulativo frente a su índice. Todo se usa desde la CLI `atlas`.
- **La web, completa.** Resumen, Movimientos, Registrar, Cartera, Cubo, Ajustes y libro, con gráficas y todos los asistentes, más la pantalla fiscal fuera de la barra. Desde ADR-0035 es solo en la nube: entra con Google, lee el libro de la API (que lo guarda en S3) y no muestra ni registra nada sin conexión.
- **Las previsiones fiscales del esquema, integradas.** El libro ya guarda los datos que necesitará el cálculo de la Renta (ADR-0021).
- **La Fase 5, terminada.** El motor: la base imponible del ahorro de un ejercicio, con la regla de recompra calculada, la compensación del art. 49 y el arrastre a cuatro ejercicios. Y la salida: la Renta por casillas del Modelo 100 del ejercicio, los Modelos 720 y 721, la constancia de lo presentado frente a lo calculado, y todo ello en la consola y en la pantalla fiscal de la web.
- **La nube, escrita y sin desplegar.** La API (Lambda), las tareas programadas (BCE, precios, correo, copias, integridad) y la infraestructura de Terraform están implementadas y probadas con dobles de S3, SSM y Google; falta desplegarlas. Hasta entonces la web solo se prueba contra el servidor local de pruebas (más abajo) y la consola trabaja sobre un fichero local.

Las especificaciones de las últimas funcionalidades están en [`specs/`](specs/); las anteriores están en el historial de git.

## Documentación

- [`docs/specification.md`](docs/specification.md) — especificación funcional y técnica. Es la referencia.
- [`docs/business-rules.md`](docs/business-rules.md) — reglas de dominio y mecánica fiscal española.
- [`docs/fiscal-questions.md`](docs/fiscal-questions.md) — los criterios fiscales que aplica la aplicación, cada uno con su grado de certeza y hacia qué lado caería el error si estuviera mal.
- [`docs/data-schema.md`](docs/data-schema.md) — formato del libro (`ledger.jsonl`), eventos, proyecciones y FIFO.
- [`docs/decision-roadmap.md`](docs/decision-roadmap.md) — lo que sigue pendiente; [`docs/first-deploy-checks.md`](docs/first-deploy-checks.md) — qué comprobar en el primer despliegue.
- [`docs/adr/`](docs/adr/) — decisiones de arquitectura. [`docs/dependencies.md`](docs/dependencies.md) — presupuesto cerrado de dependencias.
- [`docs/design/brief.md`](docs/design/brief.md) — requisitos de la interfaz: tamaños de pantalla, modo privacidad, estados y restricciones. [`docs/cli.md`](docs/cli.md) — guía de la consola.
- [`CLAUDE.md`](CLAUDE.md) — contexto y convenciones para el asistente de código.
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — constitución del proyecto ([GitHub Spec Kit](https://github.com/github/spec-kit)). Los specs por funcionalidad viven en `specs/`.

El plan de inversión personal (`plan-financiero.md`) es privado y no está en el repositorio.

## Arranque en local

Requisitos: Node 22 (vía [nvm](https://github.com/nvm-sh/nvm)) y npm 10.

```bash
nvm install 22 && nvm use            # lee .nvmrc
npm ci                               # instala el toolchain (en runtime, solo Solid y su router en la web)
npm run lint && npm run typecheck    # Biome + tsc
npm test                             # vitest (dominio al 100 % de cobertura con npm run test:coverage)
npm run build                        # tsc -b de todos los paquetes + build de la web
npm run dev                          # servidor de desarrollo de la web en http://localhost:5173
npm run clean                        # borra dist/, dist-test/, coverage/ y la caché de Vite
```

`npm run clean && npm run build` reconstruye desde cero (los `.tsbuildinfo` viven dentro de `dist*/`, así que borrar la salida no deja estado incremental a medias, por ejemplo al cambiar de rama).

Estructura (ADR-0007): `packages/domain` (núcleo puro, sin imports externos; `vendor/big.js` para el decimal exacto), `packages/adapters` (`FileLedgerStore`, `BlobLedgerStore`, los clientes de la API y los almacenes de AWS, reloj y aleatoriedad del sistema), `apps/cli` y `apps/web`.

## La aplicación web

Atlas es siempre en la nube (ADR-0035): se entra con Google y se ve el libro de S3, que es la única fuente de verdad. Sin conexión no se registra ni se muestra nada, y no hay cola ni libro guardado en el dispositivo. El *stack* es Solid, con uPlot vendorizada (ADR-0017) y una base de estilos propia (ADR-0023, `docs/design/system.md`). Seis pantallas: Resumen, Movimientos, Registrar, Cartera, Cubo y Ajustes, más la pantalla fiscal en `/fiscal`, que no ocupa un sitio en la barra porque se abre unas pocas veces al año.

```bash
npm run dev                          # http://localhost:5173
npm run build                        # produce apps/web/dist y comprueba el bundle
npm run preview                      # sirve el build de producción en :4173
```

**Desarrollo sin AWS.** `npm run dev` lleva `/api` (con un *proxy* de Vite, solo en desarrollo) al servidor local de pruebas, que compone el manejador real con dobles de S3, SSM y Google y solo lleva datos sintéticos:

```bash
npm run build                        # compila también el servidor de pruebas (apps/api/dist-test)
node apps/api/dist-test/apps/api/test/support/local-server.js --port 8787 --origin http://localhost:5173 \
  --account allowed --ledger tests/fixtures/ledger/synthetic-v1.jsonl   # terminal 1
npm run dev                          # terminal 2; abre http://localhost:5173 y entra con Google (el falso)
```

`ATLAS_API_URL` cambia el destino del *proxy* (por defecto `http://127.0.0.1:8787`).

Las copias del libro fuera de AWS son el botón «Descargar copia» y, en el ordenador, `atlas backup`.

El modo privacidad está **activado por defecto**: oculta importes y cantidades, y deja a la vista porcentajes, pesos, desviaciones y fechas. Se conmuta desde la cabecera y se recuerda en el dispositivo.

### CSP: desarrollo y producción

`apps/web/index.html` lleva la política de producción (`script-src 'self'`, sin `unsafe-inline`). El servidor de desarrollo de Vite inyecta *scripts* en línea, así que `vite.config.ts` **relaja la misma política en `npm run dev`** (añade `'unsafe-inline'` a scripts y estilos, `'unsafe-eval'`, y `ws:`/`wss:` para el *hot reload*). Lo que se sirve en producción es la estricta, y `npm run build` comprueba sobre el resultado que no hay ni un `node:` ni una URL a un origen ajeno.

## Uso de la CLI

La guía de la consola `atlas` (catálogo, operaciones, ciclo mensual, precios, cubo, Renta, copias y datos sintéticos) está en [`docs/cli.md`](docs/cli.md). Tras `npm run build`, el ejecutable es `node apps/cli/dist/main.js` (o `npm run atlas --`).

## Idioma

Todo lo técnico (código, identificadores, commits, ramas, ficheros, infraestructura) va en **inglés**. Los documentos de `docs/` y los mensajes de la CLI van en **español**, con los identificadores en inglés.

## Flujo de trabajo (git flow)

El repositorio sigue el modelo **git flow** con **git básico, sin la extensión `git-flow`**:

| Rama        | Propósito                                                        |
|-------------|------------------------------------------------------------------|
| `main`      | Código en producción. Cada release se etiqueta (`vX.Y.Z`).       |
| `develop`   | Rama de integración. De aquí parten las *features*.              |
| `feature/*` | Desarrollo de una funcionalidad. Se fusiona en `develop`.        |
| `fix/*`     | Corrección no urgente sobre `develop`. Se fusiona en `develop`.  |
| `release/*` | Preparación de una versión. Se fusiona en `main` y `develop`.    |
| `hotfix/*`  | Arreglos urgentes sobre `main`. Se fusionan en `main` y `develop`.|

Las fusiones a `develop` y `main` se hacen mediante pull request, nunca con push directo.

```bash
# Feature (igual para fix/*)
git checkout -b feature/<name> develop
git checkout develop && git merge --no-ff feature/<name> && git branch -d feature/<name>

# Release
git checkout -b release/<version> develop
git checkout main && git merge --no-ff release/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff release/<version> && git branch -d release/<version>

# Hotfix
git checkout -b hotfix/<version> main
git checkout main && git merge --no-ff hotfix/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff hotfix/<version> && git branch -d hotfix/<version>
```

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …), en inglés y en una sola línea. Hooks: `git config core.hooksPath .githooks`. El `pre-commit` pasa `gitleaks` (reglas del proyecto en `.gitleaks.toml`) y Biome sobre los ficheros preparados, y aborta el commit si alguno falla; los detalles están en [`.githooks/README.md`](.githooks/README.md).

## Licencia

[MIT](LICENSE).
