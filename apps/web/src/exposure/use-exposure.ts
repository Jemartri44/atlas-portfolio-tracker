// The exposure the owner declared (`docs/api.md` §6.2), read from the cloud and written back with the
// etag it was read at. Nothing of it stays on the device. A screen that shows or edits the exposure
// makes its own `createExposure()`: each reads when it opens, so what it shows is what the cloud holds.
//
// - No object yet is an empty exposure, not an error: the defaults of the indexes still apply.
// - An object that is there and does not validate is **no data** (`unreadable`): the screen says so
//   and offers to start over, and writing replaces it only with the etag that was read.
// - A write that meets another one (`412`) reads again and says so: the owner decides again over
//   what is there now.

import { ApiExposureStore } from "@atlas/adapters/settings-http";
import { type Exposures, exposureOrNone } from "@atlas/domain/portfolio";
import { RemoteError } from "@atlas/domain/sync";
import { createSignal, onMount } from "solid-js";
import { cloudFetch } from "../ledger/cloud.js";
import { toAppError } from "../ledger/errors.js";

export type ExposureLoad =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; exposures: Exposures; etag: string | undefined; unreadable: boolean };

const store = (): ApiExposureStore => new ApiExposureStore({ origin: "", fetch: cloudFetch() });

const CHANGED =
  "La exposición ha cambiado desde otro dispositivo. Ya está leída otra vez: mira lo que hay y vuelve a hacerlo.";

export const createExposure = () => {
  const [state, setState] = createSignal<ExposureLoad>({ kind: "loading" });
  const [busy, setBusy] = createSignal(false);

  const load = async (): Promise<void> => {
    try {
      const read = await store().read();
      if (read.kind === "missing") {
        setState({ kind: "ready", exposures: {}, etag: undefined, unreadable: false });
        return;
      }
      const exposures = exposureOrNone(read.text);
      setState({
        kind: "ready",
        exposures: exposures ?? {},
        etag: read.etag,
        unreadable: exposures === undefined,
      });
    } catch (failure) {
      setState({ kind: "failed", message: toAppError(failure).message });
    }
  };

  /** The sentence of what went wrong, or `undefined` when it is saved. */
  const save = async (next: Exposures): Promise<string | undefined> => {
    const current = state();
    if (current.kind !== "ready") {
      return "La exposición todavía no se ha leído.";
    }
    setBusy(true);
    try {
      const written = await store().write(next, current.etag);
      setState({ kind: "ready", exposures: next, etag: written.etag, unreadable: false });
      return undefined;
    } catch (failure) {
      if (
        failure instanceof RemoteError &&
        (failure.code === "precondition_failed" || failure.code === "precondition_required")
      ) {
        await load();
        return CHANGED;
      }
      return toAppError(failure).message;
    } finally {
      setBusy(false);
    }
  };

  onMount(() => void load());
  return { state, busy, save, reload: load };
};
