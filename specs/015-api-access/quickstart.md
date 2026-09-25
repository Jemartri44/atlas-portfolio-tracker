# Guía de validación: `015-api-access`

Cómo se comprueba cada entrega. **Sin AWS, sin Google y sin coste.** Las órdenes se ejecutan en el worktree de la rama. Los temporales van al *scratchpad* de la sesión, con el prefijo `015-`.

## Antes de cualquier entrega

```bash
cd ../atlas-wt-015 && git config core.hooksPath .githooks && npm ci
npm run lint > "$SP/015-lint.log" 2>&1; echo "lint=$?"
npm run typecheck > "$SP/015-tsc.log" 2>&1; echo "tsc=$?"
npm run test:coverage > "$SP/015-cov.log" 2>&1; echo "cov=$?"   # packages/domain al 100 %
npm run build > "$SP/015-build.log" 2>&1; echo "build=$?"
node "$SP/015-bundle/measure-015.mjs" apps/web/dist                # arranque y total, en bytes
find packages apps tests -name '*.js' -not -path '*/node_modules/*' -not -path '*/dist*' \
  | while read f; do b="${f%.js}"; [ -e "$b.ts" -o -e "$b.tsx" ] && echo "TWIN $f"; done   # tiene que salir vacío
```

Siempre se redirige a un fichero y se lee `$?`: un resultado leído a través de una tubería se come el error.

## Por entrega

| Entrega | Qué se valida | Dónde |
|---|---|---|
| E1 | Las reglas R01 a R31 (plan §4.1), cada una con su test y su mutante; los centinelas en `stdout` y `stderr`; iniciar sesión, cerrarla, el acceso denegado y la sesión caducada, en Chromium | `apps/api/test/`, `packages/domain/test/access/`, `tests/architecture.test.ts`; capturas |
| E2 | T01 a T38 (plan §4.2); el *loopback* y la variante manual de `atlas remote login` contra el servidor local, con el lanzador de navegador inyectado; la tarjeta de dispositivos con uno revocado y una emisión reciente | `apps/cli/test/remote/`; capturas |
| E3 | `S3LedgerStore` con `ledger-store.contract.ts`; los recorridos de la 014 a través del manejador con el doble de S3; la propiedad ampliada y sus cifras; la salida fiscal byte a byte (predicción escrita antes) | `packages/adapters/test/`, `tests/` |
| E4 | Los tests de P2 y P3, en rojo sin el código; el orden del historial (`git log --oneline`); las pantallas con pendientes, con algo retenido, tras una reescritura, al empezar, al desactivar y al importar o exportar sincronizado, con la privacidad puesta y quitada | capturas a 400×890 DPR 3, a 2045×1141 y a 360 de ancho (`scrollWidth === clientWidth`) |
| E5 | Las órdenes de `atlas admin` y `atlas backup --from-bucket` contra los dobles, con un corte entre cada par de pasos ordenados; los tres procedimientos ejecutados en todo lo que no necesita AWS | `apps/cli/test/admin/`; `specs/015-api-access/runbooks/` |

## El servidor local de las capturas (plan §11)

```bash
npm run build
node tests/dist/support/api/local-server.js --port 0 --data "$SP/015-local-bucket"   # imprime http://127.0.0.1:<puerto>
```

Se abre la URL en el Chromium de `~/.cache/ms-playwright/`, conducido desde el *scratchpad*. En `/__fake-google/authorize` se elige una de las tres cuentas sintéticas. **Nada de este servidor es alcanzable desde el artefacto de producción**, y un test lo comprueba.

## Al cerrar cada entrega

- Se congela un commit y se anota su SHA en `questions.md`.
- `git log origin/develop..feature/015-api-access` sale vacío tras la fusión.
- La entrega siguiente empieza con `git merge origin/develop`.
