# ADR-0021 — Previsiones del esquema para la Fase 5: guardar el dato sin decidir el criterio

**Estado:** Aceptada (2026-09-18). Consecuencia directa de la revisión adversarial de `docs/fiscal-questions.md` (PR #41). Se apoya en la ventana que abre ADR-0018 y la cierra.

## Contexto

La revisión adversarial de los criterios fiscales dejó seis **en disputa** y sacó a la luz una mecánica entera que ninguno cubría (si un ETC de oro genera ganancia patrimonial o rendimiento del capital mobiliario). Ninguna de esas dudas puede resolverla la dirección: no hay asesor fiscal, y sustituir una lectura no verificada por otra no es progreso.

Pero **las dudas no bloquean por sí mismas**. El proyecto ya sabe convivir con criterios fiscales no resueltos: la regla de la fecha fiscal y la ventana de recompra son configuración (`fiscal_date_rule`, `wash_sale_window`), y cambiarlas es un `settings_changed`, no un despliegue (ADR-0013). Lo que sí bloquea es otra cosa: **el libro no guarda los datos que harían falta para aplicar cualquiera de las dos lecturas.** No se puede aplicar una ventana distinta a un valor del Nasdaq y a uno de Fráncfort si el catálogo no guarda dónde cotiza ninguno de los dos.

Son nueve huecos, y todos comparten la misma economía: **guardarlos hoy es gratis y añadirlos después es carísimo**, porque exige migrar un libro con años de operaciones y, en varios casos, información que ya no se puede reconstruir (¿dónde cotizaba aquel valor que se excluyó de cotización en 2029?).

Hay además una ventana que se cierra sola. **ADR-0018** permite endurecer una validación dentro de la v1 **solo mientras el libro real esté vacío**, porque el cargador juzga las líneas viejas con las reglas de hoy y endurecer con datos dentro deja el libro entero ilegible. El libro real está vacío **hoy**, y deja de estarlo el día que el usuario registre su primera operación de verdad — que será cuando la web esté terminada, es decir, dentro de poco.

## Opciones consideradas

1. **Esperar a resolver las dudas fiscales.** Ventaja: no se toca el esquema con información incompleta. Inconveniente: las dudas dependen de una revisión profesional que no tiene fecha, mientras la ventana de ADR-0018 se cierra con el primer evento real. Es esperar a lo incierto sacrificando lo cierto.
2. **Decidir ahora los criterios en disputa y modelar solo la respuesta elegida.** Inconveniente: es exactamente lo que la revisión acaba de demostrar que sale mal, y deja el esquema sin forma de representar la otra lectura.
3. **Guardar el dato sin decidir el criterio** (elegida). El esquema gana la capacidad de expresar las dos lecturas; cuál se aplica es configuración, como ya lo son la fecha fiscal y la ventana de recompra.

## Decisión

Se añaden al esquema las nueve previsiones de abajo. **Ninguna decide una pregunta fiscal**: cada una permite responderla en cualquiera de los dos sentidos. Todas son **compatibles** en el sentido de ADR-0018 (campos opcionales y tipos de evento nuevos) salvo la novena, que es un endurecimiento y por eso se hace **ahora**.

| # | Previsión | Forma | Qué desbloquea |
|---|---|---|---|
| 1 | **Categoría de renta por tipo de activo** | `Settings.income_category: Record<AssetType, "capital_gain" \| "movable_capital">`, **por defecto `capital_gain` para todos** (el comportamiento de hoy) | Que un ETC pase a rendimiento del capital mobiliario sin tocar código. Mismo patrón que `fiscal_date_rule` |
| 2 | **Mercado donde cotiza** | `asset_created.market?` (código MIC o nombre), opcional | Ventana de recompra distinta dentro y fuera de la UE; valoración del 720 |
| 3 | **Domicilio del emisor** | `asset_created.issuer_country?` (ISO 3166-1 alfa-2), opcional | Art. 95 LIRPF (jurisdicciones no cooperativas); clasificación 720/721 |
| 4 | **Naturaleza de la comisión suelta** | `standalone_fee.fee_kind?`: `custody \| administration \| connectivity \| discretionary_management \| other`, por defecto `other` | Deducir del rendimiento del capital mobiliario lo que permite el art. 26.1.a) y no lo demás |
| 5 | **Retención en venta forzosa** | `forced_sale.withholding?`, misma forma que `sell.withholding` | Liquidación de fondo, venta de derechos, ETC en bróker español |
| 6 | **Renta en especie sin transmisión** | `grant` gana `income_eur?` e `income_base?`: `general \| savings` | Fork y airdrop a valor de mercado; acciones de una escisión no amparada; dividendo en especie. Hoy `grant` crea lotes pero no declara renta, y no existe la noción de base general |
| 7 | **Permuta de un activo por otro** | Tipo de evento `swap`, con la regla del art. 37.1.h (**el mayor** entre el valor de mercado de lo entregado y de lo recibido) | Cripto por cripto, que hoy no tiene evento: `fx_exchange` es solo para divisas |
| 8 | **Régimen de neutralidad** | `corporate_action.neutrality_regime?: boolean` | Decide si una fusión es `convert` (diferimiento) o permuta plenamente sujeta. Hoy el usuario elige las primitivas y el libro no registra por qué |
| 9 | **`fx_rate_date` pasa a obligatorio** en `cash_deposit`, `cash_withdrawal` y `standalone_fee` | Endurecimiento, permitido por ADR-0018 **solo mientras el libro real esté vacío** | Lotes de divisa reproducibles, sin los cuales el FIFO por divisa del criterio 4 no es computable |

**Momento.** Las nueve se implementan **antes de que el usuario registre su primera operación real**, es decir, junto a la Fase 5 o antes si la web se termina primero. La novena es la que manda el calendario: pasado ese punto, endurecer `fx_rate_date` deja de ser posible dentro de la v1 y pasa a exigir `schema_version = 2` y migración.

**Lo que esta decisión NO hace.** No resuelve ninguno de los criterios en disputa de `docs/fiscal-questions.md`, no cambia ninguna cifra que el sistema calcule hoy, y no presupone qué contestará una revisión profesional. Los valores por defecto están elegidos para que **el comportamiento actual no varíe**: si nadie toca nada, el sistema calcula exactamente lo que calculaba.

## Consecuencias

- `docs/data-schema.md` incorpora las nueve previsiones; los tipos de evento suben a **25** (entra `swap`).
- La Fase 5 puede escribirse tratando las dudas como configuración, que es como el proyecto ya trata la fecha fiscal y la ventana de recompra.
- Se vuelve más fácil: responder a una revisión profesional con un `settings_changed` en vez de con una migración.
- Se vuelve más difícil: hay más campos que rellenar al dar de alta un activo. Se mitiga dejándolos **opcionales** (salvo el 9) y pidiéndolos solo donde aportan.
- **Riesgo asumido:** se añade estructura para mecánicas que quizá nunca se usen (la permuta cripto-cripto, si el usuario se queda en ETP). Es deliberado y es la excepción justificada al principio de no añadir nada por añadir: el coste de tenerlo y no usarlo es un campo opcional vacío; el de no tenerlo y necesitarlo es una migración del libro.
- La ventana de ADR-0018 **se cierra** con esta decisión: después de esto, cualquier endurecimiento exige `schema_version = 2`.
