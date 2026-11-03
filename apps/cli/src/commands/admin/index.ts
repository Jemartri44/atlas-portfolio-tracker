// atlas admin pull | compact | restore | prices push | secrets --env <e> (ADR-0026, Part A,
// ADR-0032): operations of administration **over the copy of reference**, with the short-lived
// credentials of the role `atlas-<env>-admin` (the standard chain of the SDK) — **never through
// the API**, which only appends; the console has no access of its own to the API (ADR-0037).
// Nothing of this is reachable from `apps/api` (architecture test).

import { adminClientsOf, environmentFlag, translateAwsFailure } from "../../admin/clients.js";
import type { AdminClients } from "../../admin/environment.js";
import { assertKnownFlags, type Flags, UsageError } from "../../args.js";
import { type Context, GLOBAL_FLAGS } from "../../context.js";
import { compactOrder, pullOrder, restoreOrder } from "./ledger.js";
import { pricesPushOrder } from "./prices-push.js";
import { secretsOrder } from "./secrets.js";

const USAGE =
  "uso: atlas admin pull --to <directorio> | compact [--accept-unverified <id>]… | restore --from <fichero|s3-version:<id>|backups/AAAA-MM> | prices push | secrets, siempre con --env <entorno>";

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
    input: { positionals: string[]; flags: Flags },
  ) => Promise<number>;
}

const ORDERS: Readonly<Record<string, AdminOrder>> = {
  pull: {
    label: "pull",
    flags: ["env", "to"],
    refusesYes: false,
    run: (ctx, clients, environment, { flags }) => pullOrder(ctx, clients, environment, flags),
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
  assertKnownFlags(flags, ["env", "to", "from", "accept-unverified", ...GLOBAL_FLAGS]);
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
  if (ctx.yes && order.refusesYes) {
    throw new UsageError(
      `--yes no vale en «atlas admin ${order.label}»: se confirma escribiendo el nombre del entorno, con lo que se pierde delante (ADR-0032)`,
    );
  }
  const environment = environmentFlag(flags);
  try {
    const clients = await adminClientsOf(ctx, flags);
    return await order.run(ctx, clients, environment, { positionals, flags });
  } catch (error) {
    throw translateAwsFailure(error);
  }
};
