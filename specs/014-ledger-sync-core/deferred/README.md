# P2 y P3 de la web, aplazados a la feature 015

Decisión de la dirección del 2026-09-25 (D-Q17, `../questions.md` §12): la negativa a importar en una web sincronizada (§6.2 P2) y lo retenido en la exportación de la web (§6.2 P3) **pasan a la 015**, sin subir el tope del arranque. En la 014 la sincronización no se puede configurar en producción, así que en la web todavía no protegen nada.

**Requisito duro para la 015: no puede permitir configurar la sincronización en la web sin P2 y P3 dentro.**

`p2-p3-web.patch` es el trabajo hecho y probado en la 014, fuera de la rama activa: `replaceLedgerText` lee el estado de la sincronización en su misma transacción y se niega con `import_refused_synced`; `exportLedgerAndHeld` devuelve el libro byte a byte y, aparte, lo retenido sin resolver, que la web descarga como `ledger.held.jsonl`; y su test (`packages/adapters/test/sync/transfer-sync.test.ts`). Con él, el arranque midió 75.861 bytes (+158 sobre `develop` antes de la 014): el coste es la tabla de precargas de la entrada, por un fragmento del dominio de la sincronización compartido entre dos fragmentos perezosos. Se aplica con `git apply` sobre la rama de la 014; la 015 lo presupuesta con su propia medida.

En la consola, P2 y P3 ya están en la 014 (`atlas compact` y `atlas backup`).
