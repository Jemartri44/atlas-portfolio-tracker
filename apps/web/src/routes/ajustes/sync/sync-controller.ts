// The orders of the card of the sync (feature 015, E4): each one a button,
// each one through the engine, and after each the state, what is held and the
// ledger read again. **Nothing here starts by itself.**

import { DomainError, type UseCaseDeps } from "@atlas/domain";
import type { RedoPlan } from "@atlas/domain/sync";
import { createResource, createSignal } from "solid-js";
import { reloadLedger } from "../../../ledger/actions.js";
import { toAppError } from "../../../ledger/errors.js";
import { store } from "../../../ledger/state.js";
import {
  deactivate,
  redownload,
  type StartHow,
  startSync,
  syncNow,
  type WebSyncEnv,
  webSyncStatus,
} from "../../../sync/engine.js";
import {
  confirmHeld,
  discardHeld,
  type HeldItem,
  heldItems,
  planRedo,
  recordRedo,
} from "../../../sync/engine-held.js";
import { outcomeTold, said, type Told } from "./sync-texts.js";

export interface SyncCardProps {
  /** The device of the session, from `GET /api/session`. */
  readonly device: string;
  readonly request: typeof fetch;
  /** IndexedDB for a test; the browser's own otherwise. */
  readonly open?: () => Promise<IDBDatabase>;
  /** What a redo records with; the loaded ledger's otherwise. */
  readonly deps?: () => UseCaseDeps | undefined;
}

export interface PendingRedo {
  readonly unit: string;
  readonly plan: RedoPlan;
  /** The first try found it repeated: the second records it as such, once asked. */
  readonly duplicate: boolean;
}

const info = (title: string, text: string): Told => ({ severity: "info", title, text });

export const createSyncController = (props: SyncCardProps) => {
  const env: WebSyncEnv = {
    fetch: props.request,
    ...(props.open === undefined ? {} : { open: props.open }),
  };
  // A storage that cannot be read says so; it never breaks the card.
  const [status, { refetch }] = createResource(() => webSyncStatus(env).catch(() => null));
  const [held, { refetch: refetchHeld }] = createResource(() =>
    heldItems(env).catch(() => [] as HeldItem[]),
  );
  const [busy, setBusy] = createSignal(false);
  const [told, setTold] = createSignal<Told>();
  const [asking, setAsking] = createSignal<StartHow | "redownload">();
  const [rewritten, setRewritten] = createSignal(false);
  const [redo, setRedo] = createSignal<PendingRedo>();

  const run = async (work: () => Promise<Told | undefined>): Promise<void> => {
    setBusy(true);
    setTold(undefined);
    try {
      setTold(await work());
    } catch (error) {
      setTold({ severity: "danger", title: "No se ha hecho", text: toAppError(error).message });
    } finally {
      setBusy(false);
      refetch();
      refetchHeld();
      await reloadLedger();
    }
  };

  const depsNow = (): UseCaseDeps => {
    const deps = (props.deps ?? store.deps)();
    if (deps === undefined) {
      throw new DomainError("conflict", "no ledger loaded");
    }
    return deps;
  };

  const sync = (): Promise<void> =>
    run(async () => {
      const outcome = await syncNow(env);
      setRewritten(outcome.status === "stopped" && outcome.stop.code === "remote_rewritten");
      return outcomeTold(outcome, "Sincronizado");
    });

  /** What `asking` asked, once the user said yes. */
  const proceed = (): Promise<void> =>
    run(async () => {
      const how = asking();
      setAsking(undefined);
      if (how === undefined) {
        return undefined;
      }
      if (how !== "redownload") {
        return outcomeTold(await startSync(env, how), "Sincronización iniciada");
      }
      const outcome = await redownload(env);
      if (outcome.status === "synced") {
        setRewritten(false);
      }
      return outcomeTold(outcome, "Descargado de nuevo");
    });

  const stop = (): Promise<void> =>
    run(async () => {
      const refusal = await deactivate(env);
      return refusal === undefined
        ? info(
            "Sincronización desactivada",
            "Tus datos siguen aquí. Para volver a sincronizar hay que unirse otra vez.",
          )
        : {
            severity: "danger",
            title: "No se ha desactivado",
            text: said(refusal.code, refusal.details),
          };
    });

  const resolve = (item: HeldItem, resolution: string): Promise<void> =>
    run(async () => {
      if (resolution === "confirm") {
        await confirmHeld(env, item.unit);
        return info("Confirmada", "Sube en la próxima sincronización.");
      }
      if (resolution === "discard") {
        await discardHeld(env, item.unit);
        return info("Descartada", said("discarded_by_user"));
      }
      const planned = await planRedo(env, depsNow(), item.unit);
      if ("recorded" in planned) {
        return info(
          "Rehecha",
          "Ya estaba registrada con sus identificadores reservados: se termina sin registrar nada otra vez.",
        );
      }
      setRedo({ unit: item.unit, plan: planned.plan, duplicate: false });
      return undefined;
    });

  const recordPlanned = (): Promise<void> =>
    run(async () => {
      const current = redo();
      if (current === undefined) {
        return undefined;
      }
      try {
        await recordRedo(env, depsNow(), current.unit, current.plan, current.duplicate);
      } catch (error) {
        if (error instanceof DomainError && error.code === "duplicate_fingerprint") {
          setRedo({ ...current, duplicate: true });
          return {
            severity: "caution",
            title: "Parece repetida",
            text: said(error.code, error.details),
          };
        }
        throw error;
      }
      setRedo(undefined);
      return info("Rehecha", said("redone"));
    });

  return {
    status,
    held,
    busy,
    told,
    asking,
    setAsking,
    rewritten,
    redo,
    setRedo,
    sync,
    proceed,
    stop,
    resolve,
    recordPlanned,
  };
};
