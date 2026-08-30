# ADR-0004 — Efectivo: saldos derivados por cuenta, colchón bancario fuera de alcance

**Estado:** Aceptada (2026-08-30).

## Contexto

La especificación incluía `cash_deposit` y `cash_withdrawal` pero no definía un saldo de efectivo por cuenta, y la vista consolidada mencionaba un "colchón" bancario que no pertenecía a ningún libro. Conciliar con IBKR exige conocer el efectivo de la cuenta.

## Opciones consideradas

1. **Saldo derivado por cuenta de inversión + libro `cash` para el colchón bancario.** Patrimonio total completo, pero obliga a registrar movimientos bancarios ajenos a la inversión.
2. **Solo saldos derivados de las cuentas de inversión; el colchón bancario fuera de la app.** Patrimonio total = núcleo + cubo + efectivo de esas cuentas.

## Decisión

Opción **2**. El efectivo de cada cuenta de inversión (`Account.cash_balance`) es un valor **derivado** de `cash_deposit`, `cash_withdrawal`, compras, ventas, dividendos y comisiones, y se usa para conciliar con el bróker y para la vista de patrimonio. No existen cuentas bancarias puras ni un libro `cash`; el colchón se gestiona fuera de la aplicación.

## Consecuencias

- `docs/specification.md` §3.2 y §4.1 actualizados; `CLAUDE.md` idem.
- La conciliación con IBKR compara posiciones **y** efectivo.
- Si en el futuro se quisiera incluir el colchón, bastaría con añadir un `book: cash` y cuentas sin activos; no requiere cambios de esquema.
