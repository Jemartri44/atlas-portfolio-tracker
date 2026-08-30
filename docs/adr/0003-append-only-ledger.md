# ADR-0003 — Libro mayor append-only con lotes como proyección

**Estado:** Aceptada (2026-08-30).

## Contexto

La especificación dice que todo dato derivado debe ser recalculable desde el libro mayor, pero modela `Lot` como entidad almacenada y no dice cómo se corrige una operación mal registrada. En 20 años habrá erratas: un precio con un dígito bailado, una fecha equivocada, una comisión olvidada. La duda del usuario es legítima: *"me da miedo tener un error y no poder editarlo"*.

## Cómo se corrige un error en un libro append-only

La regla es simple: **las operaciones nunca se modifican ni se borran; se rectifican**. Una corrección son dos registros nuevos:

1. Una operación de tipo `reversal` que anula la original (`reverses_transaction_id` apunta a ella).
2. La operación correcta, con `corrects_transaction_id` apuntando a la original.

**Para el usuario esto es transparente.** En la interfaz hay un botón *Editar*: abre el formulario relleno con los datos actuales; al guardar, la app escribe la anulación y la operación nueva en un solo paso. Y hay *Eliminar*: escribe solo la anulación. El usuario edita y borra como en cualquier aplicación; lo que cambia es lo que queda escrito debajo.

Lo que se gana a cambio:

- **Nada se pierde nunca.** Se puede ver qué se registró originalmente, cuándo se corrigió y por qué (campo `notes` obligatorio en la rectificación).
- **Los lotes no se editan a mano.** Como los lotes son una **proyección** (se recalculan desde cero a partir de las operaciones cada vez que hace falta), la corrección se propaga sola: FIFO, posiciones, pesos y fiscalidad salen bien sin tocar nada más. No existe el estado "los lotes dicen una cosa y las operaciones otra".
- **Aviso fiscal automático.** Si la operación rectificada pertenece a un ejercicio fiscal ya declarado, la app lo advierte ("esta corrección afecta a la Renta de 2029, ya presentada"), porque es exactamente el caso en que conviene saberlo.
- **La verificación trimestral de integridad se vuelve trivial:** recalcular la proyección y comparar con la última guardada.
- **La vista por defecto oculta las parejas anuladas** (se ven con un interruptor "mostrar correcciones"), así que el libro no se ensucia visualmente.

Caso concreto — compré 10,5 participaciones a 123,45 € y registré 132,45 €:

```
#41  2027-03-04  buy   FUND-A  10.5 @ 132.45     ← original (queda, marcada como anulada)
#57  2027-03-06  reversal  reverses=#41  notes="precio mal tecleado"
#58  2027-03-04  buy   FUND-A  10.5 @ 123.45  corrects=#41
```

La fecha de #58 es la real de la operación (4 de marzo), no la del día de la corrección; la antigüedad fiscal no cambia.

## Opciones consideradas

### A. Append-only con rectificación (recomendada)

Descrito arriba. Coste de implementación: un tipo de operación más (`reversal`), dos campos de enlace, y que la proyección de lotes ignore las parejas anuladas. La interfaz de *Editar* es la misma que la de alta.

### B. Operaciones editables con registro de auditoría

Se permite modificar y borrar registros; un log aparte guarda quién, cuándo y qué cambió.

**Ventajas:** modelo mental más familiar; menos registros en el libro.

**Inconvenientes:** hay que mantener los lotes coherentes tras cada edición (recalcular o parchear); el log de auditoría es un segundo sistema que puede desincronizarse; borrar es realmente borrar, y un fallo en el log deja sin rastro. La fiscalidad histórica puede cambiar sin que nada lo señale. Toda la garantía depende de que el código de edición sea perfecto.

## Decisión

**Opción A: append-only con rectificación.** La corrección es igual de fácil para el usuario (un botón *Editar*), y a cambio el sistema no puede perder ni corromper el historial. El único caso en que B sería preferible es si se quisiera un libro "limpio" sin registros anulados, y eso lo resuelve el filtro por defecto de la interfaz.

## Consecuencias

- `Transaction.type` incorpora `reversal`; `Transaction` gana `reverses_transaction_id` y `corrects_transaction_id` (opcionales).
- `Lot` deja de ser entidad almacenada: es el resultado de `projectLots(transactions)`. `affected_lots[]` desaparece de `Transaction` (se deriva).
- Regla de la constitución II reforzada: prohibido el borrado físico en el almacén del libro.
- Tests: propiedad "rectificar y volver a rectificar al valor original deja la proyección idéntica a no haber tocado nada".
