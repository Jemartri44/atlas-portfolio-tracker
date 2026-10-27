# Pendientes que dejaron las predicciones y las notas de 009 a 011

Lo que las predicciones (`*-expectation.md`) y las notas de implementación de las features 009, 010 y 011 decían y **no está en `docs/business-rules.md`, `docs/fiscal-questions.md`, `docs/data-schema.md`, ni en un test**. El resto se borró: ya está en esos documentos, en los tests o en los dorados `tests/fixtures/ledger/synthetic-v1.*`. Cada punto espera la ronda fiscal o a la persona; no se pasa a las reglas desde aquí. El texto original está en el historial de git (`git log --all -- 'specs/0*/*-expectation.md' specs/010-tax-output/implementation-notes.md` y `git show <commit>^:<ruta>`).

## Fiscales

4. **Recompra con #19**: con la pérdida ya cubierta, hay avisos de recompra que no difieren nada (diez de doce en el sintético de entonces). El aviso no puede saberlo sin repetir el reparto del motor; dejar de emitirlos exigiría mover ese reparto a la proyección. Se deja así (coordinadora, 2026-10-26: es diseño, no fiscal; el cálculo del año ya aplica el #19 bien). (De `warnings-expectation.md`.)

## De código y de interfaz

5. La web no alcanza `wash_sale_transfer_counts`: Configuración no tiene control booleano. La consola ya lo cubre.
6. `priorYear` / `isPriorYear` (dominio) sigue vivo porque la web lo usa en el flujo de rectificación; el aviso de ejercicio declarado lo sustituye conceptualmente.
7. La tarjeta fiscal del Resumen y `/fiscal` proyectan el libro por su cuenta; nadie ha medido su coste con la CPU frenada ×4.
8. Las dos interfaces tienen su propia lista de nombres de criterios (`CRITERION_LABELS` en la consola, `CRITERION_NAMES` en la web); el tipo garantiza que no falte ninguno, nada que digan lo mismo.
9. La guarda `invalidCount() === 0` de `apps/web/src/routes/fiscal/index.tsx` es defensa en profundidad deliberada (su mutante es equivalente).
