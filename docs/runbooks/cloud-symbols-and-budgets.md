# La correspondencia de símbolos y los presupuestos de la nube

> Feature 016. Lo que necesita AWS real está sin probar hasta la feature 018: lo dice el final de este procedimiento.

**Cuándo usarlo.**
- Cuando cambias la correspondencia de símbolos en la consola: un activo nuevo, otro símbolo o una fuente contrastada.
- Cuando llega el correo `[Atlas] Aviso: correspondencias sin contrastar en …`.
- Cuando quieres cambiar cuántas llamadas diarias gasta la nube.

**Qué es.** La tarea de precios de la nube descarga los cierres de los activos del libro con la correspondencia de `prices/symbols.json` **del bucket**. Ese fichero lo escribe **solo** `atlas admin prices push`, con el rol de administración y MFA; la tarea nunca lo toca y **nunca contrasta** una fuente (§8.1 P18, Q1). Una fuente sin contrastar en el fichero subido no se descarga, y la tarea lo avisa.

## 1. Cuándo hay que volver a subir la correspondencia

Después de cualquiera de estas órdenes en la carpeta del libro:
- `atlas prices symbols set <activo> …`: una correspondencia nueva o cambiada;
- `atlas prices symbols remove <activo>`;
- `atlas prices purge <activo> --source …`;
- la primera descarga de una fuente nueva, que es la que la **contrasta**. En una carpeta sincronizada, `atlas prices update` baja de la nube y no llama a las fuentes, así que el contraste se hace con `atlas prices update --from-sources`.

`--from-sources` gasta el cupo que la consola comparte con la nube. Por defecto son 2 llamadas de EODHD y 2 de Alpha Vantage al día, salvo que tu `prices/config.json` diga otra cosa.

Y siempre que llegue el correo de correspondencias sin contrastar.

## 2. Subirla

Desde la carpeta del libro, con el rol de administración (ADR-0034, fila 16; como en [restore-the-ledger.md](restore-the-ledger.md)):

```sh
atlas admin prices push --env prod
```

1. **Lee la diferencia** que enseña, activo a activo: qué entra, qué cambia y qué sale. Si solo cambia la forma del fichero, lo dice.
2. **Se niega** a subir:
   - un `symbols.json` con cierres mal guardados (`misstored`): purga antes en local;
   - uno que no se lee, que no es UTF-8 o que repite una clave;
   - uno de un formato más nuevo que el de la consola.
3. **Confirma tecleando el nombre del entorno** (`prod`). Cualquier otra respuesta cancela sin escribir nada. **No acepta `--yes`**, y sin una terminal a la que preguntar sale con 4 sin tocar nada.
4. Escribe con `If-Match` sobre la misma lectura que enseñó la diferencia. Si otro escribió entre medias, no escribe nada: vuelve a ejecutarla. Al terminar, dice la versión que sustituyó (el bucket está versionado).

**Nunca sube `prices/config.json`**: ese fichero es el presupuesto de la consola, no el de la nube.

## 3. Cambiar los presupuestos de la nube

Los presupuestos de la nube son **variables de la función de precios**, que escribe Terraform desde `terraform.tfvars` (§8.2 M5):
- `ATLAS_PRICES_EODHD_DAILY_CALLS`: 18 por defecto, 20 como mucho;
- `ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS`: 23 por defecto, 25 como mucho;
- `ATLAS_PRICES_FAILURE_THRESHOLD`, el umbral de fallos seguidos: 3 por defecto.

La suma de la nube y de la consola **no debe pasar del cupo del plan gratuito**: 20 llamadas de EODHD y 25 de Alpha Vantage al día, con una sola clave (ADR-0031). Por eso la consola se queda con 2 y 2 por defecto.

1. Abre `~/personal/atlas/privado/terraform/prod/terraform.tfvars` con tu editor y cambia el valor. Los nombres de las variables de Terraform son una propuesta que fija la 017.
2. Revisa el plan con `terraform plan`: tiene que cambiar **solo** la variable de entorno de la función de precios.
3. Aplícalo con `terraform apply`. Un valor por encima del techo, o que no se entiende, **impide arrancar a la función** (`jobs_config_invalid`), y la tarea deja de descargar hasta que se corrija.

---

**Lo que se ha probado y lo que no.**
- **Sí, con los dobles**: `atlas admin prices push`, entera, con sus negativas, la confirmación tecleada, la salida 4 sin terminal y la escritura sobre la lectura que enseñó la diferencia (`apps/cli/test/admin/prices-push.test.ts`). También los techos y las negativas de las variables de la función (`packages/domain/test/jobs/prices-config.test.ts`).
- **No**: Terraform no existe todavía (017), y el procedimiento se prueba en la 018.
