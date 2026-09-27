# Cómo se comprueba: `020-visual-refresh`

Todo desde el worktree `.claude/worktrees/020-visual-refresh`, con `free -m` antes de cada paso pesado (`available` ≥ 1.500 MB) y nunca dos a la vez.

## 1. La tubería (cada entrega)

```bash
npm run lint > "$S/020-lint.log" 2>&1; echo $?          # 0
npm run typecheck > "$S/020-tsc.log" 2>&1; echo $?      # 0
npm run test:coverage:domain -- --pool=forks --maxWorkers=1   # umbral del 100 % del dominio
npm run test:others -- --pool=forks --maxWorkers=1
npm run build > "$S/020-build.log" 2>&1; echo $?        # incluye check-bundle.mjs
"$S/020-measure.sh" "$PWD"                               # EXACT boot=… total=…
```

(`npm run test:coverage -- …` solo pasa las opciones a la segunda pasada: se corren por separado.)

## 2. El color (E1)

`npx vitest run apps/web/test/palette.test.ts apps/web/test/palette-usage.test.ts --pool=forks --maxWorkers=1`: los tres bloques, ΔE (ver [`research.md`](research.md) R3), contraste, pares, alias. Recalcular a mano: `node "$S/020-cvd.mjs"`.

## 3. La salida fiscal (E2 y E4)

La predicción en `questions.md` antes de la suite; después, sobre `synthetic-v1`, `tax --lots`, `tax --boxes`, `tax --json`, `gains`, `income`, `m720`, `m721` y `filed`, comparados byte a byte con la salida de `develop`. `git diff origin/develop -- tests/fixtures` vacío.

## 4. Las capturas y las medidas

```bash
CH=$(ls -d ~/.cache/ms-playwright/chromium-* | sort -V | tail -1)/chrome-linux64/chrome
(cd apps/web && npx vite preview --port 4320 --strictPort) &      # la compilación a capturar
node "$S/020-capture.mjs" "$CH" ~/personal/atlas/privado/capturas/<fecha>-020-E<n>/<antes|despues> \
  http://localhost:4320 "$S/020-synth/ledger.jsonl"
```

Resultado esperado en `medidas.json` (ver [`plan.md`](plan.md) §8): sin desplazamiento lateral a 360, 400, 1.440 y 2045; el cuerpo cambia entre 1.799 y 1.800 (desde E1); el borde de la evolución ≤ 1.141 a 2045×1141 (desde E1); el ancla bajo la barra (desde E1); nada salta en el primer pantallazo del Resumen (desde E2).

## 5. Los relojes

Las suites de la web y del dominio con `TZ=Pacific/Kiritimati` y con `TZ=Pacific/Pago_Pago`, y en la pasada del reloj falseado (31/12 23:30 y 01/01 00:30): el mismo resultado.

## 6. Al cerrar cada entrega

- Gemelos `.js`: ninguno fuera de `dist*/` (orden y salida en `questions.md`).
- Nombres de test de `develop` frente a los de la rama: ninguno desaparece sin una línea en `questions.md`.
- Cada commit que toca `apps/web/`, `packages/domain/src/` o `check-bundle.mjs` construye en verde por sí solo (worktree desacoplado, en secuencia).
