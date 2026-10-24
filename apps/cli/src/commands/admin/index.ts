// atlas admin devices | revoke-all-tokens | forget-device | compact | restore | prices push --env
// <e> (ADR-0026, Part A, ADR-0032, ADR-0033, point 8): operations of administration **over the copy
// of reference**, with the short-lived credentials of the role `atlas-<env>-admin` (the standard
// chain of the SDK) — **never with the token of a device and never through the API**, which only
// appends. Nothing of this is reachable from `apps/api` (architecture test).

import { adminClientsOf, environmentFlag, translateAwsFailure } from "../../admin/clients.js";
import type { AdminClients } from "../../admin/environment.js";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../../args.js";
import { type Context, GLOBAL_FLAGS } from "../../context.js";
import { devicesOrder, forgetOrder, revokeAllOrder } from "./devices.js";
import { compactOrder, restoreOrder } from "./ledger.js";
import { pricesPushOrder } from "./prices-push.js";
import { secretsOrder } from "./secrets.js";

const USAGE =
  "uso: atlas admin devices | revoke-all-tokens | forget-device [--] <dispositivo> | forget-device --device <dispositivo> | compact [--accept-unverified <id>]… | restore --from <fichero|s3-version:<id>|backups/AAAA-MM> | prices push | secrets, siempre con --env <entorno>";

/** What an order of `atlas admin` is: its own options, how it reads its arguments, and what it runs. */
interface AdminOrder {
  /** The name in the refusals (`prices push` for `prices`). */
  readonly label: string;
  /** The options of the order besides `--env`; `secrets` takes none of its own. */
  readonly flags: readonly string[];
  /** A `--yes` is written before the list is on screen, so these confirm by typing the environment. */
  readonly refusesYes: boolean;
  readonly run: (
    ctx: Context,
    clients: AdminClients,
    environment: string,
    input: { positionals: string[]; flags: Flags; id: string | undefined },
  ) => Promise<number>;
}

const ORDERS: Readonly<Record<string, AdminOrder>> = {
  devices: {
    label: "devices",
    flags: ["env"],
    refusesYes: false,
    run: (ctx, clients) => devicesOrder(ctx, clients),
  },
  "revoke-all-tokens": {
    label: "revoke-all-tokens",
    flags: ["env"],
    refusesYes: false,
    run: (ctx, clients) => revokeAllOrder(ctx, clients),
  },
  "forget-device": {
    label: "forget-device",
    flags: ["env", "device"],
    refusesYes: true,
    run: (ctx, clients, environment, { id }) =>
      forgetOrder(ctx, clients, environment, id as string),
  },
  compact: {
    label: "compact",
    flags: ["env", "accept-unverified"],
    refusesYes: true,
    run: (ctx, clients, environment, { flags }) => compactOrder(ctx, clients, environment, flags),
  },
  restore: {
    label: "restore",
    flags: ["env", "from"],
    refusesYes: true,
    run: (ctx, clients, environment, { flags }) => restoreOrder(ctx, clients, environment, flags),
  },
  prices: {
    label: "prices push",
    flags: ["env"],
    refusesYes: true,
    run: (ctx, clients, environment) => pricesPushOrder(ctx, clients, environment),
  },
  secrets: {
    label: "secrets",
    flags: ["env"],
    refusesYes: true,
    run: (ctx, clients, environment, { positionals, flags }) =>
      secretsOrder(ctx, clients, environment, positionals, flags),
  },
};

/** The global options that mean something here; the ones about recording an event do not. */
const ADMIN_GLOBAL_FLAGS: readonly string[] = ["ledger", "yes", "json"];

export const adminCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["env", "from", "accept-unverified", "device", ...GLOBAL_FLAGS]);
  const name = positionals[1];
  const order = name !== undefined && Object.hasOwn(ORDERS, name) ? ORDERS[name] : undefined;
  if (order === undefined || (name === "prices" && positionals[2] !== "push")) {
    throw new UsageError(USAGE);
  }
  // What this order does not take is refused, not ignored in silence.
  for (const flag of flags.keys()) {
    if (!order.flags.includes(flag) && !ADMIN_GLOBAL_FLAGS.includes(flag)) {
      throw new UsageError(`--${flag} no vale en «atlas admin ${order.label}»`);
    }
  }
  // A device id may begin with a dash: after `--`, or as `--device <id>`.
  const flagged = stringFlag(flags, "device");
  if (flagged !== undefined && (name !== "forget-device" || positionals[2] !== undefined)) {
    throw new UsageError(
      name === "forget-device"
        ? "el dispositivo se da una sola vez: «forget-device -- <id>» o «forget-device --device <id>»"
        : `--device no vale en «atlas admin ${order.label}»`,
    );
  }
  const id = flagged ?? positionals[2];
  if (name === "forget-device" && id === undefined) {
    throw new UsageError(
      "falta el dispositivo: los enseña «atlas admin devices»; si empieza por guion, escríbelo detrás de «--» o con --device <id>",
    );
  }
  if (ctx.yes && order.refusesYes) {
    throw new UsageError(
      `--yes no vale en «atlas admin ${order.label}»: se confirma escribiendo el nombre del entorno, con lo que se pierde delante (ADR-0032)`,
    );
  }
  const environment = environmentFlag(flags);
  try {
    const clients = await adminClientsOf(ctx, flags);
    return await order.run(ctx, clients, environment, { positionals, flags, id });
  } catch (error) {
    throw translateAwsFailure(error);
  }
};
