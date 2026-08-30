# ADR-0008 — Lint y formato: Biome

**Estado:** Aceptada (2026-08-30). Revisar en la Ronda 7 si la web usa Svelte.

## Contexto

Presupuesto de dependencias estricto (constitución VI) y un solo desarrollador. Biome cubre lint y formato con un paquete; ESLint + Prettier + typescript-eslint necesitan 6-9 paquetes y han obligado a migraciones de configuración entre majors. La única ventaja funcional de ESLint son las reglas con tipos (`no-floating-promises`), que Biome no ofrece; Biome tampoco formatea el marcado de ficheros `.svelte`.

## Decisión

**Biome** como única herramienta de lint y formato para TypeScript, JSON y (cuando exista) JSX de Solid. Un `biome.json` en la raíz, ejecutado en CI y disponible como `npm run lint` / `npm run format`.

- La regla "no `number` en importes" no es de lint: la cubren los tipos de ADR-0005 y un test de contrato.
- El riesgo de promesas sin `await` en `adapters` y `api` se mitiga con `strict` de TypeScript, revisión y tests de integración; si en la práctica aparece, se reevaluará añadir `typescript-eslint` solo a esos paquetes.
- Si la Ronda 7 elige Svelte, se añadirá Prettier + `prettier-plugin-svelte` **exclusivamente en `apps/web`**; con Solid no hace falta nada.

## Consecuencias

- Dependencias de desarrollo en la raíz: `@biomejs/biome`, `typescript`, `vitest`, `fast-check`, `esbuild`, `vite`.
- Formato aplicado en el primer commit de código; el hook de `pre-commit` puede ejecutar `biome check --staged` cuando exista código.
