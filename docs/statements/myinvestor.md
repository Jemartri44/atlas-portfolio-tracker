# Formato de los extractos de MyInvestor

Descripción **estructural** de lo que exporta MyInvestor, para escribir el adaptador `StatementSource` y sus fixtures sintéticas. Sin datos reales: los ficheros originales viven en `~/atlas-private/statements/myinvestor/`. Observado el 2026-08-30 sobre una cuenta recién abierta (sin fondos todavía), así que **la exportación de operaciones de fondos aún no se ha visto**; se completará con la primera suscripción.

## 1. `Movimientos_<desde>_<hasta>.xlsx` — movimientos de la cuenta de efectivo

Una hoja, `Movimientos MyInvestor`. Nueve filas de cabecera con metadatos (titular, número de cuenta, saldo) **que contienen datos personales y deben ignorarse y no copiarse a fixtures**; después una fila de encabezados y las filas de datos.

| Columna (índice) | Encabezado | Tipo observado | Notas |
|---|---|---|---|
| 1 | `Fecha Operación` | texto `DD/MM/YYYY` | Fecha de orden |
| 2 | `Fecha Valor` | texto `DD/MM/YYYY` | Fecha valor |
| 3 | `Movimiento` | texto | Concepto libre; vacío en la apertura |
| 4 | *(sin encabezado)* | vacío | Columna de relleno |
| 5 | `Importe` | número (float en Excel) | Signo según cargo/abono; **leer como cadena decimal**, nunca como float (ADR-0005) |
| 6 | `Saldo` | número | Saldo tras el movimiento; útil para conciliar |

La columna 0 está vacía. El fichero declara un área de impresión `$A:$H` que `openpyxl` avisa pero no impide leer.

Uso previsto: alimentar `cash_deposit` / `cash_withdrawal` / `standalone_fee` de la cuenta de efectivo y conciliar `cashBalances` contra `Saldo`.

## 2. `Extracto cuenta MyInvestor.pdf` — extracto de posición

PDF de cinco páginas con estas secciones. Las tres primeras páginas llevan datos personales (nombre, dirección, DNI, IBAN) que no deben extraerse ni conservarse.

| Sección | Columnas | Uso |
|---|---|---|
| Intervinientes | titular, documento | Ignorar |
| Cuentas | tipo (`Efectivo`, `Valores`), estado, modalidad, número | Mapear los dos números de cuenta a `account_id` internos (fuera del repo) |
| Posición integrada | `Efectivo`, `Inversión`, `Total` en EUR con 4 decimales | Conciliación agregada |
| Detalle últimos movimientos de efectivo | `Fecha operación`, `Fecha valor`, `Operacion`, `Concepto`, `Tipo`, `Importe`, `Saldo` | Igual que el xlsx, con dos columnas más (`Operacion`, `Tipo`); p. ej. `APERTURA` |
| Posiciones | `Código`, `Nombre`, `Divisa`, `Títulos`, `Precio medio posicion`, `Valor de mercado`, `Valor de mercado EUR` | **Es la tabla de conciliación de posiciones**: comparar `Títulos` con `physicalPositions`. `Precio medio` es informativo (no es base fiscal) |
| Tarjetas, Movimientos tarjetas, Créditos y préstamos | — | Fuera del alcance |

Los importes usan coma decimal y símbolo `€` (`0,0000 €`); el parser debe normalizar a cadena decimal con punto.

## 3. Pendiente de observar

- Exportación de **operaciones de fondos** (suscripciones, reembolsos, traspasos internos y externos): qué columnas trae (ISIN, participaciones, valor liquidativo, importe, fechas de orden y valor) y si un traspaso aparece como un movimiento o como dos. Es la entrada principal de `buy`/`sell`/`transfer` del libro `core`.
- Si el PDF de posición admite descarga a una fecha dada (para `valuation` a 31/12).

Cuando se disponga de estos ficheros, actualizar esta página y crear las fixtures sintéticas en `tests/fixtures/myinvestor/`.
