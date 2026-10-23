// atlas admin devices | revoke-all-tokens | forget-device: the devices of the cloud and their tokens
// (ADR-0033, point 8).

import { DeviceStore, TokenRegistry } from "@atlas/adapters/aws";
import { DomainError } from "@atlas/domain";
import type { DeviceObject, TokenRecord } from "@atlas/domain/access";
import { type AdminDeviceRead, forgetRefusal, forgottenDevice } from "@atlas/domain/admin";
import { RefusedError } from "@atlas/domain/sync";
import type { AdminClients } from "../../admin/environment.js";
import { type Context, EXIT } from "../../context.js";
import { table } from "../../output/table.js";
import { render } from "../shared.js";
import { confirmEnvironment } from "./confirm.js";

/** Every object under `sync/devices/`, read strictly: an unreadable one is kept as such. */
const readDevices = async (clients: AdminClients): Promise<AdminDeviceRead[]> => {
  const devices = new DeviceStore(clients.objects);
  const reads: AdminDeviceRead[] = [];
  for (const id of await devices.ids()) {
    const read = await devices.read(id);
    if (read !== undefined) {
      reads.push(read === "unreadable" ? { device_id: id, unreadable: true } : read);
    }
  }
  return reads;
};

/** `atlas admin devices`: every object of `sync/devices/`, with its type and its state. */
export const devicesOrder = async (ctx: Context, clients: AdminClients): Promise<number> => {
  const reads = await readDevices(clients);
  render(
    ctx,
    { devices: reads },
    reads.length === 0
      ? "No hay ningún dispositivo en sync/devices/."
      : table(
          ["dispositivo", "tipo", "estado", "última sincronización", "nombre"],
          reads.map((read) =>
            "unreadable" in read
              ? [read.device_id, "?", "ilegible", "", ""]
              : [
                  read.device_id,
                  read.type === "web" ? "web" : "consola",
                  read.state === "active" ? "activo" : "olvidado",
                  read.last_sync_at ?? "",
                  read.device_name ?? "",
                ],
          ),
        ),
  );
  return EXIT.ok;
};

/**
 * Revokes the live records `which` picks with the **same code the API
 * writes** (`TokenRegistry.revoke`, `revokedRecord`): one already
 * revoked is left as it is, so it can be repeated without harm. An unreadable
 * record is said and left: the API refuses it anyway.
 */
const revokeTokens = async (
  clients: AdminClients,
  now: number,
  which: (record: TokenRecord) => boolean,
): Promise<{ revoked: string[]; already: number; unreadable: string[] }> => {
  const registry = new TokenRegistry(clients.parameters, clients.ssmPrefix, {});
  const revoked: string[] = [];
  const unreadable: string[] = [];
  let already = 0;
  for (const { tokenId, read } of await registry.list()) {
    if (read === "unreadable") {
      unreadable.push(tokenId);
    } else if (!which(read)) {
      // Another device's.
    } else if (read.revoked_at !== undefined) {
      already += 1;
    } else {
      await registry.revoke(read, now);
      revoked.push(tokenId);
    }
  }
  return { revoked, already, unreadable };
};

export const revokeAllOrder = async (ctx: Context, clients: AdminClients): Promise<number> => {
  const done = await revokeTokens(clients, ctx.deps.clock.now().getTime(), () => true);
  render(
    ctx,
    done,
    [
      `Revocados ${done.revoked.length} tokens; ${done.already} ya lo estaban y se han dejado igual.`,
      ...(done.unreadable.length === 0
        ? []
        : [
            `Registros que esta consola no entiende, sin tocar: ${done.unreadable.join(", ")}. No se puede asegurar que estén revocados: revísalos con la CLI de AWS (procedimiento «Revocar todos los tokens», apartado 2).`,
          ]),
    ].join("\n"),
  );
  // Revoking **all** is not done while a record could not be read: a console older than the API may
  // not understand a live one.
  return done.unreadable.length === 0 ? EXIT.ok : EXIT.domain;
};

/**
 * `atlas admin forget-device <id>|--device <id>`:
 * **first** its tokens are revoked, **then** its object is rewritten on the
 * ETag it was read at, with `state: "forgotten"`. Never deleted. A cut between
 * the two leaves it revoked and not forgotten — safe, and repeating finishes
 * it; forgotten and not revoked cannot exist.
 */
export const forgetOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  id: string,
): Promise<number> => {
  const devices = new DeviceStore(clients.objects);
  const first = await devices.readForUpdate(id);
  const refusal = forgetRefusal(first?.device);
  const sweep = () =>
    revokeTokens(clients, ctx.deps.clock.now().getTime(), (record) => record.device_id === id);
  if (refusal === "already_forgotten") {
    // A cut after the mark and before the sweep below is finished here.
    const late = await sweep();
    render(
      ctx,
      { device_id: id, already_forgotten: true, revoked: late.revoked },
      late.revoked.length === 0
        ? `El dispositivo ${id} ya estaba olvidado: no se ha tocado nada.`
        : `El dispositivo ${id} ya estaba olvidado; revocados ${late.revoked.length} tokens suyos que seguían vivos.`,
    );
    return EXIT.ok;
  }
  if (refusal !== undefined) {
    throw new RefusedError(refusal);
  }
  const device = first?.device as DeviceObject;
  const described = [
    device.type === "web" ? "web" : "consola",
    ...(device.device_name === undefined ? [] : [`«${device.device_name}»`]),
    `última sincronización ${device.last_sync_at ?? "ninguna"}`,
  ].join(", ");
  if (
    !(await confirmEnvironment(
      ctx,
      environment,
      `¿Olvidar en ${environment} el dispositivo ${id} (${described}) y revocar sus tokens?`,
    ))
  ) {
    render(ctx, { status: "cancelled" }, "Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  const now = ctx.deps.clock.now();
  // First the tokens: a cut here leaves it revoked and alive, which is safe.
  const tokens = await revokeTokens(clients, now.getTime(), (record) => record.device_id === id);
  // Then the mark, on the ETag it was read at. A write that came in between is
  // read again, never written over, and the rule is asked again.
  let current = first;
  for (let attempt = 1; ; attempt += 1) {
    const again = forgetRefusal(current?.device);
    if (again === "already_forgotten") {
      break;
    }
    if (again !== undefined) {
      throw new RefusedError(again);
    }
    const read = current as { device: DeviceObject; etag: string };
    if (
      (await devices.replace(forgottenDevice(read.device, now.toISOString()), read.etag)) ===
      "written"
    ) {
      break;
    }
    if (attempt === 3) {
      throw new DomainError(
        "forget_contention",
        "the object changed three times while forgetting it",
        {
          device_id: id,
        },
      );
    }
    current = await devices.readForUpdate(id);
  }
  // And again once it is forgotten: a sign-in that
  // ended between the revocation and the mark left a token nobody revoked.
  const late = await sweep();
  const revoked = [...tokens.revoked, ...late.revoked];
  render(
    ctx,
    { device_id: id, revoked, already: tokens.already },
    [
      `Olvidado ${id}: revocados ${revoked.length} tokens (${tokens.already} ya lo estaban).`,
      "La API rechazará toda credencial de ese dispositivo con device_forgotten. Si era una web, recibirá otro dispositivo al volver a iniciar sesión.",
    ].join("\n"),
  );
  return EXIT.ok;
};
