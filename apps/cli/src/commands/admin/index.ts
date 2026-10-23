// atlas admin devices | revoke-all-tokens | forget-device | compact | restore | prices push --env
// <e> (ADR-0026, Part A, ADR-0032, ADR-0033, point 8): operations of administration **over the copy
// of reference**, with the short-lived credentials of the role `atlas-<env>-admin` (the standard
// chain of the SDK) — **never with the token of a device and never through the API**, which only
// appends. Nothing of this is reachable from `apps/api` (architecture test).

import { adminClientsOf, environmentFlag, translateAwsFailure } from "../../admin/clients.js";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../../args.js";
import { type Context, GLOBAL_FLAGS } from "../../context.js";
import { devicesOrder, forgetOrder, revokeAllOrder } from "./devices.js";
import { compactOrder, restoreOrder } from "./ledger.js";
import { pricesPushOrder } from "./prices-push.js";
import { secretsOrder } from "./secrets.js";

const USAGE =
  "uso: atlas admin devices | revoke-all-tokens | forget-device [--] <dispositivo> | forget-device --device <dispositivo> | compact [--accept-unverified <id>]… | restore --from <fichero|s3-version:<id>|backups/AAAA-MM> | prices push | secrets, siempre con --env <entorno>";

/** The options of each order besides `--env`; `secrets` takes none of its own. */
const ORDER_FLAGS: Readonly<Record<string, readonly string[]>> = {
  devices: ["env"],
  "revoke-all-tokens": ["env"],
  "forget-device": ["env", "device"],
  compact: ["env", "accept-unverified"],
  restore: ["env", "from"],
  prices: ["env"],
  secrets: ["env"],
};

/** The global options that mean something here; the ones about recording an event do not. */
const ADMIN_GLOBAL_FLAGS: readonly string[] = ["ledger", "yes", "json"];

export const adminCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["env", "from", "accept-unverified", "device", ...GLOBAL_FLAGS]);
  const order = positionals[1];
  if (
    order === undefined ||
    ![
      "devices",
      "revoke-all-tokens",
      "forget-device",
      "compact",
      "restore",
      "prices",
      "secrets",
    ].includes(order) ||
    (order === "prices" && positionals[2] !== "push")
  ) {
    throw new UsageError(USAGE);
  }
  // What this order does not take is refused, not ignored in silence.
  for (const name of flags.keys()) {
    if (!ORDER_FLAGS[order]?.includes(name) && !ADMIN_GLOBAL_FLAGS.includes(name)) {
      throw new UsageError(
        `--${name} no vale en «atlas admin ${order === "prices" ? "prices push" : order}»`,
      );
    }
  }
  // A device id may begin with a dash: after `--`, or as `--device <id>`.
  const flagged = stringFlag(flags, "device");
  if (flagged !== undefined && (order !== "forget-device" || positionals[2] !== undefined)) {
    throw new UsageError(
      order === "forget-device"
        ? "el dispositivo se da una sola vez: «forget-device -- <id>» o «forget-device --device <id>»"
        : `--device no vale en «atlas admin ${order}»`,
    );
  }
  const id = flagged ?? positionals[2];
  if (order === "forget-device" && id === undefined) {
    throw new UsageError(
      "falta el dispositivo: los enseña «atlas admin devices»; si empieza por guion, escríbelo detrás de «--» o con --device <id>",
    );
  }
  // A `--yes` is written before the list is on screen.
  if (ctx.yes && ["forget-device", "compact", "restore", "prices", "secrets"].includes(order)) {
    throw new UsageError(
      `--yes no vale en «atlas admin ${order === "prices" ? "prices push" : order}»: se confirma escribiendo el nombre del entorno, con lo que se pierde delante (ADR-0032)`,
    );
  }
  const environment = environmentFlag(flags);
  try {
    const clients = await adminClientsOf(ctx, flags);
    switch (order) {
      case "devices":
        return await devicesOrder(ctx, clients);
      case "revoke-all-tokens":
        return await revokeAllOrder(ctx, clients);
      case "forget-device":
        return await forgetOrder(ctx, clients, environment, id as string);
      case "compact":
        return await compactOrder(ctx, clients, environment, flags);
      case "prices":
        return await pricesPushOrder(ctx, clients, environment);
      case "secrets":
        return await secretsOrder(ctx, clients, environment, positionals, flags);
      default:
        return await restoreOrder(ctx, clients, environment, flags);
    }
  } catch (error) {
    throw translateAwsFailure(error);
  }
};
