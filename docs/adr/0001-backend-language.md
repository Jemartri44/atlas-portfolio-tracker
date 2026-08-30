# ADR-0001 — Lenguaje del backend y del dominio

**Estado:** Aceptada (2026-08-30).

## Contexto

El frontend es una SPA con Vite (Svelte o Solid), es decir, TypeScript. El backend son Lambdas con Function URL y trabajos programados. El lenguaje del backend no está decidido y condiciona la Fase 1, porque el **dominio** (lotes, FIFO, traspasos, eventos corporativos, motor fiscal) es la parte con más valor y más riesgo del sistema.

Requisitos que pesan en la decisión (constitución II, VI, VII):

- Dinero en decimal, nunca en coma flotante.
- Pocas dependencias y un toolchain que siga compilando dentro de diez años.
- Un solo desarrollador: cada toolchain adicional es coste de mantenimiento perpetuo.
- Consulta sin conexión desde el móvil: el frontend debe poder mostrar posiciones con datos cacheados.
- Cobertura de tests alta en el motor fiscal.

## Opciones consideradas

### A. TypeScript en todo (recomendada)

Monorepo con `packages/domain` (puro, sin dependencias de AWS), `apps/api` (Lambda Node) y `apps/web` (Vite).

**Ventajas**
- **Un único toolchain** (npm, un lockfile, un `npm audit`, un linter, un sistema de tipos). La constitución pide presupuesto de dependencias y auditabilidad: es más fácil vigilar un ecosistema que dos.
- **El dominio se comparte con el frontend.** La SPA puede recalcular posiciones, pesos y desviaciones a partir del libro cacheado, sin llamar a la API. Eso resuelve de forma natural el requisito de consulta sin conexión, y hace que el simulador de traspaso y la calculadora de aportación funcionen en el cliente.
- Tipos compartidos entre API y cliente: los contratos no se desincronizan.
- Lambda Node arranca rápido (cold start bajo) y el runtime tiene soporte largo.
- Tests de propiedades con `fast-check`, maduro.

**Inconvenientes**
- No hay tipo decimal en el lenguaje. Dos salidas: una dependencia (`decimal.js` o `big.js`, estables y pequeñas) o **enteros escalados con `bigint`** (importes en céntimos ×10⁴, participaciones ×10⁸), sin dependencia pero con más disciplina. Cualquiera de las dos es válida; hay que elegir una y encapsularla en un tipo `Money`/`Quantity` propio.
- Trampa concreta: el SDK de DynamoDB devuelve los `Number` como `number` (float) salvo que se use `wrapNumbers`. Si se elige DynamoDB (ADR-0002), hay que fijarlo desde el primer día. Con S3 + JSON el problema es el mismo con `JSON.parse`: los importes deben serializarse como **cadenas**, nunca como números JSON.
- El ecosistema npm rota más rápido que otros; mitigado por el presupuesto de dependencias.

### B. Python (uv) en el backend, TypeScript solo en el frontend

**Ventajas**
- `decimal.Decimal` en la biblioteca estándar: el requisito de dinero decimal se cumple sin dependencias ni disciplina extra.
- Beancount, la mejor referencia de motor de lotes, está en Python: se puede leer y adaptar ideas directamente.
- `hypothesis` para tests de propiedades es excelente.
- Preferencia personal del usuario y `uv` como gestor.

**Inconvenientes**
- **Dos toolchains** que mantener, auditar y actualizar durante 20 años (npm + uv, dos lockfiles, dos linters, dos pipelines de CI).
- **El dominio no se comparte.** Toda lógica de cálculo vive solo en la API; el frontend es un cliente tonto. La consulta sin conexión se limita a mostrar el último resultado cacheado, sin poder recalcular ni simular.
- Los contratos API–cliente hay que duplicarlos o generarlos (OpenAPI → tipos TS), un paso más que se rompe en silencio.
- Cold start de Lambda algo mayor; irrelevante a esta escala.

### C. Go en el backend

**Ventajas**
- Binario estático, sin runtime que actualizar; el toolchain de Go es de los más estables que existen y la compatibilidad hacia atrás está garantizada. Es el mejor argumento de "sobrevivir 20 años".
- Cold start mínimo y consumo ínfimo de memoria.

**Inconvenientes**
- Los mismos de Python (dos toolchains, dominio no compartido) sin la ventaja del `decimal` de serie: hace falta `shopspring/decimal` o `math/big`.
- Más verboso para reglas de negocio; menos productivo para un solo desarrollador que ya trabaja en TS en el frontend.

## Decisión

**Opción A: TypeScript en todo**, por dos razones que pesan más que el resto: un solo toolchain y el dominio compartido con el frontend (consulta y simulación sin conexión). Python (B) era viable a cambio de un frontend sin lógica; Go (C) no compensaba para un solo desarrollador.

## Consecuencias

- Estructura de monorepo con `packages/domain`, `apps/api`, `apps/web`, `infra/`.
- Tipo `Money` y `Quantity` propios desde el primer commit de dominio; prohibido `number` para importes (regla de lint).
- Serialización de importes como cadenas en JSON y en la base de datos.
- `fast-check` como única dependencia de test añadida al runner.
