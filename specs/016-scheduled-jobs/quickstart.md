# Guía rápida de validación: `016-scheduled-jobs`

Sin AWS, sin SES real, sin el BCE ni fuentes de precios reales. Todo con dobles y un reloj fijo.

## Requisitos

- Node 22 (`nvm use`), `npm ci` en el worktree.
- `free -m` con al menos 1.500 MB disponibles antes de cada paso pesado (la puerta `016-gate.sh` del *scratchpad* espera).

## Suites

```bash
npx vitest run --project jobs --pool=forks --maxWorkers=1          # apps/jobs: manejador, cortes, centinelas
npx vitest run --project domain --pool=forks --maxWorkers=1 packages/domain/test/jobs
npx vitest run --project repo --pool=forks --maxWorkers=1 tests/jobs-access.test.ts tests/jobs-package.test.ts
npm run test:coverage:domain -- --pool=forks --maxWorkers=1         # 100 % en su propia pasada
npm run build                                                       # incluye jobs.zip y check-bundle
```

## Escenarios que prueban la feature de principio a fin

1. **El recordatorio sin importes** (E1): el guion `016-exercise.mjs` del *scratchpad* compone la función de correo con un libro sintético sembrado de centinelas, el interruptor en `off` y el `Notifier` de fichero; el correo queda en `…/scratchpad/016-mail/` y **ningún centinela aparece**. Con `on`, aparecen solo las cifras de `contracts/mail.md` §1.
2. **Idempotencia** (E1): el mismo evento dos veces seguidas → un solo recordatorio; un corte simulado entre enviar y cerrar → dos correos con el mismo asunto; un aviso cortado tras `sending` → ninguno más.
3. **Los datos del día** (E2): la función de precios con la fuente simulada y `ATLAS_ENV=dev` escribe `prices/` en el doble de S3; con `ATLAS_ENV=prod` no arranca.
4. **La consola bebe de la nube** (E3): `atlas prices update` en una carpeta sincronizada contra el servidor local de la 015 → ninguna llamada a las fuentes (los dobles fallan si se les llama).
5. **El volcado** (E4): dos ejecuciones del mismo mes → los mismos objetos, ninguno sobrescrito.

Salida esperada de cada escenario: la del test que lo ata (plan §4).
