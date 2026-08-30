# Guía rápida de verificación — feature 003-synthetic-data

Prerrequisitos: Node 22 (`nvm use`), `npm ci`, rama `feature/003-synthetic-data`.

## 0. Tooling desde cero

```bash
npm run clean && npm run build        # sin TS6305; los .tsbuildinfo aparecen dentro de dist*/
find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -not -path '*/dist*/*'   # vacío
npm run lint && npm run typecheck && npm run test:coverage   # 100 % en packages/domain
```

## 1. Libro sintético reproducible

```bash
alias atlas='node apps/cli/dist/main.js'
atlas synth --out /tmp/a.jsonl                      # semilla 1
atlas synth --out /tmp/b.jsonl --seed 1
cmp /tmp/a.jsonl /tmp/b.jsonl                       # idénticos
cmp /tmp/a.jsonl tests/fixtures/ledger/synthetic-v1.jsonl   # idéntico al golden file
atlas synth --out /tmp/a.jsonl                      # rechazado: la ruta existe (código 1)
atlas synth --out /tmp/c.jsonl --seed 42            # otro libro, mismo esqueleto
atlas --ledger /tmp/c.jsonl check --deep            # Libro íntegro (código 0)
atlas --ledger /tmp/c.jsonl positions               # incluye ast_gold en acc_ibkr y acc_ibkr2, ast_gamma en acc_bucket
atlas --ledger /tmp/c.jsonl gains 2027              # ganancia de la venta 30/12 (trade_date) y picos
atlas --ledger /tmp/c.jsonl order list; atlas --ledger /tmp/c.jsonl transfer pending   # uno pendiente cada uno
```

Resultado esperado: el resumen de `synth` lista los 23 tipos de evento de `docs/data-schema.md` §3, 4 cuentas y los activos de `data-model.md` §6; `check --deep` limpio.

## 2. Verificación profunda sobre un libro manipulado

```bash
cp tests/fixtures/ledger/synthetic-v1.jsonl /tmp/d.jsonl
sed -i '10s/"fee":"[0-9.]*"/"fee":"999"/' /tmp/d.jsonl     # edita a mano un importe de una línea con huella
atlas --ledger /tmp/d.jsonl check                   # limpio: la proyección no ve la huella
atlas --ledger /tmp/d.jsonl check --deep            # error fingerprint_mismatch (código 1)
atlas --ledger tests/fixtures/ledger/valid-v1.jsonl check --deep   # huellas de fixture ("sha256:fixture-…") → fingerprint_mismatch
```

## 3. `compact` con el esquema de prueba (solo tests)

No hay líneas antiguas en un libro real todavía:

```bash
atlas --ledger /tmp/c.jsonl compact --yes           # Nada que compactar: … schema_version 1 (código 0)
```

La migración real se verifica en los tests (`packages/domain/test/usecases/compact.test.ts`, `packages/adapters/test/file.test.ts`): con `TEST_SCHEMA_V2` y `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl`, `compact` deja todas las líneas en v2 con `notes`, el archivo `archive/ledger-<fecha>-v1.jsonl` es byte a byte el original, la instantánea no cambia y el segundo `compact` es no-op.

## 4. Copia verificada

```bash
atlas --ledger /tmp/c.jsonl backup --to /tmp/backups          # Copia verificada: /tmp/backups/ledger-<hoy>.jsonl (N líneas, etag …)
atlas --ledger /tmp/c.jsonl backup --to /tmp/backups          # rechazado: el destino existe (código 1)
cmp /tmp/c.jsonl /tmp/backups/ledger-*.jsonl                  # idénticos
```

## 5. Tests que lo demuestran

| Qué | Dónde |
|---|---|
| Golden file (bytes e instantánea), contenido mínimo, prefijos de la semilla 1 | `packages/domain/test/synth/generator.test.ts` |
| Propiedad sobre ≥ 20 semillas; `compact` conserva `snapshotOf` | `packages/domain/test/synth/properties.test.ts` |
| Un test por código de `deepCheck` e `integrity` | `packages/domain/test/projections/{deep-check,integrity}.test.ts` |
| `compact`: mezclado, no-op, inválido, etag, archivo existente, vacío | `packages/domain/test/usecases/compact.test.ts` |
| Esquema de prueba: carga, `append` en v2, v3 rechazada, paso faltante | `packages/domain/test/schema/{legacy-fixture,migrations}.test.ts`, `packages/adapters/test/file.test.ts` |
| Contrato del puerto (`lines`, `replace`) en memoria y fichero | `packages/adapters/test/ledger-store.contract.ts` |
| `synth`, `compact`, `check --deep`, `backup` de extremo a extremo | `apps/cli/test/commands/*.test.ts`, `apps/cli/test/e2e.test.ts` |
| Nada del dominio importa de `synth/` | `tests/architecture.test.ts` |
