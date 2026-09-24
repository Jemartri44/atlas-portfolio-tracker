// atlas lock show | atlas lock break: the advisory lock of the ledger folder
// (ADR-0026, Part B; feature 012, block 0).
//
// The lock is **never broken automatically**, however old: breaking it is this
// command, asked for by the user after seeing who holds it and since when.

import { dirname } from "node:path";
import { breakFolderLock, readFolderLock, readLocalConfig } from "@atlas/adapters";
import { assertKnownFlags, type Flags, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { describeLock, LOCK_REMEDY } from "../output/lock.js";
import { confirm, render } from "./shared.js";

export const lockCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, [...GLOBAL_FLAGS]);
  const sub = positionals[1];
  if (sub !== "show" && sub !== "break") {
    throw new UsageError("uso: atlas lock show | atlas lock break");
  }
  const folder = dirname(ctx.ledgerPath);
  const info = await readFolderLock(folder);
  const now = ctx.deps.clock.now();
  if (info === null) {
    render(
      ctx,
      { locked: false },
      "La carpeta del libro no tiene cerrojo: nadie está escribiendo.",
    );
    return 0;
  }
  const { lock_stale_minutes } = await readLocalConfig(folder);
  const description = describeLock(info, now, lock_stale_minutes);
  if (sub === "show") {
    render(ctx, { locked: true, lock: info ?? null }, `${description}\n${LOCK_REMEDY}`);
    return 0;
  }
  ctx.io.out(description);
  ctx.io.out(
    "Romperlo es seguro si ese proceso ya no existe. Si siguiera vivo, podría escribir a la vez que la siguiente orden: la comprobación de pertenencia lo hace menos probable, no imposible.",
  );
  if (!(await confirm(ctx, "¿Romper el cerrojo? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const broken = await breakFolderLock(folder);
  ctx.io.out(broken ? "Cerrojo roto." : "El cerrojo ya no estaba: nada que romper.");
  return 0;
};
