# Recorrido manual — feature `006-web-shell`

Lo que hay que poder hacer a mano al terminar, en este orden. Es el criterio §5 del prompt convertido en guion; cada paso se anota con su resultado en la tarea de cierre.

## 0. Preparar un libro de pruebas (nunca el real)

```bash
cd ~/projects/atlas-portfolio-tracker-006
nvm use && npm ci
npm run build                                  # dominio, adaptadores, CLI y web

mkdir -p /tmp/atlas-demo
cp tests/fixtures/ledger/synthetic-v1.jsonl /tmp/atlas-demo/ledger.jsonl
node apps/cli/dist/main.js --ledger /tmp/atlas-demo/ledger.jsonl check --deep
node apps/cli/dist/main.js --ledger /tmp/atlas-demo/ledger.jsonl networth --date 2029-06-30
```

El *golden* sintético tiene 200 eventos, cuatro cuentas (tres del núcleo y una del cubo), quince activos, nueve tesis y un evento anulado: sirve para todas las pantallas. Se copia a `/tmp` porque la aplicación va a **escribir** en él.

## 1. Arrancar la web

```bash
npm run dev -w @atlas/web     # o npm run dev desde la raíz
```

Se abre `http://localhost:5173`. `localhost` es contexto seguro, así que la File System Access API y el *service worker* funcionan igual que en producción.

**Se comprueba**: la aplicación arranca en `/libro` porque no hay libro configurado, **no** en un Resumen de ceros.

## 2. Abrir el libro del disco (Chrome o Edge de escritorio)

1. "Abrir la carpeta de mi libro" → se elige `/tmp/atlas-demo`.
2. La aplicación carga `ledger.jsonl` de esa carpeta y va al Resumen.

**Se comprueba**: el chip de la cabecera dice `ledger.jsonl · atlas-demo`. El Resumen muestra el patrimonio **desglosado** (núcleo por clase, cubo por posición, efectivo por cuenta y divisa) con la misma cifra que imprimió `atlas networth` en el paso 0, y la marca de parcialidad si falta algún precio.

## 3. Cerrar la pestaña y volver

Se cierra la pestaña y se abre de nuevo `http://localhost:5173`.

**Se comprueba**: la aplicación recuerda **cuál** era la carpeta y pide reconectar con un botón (el permiso no sobrevive al cierre de todas las pestañas: `research.md` §4). Un clic en "Reconectar" y el libro vuelve, sin tener que volver a buscar la carpeta.

## 4. El Resumen responde "¿cómo va y hay algo que hacer?"

**Se comprueba**, sin desplazarse: total y tres subtotales, recuento de lo que reclama atención. Desplazándose: cada aviso con su texto en español y su enlace, y los cinco últimos movimientos.

**Se comprueba el fallo seguro**: se borra a mano la última `valuation` de un activo del libro de pruebas (con `atlas delete <id> --reason …`, que es la forma correcta), se recarga la web y la fila de ese activo pasa a "sin precio", el total se marca **parcial** y aparece el aviso con enlace a registrar la valoración. Ningún cero.

## 5. Movimientos responde "¿qué he registrado?"

1. Se abre Movimientos: 200 eventos en orden cronológico inverso, veinte visibles.
2. Se filtra por tipo "Compra" y por la cuenta del cubo; la URL refleja los filtros; el recuento dice cuántos quedan.
3. Se busca por texto un `broker_ref` del libro y aparece su evento.
4. Se abre el evento **anulado** del *golden*: se muestra como **anulado**, con enlace a su anulación.
5. Se abre un evento corporativo: se lista y se lee con normalidad aunque la web no sepa registrarlo.

**Se comprueba**: el botón atrás del navegador deshace el último filtro y después vuelve al Resumen.

## 6. Registrar una compra (el paso que escribe)

1. Se pulsa el acceso destacado a registrar → "Compra".
2. Se eligen cuenta y activo de la lista (no se teclea ningún identificador), fecha con el selector nativo, cantidad y precio con teclado numérico, comisión, divisa EUR (el tipo de cambio no se pregunta).
3. Se pide la vista previa: se ve el evento tal como se va a escribir y **el efecto**: posición antes y después, lotes antes y después, y los avisos que levante.
4. Se confirma.

**Se comprueba, fuera de la aplicación**:

```bash
tail -2 /tmp/atlas-demo/ledger.jsonl
wc -l /tmp/atlas-demo/ledger.jsonl                # 201
node apps/cli/dist/main.js --ledger /tmp/atlas-demo/ledger.jsonl check --deep
node apps/cli/dist/main.js --ledger /tmp/atlas-demo/ledger.jsonl positions
```

El fichero tiene **una línea más**, las 200 anteriores están **byte a byte** intactas (`git diff --no-index` contra la copia original lo muestra), `check --deep` no encuentra hallazgos nuevos y la posición refleja la compra.

**Se comprueba la huella repetida**: se repite exactamente la misma compra; la aplicación avisa de la repetición, nombra el evento anterior y exige confirmación explícita.

**Se comprueba el conflicto**: con la web abierta, se registra algo desde la CLI (`atlas add cash-in …`) y después se confirma la operación pendiente en la web: aparece el conflicto, la web recarga y vuelve a ofrecer la vista previa. El fichero **no** se pisa.

**Se comprueba la regla 15**: se intenta una compra en la cuenta del cubo sin elegir tesis; la aplicación exige una tesis abierta de ese par y, si no hay ninguna, dice cómo crearla con la CLI.

## 7. Rectificar

Se corrige la cantidad de la compra recién registrada, con su motivo.

**Se comprueba**: el fichero gana **dos** líneas (anulación y corregido), el detalle del original queda marcado como anulado, y `atlas check --deep` sigue limpio. Se intenta después anular una compra que ya fue vendida en el *golden*: se rechaza listando los dependientes.

## 8. Ajustes y verificación

1. Se sube `deviation_threshold_pp` por encima de una desviación activa: la aplicación lista los avisos que se apagan y pide confirmación.
2. Se cambia `fiscal_date_rule` de un tipo de activo: si mueve ganancias de un ejercicio anterior, lo muestra con el antes y el después.
3. Se abre la verificación: `integrity` sin hallazgos; la comprobación profunda tampoco.
4. Se exporta el libro y se compara con el fichero del disco: idéntico.

## 9. El teléfono (o el navegador estrecho)

Con el navegador a **360 px** de ancho (o un teléfono real en la red local):

1. Se importa `ledger.jsonl` desde el selector de ficheros: el libro queda en el almacenamiento del navegador.
2. Se recorren **todas** las pantallas.

**Se comprueba**: cero desplazamiento horizontal en todas ellas; los objetivos táctiles miden 44 px; la barra inferior está al alcance del pulgar y **no** hay una segunda navegación; el chip dice "almacenamiento del navegador" y, si no se ha exportado, avisa; el modo privacidad está activado y los importes salen enmascarados mientras las cantidades y los porcentajes siguen legibles.

## 10. Instalar y sin conexión

1. Se instala la aplicación desde el navegador.
2. Se activa el modo avión.

**Se comprueba**: la aplicación abre, el Resumen se pinta y se puede **registrar** una compra. Y en el panel de red, en una carga normal: **ni una** petición a un origen ajeno.

## 11. Cerrar

```bash
npm run clean && npm run build    # desde cero
npm run lint && npm run typecheck && npm test
```

Y se anotan en `plan.md` (sección *Mediciones*) el tamaño del *bundle* medido, el tiempo de carga en el móvil real y cualquier número que haya salido peor de lo esperado.
