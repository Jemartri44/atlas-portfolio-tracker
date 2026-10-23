# Pendientes que dejaron las predicciones y las notas de 009 a 011

Lo que las predicciones (`*-expectation.md`) y las notas de implementación de las features 009, 010 y 011 decían y **no está en `docs/business-rules.md`, `docs/fiscal-questions.md`, `docs/data-schema.md`, ni en un test**. El resto se borró: ya está en esos documentos, en los tests o en los dorados `tests/fixtures/ledger/synthetic-v1.*`. Cada punto espera la ronda fiscal o a la persona; no se pasa a las reglas desde aquí. El texto original está en el historial de git (`git log --follow -- specs/010-tax-output/implementation-notes.md`).

## Fiscales

1. **Criterio #17, tercera lectura.** Que la comisión de una permuta **no se deduzca nunca**: el riesgo dejaría de ser un desfase temporal y pasaría a ser permanente. Y la pista del manual del Modelo 100 sobre repartirla entre las dos patas. (De `criteria-labels-expectation.md`.)
2. **`windowCriterion` con un ETC declarado capital mobiliario** recibe `2:listed` y una alternativa de un año que el art. 25.2 no contempla. Falta el **test de definitividad**: una transmisión solo libera el diferimiento si ella misma es definitiva (DGT V3282-18 y Manual práctico de Renta 2025, capítulo 11, texto de marzo de 2026), con la ventana del propio activo.
3. **Criterio #21**: la cita del art. 35 en las líneas de capital mobiliario y la atadura de las comisiones a valores negociables.
4. **Recompra con #19**: con la pérdida ya cubierta, hay avisos de recompra que no difieren nada (diez de doce en el sintético de entonces). El aviso no puede saberlo sin repetir el reparto del motor; dejar de emitirlos exigiría mover ese reparto a la proyección. Decisión de diseño no tomada. (De `warnings-expectation.md`.)

## De código y de interfaz

5. La web no alcanza `wash_sale_transfer_counts`: Configuración no tiene control booleano. La consola ya lo cubre.
6. `priorYear` / `isPriorYear` (dominio) sigue vivo porque la web lo usa en el flujo de rectificación; el aviso de ejercicio declarado lo sustituye conceptualmente.
7. La tarjeta fiscal del Resumen y `/fiscal` proyectan el libro por su cuenta; nadie ha medido su coste con la CPU frenada ×4.
8. Las dos interfaces tienen su propia lista de nombres de criterios (`CRITERION_LABELS` en la consola, `CRITERION_NAMES` en la web); el tipo garantiza que no falte ninguno, nada que digan lo mismo.
9. La guarda `invalidCount() === 0` de `apps/web/src/routes/fiscal/index.tsx` es defensa en profundidad deliberada (su mutante es equivalente).
