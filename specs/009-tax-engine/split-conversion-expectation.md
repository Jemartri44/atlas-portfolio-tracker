# Predicción: un split entre la venta con pérdida y la recompra se convierte, no se ignora

**Escrita antes de tocar el código** (tercera tanda, punto 2, decisión de la dirección). Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Qué cambia

Hasta ahora (decisión A12), una compra posterior a la pérdida con un `scale` del mismo activo entre las dos quedaba **fuera** de la regla, con solo la nota `tax_scale_in_window`: −200 computable donde son 0, la dirección agresiva y sin pasar por los dudosos.

Un split no cambia la homogeneidad: lo recomprado después es el mismo valor. El motor **convierte** las unidades de la compra a las de la venta con la razón de cada `scale` que haya entre las dos (20 títulos tras un 2:1 equivalen a 10 de antes) y aplica la regla con normalidad:

- El diario de lotes guarda en cada entrada `scale` la **razón exacta** del evento (`"2"`, `"1/4"`), además de la cantidad resultante. Con ella la conversión siempre se puede hacer; no hay caso en que falte la razón. Si la división no es exacta (un 3:1 sobre 20 títulos), se redondea a diez decimales, como cualquier otro reparto (ADR-0005).
- Lo disponible de esa compra se mide en unidades de la venta. Lo que se le asigna, y lo que ya usaron pérdidas anteriores (#19), se guarda en las unidades de la propia compra. Así el reparto sobre sus lotes y la regla de «cada unidad difiere una vez» siguen siendo los de siempre.
- En el informe, la línea de lo diferido dice las unidades en las de la venta («10 de 10»), y la adquisición, en las suyas («20»).
- Desaparecen `scale_excluded` y la nota `tax_scale_in_window`, con sus traducciones en la CLI y en la web.
- Un `scale` **anterior** a la venta no cambia nada: la venta y sus compras previas ya se miden en las mismas unidades.

## Qué se mueve en los *fixtures*

**Nada.**

- `synthetic-v1.tax.json`: el libro sintético tiene dos `scale`. Uno es el contrasplit de `ast_gold` (`01MQTWHB78RC2FADH9B774BHS5`), cuyo `scale` va **antes** de su propia venta en efectivo en el mismo evento; ninguna compra de `ast_gold` viene después. El otro es el split de `ast_gamma` (`01N3ZPHV80XRV9N73JYFHACMNJ`), un activo que nunca se vende con pérdida. Ninguna pérdida del libro tiene un `scale` entre ella y una compra de su ventana, y no hay ninguna nota `tax_scale_in_window` en el fichero.
- `synthetic-v1.snapshot.json`: el diario de lotes no está en la instantánea.
- `tax-hand-v1.jsonl`: su contrasplit (`RS`, 2021-10-01) va antes de su venta en efectivo y después de la ventana de `SX1`. Sus cifras no cambian.
