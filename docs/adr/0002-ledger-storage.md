# ADR-0002 — Almacenamiento del libro mayor

**Estado:** Aceptada (2026-08-30). Reemplaza la elección de DynamoDB de la especificación original.

## Contexto

La especificación eligió DynamoDB "por encaje con Lambda y por estar en always-free", y dejó abierta la reconsideración. Hechos que cambian el análisis:

- **Tamaño real del libro:** un inversor que aporta mensualmente y opera poco en el cubo genera decenas de operaciones al año. En 20 años son unos pocos miles de registros: **menos de 1-2 MB en JSON**. Cabe entero en memoria de una Lambda sin esfuerzo.
- Con ese tamaño, el modelo de acceso natural es **"cargar todo, calcular en memoria, guardar"**. No hacen falta índices ni consultas parciales: el FIFO, los pesos y la fiscalidad necesitan de todos modos recorrer el libro completo.
- La constitución (VI) exige que el libro sea **legible sin la aplicación** y exportable, y (I) que todo se recalcule desde el libro.

Ambas opciones cuestan cero o céntimos. La decisión no es de coste.

## Opciones consideradas

### A. JSON/JSONL en S3 con versionado (recomendada)

Un objeto por año (`ledger/2026.jsonl`, una operación por línea) o un único objeto `ledger.json`; `settings.json` aparte. Bucket privado, versionado activado, cifrado por defecto.

**Ventajas**
- **Legible sin la app.** Un fichero JSON se abre con cualquier herramienta en 2046; una tabla DynamoDB requiere exportarla primero. Cumple la constitución VI de forma literal.
- **Historial y auditoría gratis.** El versionado de S3 guarda cada versión anterior del fichero: cualquier escritura es reversible y comparable. Con DynamoDB haría falta PITR (de pago, aunque poco) o streams.
- **Backup = copiar un objeto.** La "prueba de restauración anual" es descargar un fichero. El volcado mensual a S3 de la especificación deja de ser necesario: el libro ya está en S3.
- **Encaja con append-only (ADR-0003):** añadir una línea a un JSONL es exactamente lo que el modelo pide.
- **Terraform mínimo:** un bucket y una política IAM, frente a tabla + índices + capacidad + política.
- **Sin trampa de precisión:** los importes viajan como cadenas dentro del JSON; no hay conversión implícita a float en ningún SDK.
- Escrituras seguras: S3 admite escrituras condicionales (`If-Match` con ETag) desde 2024. Si dos dispositivos escriben a la vez, el segundo falla y reintenta sobre la versión nueva. Para un solo usuario es más que suficiente.

**Inconvenientes**
- S3 solo es gratuito los 12 primeros meses; después, para unos MB, el coste es de **céntimos al año**. La restricción "always-free" se cumple en la práctica, no en la letra.
- Cada escritura reescribe el objeto completo (o el del año). A 1-2 MB es trivial; sería un problema con cientos de MB, que este proyecto no alcanzará.
- No hay consultas parciales: siempre se carga todo. Es la elección deliberada, no una limitación real a esta escala.
- Concurrencia gruesa (por fichero, no por registro). Irrelevante con un usuario.

### B. DynamoDB con capacidad aprovisionada (decisión actual)

Tabla única, clave por entidad, un ítem por operación/lote/precio.

**Ventajas**
- **Always-free perpetuo** (25 GB, 25 RCU/WCU), sin letra pequeña.
- Escrituras atómicas por ítem y transacciones; concurrencia fina.
- Consultas por clave e índices secundarios, útiles si el libro creciera mucho o si hubiera varios usuarios.
- DynamoDB Local para tests de integración.

**Inconvenientes**
- **No es legible sin la app:** hay que exportar (a S3, en formato propio de DynamoDB JSON) para ver los datos.
- El historial de cambios no viene de serie: hace falta PITR o streams, o implementarlo a mano.
- Obliga a **diseñar claves e índices** para un modelo relacional (lotes ↔ operaciones ↔ activos) que en realidad se consulta siempre completo. Es complejidad sin beneficio a esta escala.
- El SDK de JavaScript devuelve los números como `float` salvo configuración explícita; los importes deben guardarse como cadenas y convertirse a mano.
- Límite de 400 KB por ítem y de 1 MB por página de consulta: cargar todo el libro implica paginar.
- Más superficie de Terraform e IAM.

## Decisión

**Opción A: JSON/JSONL en S3 con versionado.** DynamoDB es la elección correcta para una aplicación con muchos usuarios o muchas escrituras concurrentes; este proyecto tiene un usuario, un libro de pocos MB y un requisito explícito de legibilidad y supervivencia que S3 cumple mejor. La única ventaja tangible de DynamoDB (always-free literal) vale unos céntimos al año.

S3 pasa a ser el **único** almacén: libro mayor, configuración, precios cacheados, documentos de eventos corporativos y backups conviven en el mismo bucket con prefijos distintos.

## Consecuencias

- `docs/specification.md` §9 (componentes, costes), `CLAUDE.md` y la constitución actualizados.
- El repositorio de datos del dominio se define como una interfaz (`LedgerStore`) con una implementación S3 y otra en memoria/fichero local para tests y desarrollo.
- Estrategia de escritura: leer objeto + ETag → modificar en memoria → `PutObject` con `If-Match`; reintentar en conflicto.
- Ciclo de vida del bucket: conservar todas las versiones; sin expiración automática.
