# ADR-0022 — Un `settings_changed` registra la configuración vigente **entera**

**Estado:** Aceptada (2026-09-18). Precisa ADR-0018 y protege el supuesto de ADR-0020. Nace de un hallazgo colateral de la revisión de la feature 007 (nota N10).

## Contexto

ADR-0018 estableció que los mapas por tipo de activo (`fiscal_date_rule`, `wash_sale_window`, y ahora `income_category` de ADR-0021) son **parciales**: un tipo ausente toma el valor por defecto documentado. La intención era que cambiar un valor por defecto se propagara solo, sin migrar nada.

Al revisar la 007 se descubrió que **no es lo que ocurre**. `settingsAt` normaliza los mapas al leerlos —rellena los siete tipos— y la interfaz guarda lo que ha leído, así que **cada `settings_changed` escrito materializa el mapa completo**. Un libro real acaba con todos los valores fijados explícitamente, y un cambio futuro del valor por defecto **no le llega**.

Eso ocurría **por accidente**, no por decisión. La pregunta es si se arregla o se adopta.

## La observación que decide

Parece un defecto y, mirado desde la fiscalidad, **es el comportamiento correcto**.

Un cálculo fiscal tiene que ser **reproducible años después a partir del libro y solo del libro**. Si la regla que se aplicó en 2027 fue "el valor por defecto documentado en aquel momento", ese dato **no está en el libro**: está en una versión antigua de un documento. Recalcular 2027 en 2032, con otro valor por defecto, daría una cifra distinta de la presentada **sin que ninguna línea del libro hubiera cambiado**. Es exactamente el desastre que ADR-0020 existe para evitar, entrando por otra puerta: en vez de un `settings_changed` que mueve un ejercicio declarado, sería un cambio en un documento del repositorio.

Dicho de otro modo: la propagación automática de los valores por defecto es cómoda para la configuración y **venenosa** para la fiscalidad. Y esta configuración es fiscal.

## Opciones consideradas

1. **Escribir parches mínimos** (solo lo que el usuario tocó) y dejar que lo ausente tome el valor por defecto en cada lectura. Ventaja: los cambios de valor por defecto se propagan. Inconveniente: un ejercicio ya calculado puede cambiar de cifra porque alguien editó un documento. Inaceptable.
2. **Adoptar lo que ya pasa, y decirlo** (elegida): el libro registra la configuración vigente entera.
3. Registrar el parche **y además** una instantánea de los valores por defecto aplicados. Inconveniente: dos fuentes para lo mismo y más esquema para un beneficio que la opción 2 ya da.

## Decisión

**Un `settings_changed` registra la configuración en vigor completa, con todos los tipos de activo resueltos**, no solo lo que el usuario modificó. Es deliberado y queda escrito.

- **Al leer**, los mapas siguen siendo tolerantes: un tipo ausente toma el valor por defecto documentado (ADR-0018 intacto). Eso mantiene legibles los libros escritos antes de esta decisión y cualquier línea escrita a mano.
- **Al escribir**, se materializa. La interfaz lo dice con todas las letras: guardar la configuración **fija** todos los parámetros, no solo el que se ha tocado.
- **Cambiar un valor por defecto en el código o en la documentación no altera ningún libro ya escrito.** Es una consecuencia buscada: cambiar un criterio para el futuro es un `settings_changed`; no puede ser un *commit* en un documento.
- El aviso que ya existe cuando un cambio de configuración mueve cifras de un ejercicio anterior (y, con ADR-0020, de uno **declarado**) sigue siendo la red que avisa de lo que sí es legítimo hacer.

## Consecuencias

- `docs/data-schema.md` §3 y `docs/business-rules.md` §7 dicen que `settings_changed` es una foto completa, no un parche.
- Las líneas de `settings_changed` crecen. Es irrelevante: son un puñado en toda la vida del libro.
- Se vuelve más fácil: reproducir un ejercicio antiguo sin depender de qué decía un documento aquel año.
- Se vuelve más difícil: propagar un cambio de criterio a un libro existente, que ahora exige un `settings_changed` explícito. **Es lo que se quiere**: un cambio de criterio fiscal debe ser un acto registrado, con fecha, y no un efecto secundario.
- Los seis criterios **en disputa** de `docs/fiscal-questions.md` se benefician directamente: el día que alguno se resuelva, resolverlo no reescribirá en silencio los ejercicios ya calculados.
