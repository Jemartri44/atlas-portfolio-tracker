# ADR-0020 — El libro deja constancia de lo declarado: `tax_return_filed`

**Estado:** Aceptada (2026-09-18). Cierra la Ronda 9 en su parte estructural y desbloquea la Fase 5. Nace del hallazgo 2 del *challenge* 3.

## Contexto

El libro sabe todo lo que ha pasado en la cartera y no sabe **nada de lo que se ha declarado**. Parece un detalle administrativo y no lo es: rompe tres cosas a la vez.

1. **Un cambio de configuración reescribe en silencio un ejercicio presentado.** `fiscal_date_rule` y la ventana de recompra son configurables por diseño (ADR-0013), y cambiarlos mueve ganancias de un año a otro. Si la Renta de 2027 ya se presentó, cambiar el criterio en 2029 hace que la aplicación afirme una cifra de 2027 distinta de la que consta en Hacienda, sin que nada lo señale. La feature 005 mitigó la mitad —`atlas settings set` ya avisa cuando un cambio mueve ganancias de un ejercicio anterior— pero *anterior* no es lo mismo que *declarado*: no todo ejercicio pasado se ha presentado, y el aviso no sabe distinguirlos.
2. **La regla de los 20.000 € del Modelo 720 no es calculable.** La norma dice que solo se repite la declaración si una categoría sube más de 20.000 € **sobre la última presentada** (`business-rules.md` §5.8). Sin saber qué se presentó y con qué valor por categoría, la aplicación no puede responder a la única pregunta que importa: "¿tengo que volver a declarar este año?".
3. **El arrastre de pérdidas a cuatro ejercicios no tiene ancla.** El saldo pendiente de compensar viene del ejercicio anterior *tal y como se declaró*, no de lo que la aplicación recalcularía hoy con otros criterios.

Pesan además dos restricciones del proyecto. El libro es **append-only** (ADR-0003): nada se edita ni se borra. Y el principio de diseño dice que **todo valor derivado debe ser recomputable**; hay que explicar por qué esto no lo contradice.

**La observación que resuelve el diseño:** lo declarado **no es un valor derivado, es un hecho**. Es un acto con consecuencias legales, ocurrido en una fecha, con unas cifras concretas que constan en un registro externo. Pertenece a la misma familia que un extracto del bróker: se guarda tal cual, no se recalcula. Que la aplicación recompute hoy lo que diría de ese ejercicio y lo **compare** con lo presentado no es un error: es exactamente la información que el usuario necesita para decidir si le toca una complementaria.

## Opciones consideradas

1. **No registrar nada** (situación actual). Ventaja: cero trabajo. Inconveniente: los tres problemas de arriba, y el peor es silencioso — la aplicación afirma con total aplomo una cifra que no coincide con la presentada.
2. **Una marca "el ejercicio X está declarado"**, sin cifras. Ventaja: barata y resuelve el aviso de cambio de criterio. Inconveniente: no resuelve ni el 720 ni el arrastre de pérdidas, que necesitan **cuánto** se declaró, no solo **si**.
3. **Guardarlo fuera del libro** (en `Settings` o en un fichero aparte). Inconveniente: contradice que el libro sea la fuente de verdad, se queda sin las garantías de append-only y sin el versionado de esquema, y se pierde en la primera copia de seguridad que se haga mal.
4. **Un evento `tax_return_filed` con las cifras presentadas** (elegida).

## Decisión

Se añade el evento **`tax_return_filed`** al esquema del libro, con estas propiedades:

- **Es un documento administrativo, no un hecho de negocio.** Como las tesis, se proyecta en la pasada A y **se filtra por su propia fecha de presentación** (`filed_at`), no por el corte de `asOf` aplicado a fechas de negocio. Esta regla ya está generalizada en ADR-0016 y se dice aquí explícitamente porque la clase de defecto contraria ya se coló una vez.
- **Distingue el modelo**: `renta`, `720` o `721`. No son intercambiables — la regla de los 20.000 € compara con el último **720** presentado, no con la última Renta— y cada uno guarda cifras distintas.
- **Guarda lo presentado, no lo calculado.** Para la Renta: el saldo de la base del ahorro, las **pérdidas pendientes de compensar por ejercicio de origen** y las pérdidas que siguen diferidas por recompra a 31/12. Para el 720 y el 721: el valor declarado **por categoría** (cuentas, valores, inmuebles, criptoactivos), porque el umbral y la regla de repetición son por categoría.
- **Guarda también la huella del libro y las cifras que la aplicación calculaba ese día.** Con eso, años después, se puede decir con precisión "el libro ha cambiado desde que presentaste esto" y en qué.
- **Conserva su fuente documental**, como cualquier evento que remite a un papel externo: la referencia del justificante.
- **Una complementaria es un `tax_return_filed` nuevo**, con `supersedes` apuntando al anterior. **No es un `reversal`**: una anulación significa "esto nunca ocurrió", y la primera declaración sí ocurrió. Un `reversal` se reserva para lo que de verdad fue un error de registro — haber anotado una presentación que nunca se hizo.

> **Enmienda del 2026-09-18 (misma fecha).** Las pérdidas pendientes de compensar se guardan **separadas por categoría de renta** (ganancias y pérdidas patrimoniales por un lado, rendimientos del capital mobiliario por otro) además de por ejercicio de origen, porque **compensan de forma distinta** (art. 49 LIRPF). El texto original no las separaba. Lo detectó el implementador del motor fiscal al planificar; se corrige el mismo día.

Y cambia el comportamiento de la proyección en un punto:

- Un ejercicio con presentación registrada queda **cerrado**. Registrar un evento cuya fecha fiscal cae en un ejercicio cerrado **no se rechaza** —puede ser legítimo y a veces obligatorio— pero **avisa**, diciendo qué declaración habría que rectificar. Lo mismo con un `settings_changed` que mueva cifras de un ejercicio cerrado: es el aviso de la 005, ahora capaz de distinguir *pasado* de *declarado*.

**Momento:** el esquema se fija ahora; la implementación va en la **Fase 5**, junto al motor fiscal, porque las cifras que guarda el evento son literalmente la salida de ese motor. Escribirlo antes sería inventar el formato de algo que todavía no se calcula.

*Criterios fiscales implicados: son los ya fijados en `docs/fiscal-questions.md` (sobre todo el 11, Modelo 720, y el 10, compensación de pérdidas), con la certeza que allí se declara. Este ADR no decide ninguno nuevo.*

## Consecuencias

- `docs/data-schema.md` §3 pasa a describir `tax_return_filed` como evento definido, no como previsto. Sube a **24 tipos de evento**.
- La Fase 5 lo implementa: el motor fiscal produce las cifras, el usuario confirma lo que realmente presentó, y el evento las congela.
- El aviso de `atlas settings set` gana precisión: deja de decir "mueve ganancias de un ejercicio anterior" y pasa a decir "mueve ganancias de un ejercicio **declarado el tal**, habría que valorar una complementaria".
- El Modelo 720 se vuelve calculable de verdad, incluida la regla de los 20.000 €, que hasta ahora estaba escrita en `business-rules.md` sin que nada pudiera evaluarla.
- Se vuelve más fácil: contestar "¿qué cambió desde que declaré?" y sostener el arrastre de pérdidas a lo largo de los cuatro ejercicios.
- Se vuelve más difícil: hay un paso manual nuevo —registrar lo presentado— que el usuario tiene que hacer una vez al año. Es inevitable: la aplicación no tiene forma de saber qué se envió a la Agencia Tributaria, y fingir que sí lo sabe sería peor.
- **Aceptado a sabiendas:** si el usuario no registra su declaración, el sistema se queda como está hoy, sin avisos y sin la regla de los 20.000 €. Los avisos lo recuerdan; nada lo obliga.
